import { validDiscount } from "./discounts.js";
export const schedules = {
  Daily: { interval: "DAY", intervalCount: 1 },
  Weekly: { interval: "WEEK", intervalCount: 1 },
  "Every 2 weeks": { interval: "WEEK", intervalCount: 2 },
  Monthly: { interval: "MONTH", intervalCount: 1 },
  "Every 2 months": { interval: "MONTH", intervalCount: 2 },
  "Every 3 months": { interval: "MONTH", intervalCount: 3 },
  Yearly: { interval: "YEAR", intervalCount: 1 },
};
export function planOptions(plan) {
  return plan.deliveryOptions?.length ? plan.deliveryOptions : [{ frequency: plan.frequency, discount: plan.discount, discountType: plan.discountType || "percentage", ...schedules[plan.frequency] }];
}
export function sellingPlanInput(name, option) {
  const schedule = Object.hasOwn(schedules, option.frequency) ? schedules[option.frequency] : null;
  if (!schedule || !validDiscount(option.discount, option.discountType || "percentage"))
    throw new Error("Invalid delivery option.");
  return {
    name: `${name} — ${option.frequency.toLowerCase()} delivery`,
    options: [option.frequency], category: "SUBSCRIPTION",
    billingPolicy: { recurring: schedule }, deliveryPolicy: { recurring: schedule },
    pricingPolicies: [{ fixed: { adjustmentType: option.discountType === "fixed" ? "FIXED_AMOUNT" : "PERCENTAGE", adjustmentValue: option.discountType === "fixed" ? { fixedValue: String(option.discount) } : { percentage: option.discount } } }],
  };
}
export function optionRecords(options, group) {
  return options.map(option => ({
    frequency: option.frequency, discount: option.discount, discountType: option.discountType || "percentage", ...schedules[option.frequency],
    sellingPlanId: group?.sellingPlans?.nodes?.find(p => p.options?.[0] === option.frequency)?.id || null,
  }));
}
