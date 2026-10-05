// Customer Account API: customer.subscriptionContracts(first, after) plus pageInfo.
export const CONTRACT_PAGE_SIZE = 20;
export const MAX_CONTRACT_PAGES = 25;

export const CONTRACTS = `query CustomerSubscriptions($after: String) {
  customer {
    subscriptionContracts(first: ${CONTRACT_PAGE_SIZE}, after: $after) {
      nodes {
        id
        status
        nextBillingDate
        currencyCode
        deliveryPolicy { interval intervalCount { count } }
        lines(first: 10) {
          nodes { id title variantTitle quantity currentPrice { amount currencyCode } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export function contractLineNodes(contract) {
  const nodes = contract?.lines?.nodes;
  return Array.isArray(nodes) ? nodes : [];
}

function pageError(message, contracts, after) {
  const error = new Error(message);
  error.contracts = contracts;
  error.after = after;
  return error;
}

export function nextSubscriptionCursor(connection, seen) {
  if (!Array.isArray(connection?.nodes) || !connection.pageInfo) {
    throw new Error("Invalid subscription pagination.");
  }
  if (!connection.pageInfo.hasNextPage) return null;
  const next = connection.pageInfo.endCursor;
  if (typeof next !== "string" || !next || seen.has(next)) {
    throw new Error("Invalid subscription pagination.");
  }
  seen.add(next);
  return next;
}

// Follows hasNextPage / endCursor until the list ends. A page cap returns the
// next cursor so the customer account page can load the rest.
export async function loadSubscriptionContracts(requestPage, {after = null, maxPages = MAX_CONTRACT_PAGES} = {}) {
  const contracts = [];
  const seen = new Set();
  let cursor = after || null;
  if (cursor) seen.add(cursor);

  for (let page = 0; page < maxPages; page += 1) {
    let body;
    try {
      body = await requestPage(cursor);
    } catch (error) {
      throw pageError(error?.message || "Subscriptions could not be loaded.", contracts, cursor);
    }
    const connection = body?.data?.customer?.subscriptionContracts;
    if (!Array.isArray(connection?.nodes) || !connection.pageInfo) {
      const message = Array.isArray(body?.errors)
        ? body.errors.map((error) => error.message).filter(Boolean).join(" ")
        : "";
      throw pageError(message || "Invalid subscription pagination.", contracts, cursor);
    }
    contracts.push(...connection.nodes);
    let next;
    try {
      next = nextSubscriptionCursor(connection, seen);
    } catch (error) {
      throw pageError(error.message, contracts, null);
    }
    if (!next) return {contracts, after: null};
    cursor = next;
  }

  return {contracts, after: cursor};
}
