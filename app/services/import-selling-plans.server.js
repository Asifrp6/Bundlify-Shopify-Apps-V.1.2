import { formatPlan } from "./plan-list.server.js";
import { scheduleFor } from "./delivery-options.js";

const OWNED_GROUPS = `#graphql
query BundlifyOwnedGroups($after: String) {
  sellingPlanGroups(first: 25, after: $after) {
    nodes {
      id
      name
      merchantCode
      products(first: 250) { nodes { id title } }
      sellingPlans(first: 30) {
        nodes {
          id
          name
          options
          pricingPolicies {
            ... on SellingPlanFixedPricingPolicy {
              adjustmentType
              adjustmentValue {
                ... on SellingPlanPricingPolicyPercentageValue { percentage }
                ... on MoneyV2 { amount }
              }
            }
          }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

export function recordFromGroup(group) {
  if (!group?.id || typeof group.merchantCode !== "string" || !group.merchantCode.startsWith("bundlify-")) return null;
  const options = [];
  let lengthEnabled = false;
  for (const plan of group.sellingPlans?.nodes || []) {
    const frequency = plan.options?.[0];
    const schedule = scheduleFor(frequency);
    const formatted = formatPlan(plan, group);
    const discount = Number(formatted.discountValue);
    if (!schedule || !Number.isFinite(discount)) continue;
    if (formatted.discountType !== "percentage" && formatted.discountType !== "fixed_amount") continue;
    if ((plan.options || []).includes("Unlimited")) lengthEnabled = true;
    if (options.some(option => option.frequency === frequency)) continue;
    options.push({
      frequency,
      discount,
      discountType: formatted.discountType === "fixed_amount" ? "fixed" : "percentage",
      interval: schedule.interval,
      intervalCount: schedule.intervalCount,
      sellingPlanId: plan.id,
    });
  }
  if (!options.length) return null;
  const products = (group.products?.nodes || []).filter(product => /^gid:\/\/shopify\/Product\/\d+$/.test(product.id || ""));
  const single = products.length === 1;
  return {
    name: group.name || options[0].frequency,
    productId: single ? products[0].id : "ALL_PRODUCTS",
    productIdsJson: JSON.stringify(products.map(product => product.id)),
    productTitle: single ? products[0].title || null : "All products",
    frequency: options[0].frequency,
    discount: options[0].discount,
    discountType: options[0].discountType,
    status: "ACTIVE",
    sellingPlanGroupId: group.id,
    lengthEnabled,
    lengthOptionsJson: lengthEnabled ? JSON.stringify([{ interval: "UNLIMITED" }]) : "[]",
    deliveryOptions: options,
  };
}

async function ownedGroups(admin) {
  const groups = [];
  const seen = new Set();
  let after = null;
  do {
    const result = await (await admin.graphql(OWNED_GROUPS, { variables: { after } })).json();
    if (result.errors?.length || !result.data?.sellingPlanGroups) throw new Error("Unable to load selling plans from Shopify.");
    const connection = result.data.sellingPlanGroups;
    groups.push(...(connection.nodes || []));
    if (!connection.pageInfo?.hasNextPage) return groups;
    after = connection.pageInfo.endCursor;
    if (!after || seen.has(after)) throw new Error("Invalid selling plan pagination.");
    seen.add(after);
  } while (groups.length < 100);
  return groups;
}

// The storefront reads Shopify selling plans. The subscriptions page reads local rows.
// A plan created on another copy of the app can exist in Shopify and be missing here.
export async function importMissingPlans({ prisma, admin, shop }) {
  const groups = await ownedGroups(admin);
  const known = new Set(
    (await prisma.subscriptionPlan.findMany({ where: { shop }, select: { sellingPlanGroupId: true } }))
      .map(plan => plan.sellingPlanGroupId)
      .filter(Boolean),
  );
  for (const group of groups) {
    const record = recordFromGroup(group);
    if (!record || known.has(record.sellingPlanGroupId)) continue;
    const { deliveryOptions, ...data } = record;
    await prisma.subscriptionPlan.create({
      data: { shop, ...data, deliveryOptions: { create: deliveryOptions } },
    });
    known.add(record.sellingPlanGroupId);
  }
}
