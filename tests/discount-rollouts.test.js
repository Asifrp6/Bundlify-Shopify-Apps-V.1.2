import test from "node:test";
import assert from "node:assert/strict";
import {
  DISCOUNT_ROLLOUT_API_VERSION,
  combineDiscountSchedule,
  discountChangeFilter,
  hasReadRollouts,
  readBundleDiscounts,
} from "../app/services/discount-rollouts.server.js";
import { reconcileSavedResources } from "../app/services/reinstall.server.js";

const now = new Date("2026-06-01T00:00:00.000Z");
const discountId = "gid://shopify/DiscountAutomaticNode/42";

function discount(overrides = {}) {
  return {
    id: discountId,
    status: "ACTIVE",
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-12-31T00:00:00.000Z",
    rollouts: [],
    ...overrides,
  };
}

function rollout(overrides = {}) {
  return {
    id: "gid://shopify/Rollout/7",
    name: "Launch",
    status: "ACTIVE",
    schedule: { activateAt: "2026-05-01T00:00:00.000Z", concludeAt: "2026-10-08T00:00:00.000Z" },
    effectiveTrafficAllocation: 100,
    treatments: [{
      split: 100,
      changes: [{ __typename: "RolloutDiscountActivateChange", discountId }],
    }],
    ...overrides,
  };
}

test("discount reads require read_rollouts and filter changes for that discount", () => {
  assert.equal(hasReadRollouts("write_discounts,read_rollouts"), true);
  assert.equal(hasReadRollouts(["write_discounts"]), false);
  assert.equal(discountChangeFilter(discountId), "discount_id:42");
  assert.equal(DISCOUNT_ROLLOUT_API_VERSION, "2026-10");
});

test("a discount with no rollout follows its own start and end", () => {
  const live = combineDiscountSchedule(discount(), now);
  assert.equal(live.ownActive, true);
  assert.equal(live.reachesEveryBuyer, true);
  assert.equal(live.buyerReach, 100);
  assert.equal(live.note, null);
  assert.equal(live.buyerNote, null);
  assert.equal(live.nextChangeAt, "2026-12-31T00:00:00.000Z");

  const scheduled = combineDiscountSchedule(discount({ startsAt: "2026-11-01T00:00:00.000Z", status: "SCHEDULED" }), now);
  assert.equal(scheduled.ownActive, false);
  assert.equal(scheduled.reachesEveryBuyer, false);
  assert.equal(scheduled.buyerReach, 0);
  assert.equal(scheduled.nextChangeAt, "2026-11-01T00:00:00.000Z");

  const expired = combineDiscountSchedule(discount({ endsAt: "2026-05-01T00:00:00.000Z", status: "EXPIRED" }), now);
  assert.equal(expired.reachesEveryBuyer, false);
  assert.equal(expired.buyerReach, 0);
});

test("a live activation rollout reaches buyers before the discount's own start", () => {
  const result = combineDiscountSchedule(discount({
    startsAt: "2026-11-01T00:00:00.000Z",
    endsAt: null,
    status: "SCHEDULED",
    rollouts: [rollout()],
  }), now);
  assert.equal(result.ownActive, false);
  assert.equal(result.reachesEveryBuyer, true);
  assert.equal(result.buyerReach, 100);
  assert.equal(result.buyerNote, null);
  assert.equal(result.nextChangeAt, "2026-10-08T00:00:00.000Z");
  assert.match(result.note, /Rollout "Launch" is live and reaches 100% of buyers until Oct 8, 2026/);
  assert.match(result.note, /own dates start Nov 1, 2026 and stay open/);
});

