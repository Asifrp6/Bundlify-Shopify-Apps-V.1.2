export const GIFT_KINDS = ["PACKAGE", "WRAP"];
export const GIFT_LABELS = { PACKAGE: "Package", WRAP: "Wrap" };
export const GIFT_NAME_MAX = 80;
export const GIFT_PRICE_MAX = 100000;
export const GIFT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export function parseGiftOption({ kind, name, price } = {}) {
  if (!GIFT_KINDS.includes(kind)) return { error: "Choose package or wrap." };
  const label = GIFT_LABELS[kind].toLowerCase();
  const title = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (!title) return { error: `Enter a ${label} name.` };
  if (title.length > GIFT_NAME_MAX) return { error: `Keep the ${label} name under ${GIFT_NAME_MAX} characters.` };
  const raw = typeof price === "number" ? String(price) : typeof price === "string" ? price.trim() : "";
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return { error: `Enter a ${label} price like 4.99 (up to two decimals).` };
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount > GIFT_PRICE_MAX) return { error: `Enter a ${label} price up to ${GIFT_PRICE_MAX}.` };
  return { value: { kind, name: title, price: amount.toFixed(2) } };
}

// Only a Shopify CDN address is rendered. Anything else is treated as no image.
export function giftImageUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const shopify = host === "cdn.shopify.com" || host.endsWith(".shopify.com") || host.endsWith(".shopifycdn.com") || host.endsWith(".myshopify.com");
  return shopify ? url.href : null;
}

function sniffImage(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}

function imageFilename(name, type) {
  const cleaned = String(name || "").split(/[/\\]/).pop().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  const stem = cleaned.replace(/\.(jpe?g|png|webp|gif)$/i, "").replace(/^-+|-+$/g, "").slice(0, 60) || "gift";
  return `${stem}.${IMAGE_TYPES[type]}`;
}

// An empty file input means "no new image". A chosen file must be a real JPEG, PNG, WebP, or GIF.
export async function readGiftImage(file) {
  if (file == null || file === "") return { value: null };
  if (typeof file === "string" || typeof file?.arrayBuffer !== "function" || typeof file.size !== "number") return { error: "Choose an image file." };
  if (file.size === 0) return { value: null };
  if (file.size > GIFT_IMAGE_MAX_BYTES) return { error: "Keep the image under 8 MB." };
  const declared = file.type === "image/jpg" ? "image/jpeg" : file.type || "";
  const loose = !declared || declared === "application/octet-stream";
  if (!loose && !IMAGE_TYPES[declared]) return { error: "Use a JPEG, PNG, WebP, or GIF image." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImage(bytes);
  if (!sniffed || (!loose && sniffed !== declared)) return { error: "Use a JPEG, PNG, WebP, or GIF image." };
  return { value: { bytes, type: sniffed, name: imageFilename(file.name, sniffed) } };
}

const numericId = gid => String(gid || "").split("/").pop();

// Only options backed by a Shopify variant can be charged, so the storefront never offers the rest.
export function storefrontGiftOptions(rows = []) {
  const options = { packages: [], wraps: [] };
  for (const row of rows) {
    if (!row.variantId || row.syncError || !GIFT_KINDS.includes(row.kind)) continue;
    const variantId = numericId(row.variantId);
    if (!/^\d+$/.test(variantId)) continue;
    (row.kind === "PACKAGE" ? options.packages : options.wraps).push({ id: String(row.id), name: row.name, price: row.price, variantId, imageUrl: giftImageUrl(row.imageUrl) });
  }
  return options;
}

export function formatGiftPrice(price, currency) {
  const amount = Number(price);
  if (!currency) return `${amount.toFixed(2)} (store currency)`;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "code" }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
