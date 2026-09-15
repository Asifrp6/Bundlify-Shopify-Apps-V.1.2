import test from "node:test";
import assert from "node:assert/strict";
import { cartLinesDiscountsGenerateRun as run } from "../extensions/bundle-discount/src/cart_lines_discounts_generate_run.js";
const line = (id, product, quantity = 1, group = "purchase") => ({
  id, quantity, merchandise: { product: { id: product } },
  bundle: { value: "7" }, group: { value: group },
});
const input = lines => ({ cart: { lines }, discount: { metafield: { jsonValue: { id: "7", percentage: 10, products: ["a", "b"] } } } });
test("only complete bundle quantities receive the configured discount", () => {
  const regular = line("regular", "a"); delete regular.bundle;
  const result = run(input([line("a", "a", 3), line("b", "b", 2), regular]));
  const candidate = result.operations[0].productDiscountsAdd.candidates[0];
  assert.deepEqual(candidate.targets, [{ cartLine: { id: "a", quantity: 2 } }, { cartLine: { id: "b", quantity: 2 } }]);
  assert.equal(candidate.value.percentage.value, 10);
});
test("incomplete bundles and separate purchase groups do not receive a discount", () => {
  assert.deepEqual(run(input([line("a", "a")])), { operations: [] });
  assert.deepEqual(run(input([line("a", "a", 1, "one"), line("b", "b", 1, "two")])), { operations: [] });
});
test("subscription lines, wrong bundle IDs and invalid discounts are excluded", () => {
  const b = line("b", "b"); b.sellingPlanAllocation = { sellingPlan: { id: "plan" } };
  assert.deepEqual(run(input([line("a", "a"), b])), { operations: [] });
  delete b.sellingPlanAllocation; b.bundle.value = "8";
  assert.deepEqual(run(input([line("a", "a"), b])), { operations: [] });
  const bad = input([line("a", "a"), line("b", "b")]); bad.discount.metafield.jsonValue.percentage = 101;
  assert.deepEqual(run(bad), { operations: [] });
});
