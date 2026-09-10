import {
  isRouteErrorResponse,
  useRouteError,
  useRevalidator,
} from "react-router";
import { Banner, BlockStack, Button, Page } from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";

export default function RouteError() {
  const error = useRouteError();
  const revalidator = useRevalidator();
  // Shopify can return an HTML recovery response that must be rendered, not rethrown.
  if (isRouteErrorResponse(error)) return boundary.error(error);
  return (
    <Page title="Unable to load this page">
      <BlockStack gap="400">
        <Banner tone="critical">
          The page could not load. Try again. If it keeps failing, check the app
          server logs.
        </Banner>
        {import.meta.env.DEV && error instanceof Error && (
          <Banner tone="warning" title="Development error">
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {error.message}
            </pre>
          </Banner>
        )}
        <Button
          onClick={() => revalidator.revalidate()}
          loading={revalidator.state !== "idle"}
        >
          Try again
        </Button>
        <Button url="/app">Return to dashboard</Button>
      </BlockStack>
    </Page>
  );
}
