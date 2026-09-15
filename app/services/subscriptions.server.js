import { planOptions, optionRecords } from "./delivery-options.js";
import { createSellingPlan, deleteSellingPlan } from "./sellingPlan.server.js";

export async function createSubscription({
  prisma,
  admin,
  shop,
  values,
  product,
}) {
  const baseValues = { name: values.name, frequency: values.frequency, discount: values.discount, productId: values.productId };
  const options = planOptions(values);
  const plan = await prisma.subscriptionPlan.create({
    data: {
      shop,
      ...baseValues,
      deliveryOptions: { create: optionRecords(options) },
      productTitle: product.title,
      productImage: product.featuredImage?.url ?? null,
      status: values.status === "DRAFT" ? "DRAFT" : "PENDING",
    },
  });
  if (values.status === "DRAFT") return plan;
  let group;
  try {
    group = await createSellingPlan(admin, {
      ...values,
      merchantCode: `bundlify-${plan.id}`,
    });
  } catch (error) {
    if (error.sellingPlanGroupId) {
      await prisma.subscriptionPlan.update({
        where: { id: plan.id },
        data: { sellingPlanGroupId: error.sellingPlanGroupId, status: "PENDING" },
      }).catch(() => {});
    }
    if (error.rejected) {
      await prisma.subscriptionPlan.deleteMany({
        where: { id: plan.id, shop },
      });
    }
    throw error;
  }
  try {
    return await prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: { sellingPlanGroupId: group.id, status: "ACTIVE", deliveryOptions: { deleteMany: {}, create: optionRecords(options, group) } },
    });
  } catch {
    try {
      await deleteSellingPlan(admin, group.id);
    } catch {
      await prisma.subscriptionPlan
        .update({
          where: { id: plan.id },
          data: { sellingPlanGroupId: group.id, status: "PENDING" },
        })
        .catch(() => {});
      const error = new Error("Could not finalize subscription.");
      error.publicMessage = `Shopify created plan ${group.id}, but saving its status failed. Check this plan in Shopify before creating another.`;
      throw error;
    }
    await prisma.subscriptionPlan.deleteMany({ where: { id: plan.id, shop } });
    const error = new Error("Could not save subscription.");
    error.publicMessage =
      "The plan could not be saved. The Shopify change was rolled back; you can try again.";
    throw error;
  }
}
