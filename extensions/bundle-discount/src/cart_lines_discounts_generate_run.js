export function cartLinesDiscountsGenerateRun(input) {
  let config = input.discount?.metafield?.jsonValue;
  const empty = { operations: [] };
  const custom = config?.custom === true;
  if (custom) {
    const current = input.shop?.metafield?.jsonValue;
    if (!current?.id || current.id !== config.id) return empty;
    config = current;
  }
  const fixed = config?.discountType === 'fixed';
  const rate = Number(input.presentmentCurrencyRate);
  const validDiscount = fixed
    ? Number.isFinite(config.fixedAmount) && config.fixedAmount > 0 && config.fixedAmount <= 1000000 && Number.isFinite(rate) && rate > 0
    : Number.isInteger(config?.percentage) && config.percentage > 0 && config.percentage <= 100;
  if (!config || !validDiscount ||
      !Array.isArray(config.products) || config.products.length < 2 || new Set(config.products).size !== config.products.length) return empty;
  const groups = new Map();
  for (const line of input.cart.lines) {
    if ((custom ? line.custom?.value !== 'true' : line.bundle?.value !== String(config.id)) || !line.group?.value || line.sellingPlanAllocation ||
        !config.products.includes(line.merchandise?.product?.id)) continue;
    const group = groups.get(line.group.value) || [];
    group.push(line);
    groups.set(line.group.value, group);
  }
  const targets = [];
  const fixedCandidates = [];
  for (const lines of groups.values()) {
    if (custom) {
      if (new Set(lines.map(line => line.merchandise.product.id)).size >= 2) {
        if (fixed) {
          fixedCandidates.push({ message: 'Custom bundle savings', targets: lines.map(line => ({ cartLine: { id: line.id, quantity: line.quantity } })), value: { fixedAmount: { amount: (config.fixedAmount * rate).toFixed(2), appliesToEachItem: false } } });
          continue;
        }
        for (const line of lines) targets.push({ cartLine: { id: line.id, quantity: line.quantity } });
      }
      continue;
    }
    const sets = Math.min(...config.products.map(id => lines.filter(l => l.merchandise.product.id === id).reduce((sum, l) => sum + l.quantity, 0)));
    if (sets < 1) continue;
    const groupTargets = [];
    for (const id of config.products) {
      let remaining = sets;
      for (const line of lines.filter(l => l.merchandise.product.id === id)) {
        const quantity = Math.min(remaining, line.quantity);
        if (quantity > 0) groupTargets.push({ cartLine: { id: line.id, quantity } });
        remaining -= quantity;
      }
    }
    if (fixed) fixedCandidates.push({ message: "Bundle savings", targets: groupTargets, value: { fixedAmount: { amount: (config.fixedAmount * rate * sets).toFixed(2), appliesToEachItem: false } } });
    else targets.push(...groupTargets);
  }
  return targets.length || fixedCandidates.length ? { operations: [{ productDiscountsAdd: {
    candidates: fixed ? fixedCandidates : [{ message: `Bundle savings (${config.percentage}%)`, targets, value: { percentage: { value: config.percentage } } }],
    selectionStrategy: "ALL",
  } }] } : empty;
}
