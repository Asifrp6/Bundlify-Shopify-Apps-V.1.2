import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatGiftPrice, giftImageUrl, parseGiftOption, readGiftImage, storefrontGiftOptions } from "../app/services/gift-options.js";
import { GIFT_PRODUCT_TAG, attachGiftImage, deleteGiftOption, giftEnabledValue, giftStore, repairGiftProducts, saveGiftOption, syncGiftProduct } from "../app/services/gift-options.server.js";
import { loadStorefrontGiftEnabled, loadStorefrontGiftOptions } from "../app/services/storefront-bundles.server.js";

const SHOP = "shop.myshopify.com";

// In-memory stand-in for giftStore(db), keeping the same shop scoping.
function memoryStore(rows = []) {
  let next = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  return {
    rows,
    list: async shop => rows.filter(row => row.shop === shop),
    find: async (shop, id) => rows.find(row => row.shop === shop && row.id === id) || undefined,
    create: async (shop, value) => { const id = next++; rows.push({ id, shop, productId: null, variantId: null, syncError: null, ...value }); return id; },
    update: async (shop, id, value) => { const row = rows.find(r => r.shop === shop && r.id === id); if (row) Object.assign(row, value); return row ? 1 : 0; },
    remove: async (shop, id) => { const index = rows.findIndex(r => r.shop === shop && r.id === id); if (index >= 0) rows.splice(index, 1); },
  };
}
const fakeSync = (calls, { fail = null } = {}) => async (_admin, option) => {
  calls.push({ ...option });
  if (fail) throw new Error(fail);
  return { productId: option.productId || `gid://shopify/Product/${100 + option.id}`, variantId: option.variantId || `gid://shopify/ProductVariant/${200 + option.id}` };
};

test("package and wrap input is validated and prices are normalized to two decimals", () => {
  assert.deepEqual(parseGiftOption({ kind: "PACKAGE", name: "  Kraft   box ", price: "5" }), { value: { kind: "PACKAGE", name: "Kraft box", price: "5.00" } });
  assert.deepEqual(parseGiftOption({ kind: "WRAP", name: "Ribbon", price: "0" }).value.price, "0.00");
  assert.match(parseGiftOption({ kind: "BOX", name: "x", price: "1" }).error, /package or wrap/);
  assert.match(parseGiftOption({ kind: "PACKAGE", name: " ", price: "1" }).error, /package name/);
  assert.match(parseGiftOption({ kind: "WRAP", name: "x".repeat(81), price: "1" }).error, /under 80/);
  for (const price of ["", "-1", "1.999", "abc", "1e3"]) assert.match(parseGiftOption({ kind: "WRAP", name: "Ribbon", price }).error, /wrap price/);
  assert.match(parseGiftOption({ kind: "PACKAGE", name: "Crate", price: "100000.01" }).error, /up to 100000/);
});

test("saving a new package stores it for the shop and links the Shopify fee product", async () => {
  const store = memoryStore();
  const calls = [];
  const result = await saveGiftOption({ store, admin: {}, shop: SHOP, id: null, input: { kind: "PACKAGE", name: "Kraft box", price: "5" }, sync: fakeSync(calls) });
  assert.equal(result.error, undefined);
  assert.deepEqual(store.rows.map(({ shop, kind, name, price, productId, variantId, syncError }) => ({ shop, kind, name, price, productId, variantId, syncError })), [
    { shop: SHOP, kind: "PACKAGE", name: "Kraft box", price: "5.00", productId: "gid://shopify/Product/101", variantId: "gid://shopify/ProductVariant/201", syncError: null },
  ]);
  assert.equal(calls[0].productId, null);
});

