import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CUSTOM_APPLY_SUCCESS,
  CUSTOM_BUNDLE_DELETE_INTENT,
  CUSTOM_BUNDLE_NAME,
  CUSTOM_DISABLED_SUCCESS,
  customApplyPath,
  customBundleOffer,
} from '../app/services/custom-bundle.js';

const ids = ['gid://shopify/Product/1', 'gid://shopify/Product/2', 'gid://shopify/Product/3'];
const products = [
  { id: ids[2], title: 'White Zircon Round' },
  { id: ids[0], title: 'Oval Aurora' },
  { id: ids[1], title: 'Pendant Pistacchio' },
];

test('a successful custom apply returns to the bundles index', () => {
  assert.equal(customApplyPath(ids), '/app/bundles?applied=1');
  assert.equal(customApplyPath([]), '/app/bundles?customDisabled=1');
  assert.equal(CUSTOM_APPLY_SUCCESS, 'Applied successfully. Your selected products are now available for custom bundles.');
  assert.equal(CUSTOM_DISABLED_SUCCESS, 'Custom bundles are now disabled.');
  const route = readFileSync(new URL('../app/routes/app.bundles.custom.jsx', import.meta.url), 'utf8');
  assert.match(route, /return redirect\(customApplyPath\(productIds\)\)/);
  assert.doesNotMatch(route, /saved:\s*true/);
  assert.match(route, /result\?\.error/);
});

test('the bundles index shows the saved custom bundle as an editable card', () => {
  const offer = customBundleOffer({
    productIds: ids,
    currency: 'USD',
    discount: { discountType: 'fixed', fixedAmount: 10, percentage: 0 },
  }, products);
  assert.equal(offer.name, CUSTOM_BUNDLE_NAME);
  assert.equal(offer.name, 'Custom bundle');
  assert.equal(offer.products.length, 3);
  assert.deepEqual(offer.products.map(product => product.productTitle), ['Oval Aurora', 'Pendant Pistacchio', 'White Zircon Round']);
  assert.equal(offer.discountText, '10 USD off');
  assert.equal(offer.editTo, '/app/bundles/custom');
  assert.equal(customBundleOffer({ productIds: ids, currency: 'USD', discount: { discountType: 'percentage', percentage: 15 } }, products).discountText, '15% off');
  assert.equal(customBundleOffer({ productIds: [], discount: {} }, []), null);
  assert.equal(customBundleOffer(null, products), null);

  const index = readFileSync(new URL('../app/routes/app.bundles._index.jsx', import.meta.url), 'utf8');
  assert.match(index, /customBundleOffer\(/);
  assert.match(index, /CUSTOM_BUNDLE_DELETE_INTENT/);
  assert.match(index, /Delete this custom bundle\?/);
  assert.match(index, /bundle\.editTo/);
  assert.match(index, /bundle\.discountText/);
  assert.match(index, /Edit bundle/);
  assert.match(index, /Delete bundle/);
  assert.equal(CUSTOM_BUNDLE_DELETE_INTENT, 'custom-bundle-delete');
  assert.match(index, /saveCustomBundleProducts\(admin, \[\]\)/);
});
