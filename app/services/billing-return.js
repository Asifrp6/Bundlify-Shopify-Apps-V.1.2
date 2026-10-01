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

// Shopify appends charge_id (the numeric AppSubscription id) to returnUrl.
export function isApprovedCharge(subscriptionId, chargeId) {
  const id = String(chargeId || "");
  return /^\d+$/.test(id) && String(subscriptionId || "") === `gid://shopify/AppSubscription/${id}`;
}
