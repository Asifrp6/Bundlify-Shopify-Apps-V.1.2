import test from "node:test";
import assert from "node:assert/strict";
import { validatePlan } from "../app/services/validation.js";
import { lengthCycles, lengthLabel, lengthRecord, planLengths, sellingPlanInput } from "../app/services/delivery-options.js";
import { createSellingPlan } from "../app/services/sellingPlan.server.js";
import { changeSubscription } from "../app/services/subscription-management.server.js";

const monthly = [{ frequency: "Monthly", discount: 10 }];
function form(lengths, enabled = true, deliveryOptions = monthly) {
  const data = new FormData();
  data.set("name", "Coffee");
  data.set("productId", "gid://shopify/Product/1");
  data.set("deliveryOptions", JSON.stringify(deliveryOptions));
  data.set("lengthEnabled", enabled ? "true" : "false");
  data.set("lengthOptions", JSON.stringify(lengths));
  return data;
}

test("enabling the storefront popup saves one ongoing length; merchant presets are ignored", () => {
  for (const posted of [[], [{ interval: "MONTH", intervalCount: 3 }, { interval: "DAY", intervalCount: 30 }], "nope"]) {
    const data = form(posted);
    if (typeof posted === "string") data.set("lengthOptions", posted);
    const { values, errors } = validatePlan(data);
    assert.deepEqual(errors, {});
    assert.equal(values.lengthEnabled, true);
    assert.deepEqual(values.lengthOptions.map(lengthLabel), ["Unlimited"]);
  }
  // Seven frequencies still fit: one plan each, far below Shopify's 31-plan group cap.
  const seven = ["Daily", "Weekly", "Every 2 weeks", "Monthly", "Every 2 months", "Every 3 months", "Yearly"].map(frequency => ({ frequency, discount: 0 }));
  assert.deepEqual(validatePlan(form([], true, seven)).errors, {});
});

test("hidden lengths are saved as disabled", () => {
  const { values, errors } = validatePlan(form([{ interval: "MONTH", intervalCount: 3 }], false));
  assert.deepEqual(errors, {});
  assert.equal(values.lengthEnabled, false);
  assert.deepEqual(values.lengthOptions, []);
  assert.deepEqual(planLengths({ ...values, lengthOptions: [{ interval: "UNLIMITED" }] }), []);
});

test("existing plans without length settings stay hidden", () => {
  const data = form([]);
  data.delete("lengthEnabled");
  data.delete("lengthOptions");
  const { values } = validatePlan(data);
  assert.equal("lengthEnabled" in values, false);
  assert.deepEqual(lengthRecord(values), {});
  assert.deepEqual(planLengths({ frequency: "Monthly" }), []);
  assert.deepEqual(planLengths({ lengthEnabled: false, lengthOptionsJson: '[{"interval":"UNLIMITED"}]' }), []);
  assert.deepEqual(planLengths({ lengthEnabled: true, lengthOptionsJson: '[{"interval":"MONTH","intervalCount":3}]' }), [{ interval: "UNLIMITED" }]);
});

test("fixed lengths map to billing cycles and unlimited has no cycle limit", () => {
  assert.equal(lengthCycles({ interval: "MONTH", intervalCount: 3 }, { interval: "MONTH", intervalCount: 1 }), 3);
  assert.equal(lengthCycles({ interval: "MONTH", intervalCount: 12 }, { interval: "MONTH", intervalCount: 3 }), 4);
  assert.equal(lengthCycles({ interval: "WEEK", intervalCount: 4 }, { interval: "WEEK", intervalCount: 2 }), 2);
  assert.equal(lengthCycles({ interval: "MONTH", intervalCount: 1 }, { interval: "WEEK", intervalCount: 1 }), 4);
  assert.equal(lengthCycles({ interval: "DAY", intervalCount: 10 }, { interval: "DAY", intervalCount: 1 }), 10);
  assert.equal(lengthCycles({ interval: "UNLIMITED" }, { interval: "MONTH", intervalCount: 1 }), null);

  const fixed = sellingPlanInput("Coffee", monthly[0], { interval: "MONTH", intervalCount: 3 });
  assert.deepEqual(fixed.options, ["Monthly", "3 months"]);
  assert.deepEqual(fixed.billingPolicy.recurring, { interval: "MONTH", intervalCount: 1, minCycles: 3, maxCycles: 3 });
  assert.deepEqual(fixed.deliveryPolicy.recurring, { interval: "MONTH", intervalCount: 1 });
  const unlimited = sellingPlanInput("Coffee", monthly[0], { interval: "UNLIMITED" });
  assert.deepEqual(unlimited.options, ["Monthly", "Unlimited"]);
  assert.deepEqual(unlimited.billingPolicy.recurring, { interval: "MONTH", intervalCount: 1 });
  assert.equal(unlimited.name, "Coffee — monthly delivery", "the cart line's Subscription length states the count, not the plan name");
  assert.equal(fixed.name, "Coffee — monthly delivery, 3 months");
  assert.deepEqual(sellingPlanInput("Coffee", monthly[0]).options, ["Monthly"]);
  assert.throws(() => sellingPlanInput("Coffee", monthly[0], { interval: "YEAR", intervalCount: 1 }), /Invalid/);
});

