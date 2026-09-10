export const schedules = {
  Daily: { interval: "DAY", intervalCount: 1 },
  Weekly: { interval: "WEEK", intervalCount: 1 },
  "Every 2 weeks": { interval: "WEEK", intervalCount: 2 },
  Monthly: { interval: "MONTH", intervalCount: 1 },
  Yearly: { interval: "YEAR", intervalCount: 1 },
};
export function planOptions(plan) {
  return plan.deliveryOptions?.length ? plan.deliveryOptions : [{ frequency: plan.frequency, discount: plan.discount, ...schedules[plan.frequency] }];
}
export function sellingPlanInput(name, option) {
  const schedule = schedules[option.frequency];
  if (!schedule || !Number.isInteger(option.discount) || option.discount < 0 || option.discount > 100)
    throw new Error("Invalid delivery option.");
  return {
    name: `${name} — ${option.frequency.toLowerCase()} delivery`,
    options: [option.frequency], category: "SUBSCRIPTION",
    billingPolicy: { recurring: schedule }, deliveryPolicy: { recurring: schedule },
    pricingPolicies: [{ fixed: { adjustmentType: "PERCENTAGE", adjustmentValue: { percentage: option.discount } } }],
  };
}
export function optionRecords(options, group) {
  return options.map(option => ({
    frequency: option.frequency, discount: option.discount, ...schedules[option.frequency],
    sellingPlanId: group?.sellingPlans?.nodes?.find(p => p.options?.[0] === option.frequency)?.id || null,
  }));
}
