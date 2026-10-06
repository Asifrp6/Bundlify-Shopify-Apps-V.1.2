import test from "node:test";
import assert from "node:assert/strict";
import { loadStorefrontBundles, storefrontBundleWhere, storefrontBundles } from "../app/services/storefront-bundles.server.js";
import { bundleActivationError } from "../app/services/product-selection.js";

const gid = id => `gid://shopify/Product/${id}`;
const row = id => ({ productId: gid(id), productTitle: `Product ${id}` });
const bundle = (id, status, productIds, extra = {}) => ({
  id, shop: "shop.myshopify.com", name: `Bundle ${id}`, status, discount: 10, discountType: "percentage",
  discountNodeId: `gid://shopify/DiscountAutomaticNode/${id}`, createdAt: new Date(2026, 0, id), products: productIds.map(row), ...extra,
});
const published = id => ({ id: gid(id), title: `Product ${id}`, handle: `product-${id}`, status: "ACTIVE", publishedAt: "2026-01-01T00:00:00Z" });

// Mirrors the Prisma filter so the test covers the query and the response together.
function fakeDb(rows) {
  return { bundle: { findMany: async ({ where }) => {
    assert.deepEqual(Object.keys(where).sort(), ["shop", "status"]);
    return rows.filter(b => b.shop === where.shop && b.status === where.status);
  } } };
}
const fakeAdmin = catalog => ({ graphql: async (query, { variables } = {}) => ({ json: async () => {
  if (String(query).includes("BundleDiscountWindows")) {
    return { data: { nodes: variables.ids.map(id => ({ id, automaticDiscount: { status: "ACTIVE", startsAt: "2020-01-01T00:00:00Z", endsAt: null } })) } };
  }
  return { data: { shop: { currencyCode: "USD" }, nodes: variables.ids.map(id => catalog.find(p => p.id === id) || null) } };
} }) });

test("storefront query reads every active bundle for the shop, not only the current product's", () => {
  assert.deepEqual(storefrontBundleWhere("shop.myshopify.com"), { shop: "shop.myshopify.com", status: "ACTIVE" });
});

test("all active bundles with two live products are returned, drafts are not", async () => {
  const rows = [
    bundle(1, "ACTIVE", [11, 12]),
    bundle(2, "DRAFT", [11, 13]),
    bundle(3, "ACTIVE", [20, 21]),
    bundle(4, "ACTIVE", [11, 12, 13, 14]),
  ];
  const bundles = await loadStorefrontBundles({
    db: fakeDb(rows), admin: fakeAdmin([11, 12, 13, 14, 20, 21].map(published)), shop: "shop.myshopify.com",
  });
  assert.deepEqual(bundles.map(b => b.id), ["1", "3", "4"]);
  assert.deepEqual(bundles[0], {
    id: "1", discount: 10, discountType: "percentage", fixedDiscount: 0, shopCurrency: "USD", name: "Bundle 1",
    products: [{ title: "Product 11", handle: "product-11" }, { title: "Product 12", handle: "product-12" }],
  });
});

test("two active bundles both show on a product page whose product is in one of them or in neither", async () => {
  const catalog = [11, 12, 13, 14, 99].map(published);
  const rows = [bundle(1, "ACTIVE", [11, 12]), bundle(2, "ACTIVE", [13, 14])];
  // The proxy ignores which product page asked; product 11 is in Bundle 1 only and product 99 is in neither.
  for (const productId of ["11", "99"]) {
    const bundles = await loadStorefrontBundles({ db: fakeDb(rows), admin: fakeAdmin(catalog), shop: "shop.myshopify.com", productId });
    assert.deepEqual(bundles.map(b => b.name).sort(), ["Bundle 1", "Bundle 2"]);
  }
});

test("draft bundles are never returned", () => {
  const products = new Map([11, 12].map(id => [gid(id), published(id)]));
  assert.deepEqual(storefrontBundles([bundle(1, "DRAFT", [11, 12])], products), []);
});

test("a serving rollout that reaches part of the store is not advertised as a storewide discount", () => {
  const products = new Map([11, 12].map(id => [gid(id), published(id)]));
  const discountNodeId = "gid://shopify/DiscountAutomaticNode/1";
  const availability = new Map([[discountNodeId, { present: true, availability: { reachesEveryBuyer: false, buyerNote: "Live for 40% of buyers" } }]]);
  const [result] = storefrontBundles([bundle(1, "ACTIVE", [11, 12])], products, { availability });
  assert.equal(result.discount, 0);
  assert.equal(result.fixedDiscount, 0);
  assert.equal(result.discountNote, "Live for 40% of buyers");
});

test("an active bundle without a created discount still shows, but advertises no discount", () => {
  const products = new Map([11, 12].map(id => [gid(id), published(id)]));
  const [result] = storefrontBundles([bundle(1, "ACTIVE", [11, 12], { discountNodeId: null })], products);
  assert.equal(result.id, "1");
  assert.equal(result.discount, 0);
  assert.equal(result.fixedDiscount, 0);
});

test("unpublished products are left out and bundles with fewer than two visible products are hidden", async () => {
  const catalog = [published(11), published(12), { ...published(13), status: "DRAFT" }, { ...published(14), publishedAt: null }];
  const bundles = await loadStorefrontBundles({
    db: fakeDb([bundle(1, "ACTIVE", [11, 12, 13]), bundle(2, "ACTIVE", [11, 13, 14])]),
    admin: fakeAdmin(catalog), shop: "shop.myshopify.com",
  });
  assert.deepEqual(bundles.map(b => [b.id, b.products.map(p => p.handle)]), [["1", ["product-11", "product-12"]]]);
});

test("activation is blocked when fewer than two bundle products are live, matching the storefront filter", async () => {
  // One published product plus two draft products: the proxy hides this bundle, so saving it as active must fail.
  const catalog = [published(11), { ...published(12), status: "DRAFT", publishedAt: null }, { ...published(13), status: "DRAFT", publishedAt: null }];
  const bundles = await loadStorefrontBundles({ db: fakeDb([bundle(1, "ACTIVE", [11, 12, 13])]), admin: fakeAdmin(catalog), shop: "shop.myshopify.com" });
  assert.deepEqual(bundles, []);
  const error = bundleActivationError(catalog);
  assert.match(error, /Only 1 of the selected products is live/);
  assert.match(error, /Product 12 is a draft\. Product 13 is a draft\./);
  assert.match(error, /save this bundle as a draft/);
  assert.match(bundleActivationError([{ id: gid(20), title: "Gone", missing: true }, published(11)]), /Gone is removed from your store/);
  assert.equal(bundleActivationError([published(11), published(12), { ...published(13), status: "ARCHIVED" }]), null);
});