test("editing reuses the same Shopify product instead of creating another, and other shops cannot edit it", async () => {
  const store = memoryStore([{ id: 4, shop: SHOP, kind: "WRAP", name: "Ribbon", price: "2.00", productId: "gid://shopify/Product/9", variantId: "gid://shopify/ProductVariant/19", syncError: null }]);
  const calls = [];
  const result = await saveGiftOption({ store, admin: {}, shop: SHOP, id: 4, input: { kind: "WRAP", name: "Red ribbon", price: "2.5" }, sync: fakeSync(calls) });
  assert.equal(result.error, undefined);
  assert.equal(calls[0].productId, "gid://shopify/Product/9");
  assert.equal(calls[0].variantId, "gid://shopify/ProductVariant/19");
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].name, "Red ribbon");
  assert.equal(store.rows[0].price, "2.50");
  const other = await saveGiftOption({ store, admin: {}, shop: "other.myshopify.com", id: 4, input: { kind: "WRAP", name: "Stolen", price: "1" }, sync: fakeSync(calls) });
  assert.equal(other.status, 404);
  const switched = await saveGiftOption({ store, admin: {}, shop: SHOP, id: 4, input: { kind: "PACKAGE", name: "Box", price: "1" }, sync: fakeSync(calls) });
  assert.equal(switched.status, 400);
  assert.equal(calls.length, 1);
});

test("a failed product sync saves the option hidden from customers and reports the error", async () => {
  const store = memoryStore();
  const result = await saveGiftOption({ store, admin: {}, shop: SHOP, id: null, input: { kind: "PACKAGE", name: "Crate", price: "9" }, sync: fakeSync([], { fail: "Access denied for publications" }) });
  assert.match(result.error, /Access denied for publications.*hidden from customers/);
  assert.ok(result.option);
  assert.equal(store.rows[0].syncError, "Access denied for publications");
  assert.equal(store.rows[0].variantId, null);
  assert.deepEqual(storefrontGiftOptions(store.rows), { packages: [], wraps: [] });
});

test("the storefront payload only offers synced options, with numeric variant ids and a CDN image for the cart", async () => {
  const rows = [
    { id: 1, kind: "PACKAGE", name: "Kraft box", price: "5.00", variantId: "gid://shopify/ProductVariant/201", syncError: null, imageUrl: "https://cdn.shopify.com/s/files/1/box.jpg?v=1" },
    { id: 2, kind: "PACKAGE", name: "Broken", price: "3.00", variantId: "gid://shopify/ProductVariant/202", syncError: "failed", imageUrl: "https://cdn.shopify.com/s/files/1/broken.jpg" },
    { id: 3, kind: "WRAP", name: "Ribbon", price: "2.50", variantId: "gid://shopify/ProductVariant/203", syncError: null, imageUrl: "http://cdn.shopify.com/s/files/1/ribbon.jpg" },
    { id: 4, kind: "WRAP", name: "Pending", price: "1.00", variantId: null, syncError: null },
    { id: 5, kind: "WRAP", name: "Script", price: "1.00", variantId: "gid://shopify/ProductVariant/205", syncError: null, imageUrl: "javascript:alert(1)" },
  ];
  assert.equal(giftImageUrl("https://evil.example/box.jpg"), null);
  assert.equal(giftImageUrl("https://cdn.shopify.com.evil.com/box.jpg"), null);
  assert.deepEqual(storefrontGiftOptions(rows), {
    packages: [{ id: "1", name: "Kraft box", price: "5.00", variantId: "201", imageUrl: "https://cdn.shopify.com/s/files/1/box.jpg?v=1" }],
    wraps: [
      { id: "3", name: "Ribbon", price: "2.50", variantId: "203", imageUrl: null },
      { id: "5", name: "Script", price: "1.00", variantId: "205", imageUrl: null },
    ],
  });
  assert.deepEqual(await loadStorefrontGiftOptions({ db: null, shop: SHOP, store: memoryStore(rows.map(row => ({ ...row, shop: SHOP }))) }), storefrontGiftOptions(rows));
  assert.deepEqual(await loadStorefrontGiftOptions({ db: null, shop: SHOP, store: { list: async () => { throw new Error("no table"); } } }), { packages: [], wraps: [] });
});

