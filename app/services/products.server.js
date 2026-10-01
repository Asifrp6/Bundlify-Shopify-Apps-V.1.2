export const PRODUCTS_QUERY = `#graphql
  query BundlifyProducts($after: String) {
    products(first: 100, after: $after, sortKey: TITLE) {
      nodes { id title productType status publishedAt featuredMedia { preview { image { url } } } category { id fullName } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const SELECTED_PRODUCTS_QUERY = `#graphql
  query BundlifySelectedProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product { id title status publishedAt featuredMedia { preview { image { url } } } }
    }
  }
`;

export function productLoadFailure(error) {
  const status = error?.response?.code || error?.response?.status || error?.status;
  const errors = error?.body?.errors?.graphQLErrors || error?.body?.errors || [];
  const codes = Array.isArray(errors) ? errors.map((item) => item.extensions?.code) : [];
  let code = "PRODUCT_REQUEST_FAILED";
  let message = "Unable to load products. Retry, and check the app server's product error code if it continues.";
  if (status === 401) {
    code = "PRODUCT_SESSION_EXPIRED";
    message = "Shopify rejected the app session. Reopen Bundle Base from Shopify Admin to refresh your session.";
  } else if (status === 403 || codes.includes("ACCESS_DENIED")) {
    code = "PRODUCT_ACCESS_DENIED";
    message = "Shopify denied product access. Update this app installation's product permissions, then reopen Bundle Base.";
  } else if (status === 429 || codes.includes("THROTTLED")) {
    code = "PRODUCT_RATE_LIMITED";
    message = "Shopify is temporarily limiting requests. Wait a moment, then retry loading products.";
  } else if (error?.cause?.code || error instanceof TypeError) {
    code = "PRODUCT_CONNECTION_FAILED";
    message = "The app server could not connect to Shopify. Check its internet connection, then retry.";
  }
  return { code, message, status: status || null };
}

async function query(admin, document, variables) {
  const response = await admin.graphql(document, { variables });
  const result = await response.json();
  if (result.errors?.length || !result.data) {
    const error = new Error("Could not load Shopify products.");
    error.body = { errors: result.errors || [] };
    error.status = response.status;
    throw error;
  }
  return result.data;
}

// Bounds catalog loading (100 products per page) so very large stores cannot hang the editor.
export const MAX_PRODUCT_PAGES = 50;

export async function listProducts(admin, maxPages = MAX_PRODUCT_PAGES) {
  const products = [];
  const seen = new Set();
  let after = null;
  for (let page = 0; page < maxPages; page++) {
    const result = await query(admin, PRODUCTS_QUERY, { after });
    const connection = result.products;
    if (!Array.isArray(connection?.nodes) || !connection.pageInfo)
      throw new Error("Invalid product response.");
    products.push(...connection.nodes.map(productImage));
    if (!connection.pageInfo.hasNextPage) return products;
    const next = connection.pageInfo.endCursor;
    if (!next || seen.has(next)) throw new Error("Invalid product pagination.");
    seen.add(next);
    after = next;
  }
  return products;
}

export async function getProducts(admin, ids) {
  const result = await query(admin, SELECTED_PRODUCTS_QUERY, { ids });
  if (!Array.isArray(result.nodes))
    throw new Error("Invalid product response.");
  return result.nodes.filter((product) => product?.id && product?.title).map(productImage);
}

// Resolves a validated plan selection into the product ids to associate, or a merchant-facing error.
export async function resolvePlanProducts(admin, { productId, productIds = [] }) {
  if (productId === "ALL_PRODUCTS") {
    const catalog = await listProducts(admin);
    if (!catalog.length) return { error: "Add products in Shopify before applying this plan to all products." };
    return { productId, productIds: catalog.map(product => product.id), title: "All products", image: null };
  }
  const ids = productId === "SELECTED_PRODUCTS" ? productIds : [productId];
  const found = await getProducts(admin, ids);
  const available = new Set(found.map(product => product.id));
  const missing = ids.filter(id => !available.has(id));
  if (missing.length)
    return { error: `${missing.length === 1 ? "A selected product is" : `${missing.length} selected products are`} no longer available in Shopify. Uncheck ${missing.length === 1 ? "it" : "them"} and save again.` };
  if (productId === "SELECTED_PRODUCTS")
    return { productId, productIds: ids, title: `${ids.length} selected products`, image: null };
  return { productId, productIds: ids, title: found[0].title, image: found[0].featuredImage?.url ?? null };
}

function productImage(product) {
  return { ...product, featuredImage: product.featuredMedia?.preview?.image || null };
}
