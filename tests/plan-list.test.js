import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPlan,
  listProductPlans,
} from "../app/services/plan-list.server.js";

const connection = (nodes, cursor = null) => ({
  nodes,
  pageInfo: { hasNextPage: !!cursor, endCursor: cursor },
});
test("Admin pricing policies map percentage, fixed discounts, and fixed prices", () => {
  for (const [adjustmentType, adjustmentValue, expected] of [
    [
      "PERCENTAGE",
      { percentage: 0 },
      {
        discountType: "percentage",
        discountValue: 0,
        fixedPrice: null,
        currencyCode: null,
      },
    ],
    [
      "FIXED_AMOUNT",
      { amount: "5.00", currencyCode: "CAD" },
      {
        discountType: "fixed_amount",
        discountValue: "5.00",
        fixedPrice: null,
        currencyCode: "CAD",
      },
    ],
    [
      "PRICE",
      { amount: "20.00", currencyCode: "EUR" },
      {
        discountType: "fixed_price",
        discountValue: null,
        fixedPrice: "20.00",
        currencyCode: "EUR",
      },
    ],
  ]) {
    const result = formatPlan(
      { pricingPolicies: [{ adjustmentType, adjustmentValue }] },
      {},
    );
    for (const [key, value] of Object.entries(expected))
      assert.equal(result[key], value);
  }
});
test("plan listing follows both group and selling plan pagination", async () => {
  const calls = [];
  const responses = [
    {
      product: {
        id: "p",
        title: "Coffee",
        sellingPlanGroups: connection(
          [
            {
              id: "g1",
              name: "First",
              sellingPlans: connection([{ id: "s1" }], "plans-next"),
            },
          ],
          "groups-next",
        ),
      },
    },
    { sellingPlanGroup: { sellingPlans: connection([{ id: "s2" }]) } },
    {
      product: {
        id: "p",
        title: "Coffee",
        sellingPlanGroups: connection([
          {
            id: "g2",
            name: "Second",
            sellingPlans: connection([{ id: "s3" }]),
          },
        ]),
      },
    },
  ];
  const admin = {
    graphql: async (_, { variables }) => {
      calls.push(variables);
      return Response.json({ data: responses.shift() });
    },
  };
  const result = await listProductPlans(admin, "p");
  assert.deepEqual(
    result.plans.map((plan) => plan.id),
    ["s1", "s2", "s3"],
  );
  assert.deepEqual(calls, [
    { productId: "p", after: null },
    { id: "g1", after: "plans-next" },
    { productId: "p", after: "groups-next" },
  ]);
});
test("plan listing rejects API failures and repeated cursors", async () => {
  await assert.rejects(
    listProductPlans(
      {
        graphql: async () => Response.json({ errors: [{ message: "Denied" }] }),
      },
      "p",
    ),
    /Unable/,
  );
  await assert.rejects(
    listProductPlans(
      {
        graphql: async () =>
          Response.json({
            data: { product: { sellingPlanGroups: connection([], "repeat") } },
          }),
      },
      "p",
    ),
    /pagination/,
  );
  assert.equal(
    await listProductPlans(
      { graphql: async () => Response.json({ data: { product: null } }) },
      "missing",
    ),
    null,
  );
});