function fakeAdmin({ publications = [{ id: "gid://shopify/Publication/1", catalog: { title: "Online Store" } }], tags = [GIFT_PRODUCT_TAG], publishErrors = [], publicationsDenied = false } = {}) {
  const calls = [];
  return {
    calls,
    graphql: async (query, { variables } = {}) => {
      calls.push({ query, variables });
      if (publicationsDenied && query.includes("publications(")) return { json: async () => ({ errors: [{ message: "Access denied for publications field. Required access: `read_publications` access scope." }] }) };
      const data = query.includes("productSet") ? { productSet: { product: { id: variables.identifier?.id || "gid://shopify/Product/55", variants: { nodes: [{ id: "gid://shopify/ProductVariant/66" }] } }, userErrors: [] } }
        : query.includes("publications(") ? { publications: { nodes: publications } }
        : query.includes("publishablePublish") ? { publishablePublish: { userErrors: publishErrors } }
        : query.includes("productDelete") ? { productDelete: { deletedProductId: variables.input.id, userErrors: [] } }
        : { product: { id: variables.id, tags } };
      return { json: async () => ({ data }) };
    },
  };
}

test("the fee product is an untracked, SEO-hidden variant priced from the dashboard and published to the Online Store", async () => {
  const admin = fakeAdmin();
  const ids = await syncGiftProduct(admin, { id: 1, kind: "PACKAGE", name: "Kraft box", price: "5.00", productId: null, variantId: null });
  assert.deepEqual(ids, { productId: "gid://shopify/Product/55", variantId: "gid://shopify/ProductVariant/66" });
  const { input, identifier } = admin.calls[0].variables;
  assert.equal(identifier, null);
  assert.equal(input.title, "Gift box: Kraft box");
  assert.deepEqual(input.tags, [GIFT_PRODUCT_TAG]);
  assert.equal(input.variants[0].price, "5.00");
  assert.deepEqual(input.variants[0].inventoryItem, { tracked: false, requiresShipping: false });
  assert.equal(input.variants[0].inventoryPolicy, "CONTINUE");
  assert.equal(input.status, "UNLISTED");
  assert.equal(input.handle, "bundlify-gift-box-1");
  assert.deepEqual(input.metafields, [{ namespace: "seo", key: "hidden", type: "number_integer", value: "1" }]);
  assert.deepEqual(admin.calls[2].variables, { id: "gid://shopify/Product/55", input: [{ publicationId: "gid://shopify/Publication/1" }] });

  const update = fakeAdmin();
  await syncGiftProduct(update, { id: 1, kind: "WRAP", name: "Ribbon", price: "2.50", productId: "gid://shopify/Product/9", variantId: "gid://shopify/ProductVariant/19" });
  assert.deepEqual(update.calls[0].variables.identifier, { id: "gid://shopify/Product/9" });
  assert.equal(update.calls[0].variables.input.variants[0].id, "gid://shopify/ProductVariant/19");
  assert.equal(update.calls[0].variables.input.title, "Gift wrap: Ribbon");
  assert.equal(update.calls[0].variables.input.status, "UNLISTED");
  assert.equal(update.calls[0].variables.input.handle, "bundlify-gift-wrap-1");
  assert.deepEqual(update.calls[0].variables.input.metafields, [{ namespace: "seo", key: "hidden", type: "number_integer", value: "1" }]);
  assert.deepEqual(update.calls[0].variables.input.variants[0].inventoryItem, { tracked: false, requiresShipping: false });
  assert.equal(update.calls[0].variables.input.variants[0].inventoryPolicy, "CONTINUE");

  await assert.rejects(syncGiftProduct(fakeAdmin({ publications: [] }), { id: 1, kind: "WRAP", name: "Ribbon", price: "1.00" }), /Online Store/);
  await assert.rejects(syncGiftProduct(fakeAdmin({ publishErrors: [{ message: "Not allowed" }] }), { id: 1, kind: "WRAP", name: "Ribbon", price: "1.00" }), /Not allowed/);
});

