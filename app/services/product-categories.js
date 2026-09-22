export const categoryLabel = product => product.missing ? "Unavailable product" : product.category?.fullName || "Uncategorized";
const categoryKey = product => product.missing ? "unavailable" : product.category?.id || "uncategorized";

export function productCategories(products) {
  const categories = new Map();
  for (const product of products) {
    const key = categoryKey(product);
    const entry = categories.get(key) || { id: key, label: categoryLabel(product), count: 0 };
    entry.count++;
    categories.set(key, entry);
  }
  return [...categories.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function filterBundleProducts(products, search, category) {
  const categories = Array.isArray(category) ? category : category ? [category] : [];
  const term = search.trim().toLowerCase();
  return products.filter(product => (!categories.length || categories.includes(categoryKey(product))) &&
    `${product.title} ${categoryLabel(product)}`.toLowerCase().includes(term));
}

// Only apply the changed category, preserving individual exclusions in others.
export function selectCategoryProducts(products, selected, category, checked) {
  const ids = new Set(products.filter(product => !product.missing && categoryKey(product) === category).map(product => product.id));
  return checked ? [...new Set([...selected, ...ids])] : selected.filter(id => !ids.has(id));
}
