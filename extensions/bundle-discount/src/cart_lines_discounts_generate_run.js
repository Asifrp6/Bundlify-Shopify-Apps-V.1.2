export function cartLinesDiscountsGenerateRun(input) {
  const config = input.discount?.metafield?.jsonValue;
  const empty = { operations: [] };
  if (!config || !Number.isInteger(config.percentage) || config.percentage <= 0 || config.percentage > 100 ||
      !Array.isArray(config.products) || config.products.length < 2 || new Set(config.products).size !== config.products.length) return empty;
  const groups = new Map();
  for (const line of input.cart.lines) {
    if (line.bundle?.value !== String(config.id) || !line.group?.value || line.sellingPlanAllocation ||
        !config.products.includes(line.merchandise?.product?.id)) continue;
    const group = groups.get(line.group.value) || [];
    group.push(line);
    groups.set(line.group.value, group);
  }
  const targets = [];
  for (const lines of groups.values()) {
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
