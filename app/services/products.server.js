export const PRODUCTS_QUERY = `#graphql
  query BundlifyProducts($after: String) {
    products(first: 100, after: $after, sortKey: TITLE) {
      nodes { id title featuredImage { url } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const SELECTED_PRODUCTS_QUERY = `#graphql
  query BundlifySelectedProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product { id title featuredImage { url } }
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
    message = "Shopify rejected the app session. Reopen Bundlify from Shopify Admin to refresh your session.";
  } else if (status === 403 || codes.includes("ACCESS_DENIED")) {
    code = "PRODUCT_ACCESS_DENIED";
    message = "Shopify denied product access. Update this app installation's product permissions, then reopen Bundlify.";
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

export async function listProducts(admin) {
  const products = [];
  const seen = new Set();
  let after = null;
  do {
    const result = await query(admin, PRODUCTS_QUERY, { after });
    const connection = result.products;
    if (!Array.isArray(connection?.nodes) || !connection.pageInfo)
      throw new Error("Invalid product response.");
    products.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) return products;
    const next = connection.pageInfo.endCursor;
    if (!next || seen.has(next)) throw new Error("Invalid product pagination.");
    seen.add(next);
    after = next;
  } while (after);
  return products;
}

export async function getProducts(admin, ids) {
  const result = await query(admin, SELECTED_PRODUCTS_QUERY, { ids });
  if (!Array.isArray(result.nodes))
    throw new Error("Invalid product response.");
  return result.nodes.filter((product) => product?.id && product?.title);
}
