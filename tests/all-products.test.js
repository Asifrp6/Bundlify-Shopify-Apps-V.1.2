import test from "node:test";
import assert from "node:assert/strict";
import { validatePlan } from "../app/services/validation.js";
import { createSellingPlan, CREATE_SELLING_PLAN, ADD_PLAN_PRODUCTS, DELETE_SELLING_PLAN } from "../app/services/sellingPlan.server.js";

const values = { name: "All products club", productId: "ALL_PRODUCTS", frequency: "Weekly", discount: 10 };
const id = "gid://shopify/SellingPlanGroup/1";
test("all-products selection validates without accepting arbitrary IDs", () => {
  const form = new FormData();
  Object.entries(values).forEach(([key, value]) => form.set(key, String(value)));
  assert.deepEqual(validatePlan(form).errors, {});
  form.set("productId", "ALL");
  assert.ok(validatePlan(form).errors.productId);
});
test("all catalog products are assigned in API-sized batches", async () => {
  const productIds = Array.from({ length: 601 }, (_, i) => `gid://shopify/Product/${i + 1}`);
  const assigned = [];
  const admin = { graphql: async (doc, { variables }) => {
    assert.ok([CREATE_SELLING_PLAN, ADD_PLAN_PRODUCTS].includes(doc));
    const batch = variables.resources?.productIds || variables.productIds;
    assert.ok(batch.length <= 250);
    assigned.push(...batch);
    return Response.json({ data: { [doc === CREATE_SELLING_PLAN ? "sellingPlanGroupCreate" : "sellingPlanGroupAddProducts"]: { sellingPlanGroup: { id }, userErrors: [] } } });
  } };
  await createSellingPlan(admin, { ...values, productIds });
  assert.deepEqual(assigned, productIds);
});
test("failed catalog assignment rolls back the group and reports rejection", async () => {
  let rolledBack = false;
  const admin = { graphql: async doc => {
    if (doc === CREATE_SELLING_PLAN) return Response.json({ data: { sellingPlanGroupCreate: { sellingPlanGroup: { id }, userErrors: [] } } });
    if (doc === ADD_PLAN_PRODUCTS) throw new Error("Timeout");
    assert.equal(doc, DELETE_SELLING_PLAN);
    rolledBack = true;
    return Response.json({ data: { sellingPlanGroupDelete: { deletedSellingPlanGroupId: id, userErrors: [] } } });
  } };
  await assert.rejects(createSellingPlan(admin, { ...values, productIds: Array.from({ length: 251 }, (_, i) => `gid://shopify/Product/${i + 1}`) }), error => error.rejected);
  assert.equal(rolledBack, true);
});
