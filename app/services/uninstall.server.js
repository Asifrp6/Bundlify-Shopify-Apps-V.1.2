import { createHmac, timingSafeEqual } from "node:crypto";

// Do not refresh an already revoked offline token while processing uninstall.
export async function handleUninstall(request, { db, secret }) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (!secret) return new Response(null, { status: 503 });
  const body = Buffer.from(await request.arrayBuffer());
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("base64"));
  const supplied = Buffer.from(request.headers.get("X-Shopify-Hmac-Sha256") || "");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return new Response(null, { status: 401 });
  let payload;
  try { payload = JSON.parse(body.toString("utf8")); }
  catch { return new Response(null, { status: 400 }); }
  const shop = payload?.myshopify_domain;
  if (request.headers.get("X-Shopify-Topic") !== "app/uninstalled" ||
      typeof shop !== "string" || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ||
      shop !== request.headers.get("X-Shopify-Shop-Domain")) return new Response(null, { status: 400 });
  await db.session.deleteMany({ where: { shop } });
  // Keep merchant drafts until shop/redact. Check remote resources on reauth.
  return new Response(null, { status: 200 });
}
