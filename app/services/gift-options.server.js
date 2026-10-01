import { GIFT_LABELS, giftImageUrl, parseGiftOption } from "./gift-options.js";

export const GIFT_PRODUCT_TAG = "bundlify-gift-option";

export const GIFT_PRODUCT_SET = `#graphql
  mutation GiftOptionProductSet($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
    productSet(synchronous: true, input: $input, identifier: $identifier) {
      product { id variants(first: 1) { nodes { id } } }
      userErrors { field message }
    }
  }`;
export const ONLINE_STORE_PUBLICATIONS = `#graphql
  query GiftOptionPublications {
    publications(first: 25) { nodes { id catalog { title } } }
  }`;
export const GIFT_PRODUCT_PUBLISH = `#graphql
  mutation GiftOptionPublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) { userErrors { field message } }
  }`;
export const GIFT_PRODUCT_TAGS = `#graphql
  query GiftOptionProduct($id: ID!) { product(id: $id) { id tags } }`;
export const GIFT_PRODUCT_HEALTH = `#graphql
  query GiftOptionProductHealth($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id availableForSale inventoryPolicy inventoryItem { tracked requiresShipping }
        product { id status resourcePublicationsV2(first: 10, onlyPublished: true) { nodes { publication { catalog { title } } } } }
      }
    }
  }`;
export const GIFT_PRODUCT_DELETE = `#graphql
  mutation GiftOptionProductDelete($input: ProductDeleteInput!) {
    productDelete(input: $input) { deletedProductId userErrors { field message } }
  }`;
export const GIFT_STAGED_UPLOAD = `#graphql
  mutation GiftOptionStagedUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }`;
export const GIFT_PRODUCT_MEDIA = `#graphql
  mutation GiftOptionProductMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media { id status ... on MediaImage { image { url } } }
      mediaUserErrors { field message }
    }
  }`;
export const GIFT_MEDIA_STATUS = `#graphql
  query GiftOptionMedia($id: ID!) {
    node(id: $id) { ... on MediaImage { id status image { url } } }
  }`;
export const GIFT_MEDIA_ORDER = `#graphql
  mutation GiftOptionMediaOrder($id: ID!, $moves: [MoveInput!]!) {
    productReorderMedia(id: $id, moves: $moves) { mediaUserErrors { field message } }
  }`;
export const GIFT_MEDIA_DELETE = `#graphql
  mutation GiftOptionMediaDelete($productId: ID!, $mediaIds: [ID!]!) {
    productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
      deletedMediaIds
      mediaUserErrors { field message }
    }
  }`;

const toRow = row => row && ({ ...row, id: Number(row.id) });

// Queried with SQL so a server whose generated Prisma Client predates the GiftOption table still works.
export function giftStore(db) {
  return {
    list: async shop => (await db.$queryRaw`SELECT id, kind, name, price, productId, variantId, syncError, imageUrl, mediaId FROM "GiftOption" WHERE shop = ${shop} ORDER BY id`).map(toRow),
    find: async (shop, id) => toRow((await db.$queryRaw`SELECT id, kind, name, price, productId, variantId, syncError, imageUrl, mediaId FROM "GiftOption" WHERE shop = ${shop} AND id = ${id}`)[0]),
    create: async (shop, { kind, name, price }) => Number((await db.$queryRaw`INSERT INTO "GiftOption" (shop, kind, name, price) VALUES (${shop}, ${kind}, ${name}, ${price}) RETURNING id`)[0].id),
    update: (shop, id, { name, price, productId, variantId, syncError, imageUrl, mediaId }) =>
      db.$executeRaw`UPDATE "GiftOption" SET name = ${name}, price = ${price}, productId = ${productId}, variantId = ${variantId}, syncError = ${syncError}, imageUrl = ${imageUrl}, mediaId = ${mediaId} WHERE shop = ${shop} AND id = ${id}`,
    remove: (shop, id) => db.$executeRaw`DELETE FROM "GiftOption" WHERE shop = ${shop} AND id = ${id}`,
    removeShop: async shop => {
      await db.$executeRaw`DELETE FROM "GiftOption" WHERE shop = ${shop}`;
      await db.$executeRaw`DELETE FROM "GiftSetting" WHERE shop = ${shop}`;
    },
    enabled: async shop => giftEnabledValue((await db.$queryRaw`SELECT enabled FROM "GiftSetting" WHERE shop = ${shop}`)[0]?.enabled),
    setEnabled: (shop, enabled) =>
      db.$executeRaw`INSERT INTO "GiftSetting" (shop, enabled, updatedAt) VALUES (${shop}, ${enabled ? 1 : 0}, CURRENT_TIMESTAMP)
        ON CONFLICT(shop) DO UPDATE SET enabled = excluded.enabled, updatedAt = CURRENT_TIMESTAMP`,
  };
}

