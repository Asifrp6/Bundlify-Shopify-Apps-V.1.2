// Shopify sends the merchant's top window to returnUrl after approving or declining a charge.
// shop and host let authenticate.admin re-embed the app instead of starting a fresh login.
export function billingReturnUrl({ appUrl, shop, path = "/app/pricing" }) {
  const handle = String(shop || "").replace(/\.myshopify\.com$/i, "");
  if (!handle || !/^[a-z0-9][a-z0-9-]*$/i.test(handle)) throw new Error("Unknown shop for the billing return.");
  const url = new URL(path, appUrl);
  url.searchParams.set("shop", `${handle}.myshopify.com`);
  url.searchParams.set("host", btoa(`admin.shopify.com/store/${handle}`).replace(/=+$/, ""));
  return url.toString();
}

// Admin path is /apps/bundlify-36. shopify.app.toml names the app "Bundle Base" and has no handle key.
// This is not the API client id.
export const ADMIN_APP_HANDLE = "bundlify-36";

// Shopify's embedded redirect helper only treats shopify://admin paths as Admin URLs.
export function hostedPlanSelectionPath(appHandle = ADMIN_APP_HANDLE) {
  const handle = String(appHandle || "").trim();
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(handle)) throw new Error("Unknown app for the plan page.");
  return `shopify://admin/charges/${handle}/pricing_plans`;
}

// Shopify App Pricing hosts plan selection. There is no per-plan approval link.
export function hostedPlanSelectionUrl({ shop, appHandle = ADMIN_APP_HANDLE }) {
  const storeHandle = String(shop || "").replace(/\.myshopify\.com$/i, "");
  const handle = String(appHandle || "").trim();
  if (!storeHandle || !/^[a-z0-9][a-z0-9-]*$/i.test(storeHandle)) throw new Error("Unknown shop for the plan page.");
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(handle)) throw new Error("Unknown app for the plan page.");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${handle}/pricing_plans`;
}

// Shopify appends charge_id (the numeric AppSubscription id) to returnUrl.
export function isApprovedCharge(subscriptionId, chargeId) {
  const id = String(chargeId || "");
  return /^\d+$/.test(id) && String(subscriptionId || "") === `gid://shopify/AppSubscription/${id}`;
}
