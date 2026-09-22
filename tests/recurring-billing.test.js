import test from "node:test";
import assert from "node:assert/strict";
import { billContract, billingKey, CYCLES, CONTRACT_STATUS, BILL_CYCLE } from "../app/services/recurring-billing.server.js";

const contract = { id: "gid://shopify/SubscriptionContract/1", status: "ACTIVE", createdAt: "2026-01-31T10:00:00Z" };
const now = new Date("2026-03-01T10:00:00Z");
const cycle = { cycleIndex: 2, billingAttemptExpectedDate: "2026-02-28T10:00:00Z", status: "UNBILLED", skipped: false, billingAttempts: { nodes: [] } };
function mock(cycles, { status = "ACTIVE", attempt = { id: "attempt-1", state: { __typename: "SubscriptionBillingAttemptSuccessState" } }, fail = false } = {}) {
  const calls = [];
  return { calls, graphql: async (doc, { variables }) => {
    calls.push({ doc, variables });
    if (doc === CYCLES) return Response.json({ data: { subscriptionBillingCycles: { nodes: cycles, pageInfo: { hasNextPage: false } } } });
    if (doc === CONTRACT_STATUS) return Response.json({ data: { subscriptionContract: { status } } });
    assert.equal(doc, BILL_CYCLE);
    if (fail) throw new Error("Connection lost");
    return Response.json({ data: { subscriptionBillingAttemptCreate: { subscriptionBillingAttempt: attempt, userErrors: [] } } });
  } };
}
const run = (admin, current = contract) => billContract({ admin, shop: "test.myshopify.com", contract: current, now });

test("renewal uses Shopify calendar dates and a stable cycle-specific idempotency key", async () => {
  for (const due of ["2026-02-07T10:00:00Z", "2026-02-28T10:00:00Z"]) {
    const admin = mock([{ ...cycle, billingAttemptExpectedDate: due }]);
    assert.equal((await run(admin)).status, "billed");
    const input = admin.calls.find(call => call.doc === BILL_CYCLE).variables.input;
    assert.equal(input.originTime, due);
    assert.deepEqual(input.billingCycleSelector, { index: 2 });
    assert.equal(input.idempotencyKey, billingKey("test.myshopify.com", contract.id, 2));
  }
  assert.notEqual(billingKey("a", contract.id, 2), billingKey("b", contract.id, 2));
  assert.notEqual(billingKey("a", contract.id, 2), billingKey("a", contract.id, 3));
});
test("paid, future, skipped and inactive subscriptions are not charged", async () => {
  const admin = mock([
    { ...cycle, status: "BILLED" }, { ...cycle, skipped: true },
    { ...cycle, billingAttemptExpectedDate: "2026-04-01T10:00:00Z" },
    { ...cycle, billingAttempts: { nodes: [{ id: "paid", state: { __typename: "SubscriptionBillingAttemptSuccessState" } }] } },
  ]);
  assert.equal((await run(admin)).status, "not_due");
  assert.equal(admin.calls.length, 1);
  for (const status of ["PAUSED", "CANCELLED", "EXPIRED", "FAILED"]) {
    const inactive = mock([]);
    assert.equal((await run(inactive, { ...contract, status })).status, "inactive");
    assert.equal(inactive.calls.length, 0);
  }
});
test("a contract cancelled during the run is not charged", async () => {
  const admin = mock([cycle], { status: "CANCELLED" });
  assert.equal((await run(admin)).status, "inactive");
  assert.ok(!admin.calls.some(call => call.doc === BILL_CYCLE));
});
test("pending and failed attempts block further automatic charges", async () => {
  for (const attempt of [{ id: "pending", state: { __typename: "SubscriptionBillingAttemptPendingState" } }, { id: "failed", state: { __typename: "SubscriptionBillingAttemptFailedState" } }]) {
    const admin = mock([{ ...cycle, billingAttempts: { nodes: [attempt] } }, { ...cycle, cycleIndex: 3 }]);
    assert.equal((await run(admin)).status, attempt.id === "failed" ? "failed" : "pending");
    assert.ok(!admin.calls.some(call => call.doc === BILL_CYCLE));
  }
});
test("transport retries reuse the same payment key and only one overdue cycle is processed", async () => {
  const failed = mock([cycle], { fail: true });
  await assert.rejects(run(failed), /Connection lost/);
  const retried = mock([cycle, { ...cycle, cycleIndex: 3 }]);
  await run(retried);
  assert.deepEqual(failed.calls.at(-1).variables, retried.calls.at(-1).variables);
  assert.equal(retried.calls.filter(call => call.doc === BILL_CYCLE).length, 1);
});
