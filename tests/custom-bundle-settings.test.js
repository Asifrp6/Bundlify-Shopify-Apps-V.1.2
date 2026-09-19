import test from 'node:test';
import assert from 'node:assert/strict';
import { getCustomBundleSettings, saveCustomBundleProducts, validateCustomProducts, CUSTOM_BUNDLE_QUERY, CUSTOM_BUNDLE_SAVE } from '../app/services/custom-bundle.server.js';
import { CREATE_DISCOUNT, DELETE_DISCOUNT } from '../app/services/bundle-discount.server.js';

const ids = ['gid://shopify/Product/1', 'gid://shopify/Product/2'];
function adminFixture({ missing = false, reject = false, shopId = 'gid://shopify/Shop/8' } = {}) {
  const writes = [];
  return { writes, admin: { graphql: async (query, options) => {
    if (query === CUSTOM_BUNDLE_QUERY) return Response.json({ data: { shop: { id: shopId, metafield: { value: JSON.stringify(ids) } } } });
    if (query === CUSTOM_BUNDLE_SAVE) {
      writes.push(options.variables.metafields[0]);
      return Response.json({ data: { metafieldsSet: { metafields: reject ? [] : [{ key: 'custom_bundle_products' }], userErrors: reject ? [{ message: 'Denied' }] : [] } } });
    }
    return Response.json({ data: { nodes: missing ? [null] : ids.map(id => ({ id, title: id })) } });
  } } };
}

test('custom selection allows disabling and requires 2–50 distinct product IDs', () => {
  assert.deepEqual(validateCustomProducts([]), []);
  assert.deepEqual(validateCustomProducts(ids), ids);
  for (const invalid of [[ids[0]], [ids[0], ids[0]], ['bad', ids[0]], Array.from({ length: 51 }, (_, i) => `gid://shopify/Product/${i}`)]) {
    assert.throws(() => validateCustomProducts(invalid), /2–50/);
  }
});

test('owner discount is created before atomically saving settings; rejected settings retire the new discount', async () => {
  for (const reject of [false, true]) {
    const calls = [];
    const base = adminFixture();
    const admin = { graphql: async (query, options) => {
      calls.push({ query, variables: options?.variables });
      if (query === CREATE_DISCOUNT) return Response.json({ data: { discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticNode/1' }, userErrors: [] } } });
      if (query === DELETE_DISCOUNT) return Response.json({ data: { discountAutomaticDelete: { deletedAutomaticDiscountId: options.variables.id, userErrors: [] } } });
      if (query === CUSTOM_BUNDLE_SAVE && reject) return Response.json({ data: { metafieldsSet: { userErrors: [{ message: 'Denied' }] } } });
      return base.admin.graphql(query, options);
    } };
    if (reject) await assert.rejects(saveCustomBundleProducts(admin, ids, 20), /could not be saved/);
    else await saveCustomBundleProducts(admin, ids, 20);
    const creation = calls.find(c => c.query === CREATE_DISCOUNT);
    const saved = calls.find(c => c.query === CUSTOM_BUNDLE_SAVE);
    const config = JSON.parse(saved.variables.metafields[1].value);
    assert.equal(config.percentage, 20);
    assert.equal(JSON.parse(creation.variables.input.metafields[0].value).id, config.id);
    assert.equal(calls.some(c => c.query === DELETE_DISCOUNT), reject);
  }
  await assert.rejects(saveCustomBundleProducts(adminFixture().admin, ids, 101), /0 to 100/);
});

test('saved product references belong to the authenticated shop and reload correctly', async () => {
  for (const shopId of ['gid://shopify/Shop/8', 'gid://shopify/Shop/9']) {
    const { admin, writes } = adminFixture({ shopId });
    assert.deepEqual((await getCustomBundleSettings(admin)).productIds, ids);
    await saveCustomBundleProducts(admin, ids);
    assert.deepEqual(writes, [{ ownerId: shopId, namespace: 'bundlify', key: 'custom_bundle_products', type: 'list.product_reference', value: JSON.stringify(ids) }]);
  }
});

test('missing products and API errors do not report successful saves', async () => {
  const missing = adminFixture({ missing: true });
  await assert.rejects(saveCustomBundleProducts(missing.admin, ids), /no longer available/);
  assert.equal(missing.writes.length, 0);
  await assert.rejects(saveCustomBundleProducts(adminFixture({ reject: true }).admin, ids), /could not be saved/);
  await assert.rejects(getCustomBundleSettings({ graphql: async () => Response.json({ errors: [{ message: 'Denied' }] }) }), /Could not load/);
});

test('clearing saves an empty list to disable the storefront picker', async () => {
  const { admin, writes } = adminFixture();
  await saveCustomBundleProducts(admin, []);
  assert.equal(writes[0].value, '[]');
});
