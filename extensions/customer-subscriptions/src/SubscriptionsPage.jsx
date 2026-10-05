import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useRef, useState} from "preact/hooks";
import {CONTRACTS, contractLineNodes, loadSubscriptionContracts} from "./subscription-contracts.js";

export default async () => {
  render(<Extension />, document.body);
};

const API = "shopify://customer-account/api/2026-07/graphql.json";
const APP = "https://bundlebase.imranwebstudio.me/api/subscription-payment";

function schedule(policy) {
  const count = policy?.intervalCount?.count;
  const interval = String(policy?.interval || "").toLowerCase();
  if (!count || !interval) return "Scheduled delivery";
  return count === 1 ? `Every ${interval}` : `Every ${count} ${interval}s`;
}

function price(line, currency) {
  const amount = line.currentPrice?.amount;
  const code = line.currentPrice?.currencyCode || currency;
  return amount ? `${amount} ${code}` : "";
}

async function customerApi(query, variables) {
  const response = await fetch(API, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({query, variables}),
  });
  return response.json();
}

function Extension() {
  const [contracts, setContracts] = useState(null);
  const [more, setMore] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState("");
  const requestId = useRef(0);

  async function load({after = null, previous = []} = {}) {
    const id = ++requestId.current;
    try {
      const page = await loadSubscriptionContracts(
        (cursor) => customerApi(CONTRACTS, {after: cursor}),
        {after},
      );
      if (requestId.current !== id) return;
      setContracts(previous.concat(page.contracts));
      setMore(page.after);
    } catch (error) {
      if (requestId.current !== id) return;
      const loaded = previous.concat(error?.contracts || []);
      setContracts(loaded);
      setMore(error?.after || null);
      setMessage(!loaded.length
        ? "Subscriptions could not be loaded. Refresh the page to try again."
        : (error?.after
          ? "Some subscriptions could not be loaded. Show more subscriptions to try again."
          : "Some subscriptions could not be loaded. Refresh the page to try again."));
    }
  }

  useEffect(() => {
    load().catch(() => setContracts([]));
  }, []);

  async function showMore() {
    if (!more || loadingMore) return;
    setLoadingMore(true);
    setMessage("");
    try {
      await load({after: more, previous: contracts || []});
    } finally {
      setLoadingMore(false);
    }
  }

  async function cancel(id) {
    setMessage("");
    const body = await customerApi(
      `mutation CancelSubscription($id: ID!) {
        subscriptionContractCancel(subscriptionContractId: $id) {
          contract { id status }
          userErrors { message }
        }
      }`,
      {id},
    );
    const errors = body.data?.subscriptionContractCancel?.userErrors || [];
    if (body.errors?.length || errors.length) {
      setMessage(errors.map((error) => error.message).join(" ") || "This subscription could not be canceled.");
      return;
    }
    setMessage("This subscription is canceled. No further charges will be made.");
    await load();
  }

  async function payment(id) {
    setMessage("");
    const token = await shopify.sessionToken.get();
    const response = await fetch(APP, {
      method: "POST",
      headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
      body: JSON.stringify({contractId: id}),
    });
    const body = await response.json();
    setMessage(body.ok
      ? "Check your email for a secure link to update the card charged for this subscription."
      : (body.error || "The payment update email could not be sent."));
  }

  if (!contracts) return <s-text>Loading subscriptions…</s-text>;

  return (
    <s-page heading="Subscriptions" subheading="Products, delivery schedule, price, and the next charge">
      <s-stack direction="block" gap="base">
        {message ? <s-banner tone="info">{message}</s-banner> : null}
        {contracts.length === 0 && !message ? <s-text>You do not have any subscriptions yet.</s-text> : null}
        {contracts.map((contract) => {
          const lines = contractLineNodes(contract);
          return (
          <s-section key={contract.id} heading={lines[0]?.title || "Subscription"}>
            <s-stack direction="block" gap="base">
              <s-text>Status: {contract.status}</s-text>
              <s-text>Delivery: {schedule(contract.deliveryPolicy)}</s-text>
              <s-text>Next charge: {contract.nextBillingDate || "Not scheduled"}</s-text>
              {lines.map((line) => (
                <s-text key={line.id}>
                  {line.quantity} × {line.title}{line.variantTitle ? ` (${line.variantTitle})` : ""} · {price(line, contract.currencyCode)}
                </s-text>
              ))}
              {contract.status !== "CANCELLED" ? (
                <s-button-group>
                  <s-button onClick={() => payment(contract.id)}>Update payment method</s-button>
                  <s-button onClick={() => cancel(contract.id)}>Cancel subscription</s-button>
                </s-button-group>
              ) : null}
            </s-stack>
          </s-section>
          );
        })}
        {more ? (
          <s-button disabled={loadingMore} onClick={showMore}>
            {loadingMore ? "Loading more subscriptions…" : "Show more subscriptions"}
          </s-button>
        ) : null}
      </s-stack>
    </s-page>
  );
}
