import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { Icon } from "@shopify/polaris";
import { HomeIcon, PackageIcon, RefreshIcon, SettingsIcon } from "@shopify/polaris-icons";

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
    const { admin, session, redirect } = await authenticate.admin(request);
    const { shopLimits, syncShopPlan } = await import("../services/app-billing.server");
    let planHandle = null;
    try {
      planHandle = await syncShopPlan(admin, session.shop);
    } catch (planError) {
      if (planError instanceof Response) throw planError;
      reportRouteFailure(planError, "app plan");
      planHandle = (await shopLimits(session.shop))?.handle || null;
    }
    const url = new URL(request.url);
    const path = url.pathname;
    const chargeId = url.searchParams.get("charge_id");
    if (!planHandle && path !== "/app/pricing") {
      throw redirect(chargeId ? `/app/pricing?charge_id=${encodeURIComponent(chargeId)}` : "/app/pricing");
    }

    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      planHandle,
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
      label: "Bundles",
      icon: PackageIcon,
      destination: "/app/bundles",
    },
    {
      label: "Subscriptions",
      icon: RefreshIcon,
      destination: "/app/subscriptions",
    },
    { label: "Pricing", destination: "/app/pricing" },
    { label: "Settings", icon: SettingsIcon, destination: "/app/settings" },
  ];

  const isActive = (path) =>
    pathname === path || (path !== "/app" && pathname.startsWith(path + "/"));

  return (
    <AppProvider embedded apiKey={apiKey}>
      <header className={styles.header}>
        <div className={styles.inner}>
          <Link to="/app" className={styles.brand} aria-label="Bundlify home">
            <span className={styles.logo}>
              <img src="/bundlify-icon.png?v=3" alt="" width="637" height="637" />
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
                  {item.icon ? <Icon source={item.icon} /> : <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M10 2.5v15M6.5 6.2c0-1.3 1.6-2.2 3.5-2.2s3.5.9 3.5 2.2-1.6 2.3-3.5 2.3-3.5 1-3.5 2.3 1.6 2.2 3.5 2.2 3.5-.9 3.5-2.2" /></svg>}
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