test("a package whose fee product was created but not published is published on the next save, not duplicated", async () => {
  const store = memoryStore();
  const denied = await saveGiftOption({ store, admin: fakeAdmin({ publicationsDenied: true }), shop: SHOP, id: null, input: { kind: "PACKAGE", name: "Crate", price: "9" } });
  assert.match(denied.error, /read_publications.*hidden from customers/);
  assert.equal(store.rows[0].productId, "gid://shopify/Product/55");
  assert.equal(store.rows[0].variantId, "gid://shopify/ProductVariant/66");

  const admin = fakeAdmin();
  const retried = await saveGiftOption({ store, admin, shop: SHOP, id: store.rows[0].id, input: { kind: "PACKAGE", name: "Crate", price: "9" } });
  assert.equal(retried.error, undefined);
  assert.deepEqual(admin.calls[0].variables.identifier, { id: "gid://shopify/Product/55" });
  assert.ok(admin.calls.some(call => call.query.includes("publishablePublish") && call.variables.id === "gid://shopify/Product/55"));
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].syncError, null);
});

const healthNode = (variantId, { tracked = false, requiresShipping = false, availableForSale = true, inventoryPolicy = "CONTINUE", status = "UNLISTED", channels = ["Channel Catalog 1 for Online Store"] } = {}) => ({
  id: variantId, availableForSale, inventoryPolicy, inventoryItem: { tracked, requiresShipping },
  product: { id: "p", status, resourcePublicationsV2: { nodes: channels.map(title => ({ publication: { catalog: { title } } })) } },
});

