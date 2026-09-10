import { useLoaderData, useSearchParams } from "react-router";
import { Badge, Banner, BlockStack, Card, Page, Text } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  return {
    bundles: await prisma.bundle.findMany({
      where: { shop: session.shop },
      include: { products: true },
      orderBy: { createdAt: "desc" },
    }),
  };
}

export default function Bundles() {
  const { bundles } = useLoaderData();
  const [params] = useSearchParams();
  return (
    <Page
      title="Bundle drafts"
      primaryAction={{
        content: "Create bundle draft",
        url: "/app/bundles/new",
      }}
    >
      <BlockStack gap="400">
        {params.get("created") === "1" && (
          <Banner tone="success">Bundle draft saved.</Banner>
        )}
        <Banner>
          Bundle drafts help you plan offers. They do not change storefront
          pricing or checkout discounts.
        </Banner>
        {!bundles.length && (
          <Card>
            <Text as="p">
              No bundle drafts yet. Select products to plan your first offer.
            </Text>
          </Card>
        )}
        {bundles.map((bundle) => (
          <Card key={bundle.id}>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                {bundle.name}
              </Text>
              <Badge>Draft</Badge>
              <Text as="p">Planned discount: {bundle.discount}%</Text>
              <Text as="p">
                {bundle.products
                  .map((product) => product.productTitle)
                  .join(", ")}
              </Text>
            </BlockStack>
          </Card>
        ))}
      </BlockStack>
    </Page>
  );
}
