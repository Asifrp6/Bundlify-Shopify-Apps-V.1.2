import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useState} from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
};

const APP = "https://bundlify.imranwebstudio.me/api/product-plans";
const FREQUENCIES = ["Weekly", "Every 2 weeks", "Monthly", "Every 2 months", "Every 3 months", "Yearly"];

async function appCall(body) {
  const token = shopify.auth?.idToken ? await shopify.auth.idToken() : await shopify.sessionToken.get();
  const response = await fetch(APP, {
    method: "POST",
    headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "The subscription plan could not be saved.");
  return payload;
}

function Extension() {
  const productId = shopify.data.selected[0]?.id;
  const [variants, setVariants] = useState([]);
  const [selected, setSelected] = useState([]);
  const [plans, setPlans] = useState([]);
  const [name, setName] = useState("Subscribe and save");
  const [frequency, setFrequency] = useState("Monthly");
  const [discount, setDiscount] = useState("10");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const payload = await appCall({intent: "list", productId});
    setVariants(payload.variants || []);
    setPlans(payload.plans || []);
    setSelected((payload.variants || []).map((variant) => variant.id));
  }

  useEffect(() => {
    if (productId) load().catch((error) => setMessage(error.message));
  }, [productId]);

  function toggle(id) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function run(body) {
    setBusy(true);
    setMessage("");
    try {
      await appCall({productId, variantIds: selected.length === variants.length ? [] : selected, ...body});
      await load();
      setMessage("Saved.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (!productId) return <s-text>Open a product to manage its subscription.</s-text>;

  return (
    <s-admin-block heading="Bundlify subscriptions">
      <s-stack direction="block" gap="base">
        {message ? <s-banner tone="info">{message}</s-banner> : null}
        <s-text type="strong">Variants on the new plan</s-text>
        {variants.map((variant) => (
          <s-checkbox
            key={variant.id}
            label={variant.title}
            checked={selected.includes(variant.id)}
            onChange={() => toggle(variant.id)}
          />
        ))}
        <s-text-field label="Plan name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
        <s-select label="Delivery frequency" value={frequency} onChange={(event) => setFrequency(event.currentTarget.value)}>
          {FREQUENCIES.map((option) => <s-option key={option} value={option}>{option}</s-option>)}
        </s-select>
        <s-number-field label="Discount percent" value={discount} min={0} max={100} onChange={(event) => setDiscount(event.currentTarget.value)} />
        <s-button disabled={busy} onClick={() => run({intent: "create", name, frequency, discount: Number(discount)})}>Create subscription</s-button>
        {plans.map((plan) => (
          <s-stack key={plan.id} direction="block" gap="small">
            <s-text type="strong">{plan.name}</s-text>
            <s-text>{plan.status} · {plan.frequency} · {plan.discount}%</s-text>
            <s-button-group>
              <s-button disabled={busy} onClick={() => run({intent: "update", planId: plan.id, frequency, discount: Number(discount)})}>Update schedule</s-button>
              <s-button disabled={busy} onClick={() => run({intent: "remove", planId: plan.id})}>Remove from product</s-button>
            </s-button-group>
          </s-stack>
        ))}
      </s-stack>
    </s-admin-block>
  );
}
