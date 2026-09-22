import { randomUUID } from 'node:crypto';

export const CREATE_DISCOUNT = `#graphql
  mutation BundleDiscountCreate($input: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $input) {
      automaticAppDiscount { discountId }
      userErrors { field message }
    }
  }`;
export const DELETE_DISCOUNT = `#graphql
  mutation BundleDiscountDelete($id: ID!) {
    discountAutomaticDelete(id: $id) { deletedAutomaticDiscountId userErrors { field message } }
  }`;

export async function removeBundleDiscount(admin, bundle) {
  if (!bundle.discountNodeId) return;
  const result = await (await admin.graphql(DELETE_DISCOUNT, { variables: { id: bundle.discountNodeId } })).json();
  const payload = result.data?.discountAutomaticDelete;
  if (result.errors?.length || payload?.userErrors?.length || payload?.deletedAutomaticDiscountId !== bundle.discountNodeId)
    throw new Error("Could not remove the bundle discount. Try again before changing this bundle.");
}

export async function createBundleDiscount(admin, bundle) {
  if (!bundle.discount) return null;
  const result = await (await admin.graphql(CREATE_DISCOUNT, { variables: { input: {
    title: `Bundlify: ${String(bundle.name).slice(0, 160)} (${randomUUID()})`,
    functionHandle: "bundlify-bundle-discount",
    discountClasses: ["PRODUCT"],
    startsAt: new Date().toISOString(),
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true },
    metafields: [{ namespace: "$app:bundlify", key: "bundle", type: "json", value: JSON.stringify({
      id: String(bundle.id), percentage: bundle.discountType === 'fixed' ? 0 : bundle.discount,
      ...(bundle.discountType === 'fixed' ? { discountType: 'fixed', fixedAmount: bundle.discount } : {}),
      ...(bundle.custom ? { custom: true } : {}),
      products: bundle.products.map(p => p.productId),
    }) }],
  } } })).json();
  const payload = result.data?.discountAutomaticAppCreate;
  if (result.errors?.length || payload?.userErrors?.length || !payload?.automaticAppDiscount?.discountId) {
    const details = [...(result.errors || []), ...(payload?.userErrors || [])]
      .map(error => error.message).filter(Boolean).join("; ");
    throw new Error(`Could not activate the bundle discount. ${details || "Shopify returned no discount ID. Try again."}`);
  }
  return payload.automaticAppDiscount.discountId;
}
