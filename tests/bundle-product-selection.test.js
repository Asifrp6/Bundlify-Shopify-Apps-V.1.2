import test from "node:test";
import assert from "node:assert/strict";
import { bundleInitialMode, bundleSelectionChange, limitMessage } from "../app/services/product-selection.js";
import { validateBundle } from "../app/services/validation.js";

const gid = n => `gid://shopify/Product/${n}`;
const catalog = [1, 2, 3].map(n => ({ id: gid(n), title: `P${n}` }));

test("all current products resolves to every available catalog product", () => {
  const products = [...catalog, { id: gid(9), title: "Gone", missing: true }];
  assert.deepEqual(bundleSelectionChange("", "ALL_PRODUCTS", [], products), { mode: "ALL_PRODUCTS", selected: [gid(1), gid(2), gid(3)] });
});

test("choosing a single product adds it and keeps the multi-select open", () => {
  assert.deepEqual(bundleSelectionChange("", gid(2), [], catalog), { mode: "SELECTED_PRODUCTS", selected: [gid(2)] });
  assert.deepEqual(bundleSelectionChange("SELECTED_PRODUCTS", gid(3), [gid(2)], catalog), { mode: "SELECTED_PRODUCTS", selected: [gid(2), gid(3)] });
  assert.deepEqual(bundleSelectionChange("SELECTED_PRODUCTS", gid(2), [gid(2)], catalog).selected, [gid(2)]);
  assert.deepEqual(bundleSelectionChange("ALL_PRODUCTS", gid(1), catalog.map(p => p.id), catalog).selected, [gid(1)]);
});

test("switching to choose products keeps a manual selection but not the whole catalog", () => {
  assert.deepEqual(bundleSelectionChange("SELECTED_PRODUCTS", "SELECTED_PRODUCTS", [gid(1)], catalog).selected, [gid(1)]);
  assert.deepEqual(bundleSelectionChange("ALL_PRODUCTS", "SELECTED_PRODUCTS", catalog.map(p => p.id), catalog).selected, []);
});

test("reset unchecks every product and keeps the product list open", () => {
  for (const mode of ["", "SELECTED_PRODUCTS", "ALL_PRODUCTS"]) {
    assert.deepEqual(bundleSelectionChange(mode, "SELECTED_PRODUCTS", [], catalog), { mode: "SELECTED_PRODUCTS", selected: [] });
  }
});

test("saved bundles reopen as all products only when they cover the catalog", () => {
  assert.equal(bundleInitialMode([], catalog), "");
  assert.equal(bundleInitialMode([gid(3), gid(1), gid(2)], catalog), "ALL_PRODUCTS");
  assert.equal(bundleInitialMode([gid(1), gid(2)], catalog), "SELECTED_PRODUCTS");
  assert.equal(bundleInitialMode([gid(1)], [catalog[0]]), "SELECTED_PRODUCTS");
});

test("bundle validation still blocks one product and over-cap catalogs", () => {
  const form = ids => {
    const f = new FormData();
    f.set("name", "Duo");
    f.set("discount", "10");
    f.set("discountType", "percentage");
    ids.forEach(id => f.append("productIds", id));
    return f;
  };
  assert.match(validateBundle(form([gid(1)]), { maxProducts: 5 }).errors.productIds, /between 2 and 5/);
  assert.match(validateBundle(form(catalog.map(p => p.id)), { maxProducts: 2 }).errors.productIds, /between 2 and 2/);
  assert.equal(validateBundle(form(catalog.map(p => p.id)), { maxProducts: 5 }).errors.productIds, undefined);
  assert.match(limitMessage(3, 2, "products per bundle"), /Remove 1 products.*up to 2 products per bundle/);
});
