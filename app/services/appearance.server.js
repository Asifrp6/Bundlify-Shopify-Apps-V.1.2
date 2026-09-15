import { defaults } from "./appearance";
export const APPEARANCE_QUERY = `#graphql
query BlockAppearance { shop { id bundle: metafield(namespace: "bundlify", key: "bundle_appearance") { value } subscription: metafield(namespace: "bundlify", key: "subscription_appearance") { value } } }
`;
export const APPEARANCE_SAVE = `#graphql
mutation SaveBlockAppearance($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { metafields { key } userErrors { field message } } }
`;
export async function getAppearance(admin) {
  const result = await (await admin.graphql(APPEARANCE_QUERY)).json();
  if (result.errors?.length || !result.data?.shop) throw new Error("Could not load settings. Please try again.");
  const shop = result.data.shop;
  const settings = {};
  for (const kind of Object.keys(defaults)) {
    let saved = {}; try { saved = JSON.parse(shop[kind]?.value || "{}"); } catch { /* Use defaults for invalid saved data. */ }
    settings[kind] = { ...defaults[kind], ...saved };
  }
  return { shopId: shop.id, settings };
}
export async function saveAppearance(admin, shopId, kind, values) {
  const result = await (await admin.graphql(APPEARANCE_SAVE, { variables: { metafields: [{ ownerId: shopId, namespace: "bundlify", key: kind + "_appearance", type: "json", value: JSON.stringify(values) }] } })).json();
  if (result.errors?.length || result.data?.metafieldsSet?.userErrors?.length || !result.data?.metafieldsSet?.metafields?.length) throw new Error("Settings could not be saved. Please try again.");
}
