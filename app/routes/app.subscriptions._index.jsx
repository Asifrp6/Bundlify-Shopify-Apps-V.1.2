import { useLoaderData, useSearchParams } from "react-router";
import {
  Badge,
  Button,
  Banner,
  BlockStack,
  Card,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { reportRouteFailure } from "../services/route-diagnostics.server";

export async function loader({ request }) {
  let session;
  try {
    ({ session } = await authenticate.admin(request));
  } catch (error) {
    reportRouteFailure(error, "subscription-list authentication");
    throw error;
  }
  try {
    return {
      subscriptions: await prisma.subscriptionPlan.findMany({
        where: { shop: session.shop },
        orderBy: { createdAt: "desc" },
        include: { deliveryOptions: true },
      }),
    };
  } catch (error) {
    reportRouteFailure(error, "subscription-list database");
    throw error;
  }
}

export default function Subscriptions() {
  const { subscriptions } = useLoaderData();
  const [params] = useSearchParams();
  const active = subscriptions.filter(
    (plan) => plan.status === "ACTIVE" && plan.sellingPlanGroupId,
  );
  return (
    <Page
      title="Subscription plans"
      primaryAction={{
        content: "Create subscription",
        url: "/app/subscriptions/new",
      }}
    >
      <BlockStack gap="400">
        {params.get("updated") === "1" && <Banner tone="success">Subscription plan updated.</Banner>}
        {params.get("deleted") === "1" && <Banner tone="success">Subscription plan deleted.</Banner>}
        {params.get("created") === "1" && (
          <Banner tone="success">Subscription plan created in Shopify.</Banner>
        )}
        <Card>
          <Text as="p">
            {subscriptions.length} total plans · {active.length} active plans
          </Text>
        </Card>
        {!subscriptions.length && (
          <Card>
            <Text as="p">
              Create your first recurring purchase plan for a product.
            </Text>
          </Card>
        )}
        {subscriptions.map((plan) => (
          <Card key={plan.id}>
            <BlockStack gap="200">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  {plan.name}
                </Text>
                <InlineStack gap="200" blockAlign="center">
                <Badge
                  tone={
                    plan.status === "ACTIVE" && plan.sellingPlanGroupId
                      ? "success"
                      : "attention"
                  }
                >
                  {plan.status === "ACTIVE" && plan.sellingPlanGroupId
                    ? "Active"
                    : plan.status === "PENDING"
                      ? "Needs review"
                      : "Draft"}
                </Badge>
                <Button variant="primary" url={`/app/subscriptions/${plan.id}`}>Edit</Button>
                <Button tone="critical" url={`/app/subscriptions/${plan.id}#delete-plan`}>Delete</Button>
                </InlineStack>
              </InlineStack>
              <Text as="p">{plan.productTitle || plan.productId}</Text>
              <Text as="p">
                {plan.deliveryOptions.length ? plan.deliveryOptions.map(o => o.frequency + " / " + o.discount + "% off").join(" � ") : plan.frequency + " / " + plan.discount + "% off"}
              </Text>
              {!plan.sellingPlanGroupId && (
                <Text as="p" tone="subdued">
                  {plan.status === "PENDING"
                    ? "Creation was interrupted. Check selling plans in Shopify before creating another plan."
                    : "This plan is saved locally and is not active in Shopify."}
                </Text>
              )}
            </BlockStack>
          </Card>
        ))}
      </BlockStack>
    </Page>
  );
}
