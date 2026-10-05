import { discountLabel } from "./discounts.js";

export const CUSTOM_BUNDLE_NAME = "Custom bundle";
export const CUSTOM_BUNDLE_EDIT_PATH = "/app/bundles/custom";
export const CUSTOM_BUNDLE_DELETE_INTENT = "custom-bundle-delete";
export const CUSTOM_APPLY_SUCCESS = "Applied successfully. Your selected products are now available for custom bundles.";
export const CUSTOM_DISABLED_SUCCESS = "Custom bundles are now disabled.";

export function customApplyPath(productIds) {
  return Array.isArray(productIds) && productIds.length ? "/app/bundles?applied=1" : "/app/bundles?customDisabled=1";
}

export function customDiscountText(discountType, amount, currency) {
  if (discountType === "fixed" && currency) return `${amount} ${currency} off`;
  return discountLabel(amount, discountType === "fixed" ? "fixed" : "percentage");
}

export function customBundleOffer(settings, products = []) {
  const ids = Array.isArray(settings?.productIds) ? settings.productIds.filter(id => typeof id === "string" && id) : [];
  if (!ids.length) return null;
  const discount = settings?.discount && typeof settings.discount === "object" ? settings.discount : {};
  const discountType = discount.discountType === "fixed" ? "fixed" : "percentage";
  const raw = discountType === "fixed" ? discount.fixedAmount : discount.percentage;
  const amount = Number(raw);
  const value = Number.isFinite(amount) ? amount : 0;
  const titles = new Map((Array.isArray(products) ? products : []).flatMap(product => (
    product?.id && product.title ? [[product.id, product.title]] : []
  )));
  return {
    name: CUSTOM_BUNDLE_NAME,
    editTo: CUSTOM_BUNDLE_EDIT_PATH,
    discount: value,
    discountType,
    currency: settings?.currency || null,
    discountText: customDiscountText(discountType, value, settings?.currency || null),
    products: ids.map(productId => ({ productId, productTitle: titles.get(productId) || "Unavailable product" })),
  };
}
