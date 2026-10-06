import { sellingPlanInput, planOptions, planLengths, planCombinations, groupOptionNames } from "./delivery-options.js";
export const CREATE_SELLING_PLAN = `#graphql
  mutation BundlifySellingPlanGroupCreate($input: SellingPlanGroupInput!, $resources: SellingPlanGroupResourceInput) {
    sellingPlanGroupCreate(input: $input, resources: $resources) {
      sellingPlanGroup { id sellingPlans(first: 50) { nodes { id options } } }
      userErrors { field message }
    }
  }
`;

export const DELETE_SELLING_PLAN = `#graphql
  mutation BundlifySellingPlanGroupDelete($id: ID!) {
    sellingPlanGroupDelete(id: $id) {
      deletedSellingPlanGroupId
      userErrors { field message }
    }
  }
`;

export class SellingPlanError extends Error {
  constructor(message, { rejected = false } = {}) {
    super(message);
    this.publicMessage = message;
    this.rejected = rejected;
  }
}

export async function createSellingPlan(
  admin,
  { name, productId, productIds = [productId], productVariantIds = [], frequency, discount, discountType, merchantCode, deliveryOptions, lengthEnabled, lengthOptions, lengthOptionsJson },
) {
  const variants = productVariantIds.filter(Boolean);
  if (variants.some(id => !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(id)))
    throw new SellingPlanError("Select valid product variants.", { rejected: true });
  if (!productIds.length || productIds.some(id => !/^gid:\/\/shopify\/Product\/\d+$/.test(id)))
    throw new SellingPlanError("Select at least one valid product.", { rejected: true });
  const lengths = planLengths({ lengthEnabled, lengthOptions, lengthOptionsJson });
  let inputs;
  try {
    inputs = planCombinations(planOptions({frequency, discount, discountType, deliveryOptions}), lengths)
      .map(({ option, length }) => sellingPlanInput(name, option, length));
  }
  catch { throw new SellingPlanError("Invalid billing frequency, subscription length or discount.", { rejected: true }); }
  const response = await admin.graphql(CREATE_SELLING_PLAN, {
    variables: {
      input: {
        name,
        merchantCode,
        options: groupOptionNames(lengths),
        sellingPlansToCreate: inputs,
      },
      resources: variants.length
        ? { productVariantIds: variants.slice(0, 250) }
        : { productIds: productIds.slice(0, 250) },
    },
  });
  const result = await response.json();
  const payload = result.data?.sellingPlanGroupCreate;
  // A transport or top-level error can leave the mutation outcome unknown.
  if (result.errors?.length)
    throw new SellingPlanError(
      "Shopify could not confirm plan creation. Check your plan list before retrying.",
    );
  if (payload?.userErrors?.length) {
    throw new SellingPlanError(
      payload.userErrors.map((error) => error.message).join(" "),
      { rejected: true },
    );
  }
  if (!payload?.sellingPlanGroup?.id)
    throw new SellingPlanError(
      "Shopify did not confirm the selling plan. Check your plan list before retrying.",
    );
  const group = payload.sellingPlanGroup;
  try {
    for (let offset = 250; offset < productIds.length; offset += 250) {
      await addPlanProducts(admin, group.id, productIds.slice(offset, offset + 250));
    }
  } catch {
    try { await deleteSellingPlan(admin, group.id); }
    catch {
      const error = new SellingPlanError(`Product assignment was interrupted for ${group.id}. Review this group in Shopify before retrying.`);
      error.sellingPlanGroupId = group.id;
      throw error;
    }
    throw new SellingPlanError("Could not assign all products. The Shopify group was rolled back; please retry.", { rejected: true });
  }
  return group;
}

export const ADD_PLAN_PRODUCTS = `#graphql
mutation BundlifyAddPlanProducts($id: ID!, $productIds: [ID!]!) {
  sellingPlanGroupAddProducts(id: $id, productIds: $productIds) {
    sellingPlanGroup { id }
    userErrors { field message }
  }
}`;
export async function addPlanProducts(admin, id, productIds) {
  const response = await admin.graphql(ADD_PLAN_PRODUCTS, { variables: { id, productIds } });
  const result = await response.json();
  const payload = result.data?.sellingPlanGroupAddProducts;
  if (result.errors?.length || payload?.userErrors?.length || payload?.sellingPlanGroup?.id !== id)
    throw new Error(payload?.userErrors?.map(error => error.message).join(" ") || "Could not assign products to the selling plan.");
}

export const PLAN_PRODUCTS_QUERY = `#graphql
query BundlifyPlanProducts($id: ID!, $after: String) {
  sellingPlanGroup(id: $id) {
    products(first: 250, after: $after) { nodes { id } pageInfo { hasNextPage endCursor } }
  }
}`;
export const PLAN_VARIANTS_QUERY = `#graphql
query BundlifyPlanVariants($id: ID!, $after: String) {
  sellingPlanGroup(id: $id) {
    productVariants(first: 250, after: $after) { nodes { id product { id } } pageInfo { hasNextPage endCursor } }
  }
}`;
export const REMOVE_PLAN_VARIANTS = `#graphql
mutation BundlifyRemovePlanVariants($id: ID!, $productVariantIds: [ID!]!) {
  sellingPlanGroupRemoveProductVariants(id: $id, productVariantIds: $productVariantIds) {
    removedProductVariantIds
    userErrors { field message }
  }
}`;

