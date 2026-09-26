const CONTRACTS = `#graphql
query BundlifySubscriberContracts($after: String) {
  subscriptionContracts(first: 25, after: $after) {
    nodes {
      id
      status
      nextBillingDate
      customer { id displayName }
      deliveryPolicy { interval intervalCount }
      lines(first: 8) { nodes { title quantity currentPrice { amount currencyCode } } }
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

export function presentContract(shop, contract) {
  const order = contract.orders?.nodes?.[0];
  const every = contract.deliveryPolicy?.intervalCount;
  const interval = String(contract.deliveryPolicy?.interval || "").toLowerCase();
  return {
    id: contract.id,
    status: contract.status,
    nextBillingDate: contract.nextBillingDate,
    customerName: contract.customer?.displayName || "Customer",
    customerUrl: adminLink(shop, "customers", contract.customer?.id),
    orderName: order?.name || null,
    orderUrl: adminLink(shop, "orders", order?.id),
    frequency: every && interval ? `Every ${every} ${interval}${every === 1 ? "" : "s"}`.replace("Every 1 ", "Every ") : "Scheduled delivery",
    lines: (contract.lines?.nodes || []).map(line => ({
      title: line.title,
      quantity: line.quantity,
      amount: line.currentPrice?.amount,
      currencyCode: line.currentPrice?.currencyCode,
    })),
  };
}

export async function listSubscriberContracts(admin, shop) {
  const response = await admin.graphql(CONTRACTS);
  const result = await response.json();
  if (result.errors?.length || !result.data?.subscriptionContracts) return [];
  return result.data.subscriptionContracts.nodes.map(contract => presentContract(shop, contract));
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