test("existing sold-out fee products are repaired in place when options are listed, without duplicates", async () => {
  const rows = [
    { id: 1, shop: SHOP, kind: "PACKAGE", name: "Gift Box", price: "5.00", productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/11", syncError: null },
    { id: 2, shop: SHOP, kind: "WRAP", name: "Red ribbon", price: "2.00", productId: "gid://shopify/Product/2", variantId: "gid://shopify/ProductVariant/12", syncError: null },
    { id: 3, shop: SHOP, kind: "WRAP", name: "Fine", price: "1.00", productId: "gid://shopify/Product/3", variantId: "gid://shopify/ProductVariant/13", syncError: null },
    { id: 4, shop: SHOP, kind: "WRAP", name: "Unpublished", price: "1.00", productId: "gid://shopify/Product/4", variantId: "gid://shopify/ProductVariant/14", syncError: null },
    { id: 5, shop: SHOP, kind: "WRAP", name: "Pending", price: "1.00", productId: null, variantId: null, syncError: null },
    { id: 6, shop: SHOP, kind: "WRAP", name: "Wrap your box", price: "5.00", productId: "gid://shopify/Product/6", variantId: "gid://shopify/ProductVariant/16", syncError: null },
    { id: 7, shop: SHOP, kind: "PACKAGE", name: "Unavailable", price: "5.00", productId: "gid://shopify/Product/7", variantId: "gid://shopify/ProductVariant/17", syncError: null },
    { id: 8, shop: SHOP, kind: "PACKAGE", name: "Gift box 1", price: "5.00", productId: "gid://shopify/Product/8", variantId: "gid://shopify/ProductVariant/18", syncError: null },
  ];
  const store = memoryStore(rows.map(row => ({ ...row })));
  const nodes = [
    healthNode("gid://shopify/ProductVariant/11", { tracked: true, inventoryPolicy: "DENY" }),
    healthNode("gid://shopify/ProductVariant/12", { inventoryPolicy: "DENY" }),
    healthNode("gid://shopify/ProductVariant/13"),
    healthNode("gid://shopify/ProductVariant/14", { channels: ["Channel Catalog 2 for Point of Sale"] }),
    healthNode("gid://shopify/ProductVariant/16", { requiresShipping: true }),
    healthNode("gid://shopify/ProductVariant/17", { availableForSale: false }),
    healthNode("gid://shopify/ProductVariant/18", { status: "ACTIVE" }),
  ];
  const admin = { graphql: async () => ({ json: async () => ({ data: { nodes } }) }) };
  const calls = [];
  const result = await repairGiftProducts({ store, admin, shop: SHOP, rows, sync: fakeSync(calls) });
  assert.deepEqual(calls.map(call => [call.id, call.productId, call.variantId]), [
    [1, "gid://shopify/Product/1", "gid://shopify/ProductVariant/11"],
    [2, "gid://shopify/Product/2", "gid://shopify/ProductVariant/12"],
    [4, "gid://shopify/Product/4", "gid://shopify/ProductVariant/14"],
    [6, "gid://shopify/Product/6", "gid://shopify/ProductVariant/16"],
    [7, "gid://shopify/Product/7", "gid://shopify/ProductVariant/17"],
    [8, "gid://shopify/Product/8", "gid://shopify/ProductVariant/18"],
  ]);
  assert.equal(store.rows.length, 8);
  assert.deepEqual(result.map(row => row.productId), rows.map(row => row.productId));
});

test("repair runs the real sync mutation with untracked CONTINUE inventory and republishes to the Online Store", async () => {
  const row = { id: 1, shop: SHOP, kind: "PACKAGE", name: "Gift Box", price: "5.00", productId: "gid://shopify/Product/9", variantId: "gid://shopify/ProductVariant/19", syncError: null };
  const store = memoryStore([{ ...row }]);
  const admin = fakeAdmin();
  const graphql = admin.graphql;
  admin.graphql = async (query, options) => query.includes("GiftOptionProductHealth")
    ? { json: async () => ({ data: { nodes: [healthNode(row.variantId, { tracked: true, inventoryPolicy: "DENY" })] } }) }
    : graphql(query, options);
  await repairGiftProducts({ store, admin, shop: SHOP, rows: [row] });
  const set = admin.calls.find(call => call.query.includes("productSet"));
  assert.deepEqual(set.variables.identifier, { id: "gid://shopify/Product/9" });
  assert.equal(set.variables.input.variants[0].id, "gid://shopify/ProductVariant/19");
  assert.deepEqual(set.variables.input.variants[0].inventoryItem, { tracked: false, requiresShipping: false });
  assert.equal(set.variables.input.variants[0].inventoryPolicy, "CONTINUE");
  assert.ok(admin.calls.some(call => call.query.includes("publishablePublish")));
  assert.equal(store.rows[0].syncError, null);

  const healthy = { calls: 0, graphql: async () => { healthy.calls++; return { json: async () => ({ data: { nodes: [healthNode(row.variantId)] } }) }; } };
  await repairGiftProducts({ store, admin: healthy, shop: SHOP, rows: [row] });
  assert.equal(healthy.calls, 1);
});

test("both app configs request read and write publications for the Online Store fee product", () => {
  for (const file of ["shopify.app.toml", "shopify.app.bundlify.toml"]) {
    const scopes = readFileSync(new URL(`../${file}`, import.meta.url), "utf8").match(/^scopes\s*=\s*"([^"]*)"/m)[1].split(",");
    assert.ok(scopes.includes("read_publications") && scopes.includes("write_publications"), file);
  }
});

test("deleting removes the option and only deletes a Shopify product this app tagged", async () => {
  const row = { id: 7, shop: SHOP, kind: "PACKAGE", name: "Kraft box", price: "5.00", productId: "gid://shopify/Product/55", variantId: "gid://shopify/ProductVariant/66", syncError: null };
  const store = memoryStore([{ ...row }]);
  const admin = fakeAdmin();
  assert.deepEqual(await deleteGiftOption({ store, admin, shop: SHOP, id: 7 }), { deleted: 7, warning: null });
  assert.equal(store.rows.length, 0);
  assert.ok(admin.calls.some(call => call.query.includes("productDelete")));

  const untagged = fakeAdmin({ tags: ["summer"] });
  const kept = await deleteGiftOption({ store: memoryStore([{ ...row }]), admin: untagged, shop: SHOP, id: 7 });
  assert.match(kept.warning, /left untouched/);
  assert.ok(!untagged.calls.some(call => call.query.includes("productDelete")));

  assert.equal((await deleteGiftOption({ store: memoryStore([{ ...row }]), admin, shop: "other.myshopify.com", id: 7 })).status, 404);
});

