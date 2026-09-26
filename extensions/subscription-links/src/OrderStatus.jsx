import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useState} from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const orderId = shopify.order?.value?.id;
    if (!orderId) return;
    fetch("shopify://customer-account/api/2026-07/graphql.json", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        query: `query OrderSubscriptions($id: ID!) {
          order(id: $id) { subscriptionContracts(first: 1) { nodes { id } } }
        }`,
        variables: {id: orderId},
      }),
    })
      .then((response) => response.json())
      .then((body) => setShow(Boolean(body.data?.order?.subscriptionContracts?.nodes?.length)))
      .catch(() => setShow(false));
  }, []);

  if (!show) return null;

  return (
    <s-section heading="Subscription">
      <s-stack direction="block" gap="base">
        <s-text>View the product, price, delivery schedule, update the payment method, or cancel.</s-text>
        <s-button onClick={() => shopify.navigation.navigate("extension:customer-subscriptions")}>
          Manage subscription
        </s-button>
      </s-stack>
    </s-section>
  );
}
