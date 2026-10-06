import test from "node:test";
import assert from "node:assert/strict";
import { groupIdsForPlan } from "../app/services/sellingPlan.server.js";
import { changeSubscription } from "../app/services/subscription-management.server.js";

test("delete targets the saved group and any group created for that plan", () => {
  const ids = groupIdsForPlan(
    { id: 34, sellingPlanGroupId: "gid://shopify/SellingPlanGroup/saved" },
    [
      { id: "gid://shopify/SellingPlanGroup/other", merchantCode: "bundlify-35" },
      { id: "gid://shopify/SellingPlanGroup/match", merchantCode: "bundlify-34" },
      { id: "gid://shopify/SellingPlanGroup/saved", merchantCode: "bundlify-34" },
    ],
  );
  assert.deepEqual(ids, [
    "gid://shopify/SellingPlanGroup/saved",
    "gid://shopify/SellingPlanGroup/match",
  ]);
});

test("deleting a plan removes its Shopify groups before the local row", async () => {
  const deleted = [];
  let local = false;
  const admin = {
    graphql: async (query, args) => {
      if (query.includes("BundlifyAppGroups")) {
        return Response.json({ data: { sellingPlanGroups: { nodes: [
          { id: "gid://shopify/SellingPlanGroup/saved", merchantCode: "bundlify-34" },
          { id: "gid://shopify/SellingPlanGroup/weekly", merchantCode: "bundlify-99" },
        ], pageInfo: { hasNextPage: false, endCursor: null } } } });
      }
      deleted.push(args.variables.id);
      return Response.json({ data: { sellingPlanGroupDelete: { deletedSellingPlanGroupId: args.variables.id, userErrors: [] } } });
    },
  };
  await changeSubscription({
    admin,
    prisma: { subscriptionPlan: { deleteMany: async () => { local = true; return { count: 1 }; } } },
    plan: { id: 34, shop: "test.myshopify.com", sellingPlanGroupId: "gid://shopify/SellingPlanGroup/saved" },
    values: {},
    remove: true,
  });
  assert.deepEqual(deleted, ["gid://shopify/SellingPlanGroup/saved"]);
  assert.equal(local, true);
});

test("a Shopify delete failure keeps the local plan", async () => {
  const admin = {
    graphql: async (query) => Response.json(query.includes("BundlifyAppGroups")
      ? { data: { sellingPlanGroups: { nodes: [{ id: "gid://shopify/SellingPlanGroup/saved", merchantCode: "bundlify-34" }], pageInfo: { hasNextPage: false } } } }
      : { data: { sellingPlanGroupDelete: { userErrors: [{ message: "Denied" }] } } }),
  };
  await assert.rejects(changeSubscription({
    admin,
    prisma: { subscriptionPlan: { deleteMany: () => assert.fail("must not delete locally") } },
    plan: { id: 34, shop: "test.myshopify.com", sellingPlanGroupId: "gid://shopify/SellingPlanGroup/saved" },
    values: {},
    remove: true,
  }), /Shopify selling plan/);
});
