import test from "node:test";
import assert from "node:assert/strict";
import { applyContractLength, handleContractCreated, lengthDecision, parseLength } from "../app/services/contract-length.server.js";
import { presentContract } from "../app/services/subscription-portal.server.js";

const ID = "gid://shopify/SubscriptionContract/7";
const attr = value => [{ key: "Subscription length", value }];
function contract({ value, lineAttributes, maxCycles = null, minCycles = null, status = "ACTIVE", anchors = [] } = {}) {
  return {
    id: ID, status,
    billingPolicy: { interval: "WEEK", intervalCount: 2, minCycles, maxCycles, anchors },
    lines: { nodes: [{ variantId: "gid://shopify/ProductVariant/1", sellingPlanId: "gid://shopify/SellingPlan/5", customAttributes: lineAttributes ?? (value === undefined ? [] : attr(value)) }] },
  };
}
test("parser turns storefront values into 1-99 and rejects everything else", () => {
  assert.equal(parseLength("6 times"), 6);
  assert.equal(parseLength("1 time"), 1);
  assert.equal(parseLength(" 99 Times "), 99);
  for (const value of ["Unlimited", "", null, undefined, "0 times", "100 times", "six times", "6", "6 months", "6.5 times", "-6 times"])
    assert.equal(parseLength(value), null, String(value));
});

test("6 times sets min and max cycles to 6 and keeps the schedule", () => {
  const decision = lengthDecision(contract({ value: "6 times", anchors: [{ type: "WEEKDAY", day: 3, month: null, cutoffDay: null }] }));
  assert.equal(decision.action, "update");
  assert.deepEqual(decision.billingPolicy, { interval: "WEEK", intervalCount: 2, minCycles: 6, maxCycles: 6, anchors: [{ type: "WEEKDAY", day: 3 }] });
});

test("Unlimited, missing, garbage and conflicting values never update", () => {
  assert.deepEqual(lengthDecision(contract({ value: "Unlimited" })), { action: "skip", reason: "unlimited", values: ["Unlimited"] });
  assert.equal(lengthDecision(contract()).reason, "missing");
  assert.equal(lengthDecision(contract({ value: "lots" })).reason, "invalid");
  assert.equal(lengthDecision(contract({ lineAttributes: [...attr("6 times"), ...attr("3 times")] })).reason, "conflicting");
});

test("already limited or inactive contracts are left alone", () => {
  assert.equal(lengthDecision(contract({ value: "6 times", maxCycles: 6, minCycles: 6 })).reason, "already-set");
  assert.equal(lengthDecision(contract({ value: "6 times", status: "CANCELLED" })).reason, "inactive");
});

test("the property key matches case-insensitively on the contract line", () => {
  assert.equal(lengthDecision(contract({ lineAttributes: [{ key: "subscription length", value: "1 time" }] })).times, 1);
  assert.equal(lengthDecision(contract({ lineAttributes: [{ key: "_other", value: "4 times" }] })).reason, "missing");
});

function mockAdmin(responses) {
  const calls = [];
  return { calls, admin: { graphql: async (document, { variables }) => {
    const name = /(query|mutation)\s+(\w+)/.exec(document)[2];
    calls.push({ name, variables });
    const reply = responses[name];
    if (!reply) throw new Error(`unexpected ${name}`);
    return Response.json(typeof reply === "function" ? reply(variables) : reply);
  } } };
}
const committed = times => ({ data: { subscriptionDraftCommit: { contract: { id: ID, billingPolicy: { maxCycles: times, minCycles: times } }, userErrors: [] } } });
const portal = {
  data: {
    subscriptionContract: { customer: { defaultEmailAddress: { emailAddress: "buyer@example.com" } } },
    shop: { name: "Demo", customerAccountsV2: { url: "https://shopify.com/1/account" } },
  },
};
const flow = (subject, extra = {}) => ({
  BundlifyContractLength: { data: { subscriptionContract: subject } },
  BundlifyContractEdit: { data: { subscriptionContractUpdate: { draft: { id: "gid://shopify/SubscriptionDraft/3" }, userErrors: [] } } },
  BundlifyDraftLength: { data: { subscriptionDraftUpdate: { draft: { id: "gid://shopify/SubscriptionDraft/3" }, userErrors: [] } } },
  BundlifyDraftCommit: committed(6),
  BundlifySubscriptionPortal: portal,
  ...extra,
});

