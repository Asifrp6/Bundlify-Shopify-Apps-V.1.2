import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router";

import { AppProvider } from "@shopify/polaris";

import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import RouterLink from "./components/RouterLink";
import headerCss from "./styles/app-header.module.css?inline";
import dashboardCss from "./styles/dashboard.module.css?inline";
import bundlesCss from "./styles/bundles.module.css?inline";
import subscriptionsCss from "./styles/subscriptions.module.css?inline";
import planFormCss from "./styles/plan-form.module.css?inline";
import landingCss from "./styles/landing.module.css?inline";
import bundleEditorCss from "./styles/bundle-editor.module.css?inline";
import settingsCss from "./styles/settings.module.css?inline";
import pricingCss from "./styles/pricing.module.css?inline";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "icon", type: "image/png", href: "/bundlify-icon.png?v=3" },
];

export const loader = () => ({ apiKey: process.env.SHOPIFY_API_KEY || "" });

export default function App() {
  const { apiKey } = useLoaderData();
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="shopify-api-key" content={apiKey} />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap"
        />

        <Meta />

        <Links />
        {/* Deliver scoped app styles with the HTML, including before hydration. */}
        <style data-bundlify-styles>{[headerCss, dashboardCss, bundlesCss, subscriptionsCss, landingCss, planFormCss, bundleEditorCss, settingsCss, pricingCss].join("\n")}</style>

        <style>{`
          * {
            box-sizing: border-box;
          }

          html, body {
            margin: 0;
            padding: 0;
            font-family: "Poppins", sans-serif;
          }

          /* Include Polaris components, dialogs, headings, and form controls. */
          body, body * {
            font-family: "Poppins", sans-serif !important;
          }

          body {
            background-color: #f9fafb;
            color: #111827;
          }

          /* Mobile responsive adjustments */
          @media (max-width: 640px) {
            body {
              font-size: 14px;
            }
          }

          main {
            max-width: 100%;
            min-width: 0;
          }

          button, input, select, textarea {
            font: inherit;
            letter-spacing: inherit;
          }

          button {
            margin: 0;
            vertical-align: middle;
          }

          img {
            max-width: 100%;
          }

          /* Fix for card padding on mobile */
          @media (max-width: 640px) {
            .Polaris-Card {
              padding: 12px;
            }
          }

          a, button, input, select, textarea {
            transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
          }
        `}</style>
      </head>

      <body>
        <AppProvider i18n={enTranslations} linkComponent={RouterLink}>
          <Outlet />
        </AppProvider>

        <ScrollRestoration />

        <Scripts />
      </body>
    </html>
  );
}
