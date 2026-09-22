import test from "node:test";
import assert from "node:assert/strict";
import { validateBundle, validatePlan } from "../app/services/validation.js";
import { sellingPlanInput, optionRecords } from "../app/services/delivery-options.js";
import { setSubscriptionStatus } from "../app/services/subscription-status.server.js";
import { cartLinesDiscountsGenerateRun as run } from "../extensions/bundle-discount/src/cart_lines_discounts_generate_run.js";

test("fixed discounts preserve cents, reject invalid amounts and default legacy forms to percentage", () => {
  const form = new FormData();
  form.set("name", "Coffee");
  form.append("productIds", "gid://shopify/Product/1");
  form.append("productIds", "gid://shopify/Product/2");
  form.set("discountType", "fixed");
  form.set("discount", "12.75");
  assert.deepEqual(validateBundle(form).errors, {});
  assert.equal(validateBundle(form).values.discount, 12.75);
  for (const value of ["", "-1", "1.001", "Infinity", "1000001"]) {
    form.set("discount", value);
    assert.ok(validateBundle(form).errors.discount);
  }
  form.delete("discountType"); form.set("discount", "10");
  assert.equal(validateBundle(form).values.discountType, "percentage");
  form.set("productId", "SELECTED_PRODUCTS");
  form.set("deliveryOptions", JSON.stringify([{ frequency: "Monthly", discount: 12.75, discountType: "fixed" }]));
  const { values, errors } = validatePlan(form);
  assert.deepEqual(errors, {});
  assert.equal(values.productIds.length, 2);
  assert.equal(optionRecords(values.deliveryOptions)[0].discountType, "fixed");
  assert.deepEqual(sellingPlanInput("Coffee", values.deliveryOptions[0]).pricingPolicies, [{ fixed: { adjustmentType: "FIXED_AMOUNT", adjustmentValue: { fixedValue: "12.75" } } }]);
});

test("category-selected draft activation assigns exactly its saved products", async () => {
  const ids = ["gid://shopify/Product/1", "gid://shopify/Product/2"];
  let assigned;
  const admin = { graphql: async (query, { variables }) => {
    if (query.includes("nodes(ids:")) return Response.json({ data: { nodes: ids.map(id => ({ id, title: id })) } });
    assigned = variables.resources.productIds;
    return Response.json({ data: { sellingPlanGroupCreate: { sellingPlanGroup: { id: "group", sellingPlans: { nodes: [] } }, userErrors: [] } } });
  } };
  const prisma = { subscriptionPlan: { updateMany: async () => ({ count: 1 }), update: async () => ({}) } };
  await setSubscriptionStatus({ prisma, admin, status: "ACTIVE", plan: { id: 1, shop: "shop", status: "DRAFT", name: "Coffee", productId: "SELECTED_PRODUCTS", productIdsJson: JSON.stringify(ids), frequency: "Monthly", discount: 2.5, discountType: "fixed" } });
  assert.deepEqual(assigned, ids);
});

test("fixed bundle savings apply per complete set with currency conversion and exclude extra items", () => {
  const line = (id, product, quantity, group = "one") => ({ id, quantity, merchandise: { product: { id: product } }, bundle: { value: "7" }, group: { value: group } });
  const input = { presentmentCurrencyRate: "1.5", discount: { metafield: { jsonValue: { id: "7", discountType: "fixed", fixedAmount: 2.5, products: ["a", "b"] } } }, cart: { lines: [line("1", "a", 3), line("2", "b", 2), line("3", "a", 1, "incomplete")] } };
  const candidates = run(input).operations[0].productDiscountsAdd.candidates;
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].value, { fixedAmount: { amount: "7.50", appliesToEachItem: false } });
  assert.deepEqual(candidates[0].targets, [{ cartLine: { id: "1", quantity: 2 } }, { cartLine: { id: "2", quantity: 2 } }]);
  input.cart.lines[1].sellingPlanAllocation = {};
  assert.deepEqual(run(input), { operations: [] });
});