const MAX_ASSIGNMENT_PAGES = 50;
async function planResources(admin, id, document, field) {
  const nodes = [];
  let after = null;
  for (let page = 0; page < MAX_ASSIGNMENT_PAGES; page++) {
    const response = await admin.graphql(document, { variables: { id, after } });
    const result = await response.json();
    const connection = result.data?.sellingPlanGroup?.[field];
    if (result.errors?.length || !connection) throw new Error("Could not read the products on this Shopify plan.");
    nodes.push(...connection.nodes);
    if (!connection.pageInfo?.hasNextPage) return nodes;
    after = connection.pageInfo.endCursor;
  }
  throw new Error("This plan has too many products to edit here. Review it in Shopify.");
}

async function removePlanVariants(admin, id, productVariantIds) {
  const response = await admin.graphql(REMOVE_PLAN_VARIANTS, { variables: { id, productVariantIds } });
  const result = await response.json();
  const payload = result.data?.sellingPlanGroupRemoveProductVariants;
  if (result.errors?.length || !payload || payload.userErrors?.length)
    throw new Error(payload?.userErrors?.map(error => error.message).join(" ") || "Could not remove product variants from this plan.");
}

const chunks = (ids, size = 250) => Array.from({ length: Math.ceil(ids.length / size) }, (_, i) => ids.slice(i * size, i * size + size));

// Diffs against Shopify's live associations so retries after a partial failure are safe.
// Products scoped to specific variants keep that scope when they stay selected.
export async function syncPlanProducts(admin, id, productIds) {
  const [products, variants] = await Promise.all([
    planResources(admin, id, PLAN_PRODUCTS_QUERY, "products"),
    planResources(admin, id, PLAN_VARIANTS_QUERY, "productVariants"),
  ]);
  const next = new Set(productIds);
  const linked = new Set([...products.map(product => product.id), ...variants.map(variant => variant.product?.id)]);
  const add = [...next].filter(productId => !linked.has(productId));
  const remove = products.map(product => product.id).filter(productId => !next.has(productId));
  const removeVariants = variants.filter(variant => !next.has(variant.product?.id)).map(variant => variant.id);
  for (const ids of chunks(add)) await addPlanProducts(admin, id, ids);
  for (const ids of chunks(remove)) await removePlanProducts(admin, id, ids);
  for (const ids of chunks(removeVariants)) await removePlanVariants(admin, id, ids);
  return { added: add.length, removed: remove.length + removeVariants.length };
}

export const REMOVE_PLAN_PRODUCTS = `#graphql
mutation BundlifyRemovePlanProducts($id: ID!, $productIds: [ID!]!) {
  sellingPlanGroupRemoveProducts(id: $id, productIds: $productIds) {
    removedProductIds
    userErrors { field message }
  }
}`;
export async function removePlanProducts(admin, id, productIds) {
  const response = await admin.graphql(REMOVE_PLAN_PRODUCTS, { variables: { id, productIds } });
  const result = await response.json();
  const payload = result.data?.sellingPlanGroupRemoveProducts;
  if (result.errors?.length || payload?.userErrors?.length)
    throw new Error(payload?.userErrors?.map(error => error.message).join(" ") || "Could not remove the product from this plan.");
}

const APP_GROUPS = `#graphql
query BundlifyAppGroups($after: String) {
  sellingPlanGroups(first: 50, after: $after) {
    nodes { id merchantCode }
    pageInfo { hasNextPage endCursor }
  }
}`;

export async function listAppSellingPlanGroups(admin) {
  const groups = [];
  const seen = new Set();
  let after = null;
  do {
    const result = await (await admin.graphql(APP_GROUPS, { variables: { after } })).json();
    const connection = result.data?.sellingPlanGroups;
    if (result.errors?.length || !connection) throw new Error("Unable to verify the Shopify plan. Please retry.");
    groups.push(...(connection.nodes || []));
    if (!connection.pageInfo?.hasNextPage) return groups;
    after = connection.pageInfo.endCursor;
    if (!after || seen.has(after)) throw new Error("Unable to verify the Shopify plan. Please retry.");
    seen.add(after);
  } while (groups.length < 200);
  return groups;
}

export function groupIdsForPlan(plan, groups = []) {
  const ids = [];
  const add = id => { if (id && !ids.includes(id)) ids.push(id); };
  add(plan?.sellingPlanGroupId);
  const code = `bundlify-${plan?.id}`;
  for (const group of groups) if (group?.merchantCode === code) add(group.id);
  return ids;
}

function alreadyDeleted(payload) {
  return payload?.userErrors?.length > 0 && payload.userErrors.every(error => /does not exist|not found/i.test(error.message || ""));
}

export async function deleteSellingPlan(admin, id, { missingOk = false } = {}) {
  const response = await admin.graphql(DELETE_SELLING_PLAN, {
    variables: { id },
  });
  const result = await response.json();
  const payload = result.data?.sellingPlanGroupDelete;
  if (missingOk && alreadyDeleted(payload)) return;
  if (
    result.errors?.length ||
    payload?.userErrors?.length ||
    payload?.deletedSellingPlanGroupId !== id
  ) {
    throw new Error("Could not roll back the Shopify selling plan.");
  }
}