test("6 times runs contract update, draft update, draft commit", async () => {
  const { admin, calls } = mockAdmin(flow(contract({ value: "6 times" })));
  assert.deepEqual(await applyContractLength({ admin, contractId: ID }), { status: "updated", times: 6, contractId: ID });
  assert.deepEqual(calls.map(c => c.name), ["BundlifyContractLength", "BundlifyContractEdit", "BundlifyDraftLength", "BundlifyDraftCommit"]);
  assert.deepEqual(calls[1].variables, { contractId: ID });
  assert.deepEqual(calls[2].variables, { draftId: "gid://shopify/SubscriptionDraft/3", input: { billingPolicy: { interval: "WEEK", intervalCount: 2, minCycles: 6, maxCycles: 6, anchors: [] } } });
  assert.deepEqual(calls[3].variables, { draftId: "gid://shopify/SubscriptionDraft/3" });
});

test("Unlimited reads the contract and sends no mutation", async () => {
  const { admin, calls } = mockAdmin(flow(contract({ value: "Unlimited" })));
  assert.equal((await applyContractLength({ admin, contractId: ID })).reason, "unlimited");
  assert.deepEqual(calls.map(c => c.name), ["BundlifyContractLength"]);
});

test("webhook sets maxCycles and minCycles 3 from the contract line property", async (t) => {
  t.mock.method(console, "log", () => {});
  const weekly = contract({ value: "3 times", anchors: [{ type: "WEEKDAY", day: 1, month: null, cutoffDay: null }] });
  weekly.billingPolicy.intervalCount = 1;
  const { admin, calls } = mockAdmin(flow(weekly, { BundlifyDraftCommit: committed(3) }));
  const response = await handleContractCreated({ admin, payload: { admin_graphql_api_id: ID, id: 7 }, shop: "demo.myshopify.com" });
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map(c => c.name), ["BundlifyContractLength", "BundlifyContractEdit", "BundlifyDraftLength", "BundlifyDraftCommit", "BundlifySubscriptionPortal"]);
  assert.deepEqual(calls[2].variables.input.billingPolicy, { interval: "WEEK", intervalCount: 1, minCycles: 3, maxCycles: 3, anchors: [{ type: "WEEKDAY", day: 1 }] });
});

test("a missing property reads the contract only and never touches orders", async () => {
  const { admin, calls } = mockAdmin(flow(contract()));
  assert.equal((await applyContractLength({ admin, contractId: ID })).reason, "missing");
  assert.deepEqual(calls.map(c => c.name), ["BundlifyContractLength"]);
});

test("a redelivered webhook after the limit is set sends no mutation", async () => {
  const { admin, calls } = mockAdmin(flow(contract({ value: "3 times", maxCycles: 3, minCycles: 3 })));
  assert.equal((await applyContractLength({ admin, contractId: ID })).reason, "already-set");
  assert.deepEqual(calls.map(c => c.name), ["BundlifyContractLength"]);
});

test("webhook returns 200 when handled or skipped and 500 on Shopify failures", async (t) => {
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "warn", () => {});
  const errors = t.mock.method(console, "error", () => {});
  const payload = { admin_graphql_api_id: ID, id: 7 };

  let { admin } = mockAdmin(flow(contract({ value: "6 times" })));
  assert.equal((await handleContractCreated({ admin, payload, shop: "demo.myshopify.com" })).status, 200);
  ({ admin } = mockAdmin(flow(contract({ value: "lots" }))));
  assert.equal((await handleContractCreated({ admin, payload, shop: "demo.myshopify.com" })).status, 200);
  assert.equal((await handleContractCreated({ admin: undefined, payload, shop: "demo.myshopify.com" })).status, 200);

  ({ admin } = mockAdmin(flow(contract({ value: "6 times" }), {
    BundlifyDraftLength: { data: { subscriptionDraftUpdate: { draft: null, userErrors: [{ field: ["input"], message: "Invalid billing policy", code: "INVALID" }] } } },
  })));
  assert.equal((await handleContractCreated({ admin, payload: { id: 7 }, shop: "demo.myshopify.com" })).status, 500);
  assert.match(errors.mock.calls.at(-1).arguments[0], /SubscriptionContract\/7.*subscriptionDraftUpdate/);
  assert.match(errors.mock.calls.at(-1).arguments[1], /Invalid billing policy/);

  ({ admin } = mockAdmin(flow(contract({ value: "6 times" }), { BundlifyContractLength: { errors: [{ message: "Throttled" }] } })));
  assert.equal((await handleContractCreated({ admin, payload, shop: "demo.myshopify.com" })).status, 500);
});

test("subscriber list shows the cycle limit", () => {
  const base = { id: ID, status: "ACTIVE", customer: {}, deliveryPolicy: { interval: "MONTH", intervalCount: 1 } };
  assert.equal(presentContract("demo.myshopify.com", { ...base, billingPolicy: { maxCycles: 6 } }).cycleLimit, "6 orders total");
  assert.equal(presentContract("demo.myshopify.com", { ...base, billingPolicy: { maxCycles: 1 } }).cycleLimit, "1 order total");
  assert.equal(presentContract("demo.myshopify.com", { ...base, billingPolicy: { maxCycles: null } }).cycleLimit, "Unlimited");
});
