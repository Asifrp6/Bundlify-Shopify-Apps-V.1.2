import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { Icon } from "@shopify/polaris";
import { HomeIcon, PackageIcon, RefreshIcon } from "@shopify/polaris-icons";

import { boundary } from "@shopify/shopify-app-react-router/server";

import {
  Link,
  Outlet,
  useLoaderData,
  useRouteError,
  useLocation,
} from "react-router";

import { authenticate } from "../shopify.server";
import styles from "../styles/app-header.module.css";
import { reportRouteFailure } from "../services/route-diagnostics.server";

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
    reportRouteFailure(error, "app authentication");

    throw error;
  }
};

// ==========================
// APP LAYOUT
// ==========================

export default function App() {
  const { apiKey } = useLoaderData();
  const { pathname } = useLocation();

  const navigationItems = [
    {
      label: "Home",
      icon: HomeIcon,
      destination: "/app",
    },
    {
      label: "Bundle Drafts",
      icon: PackageIcon,
      destination: "/app/bundles",
    },
    {
      label: "Subscriptions",
      icon: RefreshIcon,
      destination: "/app/subscriptions",
    },
  ];

  const isActive = (path) =>
    pathname === path || (path !== "/app" && pathname.startsWith(path + "/"));

  return (
    <AppProvider embedded apiKey={apiKey}>
      <header className={styles.header}>
        <div className={styles.inner}>
          <Link to="/app" className={styles.brand} aria-label="Bundlify home">
            <span className={styles.logo}>
              <img
                src="/tranferent%20logo.png"
                alt=""
                width="1200"
                height="1200"
              />
            </span>
            <span className={styles.brandCopy}>
              <strong>Bundlify</strong>
              <span>Bundles &amp; subscriptions</span>
            </span>
          </Link>
          <nav className={styles.navigation} aria-label="Main navigation">
            {navigationItems.map((item) => (
              <Link
                key={item.destination}
                to={item.destination}
                className={styles.link}
                aria-current={isActive(item.destination) ? "page" : undefined}
              >
                <span className={styles.navIcon}>
                  <Icon source={item.icon} />
                </span>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div style={{ padding: "0 8px" }}>
        <Outlet />
      </div>
    </AppProvider>
  );
}

// ==========================
// ERROR HANDLING
// ==========================

export function ErrorBoundary() {
  const error = useRouteError();

  return boundary.error(error);
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
