export function validDiscount(value, type = "percentage") {
  if (!["percentage", "fixed"].includes(type) || !["number", "string"].includes(typeof value) || String(value).trim() === "") return false;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && (type === "fixed"
    ? amount <= 1000000 && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001
    : Number.isInteger(amount) && amount <= 100);
}

export function discountLabel(value, type = "percentage") {
  return type === "fixed" ? `${value} off (store currency)` : `${value}% off`;
}
