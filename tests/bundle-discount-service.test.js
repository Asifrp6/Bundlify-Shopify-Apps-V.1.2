import test from 'node:test';
import assert from 'node:assert/strict';
import { createBundleDiscount } from '../app/services/bundle-discount.server.js';

const bundle = { id: '1', name: 'Test', discount: 10, products: [] };
const admin = result => ({ graphql: async () => ({ json: async () => result }) });

test('reapplying the same bundle uses a unique automatic discount title', async () => {
  const titles = new Set();
  const client = { graphql: async (_query, { variables }) => {
    const title = variables.input.title;
    assert.ok(title.startsWith('Bundlify: Test ('));
    assert.ok(!titles.has(title), 'A replacement must not conflict with the still-active discount');
    titles.add(title);
    return { json: async () => ({ data: { discountAutomaticAppCreate: {
      automaticAppDiscount: { discountId: `discount-${titles.size}` }, userErrors: [],
    } } }) };
  } };
  await createBundleDiscount(client, bundle);
  await createBundleDiscount(client, bundle);
  assert.equal(titles.size, 2);
});

test('discount activation reports Shopify rejection instead of assuming a deployment issue', async () => {
  for (const result of [
    { errors: [{ message: 'Access denied' }] },
    { data: { discountAutomaticAppCreate: { userErrors: [{ message: 'Function not found' }] } } },
  ]) {
    await assert.rejects(createBundleDiscount(admin(result), bundle), /Access denied|Function not found/);
  }
});

test('discount activation requires an ID and returns it on success', async () => {
  await assert.rejects(createBundleDiscount(admin({}), bundle), /no discount ID/);
  assert.equal(await createBundleDiscount(admin({ data: { discountAutomaticAppCreate: {
    automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticNode/1' }, userErrors: [],
  } } }), bundle), 'gid://shopify/DiscountAutomaticNode/1');
});