// SQLite returns booleans as 0/1 (sometimes BigInt); shops without a saved row keep the gift flow on.
export const giftEnabledValue = value => value == null || !(value === false || Number(value) === 0);

// The switch is optional: a shop whose database predates GiftSetting still gets the gift flow.
export async function loadGiftEnabled(store, shop) {
  try {
    return await store.enabled(shop);
  } catch {
    return true;
  }
}

const messages = (result, payload) => [...(result.errors || []), ...(payload?.userErrors || [])].map(error => error.message).filter(Boolean).join("; ");

async function publishToOnlineStore(admin, productId) {
  const result = await (await admin.graphql(ONLINE_STORE_PUBLICATIONS)).json();
  if (result.errors?.length) throw new Error(`Could not find your Online Store channel (${messages(result)}). Open the app again and approve the updated permissions.`);
  const publication = result.data?.publications?.nodes?.find(node => /online store/i.test(node.catalog?.title || ""));
  if (!publication) throw new Error("Could not find your Online Store channel, so customers cannot add this fee to their cart.");
  const published = await (await admin.graphql(GIFT_PRODUCT_PUBLISH, { variables: { id: productId, input: [{ publicationId: publication.id }] } })).json();
  const details = messages(published, published.data?.publishablePublish);
  if (details) throw new Error(`Could not publish the fee product to your Online Store: ${details}`);
}

// Fee variants are never stocked at a location, so they must not require shipping: the storefront reports an
// untracked variant that needs shipping but has no stocking location as "already sold out" on /cart/add.js.
export const GIFT_INVENTORY_ITEM = { tracked: false, requiresShipping: false };

// UNLISTED (Admin API 2025-10+) keeps the variant sellable on the Online Store cart while leaving it out of
// search, collections and recommendations. It must stay published: unpublished variants cannot be added to a cart.
export const GIFT_PRODUCT_STATUS = "UNLISTED";
export const GIFT_HANDLE_PREFIX = "bundlify-gift-";
export const giftProductHandle = option => `${GIFT_HANDLE_PREFIX}${option.kind === "PACKAGE" ? "box" : "wrap"}-${option.id}`;

// One hidden, untracked product per option so the fee is charged at checkout from a real variant price.
export async function syncGiftProduct(admin, option) {
  const title = `${option.kind === "PACKAGE" ? "Gift box" : "Gift wrap"}: ${option.name}`;
  const variant = { optionValues: [{ optionName: "Title", name: "Default Title" }], price: option.price, inventoryPolicy: "CONTINUE", inventoryItem: { ...GIFT_INVENTORY_ITEM } };
  if (option.variantId) variant.id = option.variantId;
  const result = await (await admin.graphql(GIFT_PRODUCT_SET, { variables: {
    identifier: option.productId ? { id: option.productId } : null,
    input: {
      title, handle: giftProductHandle(option), status: GIFT_PRODUCT_STATUS, productType: "Bundlify gift option", tags: [GIFT_PRODUCT_TAG],
      productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
      variants: [variant],
      metafields: [{ namespace: "seo", key: "hidden", type: "number_integer", value: "1" }],
    },
  } })).json();
  const payload = result.data?.productSet;
  const productId = payload?.product?.id;
  const variantId = payload?.product?.variants?.nodes?.[0]?.id;
  const details = messages(result, payload);
  if (details || !productId || !variantId) throw new Error(`Shopify could not save the fee product: ${details || "no variant was returned"}`);
  try {
    await publishToOnlineStore(admin, productId);
  } catch (error) {
    // The product exists now; keep its ids so a retry publishes it instead of creating a duplicate.
    throw Object.assign(error, { productId, variantId });
  }
  return { productId, variantId };
}

const onlineStore = product => product?.resourcePublicationsV2?.nodes?.some(node => /online store/i.test(node.publication?.catalog?.title || ""));
const sellable = variant => variant?.availableForSale !== false && variant?.inventoryItem?.tracked === false && variant.inventoryItem.requiresShipping === false
  && variant.inventoryPolicy === "CONTINUE" && variant.product?.status === GIFT_PRODUCT_STATUS && onlineStore(variant.product);

