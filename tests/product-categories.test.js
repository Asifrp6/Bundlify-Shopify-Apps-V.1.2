import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCategoryProducts, filterBundleProducts } from '../app/services/product-categories.js';

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