test("a live expiration rollout holds an otherwise active discount", () => {
  const result = combineDiscountSchedule(discount({
    rollouts: [rollout({
      treatments: [{ split: 100, changes: [{ __typename: "RolloutDiscountExpireChange", discountId }] }],
    })],
  }), now);
  assert.equal(result.ownActive, true);
  assert.equal(result.reachesEveryBuyer, false);
  assert.equal(result.buyerReach, 0);
  assert.equal(result.limited, true);
  assert.equal(result.buyerNote, "Held during a live rollout");
  assert.match(result.note, /until Oct 8, 2026 with 100% of buyer traffic/);
  assert.match(result.note, /reaches 0% of buyers/);
  assert.match(result.note, /own dates run Jan 1, 2026 through Dec 31, 2026/);
});

test("traffic outside a rollout still follows the discount's own dates", () => {
  const partial = combineDiscountSchedule(discount({
    startsAt: "2026-11-01T00:00:00.000Z",
    status: "SCHEDULED",
    rollouts: [rollout({ effectiveTrafficAllocation: 40 })],
  }), now);
  assert.equal(partial.buyerReach, 40);
  assert.equal(partial.reachesEveryBuyer, false);
  assert.equal(partial.buyerNote, "Live for 40% of buyers");

  const covered = combineDiscountSchedule(discount({
    rollouts: [rollout({ effectiveTrafficAllocation: 40 })],
  }), now);
  assert.equal(covered.buyerReach, 100);
  assert.equal(covered.reachesEveryBuyer, true);
  assert.match(covered.note, /with 40% of buyer traffic/);
  assert.match(covered.note, /reaches 100% of buyers/);
});

test("a rollout whose conclude time has passed leaves the discount on its own dates", () => {
  const result = combineDiscountSchedule(discount({
    rollouts: [rollout({ schedule: { activateAt: "2026-01-01T00:00:00.000Z", concludeAt: "2026-05-01T00:00:00.000Z" } })],
  }), now);
  assert.equal(result.reachesEveryBuyer, true);
  assert.equal(result.note, null);
  assert.equal(result.limited, false);
});

test("a scheduled rollout does not change current reach and sets the next change", () => {
  const result = combineDiscountSchedule(discount({
    rollouts: [rollout({
      status: "SCHEDULED",
      schedule: { activateAt: "2026-07-04T00:00:00.000Z", concludeAt: "2026-07-20T00:00:00.000Z" },
    })],
  }), now);
  assert.equal(result.reachesEveryBuyer, true);
  assert.equal(result.buyerReach, 100);
  assert.equal(result.buyerNote, null);
  assert.equal(result.nextChangeAt, "2026-07-04T00:00:00.000Z");
  assert.match(result.note, /scheduled to start Jul 4, 2026/);
  assert.match(result.note, /own dates until then/);
});

test("an incomplete rollout picture stays limited", () => {
  const result = combineDiscountSchedule(discount({
    rolloutsIncomplete: true,
    rollouts: [rollout()],
  }), now);
  assert.equal(result.buyerReach, null);
  assert.equal(result.reachesEveryBuyer, false);
  assert.equal(result.buyerNote, "Limited to selected buyers");
  assert.match(result.note, /buyers included in that rollout/);
});

test("rollout reads use Admin API 2026-10 and page through the connection", async () => {
  const calls = [];
  const page = (hasNextPage, rolloutNode) => ({
    data: { node: { id: discountId, automaticDiscount: {
      status: "SCHEDULED",
      startsAt: "2026-11-01T00:00:00.000Z",
      endsAt: null,
      rollouts: { pageInfo: { hasNextPage, endCursor: hasNextPage ? "cursor-2" : null }, nodes: [rolloutNode] },
    } } },
  });
  const admin = { graphql: async (query, options) => {
    calls.push({ query, options });
    const first = calls.length === 1;
    return { json: async () => page(first, {
      id: first ? "gid://shopify/Rollout/1" : "gid://shopify/Rollout/2",
      name: first ? "Later" : "Launch",
      status: first ? "SCHEDULED" : "ACTIVE",
      schedule: first
        ? { activateAt: "2026-12-01T00:00:00.000Z", concludeAt: "2026-12-31T00:00:00.000Z" }
        : { activateAt: "2026-05-01T00:00:00.000Z", concludeAt: "2026-10-08T00:00:00.000Z" },
      effectiveTrafficAllocation: 100,
      treatments: [{
        id: "gid://shopify/RolloutTreatment/1",
        split: 100,
        changes: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [{ __typename: "RolloutDiscountActivateChange", id: "gid://shopify/RolloutChange/1", discount: { id: discountId } }],
        },
      }],
    }) };
  } };
  const found = await readBundleDiscounts(admin, [discountId], { scopes: "write_discounts,read_rollouts", now });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.apiVersion, "2026-10");
  assert.match(calls[0].query, /rollouts\(first: 10/);
  assert.equal(calls[0].options.variables.changeFilter, "discount_id:42");
  assert.equal(calls[1].options.variables.cursor, "cursor-2");
  assert.equal(calls[0].query.includes("BundleDiscountWindows"), false);
  const availability = found.get(discountId).availability;
  assert.equal(found.get(discountId).present, true);
  assert.equal(availability.reachesEveryBuyer, true);
  assert.match(availability.note, /Rollout "Launch" is live/);
});

