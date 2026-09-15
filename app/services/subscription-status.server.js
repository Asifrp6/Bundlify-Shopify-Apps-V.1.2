import { createSellingPlan, deleteSellingPlan } from "./sellingPlan.server.js";
import { planOptions, optionRecords } from "./delivery-options.js";
import { listProducts, getProducts } from "./products.server.js";

export async function setSubscriptionStatus({ prisma, admin, plan, status }) {
  if (!["DRAFT", "ACTIVE"].includes(status)) throw new Error("Invalid status.");
  if (plan.status === "PENDING") throw new Error("Review this interrupted operation before changing its status.");
  if (plan.status === status && (status === "DRAFT" || plan.sellingPlanGroupId)) return;
  let values;
  if (status === "ACTIVE") {
    const products = plan.productId === "ALL_PRODUCTS" ? await listProducts(admin) : await getProducts(admin, [plan.productId]);
    if (!products.length) throw new Error("The selected products are no longer available.");
    values = { ...plan, productIds: products.map(p => p.id), merchantCode: `bundlify-${plan.id}` };
  }
  const lock = await prisma.subscriptionPlan.updateMany({ where: { id: plan.id, shop: plan.shop, status: plan.status }, data: { status: "PENDING" } });
  if (!lock.count) throw new Error("This plan changed. Refresh before trying again.");
  let group;
  try {
    if (status === "DRAFT") {
      if (plan.sellingPlanGroupId) await deleteSellingPlan(admin, plan.sellingPlanGroupId);
    } else group = await createSellingPlan(admin, values);
  } catch (error) {
    if (error.sellingPlanGroupId) await prisma.subscriptionPlan.update({ where: { id: plan.id, shop: plan.shop }, data: { sellingPlanGroupId: error.sellingPlanGroupId } });
    if (error.rejected) await prisma.subscriptionPlan.update({ where: { id: plan.id, shop: plan.shop }, data: { status: plan.status } });
    throw new Error(error.publicMessage || "Shopify could not confirm the status change. Review this plan before retrying.");
  }
  // Save the remote ID before finalizing, so an interrupted write can be reviewed.
  if (group) await prisma.subscriptionPlan.update({ where: { id: plan.id, shop: plan.shop }, data: { sellingPlanGroupId: group.id } });
  await prisma.subscriptionPlan.update({ where: { id: plan.id, shop: plan.shop }, data: {
    status, sellingPlanGroupId: group?.id || null,
    deliveryOptions: { deleteMany: {}, create: optionRecords(planOptions(plan), group) },
  } });
}
