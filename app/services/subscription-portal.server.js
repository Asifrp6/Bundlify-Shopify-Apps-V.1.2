// 25 per page, 20 pages: the merchant list loads up to 500 contracts, then Show more.
export const SUBSCRIBER_PAGE_SIZE = 25;
export const MAX_SUBSCRIBER_PAGES = 20;

export const CONTRACTS = `#graphql
query BundlifySubscriberContracts($after: String) {
  subscriptionContracts(first: 25, after: $after) {
    nodes {
      id
      status
      nextBillingDate
      customer { id displayName }
      deliveryPolicy { interval intervalCount }
      billingPolicy { maxCycles }
      lines(first: 8) { nodes { title quantity currentPrice { amount currencyCode } } }
      originOrder { id name }
      orders(first: 1, reverse: true) { nodes { id name } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const PAYMENT_METHOD = `#graphql
query BundlifyContractPayment($id: ID!) {
  subscriptionContract(id: $id) {
    customer { id }
    customerPaymentMethod { id }
  }
}`;

const SEND_UPDATE = `#graphql
mutation BundlifyPaymentUpdateEmail($id: ID!) {
  customerPaymentMethodSendUpdateEmail(customerPaymentMethodId: $id) {
    customer { id }
    userErrors { field message }
  }
}`;

function adminLink(shop, resource, gid) {
  const id = String(gid || "").split("/").pop();
  if (!/^\d+$/.test(id)) return null;
  return `https://admin.shopify.com/store/${shop.replace(/\.myshopify\.com$/, "")}/${resource}/${id}`;
}

function orderLink(shop, order) {
  const url = adminLink(shop, "orders", order?.id);
  if (!url) return null;
  return { name: order.name || null, url };
}

export function presentContract(shop, contract) {
  const latest = orderLink(shop, contract.orders?.nodes?.[0]);
  const origin = orderLink(shop, contract.originOrder);
  const primary = latest || origin;
  const orderLinks = [];
  if (latest && origin && origin.url !== latest.url) {
    orderLinks.push({ url: origin.url, label: origin.name ? `Origin ${origin.name}` : "Origin order" });
  }
  if (primary) orderLinks.push({ url: primary.url, label: primary.name || "Order" });
  const every = contract.deliveryPolicy?.intervalCount;
  const interval = String(contract.deliveryPolicy?.interval || "").toLowerCase();
  const maxCycles = contract.billingPolicy?.maxCycles;
  return {
    id: contract.id,
    status: contract.status,
    nextBillingDate: contract.nextBillingDate,
    customerName: contract.customer?.displayName || "Customer",
    customerUrl: adminLink(shop, "customers", contract.customer?.id),
    orderName: primary?.name || null,
    orderUrl: primary?.url || null,
    orderLinks,
    frequency: every && interval ? `Every ${every} ${interval}${every === 1 ? "" : "s"}`.replace("Every 1 ", "Every ") : "Scheduled delivery",
    cycleLimit: maxCycles ? `${maxCycles} ${maxCycles === 1 ? "order" : "orders"} total` : "Unlimited",
    lines: (contract.lines?.nodes || []).map(line => ({
      title: line.title,
      quantity: line.quantity,
      amount: line.currentPrice?.amount,
      currencyCode: line.currentPrice?.currencyCode,
    })),
  };
}

export function nextSubscriberCursor(connection, seen) {
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

// Follows hasNextPage / endCursor until the shop's contracts end. The page cap
// returns the next cursor so the subscriptions page can show the rest.
export async function listSubscriberContracts(admin, shop, { after = null, maxPages = MAX_SUBSCRIBER_PAGES } = {}) {
  const contracts = [];
  const seen = new Set();
  let cursor = after || null;
  if (cursor) seen.add(cursor);

  for (let page = 0; page < maxPages; page += 1) {
    let result;
    try {
      const response = await admin.graphql(CONTRACTS, { variables: { after: cursor } });
      result = await response.json();
    } catch {
      return { contracts, after: cursor };
    }
    const connection = result.data?.subscriptionContracts;
    // A denied optional field, such as originOrder, still leaves the contract list usable.
    if (!Array.isArray(connection?.nodes) || !connection.pageInfo) {
      return { contracts, after: cursor };
    }
    contracts.push(...connection.nodes.map(contract => presentContract(shop, contract)));
    let next;
    try {
      next = nextSubscriberCursor(connection, seen);
    } catch {
      return { contracts, after: null };
    }
    if (!next) return { contracts, after: null };
    cursor = next;
  }

  return { contracts, after: cursor };
}

export async function sendPaymentUpdate(admin, { contractId, customerId }) {
  const response = await admin.graphql(PAYMENT_METHOD, { variables: { id: contractId } });
  const result = await response.json();
  const contract = result.data?.subscriptionContract;
  if (result.errors?.length || !contract) throw new Error("This subscription could not be found.");
  if (contract.customer?.id !== customerId) throw new Error("This subscription belongs to a different customer.");
  const methodId = contract.customerPaymentMethod?.id;
  if (!methodId) throw new Error("This subscription has no saved payment method yet.");
  const sent = await admin.graphql(SEND_UPDATE, { variables: { id: methodId } });
  const payload = (await sent.json()).data?.customerPaymentMethodSendUpdateEmail;
  if (payload?.userErrors?.length) throw new Error(payload.userErrors.map(error => error.message).join(" "));
  if (!payload?.customer?.id) throw new Error("Shopify could not send the payment update email.");
}
