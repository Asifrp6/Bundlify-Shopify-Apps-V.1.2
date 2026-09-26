/* eslint-disable react/prop-types -- Internal controlled form component. */
import { BlockStack, Button, InlineStack, Select, TextField } from "@shopify/polaris";
import { schedules } from "../services/delivery-options";
// Options are submitted as one validated payload; Shopify IDs are never trusted from the browser.
// eslint-disable-next-line react/prop-types
export default function DeliveryOptions({ options, onChange, maxOptions = 7 }) {
  const change = (index, key, value) => onChange(options.map((option, i) => i === index ? { ...option, [key]: value } : option));
  return <BlockStack gap="300">
    <input type="hidden" name="deliveryOptions" value={JSON.stringify(options)} />
    {options.map((option, index) => <InlineStack key={index} gap="200" blockAlign="end">
      <Select label="Delivery frequency" value={option.frequency} options={Object.keys(schedules)} onChange={value => change(index, "frequency", value)} />
      <TextField label="Discount" type="number" min={0} max={100} suffix="%" autoComplete="off" value={String(option.discount)} onChange={value => change(index, "discount", value)} />
      <Button disabled={options.length === 1} onClick={() => onChange(options.filter((_, i) => i !== index))}>Remove option</Button>
    </InlineStack>)}
    <Button disabled={options.length >= maxOptions} onClick={() => onChange([...options, { frequency: Object.keys(schedules).find(f => !options.some(o => o.frequency === f)) || "Monthly", discount: 0 }])}>Add delivery option</Button>
  </BlockStack>;
}