test("the gift switch defaults to on, stays per shop, and an unreadable setting keeps the gift flow", async () => {
  for (const value of [undefined, null, true, 1, 1n]) assert.equal(giftEnabledValue(value), true, String(value));
  for (const value of [false, 0, 0n]) assert.equal(giftEnabledValue(value), false, String(value));

  const settings = new Map();
  const store = { enabled: async shop => giftEnabledValue(settings.get(shop)), setEnabled: async (shop, enabled) => { settings.set(shop, enabled ? 1 : 0); } };
  assert.equal(await loadStorefrontGiftEnabled({ db: null, shop: SHOP, store }), true);
  await store.setEnabled(SHOP, false);
  assert.equal(await loadStorefrontGiftEnabled({ db: null, shop: SHOP, store }), false);
  assert.equal(await loadStorefrontGiftEnabled({ db: null, shop: "other.myshopify.com", store }), true);
  assert.equal(await loadStorefrontGiftEnabled({ db: null, shop: SHOP, store: { enabled: async () => { throw new Error("no table"); } } }), true);

  const sql = [];
  const db = { $queryRaw: async (strings, ...values) => { sql.push([strings.join("?"), values]); return [{ enabled: 0n }]; }, $executeRaw: async (strings, ...values) => { sql.push([strings.join("?"), values]); return 1; } };
  assert.equal(await giftStore(db).enabled(SHOP), false);
  await giftStore(db).setEnabled(SHOP, true);
  assert.match(sql[1][0], /INSERT INTO "GiftSetting".*ON CONFLICT\(shop\) DO UPDATE/s);
  assert.deepEqual(sql[1][1], [SHOP, 1]);
  await giftStore(db).removeShop(SHOP);
  assert.ok(sql.some(([query]) => query.includes('DELETE FROM "GiftSetting"')));
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CDN = "https://cdn.shopify.com/s/files/1/1/files/box.jpg?v=1";

test("an image is optional, and only a real JPEG, PNG, WebP, or GIF is accepted", async () => {
  assert.deepEqual(await readGiftImage(null), { value: null });
  assert.deepEqual(await readGiftImage(""), { value: null });
  assert.deepEqual(await readGiftImage(new File([], "box.png", { type: "image/png" })), { value: null });
  assert.match((await readGiftImage("https://cdn.shopify.com/box.jpg")).error, /image file/);
  const png = await readGiftImage(new File([PNG], "My box!.png", { type: "image/png" }));
  assert.equal(png.value.type, "image/png");
  assert.equal(png.value.name, "My-box.png");
  assert.equal(png.value.bytes[0], 0x89);
  assert.match((await readGiftImage(new File([PNG], "box.png", { type: "image/jpeg" }))).error, /JPEG, PNG/);
  assert.match((await readGiftImage(new File([PNG], "box.svg", { type: "image/svg+xml" }))).error, /JPEG, PNG/);
  assert.match((await readGiftImage({ size: 8 * 1024 * 1024 + 1, type: "image/png", name: "big.png", arrayBuffer: async () => new ArrayBuffer(0) })).error, /8 MB/);
  const webp = new Uint8Array(12);
  webp.set([0x52, 0x49, 0x46, 0x46], 0);
  webp.set([0x57, 0x45, 0x42, 0x50], 8);
  assert.equal((await readGiftImage(new File([webp], "wrap.webp", { type: "image/webp" }))).value.type, "image/webp");
});

test("saving without a new image keeps the current one, and a replacement stays on the same option", async () => {
  const imageUrl = "https://cdn.shopify.com/s/files/1/box.jpg";
  const store = memoryStore([{ id: 4, shop: SHOP, kind: "PACKAGE", name: "Kraft box", price: "5.00", productId: "gid://shopify/Product/9", variantId: "gid://shopify/ProductVariant/19", syncError: null, imageUrl, mediaId: "gid://shopify/MediaImage/1" }]);
  const kept = await saveGiftOption({ store, admin: {}, shop: SHOP, id: 4, input: { kind: "PACKAGE", name: "Kraft box", price: "6" }, sync: fakeSync([]) });
  assert.equal(kept.error, undefined);
  assert.equal(store.rows[0].imageUrl, imageUrl);
  assert.equal(store.rows[0].mediaId, "gid://shopify/MediaImage/1");
  assert.equal(store.rows[0].price, "6.00");

  const replaced = "https://cdn.shopify.com/s/files/1/new.jpg";
  const calls = [];
  const result = await saveGiftOption({
    store, admin: {}, shop: SHOP, id: 4, image: { bytes: PNG, type: "image/png", name: "box.png" },
    input: { kind: "PACKAGE", name: "Kraft box", price: "6" }, sync: fakeSync([]),
    attach: async (_admin, image, details) => { calls.push({ image, details }); return { imageUrl: replaced, mediaId: "gid://shopify/MediaImage/2" }; },
  });
  assert.equal(result.error, undefined);
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].imageUrl, replaced);
  assert.equal(store.rows[0].mediaId, "gid://shopify/MediaImage/2");
  assert.equal(calls[0].details.previousMediaId, "gid://shopify/MediaImage/1");
  assert.equal(calls[0].details.productId, "gid://shopify/Product/9");
  assert.equal(storefrontGiftOptions(store.rows).packages[0].imageUrl, replaced);

  const failed = await saveGiftOption({
    store, admin: {}, shop: SHOP, id: 4, image: { bytes: PNG, type: "image/png", name: "box.png" },
    input: { kind: "PACKAGE", name: "Kraft box", price: "6" }, sync: fakeSync([]),
    attach: async () => { throw new Error("still processing"); },
  });
  assert.match(failed.error, /still processing/);
  assert.equal(store.rows[0].imageUrl, replaced);
  assert.equal(store.rows.length, 1);
});

