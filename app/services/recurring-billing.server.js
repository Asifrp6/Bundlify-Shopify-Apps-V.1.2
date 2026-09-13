import { createHash } from "node:crypto";

export const CONTRACTS = `#graphql
query BundlifyContracts($after: String) {
  subscriptionContracts(first: 50, after: $after) {
    nodes { id status createdAt }
    pageInfo { hasNextPage endCursor }
  }
}`;
export const CYCLES = `#graphql
query BundlifyBillingCycles($id: ID!, $after: String, $start: DateTime!, $end: DateTime!) {
  subscriptionBillingCycles(contractId: $id, first: 50, after: $after,
    billingCyclesDateRangeSelector: {startDate: $start, endDate: $end}) {
    nodes {
      cycleIndex billingAttemptExpectedDate skipped status
      billingAttempts(first: 1, reverse: true) { nodes { id ready errorCode nextActionUrl } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;
export const CONTRACT_STATUS = `#graphql
query BundlifyContractStatus($id: ID!) { subscriptionContract(id: $id) { id status } }
`;
export const BILL_CYCLE = `#graphql
mutation BundlifyBillCycle($id: ID!, $input: SubscriptionBillingAttemptInput!) {
  subscriptionBillingAttemptCreate(subscriptionContractId: $id, subscriptionBillingAttemptInput: $input) {
    subscriptionBillingAttempt { id ready errorCode nextActionUrl }
    userErrors { field message }
  }
}`;

async function query(admin, document, variables) {
  const result = await (await admin.graphql(document, { variables })).json();
  if (result.errors?.length || !result.data) throw new Error("Shopify could not confirm the billing request.");
  return result.data;
}

function nextCursor(connection, seen) {
  if (!Array.isArray(connection?.nodes) || !connection.pageInfo) throw new Error("Invalid billing pagination.");
  if (!connection.pageInfo.hasNextPage) return null;
  const next = connection.pageInfo.endCursor;
  if (!next || seen.has(next)) throw new Error("Invalid billing cursor.");
  seen.add(next);
  return next;
}

export function billingKey(shop, contractId, cycleIndex) {
  return createHash("sha256").update(`bundlify:${shop}:${contractId}:${cycleIndex}`).digest("hex");
}

// Shopify owns the calendar (including month ends, skipped cycles and schedule edits).
// A stable key makes timeouts, overlapping workers and process restarts safe to retry.
export async function billContract({ admin, shop, contract, now }) {
  if (contract.status !== "ACTIVE") return { status: "inactive" };
  const seen = new Set();
  let after = null;
  do {
    const { subscriptionBillingCycles: connection } = await query(admin, CYCLES, {
      id: contract.id, after, start: contract.createdAt, end: now.toISOString(),
    });
    const next = nextCursor(connection, seen);
    for (const cycle of connection.nodes) {
      if (cycle.skipped || cycle.status !== "UNBILLED" || new Date(cycle.billingAttemptExpectedDate) > now) continue;
      const previous = cycle.billingAttempts.nodes[0];
      if (previous?.ready && !previous.errorCode && !previous.nextActionUrl) continue;
      // Failed payments require merchant/customer attention, not repeated automatic charges.
      if (previous) return { status: previous.errorCode ? "failed" : previous.nextActionUrl ? "action_required" : "pending", attemptId: previous.id, errorCode: previous.errorCode };
      const { subscriptionContract: current } = await query(admin, CONTRACT_STATUS, { id: contract.id });
      if (current?.status !== "ACTIVE") return { status: "inactive" };
      const { subscriptionBillingAttemptCreate: payload } = await query(admin, BILL_CYCLE, {
        id: contract.id,
        input: {
          idempotencyKey: billingKey(shop, contract.id, cycle.cycleIndex),
          billingCycleSelector: { index: cycle.cycleIndex },
          originTime: cycle.billingAttemptExpectedDate,
        },
      });
      if (!payload || payload.userErrors?.length || !payload.subscriptionBillingAttempt?.id)
        throw new Error(payload?.userErrors?.map(error => error.message).join(" ") || "Shopify did not confirm the billing attempt.");
      const attempt = payload.subscriptionBillingAttempt;
      // Process at most one overdue cycle per contract per run, waiting for its outcome.
      return { status: attempt.errorCode ? "failed" : attempt.nextActionUrl ? "action_required" : attempt.ready ? "billed" : "pending", attemptId: attempt.id, errorCode: attempt.errorCode };
    }
    after = next;
  } while (after);
  return { status: "not_due" };
}

export async function runRecurringBilling({ admin, shop, now = new Date() }) {
  const results = [];
  const seen = new Set();
  let after = null;
  do {
    const { subscriptionContracts: connection } = await query(admin, CONTRACTS, { after });
    const next = nextCursor(connection, seen);
    for (const contract of connection.nodes) {
      if (contract.status !== "ACTIVE") continue;
      try { results.push({ contractId: contract.id, ...await billContract({ admin, shop, contract, now }) }); }
      catch (error) { results.push({ contractId: contract.id, status: "error", message: error.message }); }
    }
    after = next;
  } while (after);
  return results;
}
