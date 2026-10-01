export const ALL_PRODUCTS = "ALL_PRODUCTS";
export const SELECTED_PRODUCTS = "SELECTED_PRODUCTS";

export const toggleProduct = (selected, id) =>
  selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id];

export function parseProductIds(json) {
  try {
    const ids = JSON.parse(json || "[]");
    return Array.isArray(ids) ? ids.filter(id => typeof id === "string" && id) : [];
  } catch {
    return [];
  }
}

// Older plans can hold a single product id plus extra ids left by the product block.
export function planSelection(plan) {
  const ids = parseProductIds(plan?.productIdsJson);
  if (plan?.productId === ALL_PRODUCTS) return { productId: ALL_PRODUCTS, selected: [] };
  if (plan?.productId === SELECTED_PRODUCTS) return { productId: SELECTED_PRODUCTS, selected: [...new Set(ids)] };
  const merged = [...new Set([plan?.productId, ...ids].filter(Boolean))];
  if (merged.length > 1) return { productId: SELECTED_PRODUCTS, selected: merged };
  return { productId: merged[0] || "", selected: [] };
}

export const unavailableTitle = id => `Unavailable product (${String(id).split("/").pop()})`;

// Saved products missing from the catalog stay visible so they are never dropped silently.
export function withMissingProducts(products, ids, titles = {}) {
  const known = new Set(products.map(product => product.id));
  const missing = [...new Set(ids)].filter(id => id && !known.has(id))
    .map(id => ({ id, title: titles[id] || unavailableTitle(id), missing: true }));
  return [...products, ...missing];
}

export function selectionSummary(productId, selected, products) {
  if (productId === ALL_PRODUCTS) return "All current products";
  if (productId === SELECTED_PRODUCTS) return `${selected.length} selected products`;
  return products.find(product => product.id === productId)?.title || "No product selected yet";
}

export function selectionReady(productId, selected, maxProducts) {
  if (!productId) return false;
  if (productId !== SELECTED_PRODUCTS) return true;
  return selected.length > 0 && selected.length <= maxProducts;
}

export const limitMessage = (count, max, itemLabel = "products") =>
  `${count} products selected. Remove ${count - max} products before continuing; your plan supports up to ${max} ${itemLabel}.`;

const availableIds = products => products.filter(product => !product.missing).map(product => product.id);

// Bundles store explicit product rows, so every select choice resolves to a concrete id list.
export function bundleSelectionChange(mode, value, selected, products) {
  if (value === ALL_PRODUCTS) return { mode: ALL_PRODUCTS, selected: availableIds(products) };
  const base = mode === ALL_PRODUCTS ? [] : selected;
  if (value === SELECTED_PRODUCTS) return { mode: SELECTED_PRODUCTS, selected: base };
  return { mode: SELECTED_PRODUCTS, selected: base.includes(value) ? base : [...base, value] };
}

export function bundleInitialMode(savedIds, products) {
  if (!savedIds.length) return "";
  const all = availableIds(products);
  const saved = new Set(savedIds);
  return all.length >= 2 && saved.size === all.length && all.every(id => saved.has(id)) ? ALL_PRODUCTS : SELECTED_PRODUCTS;
}

// Matches what the storefront bundle proxy shows: active products with a past Online Store publish date.
export function storefrontIssue(product, now = new Date()) {
  if (!product || product.missing) return "removed from your store";
  if (product.status === "ARCHIVED") return "archived";
  if (product.status !== "ACTIVE") return "a draft";
  if (!product.publishedAt || new Date(product.publishedAt) > now) return "not published to the Online Store";
  return null;
}

export function bundleActivationError(products, now = new Date()) {
  const blocked = products.flatMap(product => {
    const issue = storefrontIssue(product, now);
    return issue ? [`${product.title || unavailableTitle(product.id)} is ${issue}`] : [];
  });
  const visible = products.length - blocked.length;
  if (visible >= 2) return null;
  return `Only ${visible} of the selected products ${visible === 1 ? "is" : "are"} live on your Online Store, so customers would not see this bundle. ${blocked.join(". ")}. Set at least two bundle products to Active and publish them to the Online Store in Shopify, or choose other products. You can still save this bundle as a draft.`;
}

export function assignmentChanges(current, next) {
  const before = new Set(current);
  const after = new Set(next);
  return {
    add: [...after].filter(id => !before.has(id)),
    remove: [...before].filter(id => !after.has(id)),
  };
}
