import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import { AppProvider } from "@shopify/polaris";

import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import RouterLink from "./components/RouterLink";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />

        <meta name="viewport" content="width=device-width,initial-scale=1" />

        <link rel="preconnect" href="https://cdn.shopify.com/" />

        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />

        <Meta />

        <Links />
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