test("creation builds one ongoing selling plan per frequency under a second group option", async () => {
  let variables;
  const admin = { graphql: async (_, args) => {
    variables = args.variables;
    return Response.json({ data: { sellingPlanGroupCreate: { sellingPlanGroup: { id: "group", sellingPlans: { nodes: [] } }, userErrors: [] } } });
  } };
  await createSellingPlan(admin, {
    name: "Coffee", productId: "gid://shopify/Product/1", frequency: "Monthly", discount: 10,
    deliveryOptions: [...monthly, { frequency: "Weekly", discount: 5 }],
    lengthEnabled: true, lengthOptionsJson: JSON.stringify([{ interval: "MONTH", intervalCount: 3 }, { interval: "UNLIMITED" }]),
  });
  assert.deepEqual(variables.input.options, ["Delivery frequency", "Subscription length"]);
  assert.deepEqual(variables.input.sellingPlansToCreate.map(p => p.options), [["Monthly", "Unlimited"], ["Weekly", "Unlimited"]]);
  assert.ok(variables.input.sellingPlansToCreate.every(p => !("maxCycles" in p.billingPolicy.recurring)));

  await createSellingPlan(admin, { name: "Coffee", productId: "gid://shopify/Product/1", frequency: "Monthly", discount: 10, lengthEnabled: false, lengthOptionsJson: '[{"interval":"UNLIMITED"}]' });
  assert.deepEqual(variables.input.options, ["Delivery frequency"]);
  assert.deepEqual(variables.input.sellingPlansToCreate.map(p => p.options), [["Monthly"]]);
});

function updateAdmin(remote) {
  const calls = [];
  let n = 0;
  return { calls, admin: { graphql: async (_, args) => {
    if (n++ === 0) return Response.json({ data: { sellingPlanGroup: { id: "group", sellingPlans: { nodes: remote } } } });
    calls.push(args.variables);
    return Response.json({ data: { sellingPlanGroupUpdate: { sellingPlanGroup: { id: "group", sellingPlans: { nodes: [] } }, userErrors: [] } } });
  } } };
}

test("enabling lengths reuses the existing frequency plan and saves the configuration", async () => {
  const { admin, calls } = updateAdmin([{ id: "month", options: ["Monthly"] }]);
  let saved;
  const values = { name: "Coffee", deliveryOptions: monthly, lengthEnabled: true, lengthOptions: [{ interval: "UNLIMITED" }, { interval: "MONTH", intervalCount: 6 }] };
  await changeSubscription({ admin, prisma: { subscriptionPlan: { update: async arg => { saved = arg; } } }, plan: { id: 1, shop: "test", sellingPlanGroupId: "group" }, values });
  const input = calls[0].input;
  assert.deepEqual(input.options, ["Delivery frequency", "Subscription length"]);
  assert.equal(input.sellingPlansToUpdate.length, 1);
  assert.equal(input.sellingPlansToUpdate[0].id, "month");
  assert.deepEqual(input.sellingPlansToUpdate[0].options, ["Monthly", "Unlimited"]);
  assert.deepEqual(input.sellingPlansToUpdate[0].billingPolicy.recurring, { interval: "MONTH", intervalCount: 1, minCycles: null, maxCycles: null });
  assert.deepEqual(input.sellingPlansToCreate, []);
  assert.deepEqual(input.sellingPlansToDelete, []);
  assert.equal(saved.data.lengthEnabled, true);
  assert.deepEqual(JSON.parse(saved.data.lengthOptionsJson), [{ interval: "UNLIMITED" }, { interval: "MONTH", intervalCount: 6 }]);
});

test("disabling lengths collapses back to one plan per frequency", async () => {
  const { admin, calls } = updateAdmin([{ id: "a", options: ["Monthly", "3 months"] }, { id: "b", options: ["Monthly", "Unlimited"] }]);
  await changeSubscription({ admin, prisma: { subscriptionPlan: { update: async () => {} } }, plan: { id: 1, shop: "test", sellingPlanGroupId: "group" }, values: { name: "Coffee", deliveryOptions: monthly, lengthEnabled: false, lengthOptions: [] } });
  const input = calls[0].input;
  assert.deepEqual(input.options, ["Delivery frequency"]);
  assert.deepEqual(input.sellingPlansToUpdate.map(p => [p.id, p.options]), [["a", ["Monthly"]]]);
  assert.equal(input.sellingPlansToUpdate[0].billingPolicy.recurring.maxCycles, null);
  assert.deepEqual(input.sellingPlansToDelete, ["b"]);
});

test("callers without length fields keep the popup on and turn old preset plans ongoing", async () => {
  const { admin, calls } = updateAdmin([{ id: "a", options: ["Monthly", "3 months"] }, { id: "b", options: ["Monthly", "Unlimited"] }]);
  let saved;
  const plan = { id: 1, shop: "test", sellingPlanGroupId: "group", lengthEnabled: true, lengthOptionsJson: '[{"interval":"MONTH","intervalCount":3},{"interval":"UNLIMITED"}]' };
  await changeSubscription({ admin, prisma: { subscriptionPlan: { update: async arg => { saved = arg; } } }, plan, values: { name: "Coffee", frequency: "Monthly", discount: 5, deliveryOptions: [{ frequency: "Monthly", discount: 5 }] } });
  const input = calls[0].input;
  assert.deepEqual(input.sellingPlansToUpdate.map(p => [p.id, p.options, p.billingPolicy.recurring.maxCycles]), [["b", ["Monthly", "Unlimited"], null]]);
  assert.deepEqual(input.sellingPlansToDelete, ["a"]);
  assert.equal("lengthEnabled" in saved.data, false);
});
