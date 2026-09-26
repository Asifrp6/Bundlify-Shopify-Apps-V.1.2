import { createHmac, timingSafeEqual } from "node:crypto";

function decode(part) {
  return JSON.parse(Buffer.from(part, "base64url").toString());
}

export function customerSession(token, { apiKey, apiSecret, now = Date.now() } = {}) {
  if (!apiKey || !apiSecret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  let expected;
  try {
    expected = createHmac("sha256", apiSecret).update(`${header}.${body}`).digest();
  } catch {
    return null;
  }
  let actual;
  try { actual = Buffer.from(signature, "base64url"); }
  catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  let payload;
  try { payload = decode(body); }
  catch { return null; }
  if (payload.aud !== apiKey || !Number.isFinite(payload.exp) || payload.exp * 1000 <= now) return null;
  const dest = String(payload.dest || "").replace(/^https:\/\//, "").split("/")[0];
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(dest)) return null;
  if (!/^gid:\/\/shopify\/Customer\/\d+$/.test(payload.sub || "")) return null;
  return { shop: dest, customerId: payload.sub };
}
