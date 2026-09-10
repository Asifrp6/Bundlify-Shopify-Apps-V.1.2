import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  try {
    const url = new URL(request.url);

    const productId = url.searchParams.get("productId");

    if (!productId) {
      return Response.json(
        {
          success: false,
          message: "Product ID is required",
          plans: [],
        },
        { status: 400 },
      );
    }

    /*
      If productId comes from Liquid like:
      {{ product.id }}

      it will normally be numeric.

      Shopify Admin GraphQL needs:
      gid://shopify/Product/123456
    */

    const gid = productId.startsWith("gid://")
      ? productId
      : `gid://shopify/Product/${productId}`;

    /*
      IMPORTANT:
      For normal authenticated admin requests:
      use authenticate.admin(request)

      If this route is being called through an App Proxy,
      use authenticate.public.appProxy(request)
    */

    let admin;

    try {
      const auth = await authenticate.public.appProxy(request);
      admin = auth.admin;
    } catch (error) {
      const auth = await authenticate.admin(request);
      admin = auth.admin;
    }

    if (!admin) {
      return Response.json(
        {
          success: false,
          message: "Unable to authenticate Shopify Admin API",
          plans: [],
        },
        { status: 401 },
      );
    }

    const response = await admin.graphql(
      `
        query GetProductSellingPlans($productId: ID!) {
          product(id: $productId) {
            id
            title

            sellingPlanGroups(first: 20) {
              nodes {
                id
                name

                sellingPlans(first: 50) {
                  nodes {
                    id
                    name
                    description

                    options {
                      name
                      value
                    }

                    billingPolicy {
                      ... on SellingPlanRecurringBillingPolicy {
                        interval
                        intervalCount
                      }
                    }

                    deliveryPolicy {
                      ... on SellingPlanRecurringDeliveryPolicy {
                        interval
                        intervalCount
                      }
                    }

                    priceAdjustments {
                      adjustmentValue {
                        ... on SellingPlanPercentagePriceAdjustment {
                          adjustmentPercentage
                        }

                        ... on SellingPlanFixedAmountPriceAdjustment {
                          adjustmentAmount {
                            amount
                            currencyCode
                          }
                        }

                        ... on SellingPlanFixedPriceAdjustment {
                          price {
                            amount
                            currencyCode
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      {
        variables: {
          productId: gid,
        },
      },
    );

    const result = await response.json();

    if (result.errors) {
      console.error("[Bundlify] Shopify GraphQL errors:", result.errors);

      return Response.json(
        {
          success: false,
          message: "Shopify GraphQL request failed",
          errors: result.errors,
          plans: [],
        },
        { status: 500 },
      );
    }

    const product = result.data?.product;

    if (!product) {
      return Response.json(
        {
          success: false,
          message: "Product not found",
          plans: [],
        },
        { status: 404 },
      );
    }

    const plans = [];

    for (const group of product.sellingPlanGroups?.nodes || []) {
      for (const plan of group.sellingPlans?.nodes || []) {
        const billingPolicy = plan.billingPolicy || {};
        const deliveryPolicy = plan.deliveryPolicy || {};

        const adjustment = plan.priceAdjustments?.[0]?.adjustmentValue;

        let discountType = null;
        let discountValue = null;
        let fixedPrice = null;
        let currencyCode = null;

        /*
          Percentage discount
        */

        if (adjustment && adjustment.adjustmentPercentage !== undefined) {
          discountType = "percentage";
          discountValue = adjustment.adjustmentPercentage;
        }

        /*
          Fixed amount discount
        */

        if (adjustment?.adjustmentAmount) {
          discountType = "fixed_amount";
          discountValue = adjustment.adjustmentAmount.amount;
          currencyCode = adjustment.adjustmentAmount.currencyCode;
        }

        /*
          Fixed subscription price
        */

        if (adjustment?.price) {
          discountType = "fixed_price";
          fixedPrice = adjustment.price.amount;
          currencyCode = adjustment.price.currencyCode;
        }

        plans.push({
          id: plan.id,

          sellingPlanId: plan.id,

          groupId: group.id,

          groupName: group.name,

          name: plan.name,

          description: plan.description || "",

          options: plan.options || [],

          interval: deliveryPolicy.interval || billingPolicy.interval || null,

          intervalCount:
            deliveryPolicy.intervalCount || billingPolicy.intervalCount || 1,

          billingInterval: billingPolicy.interval || null,

          billingIntervalCount: billingPolicy.intervalCount || 1,

          deliveryInterval: deliveryPolicy.interval || null,

          deliveryIntervalCount: deliveryPolicy.intervalCount || 1,

          discountType,

          discountValue,

          fixedPrice,

          currencyCode,
        });
      }
    }

    return Response.json({
      success: true,

      product: {
        id: product.id,
        title: product.title,
      },

      plans,
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[Bundlify] Subscription plans API error:", error);

    return Response.json(
      {
        success: false,
        message: error?.message || "Unable to load subscription plans",
        plans: [],
      },
      { status: 500 },
    );
  }
}
