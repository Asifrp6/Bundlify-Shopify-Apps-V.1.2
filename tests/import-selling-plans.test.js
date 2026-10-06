import test from "node:test";
import assert from "node:assert/strict";
import { recordFromGroup } from "../app/services/import-selling-plans.server.js";

const plan = (id, frequency, percentage, extra = []) => ({
  id,
  name: `${frequency} — ${frequency.toLowerCase()} delivery`,
  options: [frequency, ...extra],
  pricingPolicies: [{ adjustmentType: "PERCENTAGE", adjustmentValue: { percentage } }],
});

test("app selling plan groups become subscription records", () => {
  const record = recordFromGroup({
    id: "gid://shopify/SellingPlanGroup/35",
    name: "Monthly",
    merchantCode: "bundlify-35",
    products: { nodes: [{ id: "gid://shopify/Product/1", title: "Luna" }, { id: "gid://shopify/Product/2", title: "Sol" }] },
    sellingPlans: { nodes: [plan("gid://shopify/SellingPlan/1", "Monthly", 10, ["Unlimited"])] },
  });
  assert.equal(record.name, "Monthly");
  assert.equal(record.productId, "ALL_PRODUCTS");
  assert.equal(record.productTitle, "All products");
  assert.equal(record.frequency, "Monthly");
  assert.equal(record.discount, 10);
  assert.equal(record.status, "ACTIVE");
  assert.equal(record.lengthEnabled, true);
  assert.equal(record.deliveryOptions[0].sellingPlanId, "gid://shopify/SellingPlan/1");
});

test("a single-product group keeps that product", () => {
  const record = recordFromGroup({
    id: "gid://shopify/SellingPlanGroup/34",
    name: "Weekly",
    merchantCode: "bundlify-34",
    products: { nodes: [{ id: "gid://shopify/Product/9", title: "Luna" }] },
    sellingPlans: { nodes: [plan("gid://shopify/SellingPlan/2", "Weekly", 5)] },
  });
  assert.equal(record.productId, "gid://shopify/Product/9");
  assert.equal(record.productTitle, "Luna");
  assert.equal(record.lengthEnabled, false);
});

test("plans from another app are ignored", () => {
  assert.equal(recordFromGroup({
    id: "gid://shopify/SellingPlanGroup/1",
    name: "Other",
    merchantCode: "other-app",
    sellingPlans: { nodes: [plan("gid://shopify/SellingPlan/3", "Weekly", 5)] },
  }), null);
});