// Re-syncs linked fee products in place when they could not be added to a cart (tracked stock, DENY, requires shipping,
// draft or unpublished) or would show in the catalog (still ACTIVE instead of UNLISTED).
export async function repairGiftProducts({ store, admin, shop, rows, sync = syncGiftProduct }) {
  const linked = rows.filter(row => row.productId && row.variantId);
  if (!linked.length) return rows;
  const result = await (await admin.graphql(GIFT_PRODUCT_HEALTH, { variables: { ids: linked.map(row => row.variantId) } })).json();
  if (result.errors?.length || !result.data?.nodes) return rows;
  const health = new Map(result.data.nodes.filter(Boolean).map(node => [node.id, node]));
  const repaired = new Map();
  for (const row of linked) {
    const variant = health.get(row.variantId);
    if (!variant || sellable(variant)) continue;
    try {
      const { productId, variantId } = await sync(admin, row);
      await store.update(shop, row.id, { name: row.name, price: row.price, productId, variantId, syncError: null, ...imageFields(row) });
      repaired.set(row.id, { ...row, productId, variantId, syncError: null });
    } catch (error) {
      const syncError = error.message || "Shopify could not save the fee product.";
      await store.update(shop, row.id, { name: row.name, price: row.price, productId: error.productId || row.productId, variantId: error.variantId || row.variantId, syncError, ...imageFields(row) });
      repaired.set(row.id, { ...row, syncError });
    }
  }
  return rows.map(row => repaired.get(row.id) || row);
}

const imageFields = row => ({ imageUrl: row?.imageUrl ?? null, mediaId: row?.mediaId ?? null });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Image processing is asynchronous. The CDN address appears once status is READY.
export async function waitForGiftImage(admin, mediaId, { attempts = 10, pause = sleep } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await (await admin.graphql(GIFT_MEDIA_STATUS, { variables: { id: mediaId } })).json();
    const node = result.data?.node;
    if (node?.status === "FAILED") throw new Error("Shopify could not process this image.");
    const imageUrl = giftImageUrl(node?.image?.url);
    if (imageUrl) return imageUrl;
    if (attempt + 1 < attempts) await pause(500);
  }
  throw new Error("Shopify is still processing this image. Save again in a moment.");
}

