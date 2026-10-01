import test from "node:test";
import assert from "node:assert/strict";
import { assignmentChanges, planSelection, selectionReady, selectionSummary, toggleProduct, withMissingProducts } from "../app/services/product-selection.js";
import { changeSubscription, PLAN_QUERY, UPDATE_PLAN } from "../app/services/subscription-management.server.js";
import { ADD_PLAN_PRODUCTS, PLAN_PRODUCTS_QUERY, PLAN_VARIANTS_QUERY, REMOVE_PLAN_PRODUCTS, REMOVE_PLAN_VARIANTS } from "../app/services/sellingPlan.server.js";
import { resolvePlanProducts, SELECTED_PRODUCTS_QUERY } from "../app/services/products.server.js";
import { validatePlan } from "../app/services/validation.js";

const gid = n => `gid://shopify/Product/${n}`;

test("editor opens with the saved plan selection", () => {
  assert.deepEqual(planSelection({ productId: "ALL_PRODUCTS", productIdsJson: JSON.stringify([gid(1), gid(2)]) }), { productId: "ALL_PRODUCTS", selected: [] });
  assert.deepEqual(planSelection({ productId: "SELECTED_PRODUCTS", productIdsJson: JSON.stringify([gid(1), gid(2), gid(1)]) }), { productId: "SELECTED_PRODUCTS", selected: [gid(1), gid(2)] });
  assert.deepEqual(planSelection({ productId: gid(3), productIdsJson: "[]" }), { productId: gid(3), selected: [] });
  assert.deepEqual(planSelection({ productId: gid(3), productIdsJson: JSON.stringify([gid(3), gid(4)]) }), { productId: "SELECTED_PRODUCTS", selected: [gid(3), gid(4)] });
  assert.deepEqual(planSelection({ productId: gid(3), productIdsJson: "not json" }), { productId: gid(3), selected: [] });
});

test("saved products missing from the catalog stay visible and marked", () => {
  const choices = withMissingProducts([{ id: gid(1), title: "Beans" }], [gid(1), gid(9)], { [gid(9)]: "Old mug" });
  assert.deepEqual(choices.map(p => [p.id, p.title, !!p.missing]), [[gid(1), "Beans", false], [gid(9), "Old mug", true]]);
  assert.match(withMissingProducts([], [gid(7)])[0].title, /Unavailable product \(7\)/);
});

