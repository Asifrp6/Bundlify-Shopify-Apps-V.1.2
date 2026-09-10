import { deleteSellingPlan } from "./sellingPlan.server.js";
import { planOptions, sellingPlanInput, optionRecords } from "./delivery-options.js";
export const PLAN_QUERY = `#graphql
query BundlifyPlan($id: ID!) {
  sellingPlanGroup(id: $id) { id sellingPlans(first: 100) { nodes { id options } pageInfo { hasNextPage } } }
}`;
export const UPDATE_PLAN = `#graphql
mutation BundlifyUpdate($id: ID!, $input: SellingPlanGroupInput!) {
  sellingPlanGroupUpdate(id: $id, input: $input) {
    sellingPlanGroup { id sellingPlans(first: 100) { nodes { id options } } }
    userErrors { field message }
  }
}`;
export async function changeSubscription({ prisma, admin, plan, values, remove = false }) {
  if (plan.status === "PENDING" && !plan.sellingPlanGroupId)
    throw new Error("Review the interrupted creation in Shopify before changing this plan.");
  let updatedGroup;
  const options = remove ? [] : planOptions(values);
  if (plan.sellingPlanGroupId) {
    const response = await admin.graphql(PLAN_QUERY, { variables: { id: plan.sellingPlanGroupId } });
    const result = await response.json();
    if (result.errors?.length || !result.data) throw new Error("Unable to verify the Shopify plan. Please retry.");
    const group = result.data.sellingPlanGroup;
    if (remove) {
      if (group) await deleteSellingPlan(admin, group.id);
    } else {
      if (!group || group.sellingPlans.pageInfo?.hasNextPage)
        throw new Error("This group cannot be edited here. Review its selling plans in Shopify.");
      const remote = group.sellingPlans.nodes;
      const used = new Set();
      const updates = [], creates = [];
      for (const option of options) {
        // Match the live frequency first so retrying after a local save failure is safe.
        const existing = remote.find(p => p.options?.[0] === option.frequency);
        const input = sellingPlanInput(values.name, option);
        if (existing) { used.add(existing.id); updates.push({ ...input, id: existing.id }); }
        else creates.push(input);
      }
      const update = await admin.graphql(UPDATE_PLAN, { variables: {
        id: group.id,
        input: { name: values.name, sellingPlansToUpdate: updates, sellingPlansToCreate: creates,
          sellingPlansToDelete: remote.filter(p => !used.has(p.id)).map(p => p.id) },
      } });
      const body = await update.json();
      const payload = body.data?.sellingPlanGroupUpdate;
      if (body.errors?.length || !payload) throw new Error("Shopify could not confirm the update. Review the plan before retrying.");
      if (payload.userErrors?.length) throw new Error(payload.userErrors.map(e => e.message).join(" "));
      if (payload.sellingPlanGroup?.id !== group.id) throw new Error("Shopify did not confirm the update.");
      updatedGroup = payload.sellingPlanGroup;
    }
  }
  try {
    if (remove) return await prisma.subscriptionPlan.deleteMany({ where: { id: plan.id, shop: plan.shop } });
    return await prisma.subscriptionPlan.update({
      where: { id: plan.id, shop: plan.shop },
      data: { name: values.name, frequency: options[0].frequency, discount: options[0].discount,
        deliveryOptions: { deleteMany: {}, create: optionRecords(options, updatedGroup) } },
    });
  } catch {
    throw new Error("Shopify was updated, but the local save failed. Retry this same operation to synchronize the record.");
  }
}