async function stageGiftImage(admin, image, fetchImpl) {
  const result = await (await admin.graphql(GIFT_STAGED_UPLOAD, { variables: { input: [{
    filename: image.name, mimeType: image.type, resource: "PRODUCT_IMAGE", httpMethod: "POST", fileSize: String(image.bytes.byteLength),
  }] } })).json();
  const payload = result.data?.stagedUploadsCreate;
  const details = messages(result, payload);
  const target = payload?.stagedTargets?.[0];
  if (details || !target?.url || !target.resourceUrl || !/^https:\/\//.test(target.url)) throw new Error(details || "Shopify did not accept this image.");
  const body = new FormData();
  for (const parameter of target.parameters || []) body.append(parameter.name, parameter.value);
  body.append("file", new Blob([image.bytes], { type: image.type }), image.name);
  let response;
  try {
    response = await fetchImpl(target.url, { method: "POST", body, signal: AbortSignal.timeout(30000) });
  } catch {
    throw new Error("Could not upload the image. Try again.");
  }
  if (!response.ok) {
    await response.arrayBuffer().catch(() => {});
    throw new Error(`Could not upload the image (${response.status}).`);
  }
  await response.arrayBuffer().catch(() => {});
  return target.resourceUrl;
}

// The new image becomes the product's only media, so Shopify uses it as the featured image.
async function featureGiftImage(admin, productId, mediaId, previousMediaId) {
  if (!previousMediaId || previousMediaId === mediaId) return;
  try {
    await (await admin.graphql(GIFT_MEDIA_ORDER, { variables: { id: productId, moves: [{ id: mediaId, newPosition: "0" }] } })).json();
  } catch { /* Removing the previous image still leaves this one featured. */ }
  try {
    await (await admin.graphql(GIFT_MEDIA_DELETE, { variables: { productId, mediaIds: [previousMediaId] } })).json();
  } catch { /* The storefront uses the CDN address saved on the option. */ }
}

// Puts the merchant's file on the fee product and returns the CDN address customers will see.
export async function attachGiftImage(admin, image, { productId, alt, previousMediaId = null, fetchImpl = globalThis.fetch, pause } = {}) {
  const resourceUrl = await stageGiftImage(admin, image, fetchImpl);
  const result = await (await admin.graphql(GIFT_PRODUCT_MEDIA, { variables: {
    productId,
    media: [{ originalSource: resourceUrl, mediaContentType: "IMAGE", alt }],
  } })).json();
  const payload = result.data?.productCreateMedia;
  const details = messages(result, { userErrors: payload?.mediaUserErrors });
  const media = payload?.media?.[0];
  if (details || !media?.id) throw new Error(details || "Shopify did not return the image.");
  if (media.status === "FAILED") throw new Error("Shopify could not process this image.");
  const imageUrl = giftImageUrl(media.image?.url) || await waitForGiftImage(admin, media.id, pause ? { pause } : {});
  await featureGiftImage(admin, productId, media.id, previousMediaId);
  return { imageUrl, mediaId: media.id };
}

export async function saveGiftOption({ store, admin, shop, id, input, image = null, sync = syncGiftProduct, attach = attachGiftImage }) {
  const parsed = parseGiftOption(input);
  if (parsed.error) return { error: parsed.error, status: 400 };
  let existing = null;
  if (id != null) {
    existing = Number.isSafeInteger(id) && id > 0 ? await store.find(shop, id) : null;
    if (!existing) return { error: `${GIFT_LABELS[parsed.value.kind]} not found.`, status: 404 };
    if (existing.kind !== parsed.value.kind) return { error: "Package and wrap types cannot be switched.", status: 400 };
  }
  const optionId = existing ? existing.id : await store.create(shop, parsed.value);
  const option = { ...(existing || { productId: null, variantId: null, imageUrl: null, mediaId: null }), ...parsed.value, id: optionId };
  const kept = imageFields(option);
  const persist = fields => store.update(shop, optionId, { name: option.name, price: option.price, ...kept, ...fields });
  try {
    const { productId, variantId } = await sync(admin, option);
    let next = { ...kept, productId, variantId, syncError: null };
    if (image) {
      try {
        const attached = await attach(admin, image, { productId, alt: option.name, previousMediaId: kept.mediaId });
        next = { ...next, imageUrl: attached.imageUrl, mediaId: attached.mediaId };
      } catch (error) {
        await persist(next);
        return { error: `Saved, but the image could not be added: ${error.message || "try again."}`, option: { ...option, ...next } };
      }
    }
    await persist(next);
    return { option: { ...option, ...next } };
  } catch (error) {
    const syncError = error.message || "Shopify could not save the fee product.";
    // Keep the ids of a product that already exists so the next save updates it instead of creating another.
    const productId = error.productId || option.productId;
    const variantId = error.variantId || option.variantId;
    const next = { ...kept, productId, variantId, syncError };
    await persist(next);
    return { error: `${syncError} This ${GIFT_LABELS[option.kind].toLowerCase()} is saved but hidden from customers until the fee product syncs.`, status: 502, option: { ...option, ...next } };
  }
}

async function deleteGiftProduct(admin, productId) {
  const found = await (await admin.graphql(GIFT_PRODUCT_TAGS, { variables: { id: productId } })).json();
  const product = found.data?.product;
  if (!product) return null;
  if (!product.tags?.includes(GIFT_PRODUCT_TAG)) return "The linked Shopify product was not created by Bundle Base, so it was left untouched.";
  const result = await (await admin.graphql(GIFT_PRODUCT_DELETE, { variables: { input: { id: productId } } })).json();
  const details = messages(result, result.data?.productDelete);
  return details ? `Removed from the popup, but Shopify could not delete its fee product: ${details}` : null;
}

export async function deleteGiftOption({ store, admin, shop, id }) {
  const existing = Number.isSafeInteger(id) && id > 0 ? await store.find(shop, id) : null;
  if (!existing) return { error: "Option not found.", status: 404 };
  await store.remove(shop, id);
  let warning = null;
  if (existing.productId) {
    try {
      warning = await deleteGiftProduct(admin, existing.productId);
    } catch {
      warning = "Removed from the popup, but its Shopify fee product could not be deleted. You can delete it from Products.";
    }
  }
  return { deleted: id, warning };
}
