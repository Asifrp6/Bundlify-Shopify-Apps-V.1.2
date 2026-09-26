import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { customerSession } from "../app/services/customer-session.server.js";
import { presentContract } from "../app/services/subscription-portal.server.js";

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
});
