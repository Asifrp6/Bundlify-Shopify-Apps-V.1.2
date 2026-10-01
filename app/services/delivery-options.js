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
export const frequencyUnits = [
  { interval: "DAY", label: "Days", singular: "day", adverb: "Daily", max: 30 },
  { interval: "WEEK", label: "Week", singular: "week", adverb: "Weekly", max: 12 },
  { interval: "MONTH", label: "Month", singular: "month", adverb: "Monthly", max: 12 },
];
export function frequencyLabel(interval, intervalCount) {
  const unit = frequencyUnits.find(u => u.interval === interval);
  const count = Number(intervalCount);
  if (!unit || !Number.isInteger(count) || count < 1 || count > unit.max) return null;
  return count === 1 ? unit.adverb : `Every ${count} ${unit.singular}s`;
}
export function scheduleFor(frequency) {
  if (typeof frequency !== "string") return null;
  if (Object.hasOwn(schedules, frequency)) return schedules[frequency];
  const unit = frequencyUnits.find(u => u.adverb === frequency);
  if (unit) return { interval: unit.interval, intervalCount: 1 };
  const match = /^Every (\d+) (day|week|month)s$/.exec(frequency);
  if (!match) return null;
  const { interval } = frequencyUnits.find(u => u.singular === match[2]);
  const intervalCount = Number(match[1]);
  return frequencyLabel(interval, intervalCount) === frequency ? { interval, intervalCount } : null;
}
export function frequencyParts(frequency) {
  const schedule = scheduleFor(frequency);
  if (schedule?.interval === "YEAR") return { interval: "MONTH", intervalCount: 12 };
  return schedule && frequencyUnits.some(u => u.interval === schedule.interval) ? schedule : { interval: "MONTH", intervalCount: 1 };
}
export function nextFrequency(options) {
  for (const unit of [frequencyUnits[2], frequencyUnits[1], frequencyUnits[0]])
    for (let count = 1; count <= unit.max; count++) {
      const label = frequencyLabel(unit.interval, count);
      if (!options.some(o => o.frequency === label)) return label;
    }
  return "Monthly";
}
export function planOptions(plan) {
  return plan.deliveryOptions?.length ? plan.deliveryOptions : [{ frequency: plan.frequency, discount: plan.discount, discountType: plan.discountType || "percentage", ...scheduleFor(plan.frequency) }];
}
export const FREQUENCY_OPTION = "Delivery frequency";
export const LENGTH_OPTION = "Subscription length";
// Shopify caps a selling plan group at 31 plans; 7 frequencies x 4 lengths stays below it.
export const MAX_LENGTH_OPTIONS = 4;
export const MAX_GROUP_PLANS = 31;
export const UNLIMITED = "UNLIMITED";
const unitDays = { DAY: 1, WEEK: 7, MONTH: 365.25 / 12, YEAR: 365.25 };
export function normalizeLength(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.interval === UNLIMITED) return { interval: UNLIMITED };
  const unit = frequencyUnits.find(u => u.interval === raw.interval);
  const count = Number(raw.intervalCount);
  if (!unit || typeof raw.intervalCount === "boolean" || !Number.isInteger(count) || count < 1 || count > unit.max) return null;
  return { interval: unit.interval, intervalCount: count };
}
export function lengthLabel(length) {
  if (length?.interval === UNLIMITED) return "Unlimited";
  const unit = frequencyUnits.find(u => u.interval === length?.interval);
  if (!unit) return null;
  return `${length.intervalCount} ${length.intervalCount === 1 ? unit.singular : unit.singular + "s"}`;
}
export function parseLengths(json) {
  try {
    const raw = JSON.parse(json || "[]");
    return Array.isArray(raw) ? raw.map(normalizeLength).filter(Boolean) : [];
  } catch {
    return [];
  }
}
/**
 * One ongoing "Unlimited" plan per frequency when the storefront length popup is on, or [] when hidden.
 * Customers type how many times on the storefront; the count travels as a cart line property.
 */
export function planLengths(plan) {
  return plan?.lengthEnabled ? [{ interval: UNLIMITED }] : [];
}
export function nextLength(lengths) {
  const taken = new Set(lengths.map(lengthLabel));
  if (!taken.has("Unlimited")) return { interval: UNLIMITED };
  for (const unit of [frequencyUnits[2], frequencyUnits[1], frequencyUnits[0]])
    for (let count = 1; count <= unit.max; count++)
      if (!taken.has(lengthLabel({ interval: unit.interval, intervalCount: count }))) return { interval: unit.interval, intervalCount: count };
  return { interval: UNLIMITED };
}
/** Prisma columns for a validated form, or {} when the form did not carry length settings. */
export function lengthRecord(values) {
  if (typeof values?.lengthEnabled !== "boolean") return {};
  return { lengthEnabled: values.lengthEnabled, lengthOptionsJson: JSON.stringify((values.lengthOptions || []).map(normalizeLength).filter(Boolean)) };
}
/** Whole billing cycles covering the length, or null when the subscription never ends. */
export function lengthCycles(length, schedule) {
  if (!length || length.interval === UNLIMITED) return null;
  const ratio = (unitDays[length.interval] * length.intervalCount) / (unitDays[schedule.interval] * schedule.intervalCount);
  return Math.max(1, Math.round(ratio));
}
// 10% tolerance so e.g. 28–30 days still covers one calendar month of monthly delivery.
export function lengthFitsSchedule(length, schedule) {
  if (length.interval === UNLIMITED) return true;
  return unitDays[length.interval] * length.intervalCount >= 0.9 * unitDays[schedule.interval] * schedule.intervalCount;
}
export function groupOptionNames(lengths) {
  return lengths.length ? [FREQUENCY_OPTION, LENGTH_OPTION] : [FREQUENCY_OPTION];
}
/** Every selling plan the group needs: one per frequency, or per frequency and length. */
export function planCombinations(options, lengths) {
  return options.flatMap(option => lengths.length ? lengths.map(length => ({ option, length })) : [{ option, length: null }]);
}
export function sellingPlanInput(name, option, length = null) {
  const schedule = scheduleFor(option.frequency);
  if (!schedule || !validDiscount(option.discount, option.discountType || "percentage"))
    throw new Error("Invalid delivery option.");
  const label = length && lengthLabel(length);
  if (length && !label) throw new Error("Invalid subscription length.");
  const cycles = lengthCycles(length, schedule);
  // The ongoing plan carries the storefront popup's count on the cart line ("3 times"), so its name must not
  // claim "unlimited" beside it in the cart and at checkout.
  const nameLabel = length?.interval === UNLIMITED ? "" : label;
  return {
    name: `${name} — ${option.frequency.toLowerCase()} delivery${nameLabel ? `, ${nameLabel.toLowerCase()}` : ""}`,
    options: label ? [option.frequency, label] : [option.frequency], category: "SUBSCRIPTION",
    billingPolicy: { recurring: cycles ? { ...schedule, minCycles: cycles, maxCycles: cycles } : schedule }, deliveryPolicy: { recurring: schedule },
    pricingPolicies: [{ fixed: { adjustmentType: option.discountType === "fixed" ? "FIXED_AMOUNT" : "PERCENTAGE", adjustmentValue: option.discountType === "fixed" ? { fixedValue: String(option.discount) } : { percentage: option.discount } } }],
  };
}
export function optionRecords(options, group) {
  return options.map(option => ({
    frequency: option.frequency, discount: option.discount, discountType: option.discountType || "percentage", ...scheduleFor(option.frequency),
    sellingPlanId: group?.sellingPlans?.nodes?.find(p => p.options?.[0] === option.frequency)?.id || null,
  }));
}
