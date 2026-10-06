import { readBundleDiscounts } from "./discount-rollouts.server.js";

export const SAVED_RESOURCES_QUERY = `#graphql
  query BundlifySavedResources($ids: [ID!]!) {
    nodes(ids: $ids) { id }
  }
`;

async function presentNodeIds(admin, ids) {
  const present = new Set();
  for (let offset = 0; offset < ids.length; offset += 250) {
    const batch = ids.slice(offset, offset + 250);
    const result = await (await admin.graphql(SAVED_RESOURCES_QUERY, { variables: { ids: batch } })).json();
    if (result.errors?.length || !Array.isArray(result.data?.nodes) || result.data.nodes.length !== batch.length ||
        result.data.nodes.some((node, index) => node !== null && node?.id !== batch[index])) {
      throw new Error("Unable to verify saved offers after authentication. Please retry.");
    }
    for (const node of result.data.nodes) if (node) present.add(node.id);
  }
  return present;
}

export async function reconcileSavedResources({ db, admin, shop, scopes }) {
  const [bundles, plans] = await Promise.all([
    db.bundle.findMany({ where: { shop, discountNodeId: { not: null } }, select: { id: true, discountNodeId: true } }),
    db.subscriptionPlan.findMany({ where: { shop, sellingPlanGroupId: { not: null } }, select: { id: true, sellingPlanGroupId: true } }),
  ]);
  const discountIds = [...new Set(bundles.map(bundle => bundle.discountNodeId))];
  const planIds = [...new Set(plans.map(plan => plan.sellingPlanGroupId))];
  if (!discountIds.length && !planIds.length) return;
  // Discount nodes are read at 2026-10 so a serving rollout does not look like a deletion.
  const [discounts, presentPlans] = await Promise.all([
    discountIds.length ? readBundleDiscounts(admin, discountIds, { scopes }) : new Map(),
    planIds.length ? presentNodeIds(admin, planIds) : new Set(),
  ]);
  // Keep surviving resources to avoid duplicating plans on a quick reinstall.
  await db.$transaction(async tx => {
    for (const bundle of bundles.filter(bundle => !discounts.get(bundle.discountNodeId)?.present)) {
      await tx.bundle.updateMany({ where: { id: bundle.id, shop, discountNodeId: bundle.discountNodeId }, data: { status: "DRAFT", discountNodeId: null } });
    }
    for (const plan of plans.filter(p => !presentPlans.has(p.sellingPlanGroupId))) {
      const changed = await tx.subscriptionPlan.updateMany({ where: { id: plan.id, shop, sellingPlanGroupId: plan.sellingPlanGroupId }, data: { status: "DRAFT", sellingPlanGroupId: null } });
      if (changed.count) await tx.deliveryOption.updateMany({ where: { subscriptionPlanId: plan.id }, data: { sellingPlanId: null } });
    }
  });
}