test("repairing a fee product keeps the image already saved on that option", async () => {
  const row = { id: 1, shop: SHOP, kind: "PACKAGE", name: "Gift Box", price: "5.00", productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/11", syncError: null, imageUrl: "https://cdn.shopify.com/s/files/1/box.jpg", mediaId: "gid://shopify/MediaImage/4" };
  const store = memoryStore([{ ...row }]);
  const admin = { graphql: async () => ({ json: async () => ({ data: { nodes: [healthNode(row.variantId, { tracked: true })] } }) }) };
  await repairGiftProducts({ store, admin, shop: SHOP, rows: [row], sync: fakeSync([]) });
  assert.equal(store.rows[0].imageUrl, row.imageUrl);
  assert.equal(store.rows[0].mediaId, row.mediaId);
  assert.equal(store.rows[0].productId, row.productId);
});

function imageAdmin({ ready = true, url = CDN } = {}) {
  const calls = [];
  let polls = 0;
  return {
    calls,
    graphql: async (query, { variables } = {}) => {
      calls.push({ query, variables });
      const data = query.includes("stagedUploadsCreate") ? { stagedUploadsCreate: { stagedTargets: [{ url: "https://upload.test/staged", resourceUrl: "https://shopify-staged-uploads.storage.googleapis.com/tmp/box.jpg", parameters: [{ name: "key", value: "tmp/box.jpg" }] }], userErrors: [] } }
        : query.includes("productCreateMedia") ? { productCreateMedia: { media: [{ id: "gid://shopify/MediaImage/9", status: ready ? "READY" : "PROCESSING", image: ready ? { url } : null }], mediaUserErrors: [] } }
        : query.includes("productReorderMedia") ? { productReorderMedia: { mediaUserErrors: [] } }
        : query.includes("productDeleteMedia") ? { productDeleteMedia: { deletedMediaIds: variables.mediaIds, mediaUserErrors: [] } }
        : query.includes("query GiftOptionMedia") ? { node: { id: variables.id, status: "READY", image: { url } } }
        : {};
      if (query.includes("query GiftOptionMedia")) polls += 1;
      return { json: async () => ({ data }) };
    },
    polls: () => polls,
  };
}

test("the uploaded file is staged onto the fee product and the CDN address is what gets stored", async () => {
  const admin = imageAdmin();
  const uploads = [];
  const image = { bytes: PNG, type: "image/png", name: "kraft.png" };
  const attached = await attachGiftImage(admin, image, {
    productId: "gid://shopify/Product/55", alt: "Kraft box", previousMediaId: "gid://shopify/MediaImage/1",
    fetchImpl: async (url, options) => { uploads.push({ url, body: options.body }); return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) }; },
  });
  assert.deepEqual(attached, { imageUrl: CDN, mediaId: "gid://shopify/MediaImage/9" });
  assert.equal(admin.polls(), 0);
  const staged = admin.calls[0].variables.input[0];
  assert.equal(staged.resource, "PRODUCT_IMAGE");
  assert.equal(staged.httpMethod, "POST");
  assert.equal(staged.mimeType, "image/png");
  assert.equal(staged.filename, "kraft.png");
  assert.equal(uploads[0].url, "https://upload.test/staged");
  assert.deepEqual([...uploads[0].body.keys()], ["key", "file"]);
  assert.equal(uploads[0].body.get("key"), "tmp/box.jpg");
  const media = admin.calls.find(call => call.query.includes("productCreateMedia"));
  assert.equal(media.variables.media[0].originalSource, "https://shopify-staged-uploads.storage.googleapis.com/tmp/box.jpg");
  assert.equal(media.variables.media[0].mediaContentType, "IMAGE");
  assert.equal(media.variables.media[0].alt, "Kraft box");
  assert.deepEqual(admin.calls.find(call => call.query.includes("productReorderMedia")).variables, { id: "gid://shopify/Product/55", moves: [{ id: "gid://shopify/MediaImage/9", newPosition: "0" }] });
  assert.deepEqual(admin.calls.find(call => call.query.includes("productDeleteMedia")).variables.mediaIds, ["gid://shopify/MediaImage/1"]);
  assert.ok(!admin.calls.some(call => call.query.includes("productSet")));

  const processing = imageAdmin({ ready: false });
  const waited = await attachGiftImage(processing, image, {
    productId: "gid://shopify/Product/55", alt: "Kraft box", pause: async () => {},
    fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) }),
  });
  assert.equal(waited.imageUrl, CDN);
  assert.equal(processing.polls(), 1);
  assert.ok(!processing.calls.some(call => call.query.includes("productDeleteMedia")));
});

