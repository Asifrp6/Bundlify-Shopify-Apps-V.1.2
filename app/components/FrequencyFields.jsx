/* eslint-disable react/prop-types -- Internal controlled form component. */
import { frequencyLabel, frequencyParts, frequencyUnits } from "../services/delivery-options";

export default function FrequencyFields({ index, option, options, className, disabled, onChange }) {
  const { interval, intervalCount } = frequencyParts(option.frequency);
  const unit = frequencyUnits.find(u => u.interval === interval);
  const taken = count => options.some((other, i) => i !== index && other.frequency === frequencyLabel(interval, count));
  const changeUnit = next => {
    const nextUnit = frequencyUnits.find(u => u.interval === next);
    const free = Array.from({ length: nextUnit.max }, (_, i) => i + 1)
      .find(count => !options.some((other, i) => i !== index && other.frequency === frequencyLabel(next, count)));
    onChange(frequencyLabel(next, Math.min(free ?? intervalCount, nextUnit.max)));
  };
  return <>
    <label className={className} htmlFor={"frequency-" + index}>
      Delivery frequency
      <select id={"frequency-" + index} value={interval} disabled={disabled} onChange={event => changeUnit(event.target.value)}>
        {frequencyUnits.map(u => <option key={u.interval} value={u.interval}>{u.label}</option>)}
      </select>
    </label>
    <label className={className} htmlFor={"frequency-value-" + index}>
      Every
      <select id={"frequency-value-" + index} value={intervalCount} disabled={disabled} onChange={event => onChange(frequencyLabel(interval, Number(event.target.value)))}>
        {Array.from({ length: unit.max }, (_, i) => i + 1).map(count =>
          <option key={count} value={count} disabled={taken(count)}>{count} {count === 1 ? unit.singular : unit.singular + "s"}</option>)}
      </select>
    </label>
  </>;
}
