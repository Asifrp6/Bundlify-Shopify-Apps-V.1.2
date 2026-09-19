import { getProducts } from './products.server.js';
import { randomUUID } from 'node:crypto';
import { createBundleDiscount, removeBundleDiscount } from './bundle-discount.server.js';

export const CUSTOM_BUNDLE_QUERY = `#graphql
  query CustomBundleSettings {
    shop { id metafield(namespace: "bundlify", key: "custom_bundle_products") { value }
      discount: metafield(namespace: "bundlify", key: "custom_bundle_discount") { value } }
  }
`;
export const CUSTOM_BUNDLE_SAVE = `#graphql
  mutation SaveCustomBundleProducts($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { metafields { key } userErrors { message } }
  }
`;

export function validateCustomProducts(ids) {
  if (!Array.isArray(ids) || ids.length > 50 || ids.length === 1 ||
      ids.some(id => typeof id !== 'string' || !/^gid:\/\/shopify\/Product\/\d+$/.test(id)) ||
      new Set(ids).size !== ids.length) {
    throw new Error('Select 2–50 different products, or clear the selection to disable custom bundles.');
  }
  return ids;
}

export async function getCustomBundleSettings(admin) {
  const result = await (await admin.graphql(CUSTOM_BUNDLE_QUERY)).json();
  if (result.errors?.length || !result.data?.shop?.id) throw new Error('Could not load custom bundle settings.');
  const shop = result.data.shop;
  const productIds = JSON.parse(shop.metafield?.value || '[]');
  if (!Array.isArray(productIds) || productIds.some(id => typeof id !== 'string')) throw new Error('Invalid custom bundle settings.');
  const discount = JSON.parse(shop.discount?.value || '{}');
  return { shopId: shop.id, productIds, discount };
}

export async function saveCustomBundleProducts(admin, ids, percentage = 0) {
  validateCustomProducts(ids);
  if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) throw new Error('Enter a whole-number discount from 0 to 100.');
  if (ids.length) {
    const products = await getProducts(admin, ids);
    if (products.length !== ids.length || ids.some(id => !products.some(product => product.id === id))) {
      throw new Error('A selected product is no longer available. Reload the page and select products again.');
    }
  }
  // Resolve the owner from this authenticated shop, never from submitted form data.
  const { shopId, discount: previous } = await getCustomBundleSettings(admin);
  const config = { id: randomUUID(), percentage: ids.length ? percentage : 0, products: ids, discountNodeId: null };
  if (config.percentage > 0) config.discountNodeId = await createBundleDiscount(admin, {
    id: config.id, name: 'Custom bundle', custom: true, discount: config.percentage, products: ids.map(productId => ({ productId })),
  });
  // The shop configuration activates the new discount atomically with the eligible list.
  // Retain the node on ambiguous transport errors; it only runs if its ID was saved.
  const result = await (await admin.graphql(CUSTOM_BUNDLE_SAVE, { variables: {
    metafields: [{ ownerId: shopId, namespace: 'bundlify', key: 'custom_bundle_products',
      type: 'list.product_reference', value: JSON.stringify(ids) },
      { ownerId: shopId, namespace: 'bundlify', key: 'custom_bundle_discount', type: 'json', value: JSON.stringify(config) }],
  } })).json();
  if (result.errors?.length || result.data?.metafieldsSet?.userErrors?.length || !result.data?.metafieldsSet?.metafields?.length) {
    try { await removeBundleDiscount(admin, config); } catch { /* Inactive without a matching shop config. */ }
    throw new Error('Custom bundle products could not be saved. Please try again.');
  }
  if (previous.discountNodeId) {
    try { await removeBundleDiscount(admin, previous); }
    catch { /* The function rejects retired IDs even if Shopify cleanup fails. */ }
  }
}
