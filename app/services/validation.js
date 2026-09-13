import { schedules } from "./delivery-options.js";
export const frequencies = Object.keys(schedules);
const productIdPattern = /^gid:\/\/shopify\/Product\/\d+$/;

export function validatePlan(formData) {
  let deliveryOptions;
  if (formData.has("deliveryOptions")) {
    try {
      const raw = JSON.parse(String(formData.get("deliveryOptions")));
      if (!Array.isArray(raw) || !raw.length || raw.length > 5) throw new Error();
      deliveryOptions = raw.map(option => {
        if (!option || !Object.hasOwn(schedules, option.frequency) || !["string", "number"].includes(typeof option.discount) || String(option.discount).trim() === "" || !Number.isInteger(Number(option.discount)) || Number(option.discount) < 0 || Number(option.discount) > 100) throw new Error();
        return { frequency: option.frequency, discount: Number(option.discount), ...schedules[option.frequency] };
      });
      if (new Set(deliveryOptions.map(o => o.frequency)).size !== deliveryOptions.length) throw new Error();
      formData.set("frequency", deliveryOptions[0].frequency);
      formData.set("discount", String(deliveryOptions[0].discount));
    } catch {
      return { values: {}, errors: { deliveryOptions: "Choose 1–5 distinct delivery frequencies with whole-number discounts from 0 to 100." } };
    }
  }
  const name = String(formData.get("name") ?? "").trim();
  const frequency = String(formData.get("frequency") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const rawDiscount = String(formData.get("discount") ?? "").trim();
  const discount = Number(rawDiscount);
  const errors = {};
  if (!name || name.length > 120)
    errors.name = "Enter a name of 1–120 characters.";
  if (!frequencies.includes(frequency))
    errors.frequency = "Select a billing frequency.";
  if (productId !== "ALL_PRODUCTS" && !productIdPattern.test(productId)) errors.productId = "Select a product.";
  if (
    !rawDiscount ||
    !Number.isInteger(discount) ||
    discount < 0 ||
    discount > 100
  ) {
    errors.discount = "Enter a whole-number discount between 0 and 100.";
  }
  return { values: { name, frequency, productId, discount, ...(deliveryOptions ? { deliveryOptions } : {}) }, errors };
}

export function validateBundle(formData) {
  const { values, errors } = validatePlan(formData);
  delete errors.frequency;
  delete errors.productId;
  const productIds = [...new Set(formData.getAll("productIds").map(String))];
  if (
    productIds.length < 2 ||
    productIds.length > 50 ||
    productIds.some((id) => !productIdPattern.test(id))
  ) {
    errors.productIds = "Select between 2 and 50 different products.";
  }
  return {
    values: { name: values.name, discount: values.discount, productIds },
    errors,
  };
}
