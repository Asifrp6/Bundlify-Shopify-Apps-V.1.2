import test from "node:test";
import assert from "node:assert/strict";
import { validatePlan, validateBundle } from "../app/services/validation.js";
import { createSubscription } from "../app/services/subscriptions.server.js";
import {
  createSellingPlan,
  CREATE_SELLING_PLAN,
  DELETE_SELLING_PLAN,
} from "../app/services/sellingPlan.server.js";
import { listProducts, getProducts } from "../app/services/products.server.js";

const product = { id: "gid://shopify/Product/1", title: "Coffee" };
const values = {
  name: "Coffee club",
  productId: product.id,
  frequency: "Monthly",
  discount: 10,
};
const groupId = "gid://shopify/SellingPlanGroup/12";
const form = (entries) => {
  const result = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value])
      result.append(key, String(item));
  }
  return result;
};

test("plan validation rejects missing, out-of-range, fractional, and non-finite discounts", () => {
  for (const discount of ["", -1, 101, 2.5, "NaN", "Infinity"]) {
    assert.ok(validatePlan(form({ ...values, discount })).errors.discount);
  }
  for (const discount of [0, 100])
    assert.deepEqual(validatePlan(form({ ...values, discount })).errors, {});
});

test("plan validation rejects invalid names, products, and billing frequencies", () => {
  assert.deepEqual(
    Object.keys(
      validatePlan(
        form({ ...values, name: " ", productId: "1", frequency: "Hourly" }),
      ).errors,
    ).sort(),
    ["frequency", "name", "productId"],
  );
});

test("bundle validation requires distinct Shopify products", () => {
  assert.ok(
    validateBundle(form({ ...values, productIds: [product.id, product.id] }))
      .errors.productIds,
  );
  const valid = validateBundle(
    form({
      ...values,
      productIds: [product.id, "gid://shopify/Product/2", product.id],
    }),
  );
  assert.deepEqual(valid.errors, {});
  assert.equal(valid.values.productIds.length, 2);
});

test("selling plans associate products and match delivery and billing intervals", async () => {
  for (const [frequency, interval] of [
    ["Weekly", "WEEK"],
    ["Monthly", "MONTH"],
    ["Yearly", "YEAR"],
  ]) {
    const admin = {
      graphql: async (document, { variables }) => {
        assert.equal(document, CREATE_SELLING_PLAN);
        assert.deepEqual(variables.resources.productIds, [product.id]);
        const plan = variables.input.sellingPlansToCreate[0];
        assert.deepEqual(plan.billingPolicy.recurring, {
          interval,
          intervalCount: 1,
        });
        assert.deepEqual(
          plan.deliveryPolicy.recurring,
          plan.billingPolicy.recurring,
        );
        assert.equal(
          plan.pricingPolicies[0].fixed.adjustmentValue.percentage,
          10,
        );
        return Response.json({
          data: {
            sellingPlanGroupCreate: {
              sellingPlanGroup: { id: groupId },
              userErrors: [],
            },
          },
        });
      },
    };
    assert.deepEqual(
      await createSellingPlan(admin, {
        ...values,
        frequency,
        merchantCode: "bundlify-1",
      }),
      { id: groupId },
    );
  }
});

