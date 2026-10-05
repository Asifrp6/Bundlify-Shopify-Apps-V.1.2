import test from "node:test";
import assert from "node:assert/strict";
import { handleContractCreated } from "../app/services/contract-length.server.js";
import { emailSubscriptionPortal, subscriptionPortalUrl } from "../app/services/subscription-email.server.js";

const ID = "gid://shopify/SubscriptionContract/7";
const PORTAL = "https://shopify.com/42/account/pages/customer-subscriptions";
const settings = { host: "smtp.test", port: 587, from: "Demo <shop@example.com>", user: "shop", password: "secret" };

function unlimited() {
  return {
    id: ID,
    status: "ACTIVE",
    billingPolicy: { interval: "MONTH", intervalCount: 1, minCycles: null, maxCycles: null, anchors: [] },
    lines: { nodes: [{ customAttributes: [{ key: "Subscription length", value: "Unlimited" }] }] },
  };
}

function adminFor(portal = {
  subscriptionContract: { customer: { defaultEmailAddress: { emailAddress: "buyer@example.com" } } },
  shop: { name: "Demo Coffee", customerAccountsV2: { url: "https://shopify.com/42/account" } },
}) {
  return { graphql: async (document) => {
    const name = /(query|mutation)\s+(\w+)/.exec(document)[2];
    if (name === "BundlifyContractLength") return Response.json({ data: { subscriptionContract: unlimited() } });
    if (name === "BundlifySubscriptionPortal") return Response.json({ data: portal });
    throw new Error(`unexpected ${name}`);
  } };
}

test("customer account root becomes this app's subscriptions page", () => {
  assert.equal(subscriptionPortalUrl("https://shopify.com/42/account"), PORTAL);
  assert.equal(subscriptionPortalUrl("https://shopify.com/42/account/"), PORTAL);
  assert.equal(subscriptionPortalUrl("https://bundlebase.imranwebstudio.me"), null);
  assert.equal(subscriptionPortalUrl("https://bundlify.imranwebstudio.me/account"), null);
  assert.equal(subscriptionPortalUrl("https://admin.shopify.com/store/demo"), null);
});

test("a new subscription contract emails the portal link, and anything else does not", async (t) => {
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "error", () => {});
  const sent = [];
  const mail = (args) => emailSubscriptionPortal({ ...args, settings, transport: async (message) => sent.push(message) });
  const shop = "demo.myshopify.com";

  assert.equal((await handleContractCreated({ admin: adminFor(), payload: {}, shop, mail })).status, 200);
  assert.equal((await handleContractCreated({ admin: undefined, payload: { admin_graphql_api_id: ID }, shop, mail })).status, 200);
  assert.equal(sent.length, 0);

  const response = await handleContractCreated({
    admin: adminFor(),
    payload: { admin_graphql_api_id: ID, id: 7 },
    shop,
    mail,
  });
  assert.equal(response.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "buyer@example.com");
  assert.equal(sent[0].subject, "Manage your subscription");
  assert.match(sent[0].text, new RegExp(PORTAL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(sent[0].text, /imranwebstudio|admin\.shopify\.com/);
});

test("missing mail settings skip the send and do not fail the contract webhook", async (t) => {
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  const transport = async () => { throw new Error("should not send"); };
  const skipped = await emailSubscriptionPortal({
    admin: adminFor(),
    contractId: ID,
    settings: null,
    transport,
  });
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.reason, "not-configured");
  assert.match(skipped.text, /\/pages\/customer-subscriptions/);

  const sent = [];
  const response = await handleContractCreated({
    admin: adminFor(),
    payload: { admin_graphql_api_id: ID },
    shop: "demo.myshopify.com",
    mail: async () => { sent.push("x"); throw new Error("mailbox unavailable"); },
  });
  assert.equal(response.status, 200);
  assert.equal(sent.length, 1);
});
