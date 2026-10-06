import { storefrontIssue } from "./product-selection.js";
import { storefrontGiftOptions } from "./gift-options.js";
import { giftStore, loadGiftEnabled } from "./gift-options.server.js";
import { readBundleDiscounts } from "./discount-rollouts.server.js";

export const STOREFRONT_PRODUCTS_QUERY = `#graphql
  query BundleProducts($ids: [ID!]!) {
    shop { currencyCode }
    nodes(ids: $ids) { ... on Product { id title handle status publishedAt } }
  }`;

// Drafts never reach the storefront; every product page with the block lists the same active bundles.
export const storefrontBundleWhere = shop => ({ shop, status: "ACTIVE" });

export const storefrontVisible = (product, now = new Date()) => !storefrontIssue(product, now);

function buyerDiscount(bundle, availability) {
  if (!bundle.discountNodeId) return { advertise: false, note: null };
  const record = availability instanceof Map ? availability.get(bundle.discountNodeId) : undefined;
  if (!record) return { advertise: true, note: null };
  if (!record.present) return { advertise: false, note: null };
  if (!record.availability) return { advertise: true, note: null };
  return { advertise: record.availability.reachesEveryBuyer, note: record.availability.buyerNote || null };
}

export function storefrontBundles(bundles, products, { shopCurrency, availability } = {}) {
  return bundles.flatMap(bundle => {
    if (bundle.status !== "ACTIVE") return [];
    const visible = bundle.products.filter(product => products.has(product.productId));
    if (visible.length < 2) return [];
    const offer = buyerDiscount(bundle, availability);
    const discounted = offer.advertise;
    const fixed = bundle.discountType === "fixed";
    const result = {
      id: String(bundle.id),
      discount: discounted && !fixed ? bundle.discount : 0,
      discountType: bundle.discountType,
      fixedDiscount: discounted && fixed ? bundle.discount : 0,
      shopCurrency,
      name: bundle.name,
      products: visible.map(row => {
        const product = products.get(row.productId);
        return { title: product.title, handle: product.handle };
      }),
    };
    if (offer.note) result.discountNote = offer.note;
    return [result];
  });
}

export async function loadStorefrontBundles({ db, admin, shop, now = new Date(), scopes } = {}) {
  const bundles = await db.bundle.findMany({
    where: storefrontBundleWhere(shop),
    include: { products: true },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const ids = [...new Set(bundles.flatMap(bundle => bundle.products.map(product => product.productId)))];
  const products = new Map();
  let shopCurrency;
  for (let index = 0; index < ids.length; index += 250) {
    const response = await admin.graphql(STOREFRONT_PRODUCTS_QUERY, { variables: { ids: ids.slice(index, index + 250) } });
    const result = await response.json();
    if (result.errors?.length || !result.data?.nodes) throw new Error("Products unavailable");
    shopCurrency = result.data.shop?.currencyCode;
    for (const product of result.data.nodes) if (storefrontVisible(product, now)) products.set(product.id, product);
  }
  const discountIds = bundles.map(bundle => bundle.discountNodeId).filter(Boolean);
  let availability = new Map();
  if (discountIds.length) {
    try {
      availability = await readBundleDiscounts(admin, discountIds, { scopes, now });
    } catch {
      availability = new Map();
    }
  }
  return storefrontBundles(bundles, products, { shopCurrency, availability });
}

// Gift options are optional extras: a failure here must not hide the bundles themselves.
export async function loadStorefrontGiftOptions({ db, shop, store = giftStore(db) }) {
  try {
    return storefrontGiftOptions(await store.list(shop));
  } catch {
    return storefrontGiftOptions([]);
  }
}

// When the store owner turns gift options off, the popup skips Gift Box / package / wrap and only offers Add to cart.
export async function loadStorefrontGiftEnabled({ db, shop, store = giftStore(db) }) {
  return loadGiftEnabled(store, shop);
}