test("a missing rollout scope reads the discount dates without the rollouts field", async () => {
  const calls = [];
  const admin = { graphql: async (query, options) => {
    calls.push({ query, options });
    if (String(query).includes("rollouts(")) throw Object.assign(new Error("ACCESS_DENIED"), { graphqlErrors: [{ extensions: { code: "ACCESS_DENIED" } }] });
    return { json: async () => ({ data: { nodes: [{ id: discountId, discount: { status: "ACTIVE", startsAt: "2026-01-01T00:00:00.000Z", endsAt: null } }] } }) };
  } };
  const withScope = await readBundleDiscounts(admin, [discountId], { scopes: "read_rollouts", now });
  assert.match(calls[0].query, /rollouts\(/);
  assert.match(calls[1].query, /BundleDiscountWindows/);
  assert.equal(calls[1].query.includes("rollouts("), false);
  assert.equal(withScope.get(discountId).availability.reachesEveryBuyer, true);

  calls.length = 0;
  const withoutScope = await readBundleDiscounts(admin, [discountId], { scopes: "write_discounts", now });
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /BundleDiscountWindows/);
  assert.equal(withoutScope.get(discountId).availability.note, null);
});

test("reconciliation keeps a discount that a rollout still returns and drafts one that is gone", async () => {
  const keptId = "gid://shopify/DiscountAutomaticNode/1";
  const goneId = "gid://shopify/DiscountAutomaticNode/2";
  const updates = [];
  const queries = [];
  const db = {
    bundle: {
      findMany: async () => [
        { id: 1, discountNodeId: keptId },
        { id: 2, discountNodeId: goneId },
      ],
      updateMany: async args => { updates.push(args); return { count: 1 }; },
    },
    subscriptionPlan: { findMany: async () => [{ id: 9, sellingPlanGroupId: "gid://shopify/SellingPlanGroup/3" }] },
    deliveryOption: { updateMany: async () => ({ count: 0 }) },
    $transaction: async fn => fn(db),
  };
  const admin = { graphql: async (query, options) => {
    queries.push(query);
    if (String(query).includes("BundleDiscountRollouts")) {
      const present = options.variables.id === keptId;
      return { json: async () => ({ data: { node: present ? {
        id: keptId,
        automaticDiscount: {
          status: "ACTIVE",
          startsAt: "2026-01-01T00:00:00.000Z",
          endsAt: null,
          rollouts: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
        },
      } : null } }) };
    }
    return { json: async () => ({ data: { nodes: [{ id: "gid://shopify/SellingPlanGroup/3" }] } }) };
  } };
  await reconcileSavedResources({ db, admin, shop: "shop.myshopify.com", scopes: "read_rollouts" });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].where.id, 2);
  assert.equal(updates[0].data.discountNodeId, null);
  assert.ok(queries.some(query => query.includes("BundleDiscountRollouts")));
  assert.ok(queries.some(query => query.includes("BundlifySavedResources")));
});