function fixture({
  rejection = false,
  transportError = false,
  databaseError = false,
  rollbackError = false,
} = {}) {
  const calls = [];
  const prisma = {
    subscriptionPlan: {
      create: async ({ data }) => {
        calls.push(["create", data]);
        return { id: 1, ...data };
      },
      update: async ({ data }) => {
        calls.push(["update", data]);
        if (databaseError && data.status === "ACTIVE")
          throw new Error("database unavailable");
        return { id: 1, ...data };
      },
      deleteMany: async ({ where }) => {
        calls.push(["delete", where]);
        return { count: 1 };
      },
    },
  };
  const admin = {
    graphql: async (document) => {
      if (document === CREATE_SELLING_PLAN) {
        calls.push(["remote create"]);
        if (transportError) throw new Error("connection lost");
        return Response.json({
          data: {
            sellingPlanGroupCreate: {
              sellingPlanGroup: rejection ? null : { id: groupId },
              userErrors: rejection ? [{ message: "Not permitted" }] : [],
            },
          },
        });
      }
      assert.equal(document, DELETE_SELLING_PLAN);
      calls.push(["remote delete"]);
      if (rollbackError) throw new Error("connection lost");
      return Response.json({
        data: {
          sellingPlanGroupDelete: {
            deletedSellingPlanGroupId: groupId,
            userErrors: [],
          },
        },
      });
    },
  };
  return {
    args: { prisma, admin, shop: "test.myshopify.com", values, product },
    calls,
  };
}

test("subscription becomes active only after Shopify confirms creation", async () => {
  const { args, calls } = fixture();
  const result = await createSubscription(args);
  assert.equal(calls[0][1].status, "PENDING");
  assert.equal(calls[0][1].shop, args.shop);
  assert.deepEqual(
    calls.map(([name]) => name),
    ["create", "remote create", "update"],
  );
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.sellingPlanGroupId, groupId);
});

test("Shopify user errors remove the pending record and do not report success", async () => {
  const { args, calls } = fixture({ rejection: true });
  await assert.rejects(createSubscription(args), /Not permitted/);
  assert.deepEqual(calls.at(-1), ["delete", { id: 1, shop: args.shop }]);
  assert.ok(!calls.some(([name]) => name === "update"));
});

test("an unknown remote outcome keeps a pending recovery record", async () => {
  const { args, calls } = fixture({ transportError: true });
  await assert.rejects(createSubscription(args), /connection lost/);
  assert.deepEqual(
    calls.map(([name]) => name),
    ["create", "remote create"],
  );
});

test("a failed local save rolls back the newly created Shopify group", async () => {
  const { args, calls } = fixture({ databaseError: true });
  await assert.rejects(createSubscription(args), (error) =>
    /rolled back/.test(error.publicMessage),
  );
  assert.deepEqual(
    calls.slice(-2).map(([name]) => name),
    ["remote delete", "delete"],
  );
});

test("a failed rollback retains the Shopify ID for recovery", async () => {
  const { args, calls } = fixture({ databaseError: true, rollbackError: true });
  await assert.rejects(createSubscription(args), (error) =>
    error.publicMessage.includes(groupId),
  );
  assert.deepEqual(calls.at(-1), [
    "update",
    { sellingPlanGroupId: groupId, status: "PENDING" },
  ]);
  assert.ok(!calls.some(([name]) => name === "delete"));
});

test("product loading follows every page", async () => {
  let page = 0;
  const admin = {
    graphql: async (_document, { variables }) => {
      assert.equal(variables.after, page ? "cursor-1" : null);
      page += 1;
      return Response.json({
        data: {
          products: {
            nodes: [{ id: String(page), title: "Product" }],
            pageInfo: { hasNextPage: page === 1, endCursor: "cursor-1" },
          },
        },
      });
    },
  };
  assert.equal((await listProducts(admin)).length, 2);
});

test("product loading rejects API errors and broken pagination", async () => {
  await assert.rejects(
    listProducts({
      graphql: async () => Response.json({ errors: [{ message: "Denied" }] }),
    }),
  );
  await assert.rejects(
    listProducts({
      graphql: async () =>
        Response.json({
          data: {
            products: {
              nodes: [],
              pageInfo: { hasNextPage: true, endCursor: null },
            },
          },
        }),
    }),
    /pagination/,
  );
});

test("product verification excludes missing and non-product nodes", async () => {
  const admin = {
    graphql: async () =>
      Response.json({ data: { nodes: [product, null, {}] } }),
  };
  assert.deepEqual(
    await getProducts(admin, [product.id, "gid://shopify/Product/2"]),
    [product],
  );
});
