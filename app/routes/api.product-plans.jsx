import { schedules } from "../services/delivery-options";
import { creationBlocked } from "../services/app-plans";
import { createSubscription } from "../services/subscriptions.server";
import { changeSubscription } from "../services/subscription-management.server";
import { removePlanProducts } from "../services/sellingPlan.server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PRODUCT = `#graphql
query BundlifyPlanProduct($id: ID!) {
  product(id: $id) {
    id
    title
    featuredImage { url }
    variants(first: 100) { nodes { id title } }
  }
}`;

function ownedIds(value) {
  try {
    const ids = JSON.parse(value || "[]");
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "The plan details could not be read." }, { status: 400 }); }
  const productId = body.productId;
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId || ""))
    return Response.json({ error: "Open this from a product page." }, { status: 400 });
  const productResponse = await admin.graphql(PRODUCT, { variables: { id: productId } });
  const productResult = await productResponse.json();
  const product = productResult.data?.product;
  if (productResult.errors?.length || product?.id !== productId)
    return Response.json({ error: "This product could not be loaded." }, { status: 404 });
  const allowed = new Set(product.variants.nodes.map(variant => variant.id));
  const variantIds = Array.isArray(body.variantIds) ? body.variantIds.filter(id => allowed.has(id)) : [];
  if (body.intent === "list") {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      include: { deliveryOptions: true },
    });
    return {
      variants: product.variants.nodes,
      plans: plans.filter(plan => plan.productId === productId || ownedIds(plan.productIdsJson).includes(productId)).map(plan => ({
        id: plan.id,
        name: plan.name,
        status: plan.status,
        frequency: plan.frequency,
        discount: plan.discount,
      })),
    };
  }
  const planId = Number(body.planId);
  const plan = Number.isInteger(planId)
    ? await prisma.subscriptionPlan.findFirst({ where: { id: planId, shop: session.shop }, include: { deliveryOptions: true } })
    : null;
  if (body.intent === "remove") {
    if (!plan?.sellingPlanGroupId) return Response.json({ error: "This plan is not active in Shopify." }, { status: 404 });
    const ids = ownedIds(plan.productIdsJson);
    const includes = plan.productId === productId || ids.includes(productId);
    if (!includes) return Response.json({ error: "This product is not on that plan." }, { status: 404 });
    const remaining = ids.filter(id => id !== productId);
    try {
      if (!remaining.length || (plan.productId === productId && ids.length <= 1)) {
        await changeSubscription({ prisma, admin, plan, values: plan, remove: true });
        return { ok: true };
      }
      await removePlanProducts(admin, plan.sellingPlanGroupId, [productId]);
      await prisma.subscriptionPlan.update({
        where: { id: plan.id },
        data: { productIdsJson: JSON.stringify(remaining), productId: remaining[0] },
      });
    } catch (error) {
      return Response.json({ error: error.publicMessage || error.message }, { status: 502 });
    }
    return { ok: true };
  }
  const frequency = body.frequency;
  const discount = Number(body.discount);
  if (!Object.hasOwn(schedules, frequency) || !Number.isInteger(discount) || discount < 0 || discount > 100)
    return Response.json({ error: "Choose a delivery frequency and a discount from 0 to 100%." }, { status: 400 });
  if (body.intent === "update") {
    if (!plan) return Response.json({ error: "Plan not found." }, { status: 404 });
    try {
      await changeSubscription({
        prisma, admin, plan,
        values: { name: plan.name, frequency, discount, discountType: "percentage", deliveryOptions: [{ frequency, discount, discountType: "percentage" }] },
      });
    } catch (error) {
      return Response.json({ error: error.publicMessage || error.message }, { status: 502 });
    }
    return { ok: true };
  }
  const usage = await (await import("../services/app-billing.server")).shopUsage(session.shop);
  const blocked = creationBlocked(usage, "plan", usage?.plans ?? 0);
  if (!usage) return Response.json({ error: "Choose a Bundlify plan before creating a subscription." }, { status: 402 });
  if (blocked) return Response.json({ error: blocked }, { status: 402 });
  const name = String(body.name || "").trim();
  if (!name || name.length > 80) return Response.json({ error: "Enter a plan name of 80 characters or fewer." }, { status: 400 });
  try {
    await createSubscription({
      prisma, admin, shop: session.shop, product,
      values: {
        name, frequency, discount, discountType: "percentage", status: "ACTIVE",
        productId, productIds: [productId], productVariantIds: variantIds,
      },
    });
  } catch (error) {
    return Response.json({ error: error.publicMessage || error.message }, { status: 502 });
  }
  return { ok: true };
}
