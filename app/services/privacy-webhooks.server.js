import { createHmac, timingSafeEqual } from "node:crypto";

const topics = new Set(["customers/data_request", "customers/redact", "shop/redact"]);

// Privacy requests must still work after uninstall, with no session or API access.
export async function handlePrivacyWebhook(request, { db, secret }) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  if (!secret) return new Response(null, { status: 503 });

  const body = Buffer.from(await request.arrayBuffer());
  const expected = createHmac("sha256", secret).update(body).digest("base64");
  const supplied = request.headers.get("X-Shopify-Hmac-Sha256") || "";
  const actual = Buffer.from(supplied);
  const signature = Buffer.from(expected);
  if (actual.length !== signature.length || !timingSafeEqual(actual, signature)) {
    return new Response(null, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return new Response(null, { status: 400 });
  }
  const topic = request.headers.get("X-Shopify-Topic");
  // Use the signed payload's shop, not just an unsigned request header.
  const shop = payload?.shop_domain;
  if (!topics.has(topic) || typeof shop !== "string" ||
      !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ||
      request.headers.get("X-Shopify-Shop-Domain") !== shop) {
    return new Response(null, { status: 400 });
  }

  if (topic === "shop/redact") {
    try {
      // Child rows are removed first; BundleProduct has no cascade in the schema.
      // deleteMany and the transaction make retries safe and failures atomic.
      await db.$transaction(async (tx) => {
        await tx.bundleProduct.deleteMany({ where: { bundle: { shop } } });
        await tx.bundle.deleteMany({ where: { shop } });
        await tx.deliveryOption.deleteMany({ where: { subscriptionPlan: { shop } } });
        await tx.subscriptionPlan.deleteMany({ where: { shop } });
        await tx.session.deleteMany({ where: { shop } });
      });
    } catch {
      // Do not acknowledge unsuccessful deletion or log the private payload.
      return new Response(null, { status: 500 });
    }
  }

  // Bundlify persists no buyer/customer records or orders. Customer requests
  // therefore have no local records to export or erase. Merchant Session data
  // is not buyer data; never match it against a customer's ID/email.
  // Revisit these handlers whenever customer data storage is introduced.
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