test("selection helpers enforce the plan cap", () => {
  assert.deepEqual(toggleProduct(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleProduct(["a", "b"], "a"), ["b"]);
  assert.equal(selectionReady("SELECTED_PRODUCTS", ["a", "b", "c"], 2), false);
  assert.equal(selectionReady("SELECTED_PRODUCTS", [], 2), false);
  assert.equal(selectionReady("ALL_PRODUCTS", [], 2), true);
  assert.equal(selectionReady("", [], 2), false);
  assert.equal(selectionSummary("SELECTED_PRODUCTS", ["a", "b"], []), "2 selected products");
  assert.deepEqual(assignmentChanges(["a", "b"], ["b", "c"]), { add: ["c"], remove: ["a"] });
});

test("over-cap product selections are still rejected by validation", () => {
  const form = new FormData();
  form.set("name", "Coffee");
  form.set("productId", "SELECTED_PRODUCTS");
  form.set("deliveryOptions", JSON.stringify([{ frequency: "Monthly", discount: 5 }]));
  for (const n of [1, 2, 3]) form.append("productIds", gid(n));
  assert.match(validatePlan(form, { maxProducts: 2, maxOptions: 2 }).errors.productId, /between 1 and 2 products/);
});

test("resolvePlanProducts reports unavailable products instead of dropping them", async () => {
  const admin = { graphql: async (doc) => { assert.equal(doc, SELECTED_PRODUCTS_QUERY); return Response.json({ data: { nodes: [{ id: gid(1), title: "Beans" }, null] } }); } };
  const result = await resolvePlanProducts(admin, { productId: "SELECTED_PRODUCTS", productIds: [gid(1), gid(2)] });
  assert.match(result.error, /no longer available/);
});

function shopifyAdmin({ products = [], variants = [], addErrors = [] } = {}) {
  const calls = [];
  const connection = nodes => ({ nodes, pageInfo: { hasNextPage: false, endCursor: null } });
  return { calls, graphql: async (doc, { variables }) => {
    calls.push({ doc, variables });
    if (doc === PLAN_QUERY) return Response.json({ data: { sellingPlanGroup: { id: "group", sellingPlans: { nodes: [{ id: "month", options: ["Monthly"] }], pageInfo: { hasNextPage: false } } } } });
    if (doc === PLAN_PRODUCTS_QUERY) return Response.json({ data: { sellingPlanGroup: { products: connection(products.map(id => ({ id }))) } } });
    if (doc === PLAN_VARIANTS_QUERY) return Response.json({ data: { sellingPlanGroup: { productVariants: connection(variants) } } });
    if (doc === ADD_PLAN_PRODUCTS) return Response.json({ data: { sellingPlanGroupAddProducts: { sellingPlanGroup: addErrors.length ? null : { id: "group" }, userErrors: addErrors } } });
    if (doc === REMOVE_PLAN_PRODUCTS) return Response.json({ data: { sellingPlanGroupRemoveProducts: { removedProductIds: variables.productIds, userErrors: [] } } });
    if (doc === REMOVE_PLAN_VARIANTS) return Response.json({ data: { sellingPlanGroupRemoveProductVariants: { removedProductVariantIds: variables.productVariantIds, userErrors: [] } } });
    if (doc === UPDATE_PLAN) return Response.json({ data: { sellingPlanGroupUpdate: { sellingPlanGroup: { id: "group", sellingPlans: { nodes: [{ id: "month", options: ["Monthly"] }] } }, userErrors: [] } } });
    throw new Error("unexpected document");
  } };
}
const values = { name: "Coffee", deliveryOptions: [{ frequency: "Monthly", discount: 5 }] };

test("editing an all-products plan to specific products updates Shopify and the local plan", async () => {
  const admin = shopifyAdmin({ products: [gid(1), gid(2), gid(3)], variants: [{ id: "gid://shopify/ProductVariant/40", product: { id: gid(4) } }] });
  let saved;
  const assignment = { productId: "SELECTED_PRODUCTS", productIds: [gid(2), gid(5)], title: "2 selected products", image: null };
  await changeSubscription({ admin, prisma: { subscriptionPlan: { update: async arg => { saved = arg; } } }, plan: { id: 1, shop: "test", sellingPlanGroupId: "group", productId: "ALL_PRODUCTS" }, values, assignment });
  const vars = doc => admin.calls.filter(call => call.doc === doc).map(call => call.variables);
  assert.deepEqual(vars(ADD_PLAN_PRODUCTS), [{ id: "group", productIds: [gid(5)] }]);
  assert.deepEqual(vars(REMOVE_PLAN_PRODUCTS), [{ id: "group", productIds: [gid(1), gid(3)] }]);
  assert.deepEqual(vars(REMOVE_PLAN_VARIANTS), [{ id: "group", productVariantIds: ["gid://shopify/ProductVariant/40"] }]);
  assert.equal(saved.data.productId, "SELECTED_PRODUCTS");
  assert.deepEqual(JSON.parse(saved.data.productIdsJson), [gid(2), gid(5)]);
  assert.equal(saved.data.productTitle, "2 selected products");
});

test("a Shopify rejection surfaces its message and nothing else is saved", async () => {
  const admin = shopifyAdmin({ products: [gid(1)], addErrors: [{ field: ["productIds"], message: "Product is a gift card" }] });
  await assert.rejects(
    changeSubscription({ admin, prisma: { subscriptionPlan: { update: () => assert.fail("must not write") } }, plan: { id: 1, shop: "test", sellingPlanGroupId: "group" }, values, assignment: { productId: gid(2), productIds: [gid(2)], title: "Card" } }),
    /Shopify rejected the product change: Product is a gift card/,
  );
  assert.equal(admin.calls.some(call => call.doc === UPDATE_PLAN), false);
});

test("edits without an assignment leave Shopify products untouched", async () => {
  const admin = shopifyAdmin();
  let saved;
  await changeSubscription({ admin, prisma: { subscriptionPlan: { update: async arg => { saved = arg; } } }, plan: { id: 1, shop: "test", sellingPlanGroupId: "group" }, values });
  assert.equal(admin.calls.some(call => call.doc === PLAN_PRODUCTS_QUERY), false);
  assert.equal("productId" in saved.data, false);
});
