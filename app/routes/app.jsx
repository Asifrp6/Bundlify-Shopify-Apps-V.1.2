import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { boundary } from "@shopify/shopify-app-react-router/server";

import { Outlet, useLoaderData, useRouteError } from "react-router";

import { authenticate } from "../shopify.server";

// ==========================
// LOADER
// ==========================

export const loader = async ({ request }) => {
  try {
    await authenticate.admin(request);

    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
    };
  } catch (error) {
    console.error("APP AUTH ERROR:", error);

    throw error;
  }
};

// ==========================
// APP LAYOUT
// ==========================

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>

        <s-link href="/app/bundles">Bundle drafts</s-link>

        <s-link href="/app/subscriptions">Subscription Plans</s-link>

        <s-link href="/app/subscriptions/new">Create Subscription</s-link>
      </s-app-nav>

      <Outlet />
    </AppProvider>
  );
}

// ==========================
// ERROR HANDLING
// ==========================

export function ErrorBoundary() {
  const error = useRouteError();

  console.error("APP ROUTE ERROR:", error);

  return boundary.error(error);
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
