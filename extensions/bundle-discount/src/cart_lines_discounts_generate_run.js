export function cartLinesDiscountsGenerateRun(input) {
  let config = input.discount?.metafield?.jsonValue;
  const empty = { operations: [] };
  const custom = config?.custom === true;
  if (custom) {
    const current = input.shop?.metafield?.jsonValue;
    if (!current?.id || current.id !== config.id) return empty;
    config = current;
  }
  if (!config || !Number.isInteger(config.percentage) || config.percentage <= 0 || config.percentage > 100 ||
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
  for (const lines of groups.values()) {
    if (custom) {
      if (new Set(lines.map(line => line.merchandise.product.id)).size >= 2) {
        for (const line of lines) targets.push({ cartLine: { id: line.id, quantity: line.quantity } });
      }
      continue;
    }
    const sets = Math.min(...config.products.map(id => lines.filter(l => l.merchandise.product.id === id).reduce((sum, l) => sum + l.quantity, 0)));
    if (sets < 1) continue;
    for (const id of config.products) {
      let remaining = sets;
      for (const line of lines.filter(l => l.merchandise.product.id === id)) {
        const quantity = Math.min(remaining, line.quantity);
        if (quantity > 0) targets.push({ cartLine: { id: line.id, quantity } });
        remaining -= quantity;
      }
    }
  }
  return targets.length ? { operations: [{ productDiscountsAdd: {
    candidates: [{ message: `Bundle savings (${config.percentage}%)`, targets, value: { percentage: { value: config.percentage } } }],
    selectionStrategy: "ALL",
  } }] } : empty;
}
