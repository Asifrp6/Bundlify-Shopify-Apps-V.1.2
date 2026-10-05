import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACTS,
  contractLineNodes,
  loadSubscriptionContracts,
  nextSubscriptionCursor,
} from "../extensions/customer-subscriptions/src/subscription-contracts.js";

function page(nodes, {hasNextPage = false, endCursor = null} = {}) {
  return {nodes, pageInfo: {hasNextPage, endCursor}};
}

function response(connection) {
  return {data: {customer: {subscriptionContracts: connection}}};
}

test("the customer portal query pages subscription contracts and reads line nodes", () => {
  assert.match(CONTRACTS, /subscriptionContracts\(first: 20, after: \$after\)/);
  assert.match(CONTRACTS, /pageInfo \{ hasNextPage endCursor \}/);
  assert.match(CONTRACTS, /lines\(first: 10\) \{\s*nodes \{ id title/);
});

test("line items come from the connection nodes", () => {
  const line = {id: "line-1", title: "Coffee"};
  const connection = {nodes: [line], pageInfo: {hasNextPage: false, endCursor: null}};
  assert.deepEqual(contractLineNodes({lines: connection}), [line]);
  assert.deepEqual(contractLineNodes({lines: connection}).map((item) => item.title), ["Coffee"]);
  assert.deepEqual(contractLineNodes({lines: {pageInfo: {hasNextPage: true}}}), []);
  assert.deepEqual(contractLineNodes({}), []);
  assert.deepEqual(contractLineNodes({lines: null}), []);
});

test("every subscription page is loaded, including past the first 20", async () => {
  const first = Array.from({length: 20}, (_, index) => ({id: `c${index + 1}`}));
  const rest = [{id: "c21"}, {id: "c22"}];
  const requested = [];
  const result = await loadSubscriptionContracts(async (after) => {
    requested.push(after);
    if (after == null) return response(page(first, {hasNextPage: true, endCursor: "cursor-2"}));
    assert.equal(after, "cursor-2");
    return response(page(rest, {hasNextPage: false, endCursor: "cursor-3"}));
  });

  assert.deepEqual(requested, [null, "cursor-2"]);
  assert.equal(result.contracts.length, 22);
  assert.deepEqual(result.contracts.slice(-2).map((contract) => contract.id), ["c21", "c22"]);
  assert.equal(result.after, null);
});

test("a full page cap returns the next cursor instead of dropping the rest", async () => {
  const result = await loadSubscriptionContracts(async () => {
    return response(page([{id: "c1"}], {hasNextPage: true, endCursor: "more"}));
  }, {maxPages: 1});

  assert.deepEqual(result.contracts.map((contract) => contract.id), ["c1"]);
  assert.equal(result.after, "more");
});

test("a repeated cursor stops paging and keeps contracts already loaded", async () => {
  const seen = new Set();
  const first = page([{id: "c1"}], {hasNextPage: true, endCursor: "A"});
  nextSubscriptionCursor(first, seen);
  assert.throws(() => nextSubscriptionCursor(page([{id: "c2"}], {hasNextPage: true, endCursor: "A"}), seen), /Invalid subscription pagination/);

  await assert.rejects(loadSubscriptionContracts(async (after) => {
    if (after == null) return response(page([{id: "c1"}], {hasNextPage: true, endCursor: "A"}));
    return response(page([{id: "c2"}], {hasNextPage: true, endCursor: "A"}));
  }), (error) => {
    assert.equal(error.message, "Invalid subscription pagination.");
    assert.deepEqual(error.contracts.map((contract) => contract.id), ["c1", "c2"]);
    assert.equal(error.after, null);
    return true;
  });
});

test("a failed later page keeps earlier contracts and the cursor to retry", async () => {
  await assert.rejects(loadSubscriptionContracts(async (after) => {
    if (after == null) return response(page([{id: "c1"}], {hasNextPage: true, endCursor: "next"}));
    return {errors: [{message: "Throttled"}]};
  }), (error) => {
    assert.equal(error.message, "Throttled");
    assert.deepEqual(error.contracts.map((contract) => contract.id), ["c1"]);
    assert.equal(error.after, "next");
    return true;
  });
});