test("gift option rows keep the image columns in the shop query", async () => {
  const sql = [];
  const db = {
    $queryRaw: async (strings, ...values) => { sql.push([strings.join("?"), values]); return [{ id: 1n, kind: "PACKAGE", name: "Box", price: "1.00", productId: null, variantId: null, syncError: null, imageUrl: CDN, mediaId: "gid://shopify/MediaImage/1" }]; },
    $executeRaw: async (strings, ...values) => { sql.push([strings.join("?"), values]); return 1; },
  };
  const store = giftStore(db);
  const rows = await store.list(SHOP);
  assert.match(sql[0][0], /imageUrl, mediaId/);
  assert.equal(rows[0].imageUrl, CDN);
  await store.update(SHOP, 1, { name: "Box", price: "1.00", productId: null, variantId: null, syncError: null, imageUrl: CDN, mediaId: "gid://shopify/MediaImage/1" });
  assert.match(sql[1][0], /imageUrl = \?/);
  assert.equal(sql[1][1].at(-4), CDN);
  assert.equal(sql[1][1].at(-3), "gid://shopify/MediaImage/1");
});

test("admin prices use the store currency like other bundle prices", () => {
  assert.match(formatGiftPrice("5.00", "USD"), /^USD\s5\.00$/);
  assert.equal(formatGiftPrice("5", null), "5.00 (store currency)");
});
