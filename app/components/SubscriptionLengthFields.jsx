/* eslint-disable react/prop-types -- Internal controlled form component. */
import { UNLIMITED } from "../services/delivery-options";

export default function SubscriptionLengthFields({ number, enabled, onEnabledChange, disabled, styles }) {
  return (
    <section className={styles.card} aria-labelledby="length-heading">
      <div className={styles.sectionHeading}>
        <span className={styles.number}>{number}</span>
        <div>
          <h2 id="length-heading">Subscription length</h2>
          <p>Let customers choose how many deliveries their subscription runs for.</p>
        </div>
      </div>
      <input type="hidden" name="lengthEnabled" value={enabled ? "true" : "false"} />
      <input type="hidden" name="lengthOptions" value={JSON.stringify(enabled ? [{ interval: UNLIMITED }] : [])} />
      <label className={styles.toggle} htmlFor="length-enabled" aria-label="Show subscription length options on the storefront">
        <input id="length-enabled" type="checkbox" role="switch" checked={enabled} disabled={disabled} onChange={event => onEnabledChange(event.target.checked)} />
        <span>
          <strong>Show subscription length options on the storefront</strong>
          <small>{enabled ? "Customers choose a length in a popup after picking a delivery frequency." : "Hidden. Subscriptions continue until the customer cancels."}</small>
        </span>
      </label>
      {enabled && (
        <p className={styles.help}>
          Customers type how many times they want the subscription to run (1–99), or choose Unlimited. Their choice is saved on the order line as &ldquo;Subscription length&rdquo;.
        </p>
      )}
    </section>
  );
}
