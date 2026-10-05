import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_APP_HANDLE, billingReturnUrl, hostedPlanSelectionPath, hostedPlanSelectionUrl, isApprovedCharge } from "../app/services/billing-return.js";

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

test("hosted plan page stays in the shop admin and uses Shopify's app handle", () => {
  assert.equal(ADMIN_APP_HANDLE, "bundlify-36");
  assert.equal(hostedPlanSelectionPath(), "shopify://admin/charges/bundlify-36/pricing_plans");
  assert.equal(
    hostedPlanSelectionUrl({ shop: "bundlify-apps-test.myshopify.com" }),
    "https://admin.shopify.com/store/bundlify-apps-test/charges/bundlify-36/pricing_plans",
  );
  assert.equal(
    hostedPlanSelectionUrl({ shop: "demo-store.myshopify.com", appHandle: "bundle-base" }),
    "https://admin.shopify.com/store/demo-store/charges/bundle-base/pricing_plans",
  );
  for (const appHandle of ["", "Bundle Base", "../growth", "growth?x=1"])
    assert.throws(() => hostedPlanSelectionUrl({ shop: "demo.myshopify.com", appHandle }), /app/);
  assert.throws(() => hostedPlanSelectionUrl({ shop: "evil.com/../x", appHandle: "bundle-base" }), /Unknown shop/);
});

test("a charge is approved only when it is the shop's active subscription", () => {
  assert.equal(isApprovedCharge("gid://shopify/AppSubscription/123", "123"), true);
  assert.equal(isApprovedCharge("gid://shopify/AppSubscription/999", "123"), false, "declined upgrade keeps the old plan");
  assert.equal(isApprovedCharge(null, "123"), false);
  assert.equal(isApprovedCharge("gid://shopify/AppSubscription/123", ""), false);
  assert.equal(isApprovedCharge("gid://shopify/AppSubscription/123", "12x"), false);
});
