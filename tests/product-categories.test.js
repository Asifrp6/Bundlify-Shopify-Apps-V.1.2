import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCategoryProducts, filterBundleProducts, productCategories, categoryLabel } from '../app/services/product-categories.js';
import { listProducts } from '../app/services/products.server.js';

const products = [
  { id: '1', title: 'One', category: { id: 'a', fullName: 'A' } },
  { id: '2', title: 'Two', category: { id: 'a', fullName: 'A' } },
  { id: '3', title: 'Three', category: { id: 'b', fullName: 'B' } },
  { id: '4', title: 'Four' },
];
test('category selection preserves exclusions in other categories and manual selections', () => {
  let selected = selectCategoryProducts(products, ['4'], 'a', true);
  assert.deepEqual(selected, ['4', '1', '2']);
  selected = selected.filter(id => id !== '2');
  selected = selectCategoryProducts(products, selected, 'b', true);
  assert.deepEqual(selected, ['4', '1', '3']);
  assert.deepEqual(selectCategoryProducts(products, selected, 'a', false), ['4', '3']);
  assert.deepEqual(selectCategoryProducts(products, selected, 'b', true), selected);
});
test('multiple category filters combine with search and clearing shows all products', () => {
  assert.deepEqual(filterBundleProducts(products, '', ['a', 'b']).map(p => p.id), ['1', '2', '3']);
  assert.deepEqual(filterBundleProducts(products, 'two', ['a', 'b']).map(p => p.id), ['2']);
  assert.equal(filterBundleProducts(products, '', []).length, 4);
});
test('every category is listed, using product type when taxonomy category is missing', () => {
  const catalog = [
    ...products,
    { id: '5', title: 'Five', productType: 'Snowboard' },
    { id: '6', title: 'Six', productType: ' snowboard ' },
    { id: '7', title: 'Seven', productType: 'Wax' },
    { id: '8', title: 'Eight', productType: '' },
  ];
  assert.deepEqual(productCategories(catalog).map(c => [c.id, c.label, c.count]), [
    ['a', 'A', 2], ['b', 'B', 1], ['type:snowboard', 'Snowboard', 2], ['uncategorized', 'Uncategorized', 2], ['type:wax', 'Wax', 1],
  ]);
  assert.equal(categoryLabel(catalog[6]), 'Wax');
  assert.deepEqual(filterBundleProducts(catalog, '', ['type:snowboard']).map(p => p.id), ['5', '6']);
  assert.deepEqual(selectCategoryProducts(catalog, [], 'type:wax', true), ['7']);
});
test('empty and single-category shops', () => {
  assert.deepEqual(productCategories([]), []);
  assert.deepEqual(productCategories([products[0], products[1]]).map(c => c.id), ['a']);
});
test('listProducts loads every page and stops at the page bound', async () => {
  const page = (n, more) => Response.json({ data: { products: {
    nodes: [{ id: `p${n}`, title: `P${n}`, productType: `T${n}` }], pageInfo: { hasNextPage: more, endCursor: `c${n}` },
  } } });
  let calls = 0;
  const all = await listProducts({ graphql: async () => page(++calls, calls < 4) });
  assert.equal(calls, 4);
  assert.equal(productCategories(all).length, 4);
  calls = 0;
  const bounded = await listProducts({ graphql: async () => page(++calls, true) }, 3);
  assert.equal(calls, 3);
  assert.equal(bounded.length, 3);
});
