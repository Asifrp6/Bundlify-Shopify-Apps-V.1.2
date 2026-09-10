import { useLoaderData } from "react-router";
import {
  BlockStack,
  Button,
  Card,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const [bundles, subscriptions, activeSubscriptions] = await Promise.all([
    prisma.bundle.count({ where: { shop: session.shop } }),
    prisma.subscriptionPlan.count({ where: { shop: session.shop } }),
    prisma.subscriptionPlan.count({
      where: {
        shop: session.shop,
        status: "ACTIVE",
        sellingPlanGroupId: { not: null },
      },
    }),
  ]);
  return { bundles, subscriptions, activeSubscriptions };
}

export default function Dashboard() {
  const counts = useLoaderData();
  return (
    <Page title="Bundlify dashboard">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              Manage bundles and subscriptions
            </Text>
            <Text as="p">
              Create recurring product plans and organize your next bundle
              offer.
            </Text>
            <InlineStack gap="300">
              <Button variant="primary" url="/app/subscriptions/new">
                Create subscription
              </Button>
              <Button url="/app/bundles/new">Create bundle draft</Button>
            </InlineStack>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Your store
            </Text>
            <Text as="p">Bundle drafts: {counts.bundles}</Text>
            <Text as="p">Subscription plans: {counts.subscriptions}</Text>
            <Text as="p">
              Active subscription plans: {counts.activeSubscriptions}
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
