export const TECHNICAL_PRODUCT_CAP = 50;

export const plans = [
  {
    handle: "free",
    name: "Free",
    tagline: "Perfect for getting started",
    price: 0,
    maxBundles: 2,
    maxPlans: 2,
    maxProducts: 3,
    maxOptions: 2,
    features: ["2 bundles", "3 products per bundle", "2 subscription options"],
    tone: "free",
  },
  {
    handle: "starter",
    name: "Starter",
    tagline: "Great for growing stores",
    price: 8,
    maxBundles: 7,
    maxPlans: 3,
    maxProducts: 7,
    maxOptions: 3,
    features: ["7 bundles", "7 products per bundle", "3 subscription options"],
    tone: "starter",
  },
  {
    handle: "growth",
    name: "Growth",
    tagline: "Ideal for scaling businesses",
    price: 14,
    maxBundles: 15,
    maxPlans: 7,
    maxProducts: 15,
    maxOptions: 7,
    popular: true,
    features: ["15 bundles", "15 products per bundle", "7 subscription options"],
    tone: "growth",
  },
  {
    handle: "unlimited",
    name: "Unlimited",
    tagline: "For high-volume stores",
    price: 22,
    maxBundles: null,
    maxPlans: null,
    maxProducts: TECHNICAL_PRODUCT_CAP,
    maxOptions: 7,
    features: ["Unlimited bundles", "Unlimited subscriptions"],
    tone: "unlimited",
  },
];

export function planByHandle(handle) {
  return plans.find((plan) => plan.handle === handle) || null;
}

export function planFromSubscriptionName(name) {
  return plans.find((plan) => name === `Bundlify ${plan.name}` && plan.price > 0) || null;
}

export function limitsFor(handle) {
  const plan = planByHandle(handle) || plans[0];
  return {
    maxBundles: plan.maxBundles,
    maxPlans: plan.maxPlans,
    maxProducts: plan.maxProducts,
    maxOptions: plan.maxOptions,
    handle: plan.handle,
    name: plan.name,
  };
}

export function creationBlocked(limits, kind, count) {
  const max = kind === "bundle" ? limits?.maxBundles : limits?.maxPlans;
  if (max == null || count < max) return null;
  const label = kind === "bundle" ? (max === 1 ? "bundle" : "bundles") : (max === 1 ? "subscription plan" : "subscription plans");
  return `The ${limits.name} plan includes ${max} ${label}. Upgrade to add another.`;
}
