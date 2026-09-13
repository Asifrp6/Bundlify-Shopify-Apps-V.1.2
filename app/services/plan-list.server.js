const PLAN_FIELDS = `
  id name description options
  billingPolicy { ... on SellingPlanRecurringBillingPolicy { interval intervalCount } }
  deliveryPolicy { ... on SellingPlanRecurringDeliveryPolicy { interval intervalCount } }
  pricingPolicies {
    ... on SellingPlanFixedPricingPolicy {
      adjustmentType
      adjustmentValue {
        ... on SellingPlanPricingPolicyPercentageValue { percentage }
        ... on MoneyV2 { amount currencyCode }
      }
    }
  }
`;
export const PRODUCT_PLANS_QUERY = `#graphql
  query BundlifyProductPlans($productId: ID!, $after: String) {
    product(id: $productId) {
      id title
      sellingPlanGroups(first: 20, after: $after) {
        nodes { id name sellingPlans(first: 50) {
          nodes { ${PLAN_FIELDS} } pageInfo { hasNextPage endCursor }
        } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;
export const GROUP_PLANS_QUERY = `#graphql
  query BundlifyGroupPlans($id: ID!, $after: String) {
    sellingPlanGroup(id: $id) {
      sellingPlans(first: 50, after: $after) {
        nodes { ${PLAN_FIELDS} } pageInfo { hasNextPage endCursor }
      }
    }
  }
`;
function nextCursor(connection, seen) {
  if (!Array.isArray(connection?.nodes) || !connection.pageInfo)
    throw new Error("Invalid selling plan response.");
  if (!connection.pageInfo.hasNextPage) return null;
  const next = connection.pageInfo.endCursor;
  if (!next || seen.has(next))
    throw new Error("Invalid selling plan pagination.");
  seen.add(next);
  return next;
}
async function query(admin, document, variables) {
  const result = await (await admin.graphql(document, { variables })).json();
  if (result.errors?.length || !result.data)
    throw new Error("Unable to load selling plans from Shopify.");
  return result.data;
}
export function formatPlan(plan, group) {
  const billing = plan.billingPolicy || {};
  const delivery = plan.deliveryPolicy || {};
  const policy = plan.pricingPolicies?.find((item) => item.adjustmentType);
  const value = policy?.adjustmentValue;
  const type = policy?.adjustmentType;
  return {
    id: plan.id,
    sellingPlanId: plan.id,
    groupId: group.id,
    groupName: group.name,
    name: plan.name,
    description: plan.description || "",
    options: plan.options || [],
    interval: delivery.interval || billing.interval || null,
    intervalCount: delivery.intervalCount || billing.intervalCount || 1,
    billingInterval: billing.interval || null,
    billingIntervalCount: billing.intervalCount || 1,
    deliveryInterval: delivery.interval || null,
    deliveryIntervalCount: delivery.intervalCount || 1,
    discountType:
      {
        PERCENTAGE: "percentage",
        FIXED_AMOUNT: "fixed_amount",
        PRICE: "fixed_price",
      }[type] || null,
    discountValue:
      type === "PERCENTAGE"
        ? (value?.percentage ?? null)
        : type === "FIXED_AMOUNT"
          ? (value?.amount ?? null)
          : null,
    fixedPrice: type === "PRICE" ? (value?.amount ?? null) : null,
    currencyCode: value?.currencyCode || null,
  };
}
export async function listProductPlans(admin, productId) {
  const plans = [],
    seen = new Set();
  let after = null,
    product;
  do {
    ({ product } = await query(admin, PRODUCT_PLANS_QUERY, {
      productId,
      after,
    }));
    if (!product) return null;
    const groups = product.sellingPlanGroups;
    after = nextCursor(groups, seen);
    for (const group of groups.nodes) {
      let connection = group.sellingPlans;
      const planCursors = new Set();
      let next;
      do {
        next = nextCursor(connection, planCursors);
        plans.push(...connection.nodes.map((plan) => formatPlan(plan, group)));
        if (!next) break;
        const result = await query(admin, GROUP_PLANS_QUERY, {
          id: group.id,
          after: next,
        });
        connection = result.sellingPlanGroup?.sellingPlans;
      } while (next);
    }
  } while (after);
  return { product: { id: product.id, title: product.title }, plans };
}
