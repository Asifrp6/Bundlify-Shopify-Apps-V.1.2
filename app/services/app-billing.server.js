import prisma from "../db.server";
import { ADMIN_APP_HANDLE, hostedPlanSelectionUrl } from "./billing-return.js";
import { APP_NAME, limitsFor, planByHandle, planFromSubscription, plans } from "./app-plans.js";

export const CURRENT_SUBSCRIPTIONS = `#graphql
  query CurrentAppSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        lineItems {
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing {
                price { amount currencyCode }
              }
            }
          }
        }
      }
    }
  }`;

export const CANCEL_SUBSCRIPTION = `#graphql
  mutation AppSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      userErrors { field message }
      appSubscription { id status }
    }
  }`;

async function shopify(admin, document, variables, failure = "Shopify could not update the app plan.") {
  const result = await (await admin.graphql(document, { variables })).json();
  if (result.errors?.length) throw new Error(failure);
  return result.data;
}

export async function syncShopPlan(admin, shop) {
  const [data, local] = await Promise.all([
    shopify(admin, CURRENT_SUBSCRIPTIONS),
    prisma.shopPlan.findUnique({ where: { shop } }),
  ]);
  const active = data?.currentAppInstallation?.activeSubscriptions || [];
  const match = active.map((subscription) => ({ subscription, plan: planFromSubscription(subscription) })).find((item) => item.plan);
  if (match) {
    const current = local?.status === "active" && local.handle === match.plan.handle && local.subscriptionId === match.subscription.id;
    if (!current) {
      await prisma.shopPlan.upsert({
        where: { shop },
        create: { shop, handle: match.plan.handle, subscriptionId: match.subscription.id, status: "active" },
        update: { handle: match.plan.handle, subscriptionId: match.subscription.id, status: "active" },
      });
    }
    return match.plan.handle;
  }
  if (local?.status === "active" && local.handle !== "free" && local.subscriptionId) {
    await prisma.shopPlan.update({ where: { shop }, data: { status: "inactive", subscriptionId: null } });
    return null;
  }
  return local?.status === "active" ? local.handle : null;
}

export async function chooseShopPlan({ admin, shop, handle }) {
  const plan = planByHandle(handle);
  if (!plan) throw new Error(`Choose a ${APP_NAME} plan.`);
  const local = await prisma.shopPlan.findUnique({ where: { shop } });
  if (plan.price === 0) {
    if (local?.subscriptionId && local.status === "active" && local.handle !== "free") {
      const cancelled = await shopify(admin, CANCEL_SUBSCRIPTION, { id: local.subscriptionId });
      const payload = cancelled?.appSubscriptionCancel;
      if (payload?.userErrors?.length || !payload?.appSubscription?.id) {
        throw new Error(payload?.userErrors?.map((error) => error.message).filter(Boolean).join(" ") || "Shopify could not cancel the current plan.");
      }
    }
    await prisma.shopPlan.upsert({
      where: { shop },
      create: { shop, handle: "free", subscriptionId: null, status: "active" },
      update: { handle: "free", subscriptionId: null, status: "active" },
    });
    return { handle: "free" };
  }
  // Shopify App Pricing rejects appSubscriptionCreate. Open the hosted plan page instead.
  return { pricingUrl: hostedPlanSelectionUrl({ shop, appHandle: ADMIN_APP_HANDLE }) };
}

export async function activeSubscriptionId(shop) {
  const local = await prisma.shopPlan.findUnique({ where: { shop } });
  return local?.status === "active" ? local.subscriptionId : null;
}

export async function shopLimits(shop) {
  const local = await prisma.shopPlan.findUnique({ where: { shop } });
  if (local?.status !== "active") return null;
  return limitsFor(local.handle);
}

export async function shopUsage(shop) {
  const limits = await shopLimits(shop);
  if (!limits) return null;
  const [bundles, plans] = await Promise.all([
    prisma.bundle.count({ where: { shop } }),
    prisma.subscriptionPlan.count({ where: { shop } }),
  ]);
  return { ...limits, bundles, plans };
}

export { plans };
