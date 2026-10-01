import test from "node:test";
import assert from "node:assert/strict";
import { billingReturnUrl, isApprovedCharge } from "../app/services/billing-return.js";

test("billing return URL is absolute and carries shop and host for the embedded session", () => {
  const url = new URL(billingReturnUrl({ appUrl: "https://bundlify.example.com", shop: "demo-store.myshopify.com" }));
  assert.equal(url.origin, "https://bundlify.example.com");
  assert.equal(url.pathname, "/app/pricing");
  assert.equal(url.searchParams.get("shop"), "demo-store.myshopify.com");
  const host = url.searchParams.get("host");
  assert.doesNotMatch(host, /=/);
  assert.equal(Buffer.from(host, "base64").toString("utf8"), "admin.shopify.com/store/demo-store");
});

test("billing return URL ignores a trailing slash or path on the app URL and accepts a custom path", () => {
  const url = new URL(billingReturnUrl({ appUrl: "https://bundlify.example.com/", shop: "demo.myshopify.com", path: "/app" }));
  assert.equal(url.pathname, "/app");
  assert.equal(url.searchParams.get("shop"), "demo.myshopify.com");
});

test("billing return URL refuses a missing or malformed shop", () => {
  for (const shop of ["", null, "evil.com/../x", "a b.myshopify.com"])
    assert.throws(() => billingReturnUrl({ appUrl: "https://bundlify.example.com", shop }), /Unknown shop/);
});

test("a charge is approved only when it is the shop's active subscription", () => {
  assert.equal(isApprovedCharge("gid://shopify/AppSubscription/123", "123"), true);
  assert.equal(isApprovedCharge("gid://shopify/AppSubscription/999", "123"), false, "declined upgrade keeps the old plan");
  assert.equal(isApprovedCharge(null, "123"), false);
  assert.equal(isApprovedCharge("gid://shopify/AppSubscription/123", ""), false);
  assert.equal(isApprovedCharge("gid://shopify/AppSubscription/123", "12x"), false);
});
