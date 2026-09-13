import test from "node:test";
import assert from "node:assert/strict";
import { listProducts } from "../app/services/products.server.js";
import { billContract, runRecurringBilling } from "../app/services/recurring-billing.server.js";

const shop = "test.myshopify.com";
const now = new Date("2026-03-01T00:00:00Z");
const contract = { id: "gid://shopify/SubscriptionContract/1", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z" };

for (const [name, field, run] of [
  ["products", "products", (admin) => listProducts(admin)],
  ["contracts", "subscriptionContracts", (admin) => runRecurringBilling({ admin, shop, now })],
  ["billing cycles", "subscriptionBillingCycles", (admin) => billContract({ admin, shop, now, contract })],
]) {
  test(`${name} rejects multi-page cursor loops`, async () => {
    let calls = 0;
    const admin = { graphql: async () => {
      if (++calls > 3) throw new Error("Pagination continued after the loop");
      return Response.json({ data: { [field]: {
        nodes: [], pageInfo: { hasNextPage: true, endCursor: calls === 2 ? "B" : "A" },
      } } });
    } };
    await assert.rejects(run(admin), /Invalid .* (pagination|cursor)/);
    assert.equal(calls, 3);
  });

  test(`${name} rejects malformed node collections`, async () => {
    const admin = { graphql: async () => Response.json({ data: { [field]: {
      nodes: {}, pageInfo: { hasNextPage: false },
    } } }) };
    await assert.rejects(run(admin), /Invalid .* (response|pagination)/);
  });
}
