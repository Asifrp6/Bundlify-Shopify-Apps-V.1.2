import "@shopify/ui-extensions/preact";
import {render} from "preact";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  return (
    <s-section heading="Subscriptions">
      <s-stack direction="block" gap="base">
        <s-text>See every subscription, including the product, price, delivery frequency, and next charge.</s-text>
        <s-button onClick={() => shopify.navigation.navigate("extension:customer-subscriptions")}>
          Manage subscriptions
        </s-button>
      </s-stack>
    </s-section>
  );
}
