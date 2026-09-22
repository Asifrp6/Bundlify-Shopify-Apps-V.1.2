import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

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

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "icon", type: "image/png", href: "/tranferent%20logo.png" },
];

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />

        <meta name="viewport" content="width=device-width,initial-scale=1" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap"
        />

        <Meta />

        <Links />
        {/* Deliver scoped app styles with the HTML, including before hydration. */}
        <style data-bundlify-styles>{[headerCss, dashboardCss, bundlesCss, subscriptionsCss, landingCss, planFormCss, bundleEditorCss, settingsCss].join("\n")}</style>

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

          /* Ensure proper spacing on all pages */
          main {
            max-width: 100%;
            overflow-x: hidden;
          }

          /* Better button responsiveness */
          button {
            font-family: inherit;
          }

          /* Responsive image sizes */
          img {
            max-width: 100%;
            height: auto;
          }

          /* Fix for card padding on mobile */
          @media (max-width: 640px) {
            .Polaris-Card {
              padding: 12px;
            }
          }

          /* Smooth transitions */
          a, button, input, select, textarea {
            transition: all 0.2s ease;
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
