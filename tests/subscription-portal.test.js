import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { customerSession } from "../app/services/customer-session.server.js";
import {
  CONTRACTS,
  MAX_SUBSCRIBER_PAGES,
  SUBSCRIBER_PAGE_SIZE,
  listSubscriberContracts,
  presentContract,
} from "../app/services/subscription-portal.server.js";

const secret = "secret";
const apiKey = "key";

function token(payload) {
  const header = Buffer.from(JSON.stringify({alg: "HS256", typ: "JWT"})).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

test("customer session accepts a signed customer token", () => {
  const session = customerSession(token({
    aud: apiKey,
    dest: "https://demo.myshopify.com",
    sub: "gid://shopify/Customer/15",
    exp: Math.floor(Date.now() / 1000) + 60,
  }), { apiKey, apiSecret: secret });
  assert.deepEqual(session, { shop: "demo.myshopify.com", customerId: "gid://shopify/Customer/15" });
});

test("customer session rejects another app and an expired token", () => {
  const claims = { aud: apiKey, dest: "demo.myshopify.com", sub: "gid://shopify/Customer/15", exp: Math.floor(Date.now() / 1000) + 60 };
  assert.equal(customerSession(token({ ...claims, aud: "other" }), { apiKey, apiSecret: secret }), null);
  assert.equal(customerSession(token({ ...claims, exp: 1 }), { apiKey, apiSecret: secret }), null);
  assert.equal(customerSession(`${token(claims)}x`, { apiKey, apiSecret: secret }), null);
});

test("subscriber contracts link to the Shopify customer and order", () => {
  const view = presentContract("demo.myshopify.com", {
    id: "gid://shopify/SubscriptionContract/9",
    status: "ACTIVE",
    nextBillingDate: "2026-10-01T00:00:00Z",
    customer: { id: "gid://shopify/Customer/15", displayName: "Amina" },
    deliveryPolicy: { interval: "MONTH", intervalCount: 1 },
    lines: { nodes: [{ title: "Coffee", quantity: 2, currentPrice: { amount: "18.00", currencyCode: "USD" } }] },
    orders: { nodes: [{ id: "gid://shopify/Order/44", name: "#1044" }] },
  });
  assert.equal(view.customerUrl, "https://admin.shopify.com/store/demo/customers/15");
  assert.equal(view.orderUrl, "https://admin.shopify.com/store/demo/orders/44");
  assert.equal(view.frequency, "Every month");
  assert.equal(view.orderName, "#1044");
  assert.deepEqual(view.orderLinks, [{ url: "https://admin.shopify.com/store/demo/orders/44", label: "#1044" }]);
});

test("a different origin order stays linked beside the latest order", () => {
  const view = presentContract("demo.myshopify.com", {
    id: "gid://shopify/SubscriptionContract/9",
    status: "ACTIVE",
    customer: { id: "gid://shopify/Customer/15", displayName: "Amina" },
    originOrder: { id: "gid://shopify/Order/10", name: "#1010" },
    orders: { nodes: [{ id: "gid://shopify/Order/44", name: "#1044" }] },
  });
  assert.equal(view.orderUrl, "https://admin.shopify.com/store/demo/orders/44");
  assert.deepEqual(view.orderLinks, [
    { url: "https://admin.shopify.com/store/demo/orders/10", label: "Origin #1010" },
    { url: "https://admin.shopify.com/store/demo/orders/44", label: "#1044" },
  ]);
});

function contractNode(id) {
  return {
    id: `gid://shopify/SubscriptionContract/${id}`,
    status: "ACTIVE",
    customer: { id: "gid://shopify/Customer/15", displayName: "Amina" },
    deliveryPolicy: { interval: "MONTH", intervalCount: 1 },
    lines: { nodes: [] },
    originOrder: { id: "gid://shopify/Order/10", name: "#1010" },
    orders: { nodes: [{ id: "gid://shopify/Order/44", name: "#1044" }] },
  };
}

function page(nodes, { hasNextPage = false, endCursor = null } = {}) {
  return Response.json({ data: { subscriptionContracts: { nodes, pageInfo: { hasNextPage, endCursor } } } });
}

test("subscriber contracts page past the first 25 and keep customer and order links", async () => {
  assert.equal(SUBSCRIBER_PAGE_SIZE, 25);
  assert.equal(MAX_SUBSCRIBER_PAGES * SUBSCRIBER_PAGE_SIZE, 500);
  assert.match(CONTRACTS, /subscriptionContracts\(first: 25, after: \$after\)/);
  assert.match(CONTRACTS, /pageInfo \{ hasNextPage endCursor \}/);
  assert.match(CONTRACTS, /originOrder \{ id name \}/);
  assert.match(CONTRACTS, /orders\(first: 1, reverse: true\)/);

  const first = Array.from({ length: 25 }, (_, index) => contractNode(index + 1));
  const rest = [contractNode(26), contractNode(27)];
  const requested = [];
  const admin = {
    graphql: async (_document, { variables } = {}) => {
      requested.push(variables?.after ?? null);
      if (variables?.after == null) return page(first, { hasNextPage: true, endCursor: "cursor-2" });
      assert.equal(variables.after, "cursor-2");
      return page(rest);
    },
  };

  const result = await listSubscriberContracts(admin, "demo.myshopify.com");
  assert.deepEqual(requested, [null, "cursor-2"]);
  assert.equal(result.contracts.length, 27);
  assert.equal(result.after, null);
  for (const contract of result.contracts) {
    assert.equal(contract.customerUrl, "https://admin.shopify.com/store/demo/customers/15");
    assert.equal(contract.orderUrl, "https://admin.shopify.com/store/demo/orders/44");
    assert.equal(contract.orderLinks[0].url, "https://admin.shopify.com/store/demo/orders/10");
    assert.equal(contract.orderLinks[1].url, "https://admin.shopify.com/store/demo/orders/44");
  }
});

test("the subscriber page cap returns the next cursor instead of dropping the rest", async () => {
  const admin = {
    graphql: async () => page([contractNode(1)], { hasNextPage: true, endCursor: "more" }),
  };
  const result = await listSubscriberContracts(admin, "demo.myshopify.com", { maxPages: 1 });
  assert.deepEqual(result.contracts.map(contract => contract.id), ["gid://shopify/SubscriptionContract/1"]);
  assert.equal(result.after, "more");
  assert.equal(result.contracts[0].customerUrl, "https://admin.shopify.com/store/demo/customers/15");
  assert.equal(result.contracts[0].orderUrl, "https://admin.shopify.com/store/demo/orders/44");
});

test("a repeated subscriber cursor stops paging and keeps contracts already loaded", async () => {
  let calls = 0;
  const admin = {
    graphql: async () => {
      calls += 1;
      if (calls > 3) throw new Error("Pagination continued after the loop");
      return page([contractNode(calls)], { hasNextPage: true, endCursor: "A" });
    },
  };
  const result = await listSubscriberContracts(admin, "demo.myshopify.com");
  assert.equal(calls, 2);
  assert.deepEqual(result.contracts.map(contract => contract.id), [
    "gid://shopify/SubscriptionContract/1",
    "gid://shopify/SubscriptionContract/2",
  ]);
  assert.equal(result.after, null);
});

test("a denied optional order field still lists the contract and its latest order", async () => {
  const node = contractNode(1);
  delete node.originOrder;
  const admin = {
    graphql: async () => Response.json({
      errors: [{ message: "Access denied for originOrder field.", extensions: { code: "ACCESS_DENIED" } }],
      data: { subscriptionContracts: { nodes: [node], pageInfo: { hasNextPage: false, endCursor: null } } },
    }),
  };
  const result = await listSubscriberContracts(admin, "demo.myshopify.com");
  assert.equal(result.contracts.length, 1);
  assert.equal(result.after, null);
  assert.equal(result.contracts[0].customerUrl, "https://admin.shopify.com/store/demo/customers/15");
  assert.equal(result.contracts[0].orderUrl, "https://admin.shopify.com/store/demo/orders/44");
  assert.deepEqual(result.contracts[0].orderLinks, [{ url: "https://admin.shopify.com/store/demo/orders/44", label: "#1044" }]);
});

test("a failed later subscriber page keeps earlier contracts and the cursor to retry", async () => {
  const admin = {
    graphql: async (_document, { variables } = {}) => {
      if (variables?.after == null) return page([contractNode(1)], { hasNextPage: true, endCursor: "next" });
      return Response.json({ errors: [{ message: "Throttled" }] });
    },
  };
  const result = await listSubscriberContracts(admin, "demo.myshopify.com");
  assert.deepEqual(result.contracts.map(contract => contract.id), ["gid://shopify/SubscriptionContract/1"]);
  assert.equal(result.after, "next");
  assert.equal(result.contracts[0].customerUrl, "https://admin.shopify.com/store/demo/customers/15");
  assert.equal(result.contracts[0].orderUrl, "https://admin.shopify.com/store/demo/orders/44");
});
