import { LENGTH_OPTION } from "./delivery-options.js";
import { emailSubscriptionPortal } from "./subscription-email.server.js";

export const CONTRACT = `#graphql
query BundlifyContractLength($id: ID!) {
  subscriptionContract(id: $id) {
    id
    status
    billingPolicy {
      interval
      intervalCount
      minCycles
      maxCycles
      anchors { type day month cutoffDay }
    }
    lines(first: 50) {
      nodes { variantId sellingPlanId customAttributes { key value } }
    }
  }
}`;

export const CONTRACT_EDIT = `#graphql
mutation BundlifyContractEdit($contractId: ID!) {
  subscriptionContractUpdate(contractId: $contractId) {
    draft { id }
    userErrors { field message code }
  }
}`;

export const DRAFT_UPDATE = `#graphql
mutation BundlifyDraftLength($draftId: ID!, $input: SubscriptionDraftInput!) {
  subscriptionDraftUpdate(draftId: $draftId, input: $input) {
    draft { id }
    userErrors { field message code }
  }
}`;

export const DRAFT_COMMIT = `#graphql
mutation BundlifyDraftCommit($draftId: ID!) {
  subscriptionDraftCommit(draftId: $draftId) {
    contract { id billingPolicy { maxCycles minCycles } }
    userErrors { field message code }
  }
}`;

export const MAX_TIMES = 99;

// Storefront writes "6 times", "1 time" or "Unlimited"; anything else is ignored.
export function parseLength(value) {
  const match = /^\s*(\d{1,2})\s+times?\s*$/i.exec(String(value ?? ""));
  if (!match) return null;
  const times = Number(match[1]);
  return times >= 1 && times <= MAX_TIMES ? times : null;
}

function lengthValues(lines) {
  return (lines || []).flatMap(line => (line?.customAttributes || [])
    .filter(attribute => attribute?.key?.trim().toLowerCase() === LENGTH_OPTION.toLowerCase())
    .map(attribute => attribute.value));
}

// Checkout copies cart line properties onto SubscriptionLine.customAttributes, readable with the
// subscription-contract scopes alone (no read_orders).
export function contractLength(contract) {
  const values = lengthValues(contract?.lines?.nodes);
  if (!values.length) return { times: null, reason: "missing" };
  const parsed = [...new Set(values.map(parseLength))];
  if (parsed.length > 1) return { times: null, reason: "conflicting", values };
  if (parsed[0] == null) return { times: null, reason: values.some(v => /^\s*unlimited\s*$/i.test(v)) ? "unlimited" : "invalid", values };
  return { times: parsed[0] };
}

export function lengthDecision(contract) {
  const { times, reason, values } = contractLength(contract);
  if (!times) return { action: "skip", reason, values };
  if (contract.status && contract.status !== "ACTIVE") return { action: "skip", reason: "inactive", times };
  const policy = contract.billingPolicy;
  if (policy?.maxCycles === times && policy?.minCycles === times) return { action: "skip", reason: "already-set", times };
  return {
    action: "update",
    times,
    billingPolicy: {
      interval: policy.interval,
      intervalCount: policy.intervalCount,
      minCycles: times,
      maxCycles: times,
      anchors: (policy.anchors || []).map(anchor => Object.fromEntries(
        ["type", "day", "month", "cutoffDay"].filter(key => anchor[key] != null).map(key => [key, anchor[key]]))),
    },
  };
}

async function run(admin, document, variables) {
  const result = await (await admin.graphql(document, { variables })).json();
  if (result.errors?.length) throw new Error(result.errors.map(error => error.message).join(" "));
  return result.data;
}

function userErrorsOf(payload, name) {
  if (!payload) return [{ message: `${name} returned no payload` }];
  return payload.userErrors || [];
}

// Returns { status: "updated" | "skipped", ... }; throws when Shopify should retry.
export async function applyContractLength({ admin, contractId }) {
  const contract = (await run(admin, CONTRACT, { id: contractId }))?.subscriptionContract;
  if (!contract) return { status: "skipped", reason: "not-found" };
  const decision = lengthDecision(contract);
  if (decision.action === "skip") return { status: "skipped", reason: decision.reason, times: decision.times ?? null };

  const edit = (await run(admin, CONTRACT_EDIT, { contractId }))?.subscriptionContractUpdate;
  let errors = userErrorsOf(edit, "subscriptionContractUpdate");
  if (errors.length || !edit.draft?.id) throw lengthError(contractId, "subscriptionContractUpdate", errors);
  const draftId = edit.draft.id;

  const update = (await run(admin, DRAFT_UPDATE, { draftId, input: { billingPolicy: decision.billingPolicy } }))?.subscriptionDraftUpdate;
  errors = userErrorsOf(update, "subscriptionDraftUpdate");
  if (errors.length) throw lengthError(contractId, "subscriptionDraftUpdate", errors);

  const commit = (await run(admin, DRAFT_COMMIT, { draftId }))?.subscriptionDraftCommit;
  errors = userErrorsOf(commit, "subscriptionDraftCommit");
  if (errors.length || commit.contract?.billingPolicy?.maxCycles !== decision.times)
    throw lengthError(contractId, "subscriptionDraftCommit", errors);
  return { status: "updated", times: decision.times, contractId: commit.contract.id };
}

function lengthError(contractId, step, userErrors) {
  const error = new Error(`${step} failed for ${contractId}`);
  error.contractId = contractId;
  error.userErrors = userErrors;
  return error;
}

function contractIdFrom(payload) {
  if (typeof payload?.admin_graphql_api_id === "string" && payload.admin_graphql_api_id.startsWith("gid://shopify/SubscriptionContract/"))
    return payload.admin_graphql_api_id;
  return /^\d+$/.test(String(payload?.id ?? "")) ? `gid://shopify/SubscriptionContract/${payload.id}` : null;
}

export async function handleContractCreated({ admin, payload, shop, mail = emailSubscriptionPortal }) {
  const contractId = contractIdFrom(payload);
  if (!contractId) {
    console.warn(`[contract-length] ${shop}: webhook without a contract id`);
    return new Response(null, { status: 200 });
  }
  if (!admin) {
    console.warn(`[contract-length] ${shop} ${contractId}: no offline session, skipped`);
    return new Response(null, { status: 200 });
  }
  try {
    const result = await applyContractLength({ admin, contractId });
    console.log(`[contract-length] ${shop} ${contractId}: ${result.status}${result.reason ? ` (${result.reason})` : ""}${result.times ? ` maxCycles=${result.times}` : ""}`);
  } catch (error) {
    console.error(`[contract-length] ${shop} ${contractId}: ${error.message}`, JSON.stringify(error.userErrors || []));
    return new Response(null, { status: 500 });
  }
  try {
    const emailed = await mail({ admin, contractId, shop, payload });
    console.log(`[subscription-email] ${shop} ${contractId}: ${emailed.status}${emailed.reason ? ` (${emailed.reason})` : ""}`);
  } catch (error) {
    console.error(`[subscription-email] ${shop} ${contractId}: ${error.message}`);
  }
  return new Response(null, { status: 200 });
}
