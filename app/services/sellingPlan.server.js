import { sellingPlanInput, planOptions } from "./delivery-options.js";
export const CREATE_SELLING_PLAN = `#graphql
  mutation BundlifySellingPlanGroupCreate($input: SellingPlanGroupInput!, $resources: SellingPlanGroupResourceInput) {
    sellingPlanGroupCreate(input: $input, resources: $resources) {
      sellingPlanGroup { id sellingPlans(first: 10) { nodes { id options } } }
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
  { name, productId, productIds = [productId], frequency, discount, merchantCode, deliveryOptions },
) {
  if (!productIds.length || productIds.some(id => !/^gid:\/\/shopify\/Product\/\d+$/.test(id)))
    throw new SellingPlanError("Select at least one valid product.", { rejected: true });
  let inputs;
  try { inputs = planOptions({frequency, discount, deliveryOptions}).map(option => sellingPlanInput(name, option)); }
  catch { throw new SellingPlanError("Invalid billing frequency or discount.", { rejected: true }); }
  const response = await admin.graphql(CREATE_SELLING_PLAN, {
    variables: {
      input: {
        name,
        merchantCode,
        options: ["Delivery frequency"],
        sellingPlansToCreate: inputs,
      },
      resources: { productIds: productIds.slice(0, 250) },
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
    throw new Error("Could not assign products to the selling plan.");
}

export async function deleteSellingPlan(admin, id) {
  const response = await admin.graphql(DELETE_SELLING_PLAN, {
    variables: { id },
  });
  const result = await response.json();
  const payload = result.data?.sellingPlanGroupDelete;
  if (
    result.errors?.length ||
    payload?.userErrors?.length ||
    payload?.deletedSellingPlanGroupId !== id
  ) {
    throw new Error("Could not roll back the Shopify selling plan.");
  }
}
