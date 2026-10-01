/* eslint-disable react/prop-types -- Internal controlled form component. */
import { BlockStack, Button, InlineStack, Select, TextField } from "@shopify/polaris";
import { frequencyLabel, frequencyParts, frequencyUnits, nextFrequency } from "../services/delivery-options";
// Options are submitted as one validated payload; Shopify IDs are never trusted from the browser.
// eslint-disable-next-line react/prop-types
export default function DeliveryOptions({ options, onChange, maxOptions = 7 }) {
  const change = (index, key, value) => onChange(options.map((option, i) => i === index ? { ...option, [key]: value } : option));
  return <BlockStack gap="300">
    <input type="hidden" name="deliveryOptions" value={JSON.stringify(options)} />
    {options.map((option, index) => {
      const { interval, intervalCount } = frequencyParts(option.frequency);
      const unit = frequencyUnits.find(u => u.interval === interval);
      return <InlineStack key={index} gap="200" blockAlign="end">
        <Select label="Delivery frequency" value={interval} options={frequencyUnits.map(u => ({ label: u.label, value: u.interval }))} onChange={value => change(index, "frequency", frequencyLabel(value, Math.min(intervalCount, frequencyUnits.find(u => u.interval === value).max)))} />
        <Select label="Every" value={String(intervalCount)} options={Array.from({ length: unit.max }, (_, i) => ({ label: `${i + 1} ${i ? unit.singular + "s" : unit.singular}`, value: String(i + 1) }))} onChange={value => change(index, "frequency", frequencyLabel(interval, Number(value)))} />
        <TextField label="Discount" type="number" min={0} max={100} suffix="%" autoComplete="off" value={String(option.discount)} onChange={value => change(index, "discount", value)} />
        <Button disabled={options.length === 1} onClick={() => onChange(options.filter((_, i) => i !== index))}>Remove option</Button>
      </InlineStack>;
    })}
    <Button disabled={options.length >= maxOptions} onClick={() => onChange([...options, { frequency: nextFrequency(options), discount: 0 }])}>Add delivery option</Button>
  </BlockStack>;
}
