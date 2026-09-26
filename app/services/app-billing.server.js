import prisma from "../db.server";
import { limitsFor, planByHandle, planFromSubscriptionName, plans } from "./app-plans.js";

export const CURRENT_SUBSCRIPTIONS = `#graphql
  query CurrentAppSubscriptions {
    currentAppInstallation {
      activeSubscriptions { id name status }
    }
  }`;

export const CREATE_SUBSCRIPTION = `#graphql
  mutation AppSubscriptionCreate($name: String!, $returnUrl: URL!, $test: Boolean, $replacementBehavior: AppSubscriptionReplacementBehavior, $lineItems: [AppSubscriptionLineItemInput!]!) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, replacementBehavior: $replacementBehavior, lineItems: $lineItems) {
      userErrors { field message }
      confirmationUrl
      appSubscription { id status }
    }
  }`;

export const CANCEL_SUBSCRIPTION = `#graphql
  mutation AppSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      userErrors { field message }
      appSubscription { id status }
    }
  }`;

async function shopify(admin, document, variables) {
  const result = await (await admin.graphql(document, { variables })).json();
  if (result.errors?.length) throw new Error("Shopify could not update the app plan.");
  return result.data;
}

export async function syncShopPlan(admin, shop) {
  const data = await shopify(admin, CURRENT_SUBSCRIPTIONS);
  const active = data?.currentAppInstallation?.activeSubscriptions || [];
  const match = active.map((subscription) => ({ subscription, plan: planFromSubscriptionName(subscription.name) })).find((item) => item.plan);
  if (match) {
    await prisma.shopPlan.upsert({
      where: { shop },
      create: { shop, handle: match.plan.handle, subscriptionId: match.subscription.id, status: "active" },
      update: { handle: match.plan.handle, subscriptionId: match.subscription.id, status: "active" },
    });
    return match.plan.handle;
  }
  const local = await prisma.shopPlan.findUnique({ where: { shop } });
  if (local?.status === "active" && local.handle !== "free" && local.subscriptionId) {
    await prisma.shopPlan.update({ where: { shop }, data: { status: "inactive", subscriptionId: null } });
    return null;
  }
  return local?.status === "active" ? local.handle : null;
}

export async function chooseShopPlan({ admin, shop, handle, returnUrl, test }) {
  const plan = planByHandle(handle);
  if (!plan) throw new Error("Choose a Bundlify plan.");
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
  const created = await shopify(admin, CREATE_SUBSCRIPTION, {
    name: `Bundlify ${plan.name}`,
    returnUrl,
    test,
    replacementBehavior: "APPLY_IMMEDIATELY",
    lineItems: [{ plan: { appRecurringPricingDetails: { price: { amount: plan.price, currencyCode: "USD" }, interval: "EVERY_30_DAYS" } } }],
  });
  const payload = created?.appSubscriptionCreate;
  if (payload?.userErrors?.length || !payload?.confirmationUrl) {
    throw new Error(payload?.userErrors?.map((error) => error.message).filter(Boolean).join(" ") || "Shopify did not start the plan charge.");
  }
  return { confirmationUrl: payload.confirmationUrl };
}

export function billingTestMode() {
  return process.env.NODE_ENV !== "production";
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
