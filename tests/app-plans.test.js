import assert from "node:assert/strict";
import test from "node:test";
import { creationBlocked, limitsFor, planFromSubscription, planFromSubscriptionName, plans } from "../app/services/app-plans.js";
import { validateBundle, validatePlan } from "../app/services/validation.js";

test("free plan limits bundle products and subscription options", () => {
  const limits = limitsFor("free");
  const bundle = new FormData();
  bundle.set("name", "Kit");
  bundle.set("discount", "10");
  bundle.set("discountType", "percentage");
  for (let index = 1; index <= 6; index += 1) bundle.append("productIds", `gid://shopify/Product/${index}`);
  assert.match(validateBundle(bundle, limits).errors.productIds, /2 and 5/);

  const plan = new FormData();
  plan.set("name", "Coffee");
  plan.set("productId", "gid://shopify/Product/1");
  plan.set("deliveryOptions", JSON.stringify([
    { frequency: "Weekly", discount: 5, discountType: "percentage" },
    { frequency: "Monthly", discount: 10, discountType: "percentage" },
    { frequency: "Yearly", discount: 15, discountType: "percentage" },
  ]));
  assert.match(validatePlan(plan, limits).errors.deliveryOptions, /1–2/);
  assert.match(creationBlocked(limits, "bundle", 5), /Free plan includes 5 bundles/);
  assert.equal(creationBlocked(limits, "bundle", 4), null);
  assert.match(creationBlocked(limits, "plan", 2), /2 subscription plans/);
});

test("paid plans raise the bundle and subscription limits", () => {
  assert.deepEqual(
    ["starter", "growth", "unlimited"].map((handle) => limitsFor(handle).maxProducts),
    [10, 15, 50],
  );
  assert.deepEqual(
    ["starter", "growth", "unlimited"].map((handle) => limitsFor(handle).maxOptions),
    [3, 7, 7],
  );
  assert.deepEqual(
    ["free", "starter", "growth", "unlimited"].map((handle) => limitsFor(handle).maxBundles),
    [5, 10, 15, null],
  );
  assert.deepEqual(
    ["free", "starter", "growth", "unlimited"].map((handle) => limitsFor(handle).maxPlans),
    [2, 3, 7, null],
  );
});

test("subscription name or USD price maps to the paid plan Shopify reports", () => {
  assert.equal(plans.find((plan) => plan.handle === "growth").price, 14);
  assert.equal(planFromSubscriptionName("Bundle Base Growth").handle, "growth");
  assert.equal(planFromSubscriptionName("Growth").handle, "growth");
  assert.equal(planFromSubscriptionName("growth").handle, "growth");
  assert.equal(planFromSubscriptionName("Free"), null);
  assert.equal(planFromSubscription({ name: "Something else", lineItems: [{ plan: { pricingDetails: { price: { amount: "14.0", currencyCode: "USD" } } } }] }).handle, "growth");
  assert.equal(planFromSubscription({ name: "Something else", lineItems: [{ plan: { pricingDetails: { price: { amount: "14.0", currencyCode: "CAD" } } } }] }), null);
});
