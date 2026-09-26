import { Link } from "react-router";
import styles from "../styles/landing.module.css";

export default function Privacy() {
  return (
    <div className={styles.index}>
      <div className={`${styles.content} ${styles.legal}`}>
        <h1 className={styles.heading}>Privacy policy</h1>
        <p>Bundlify is a Shopify app for product bundles and subscription plans. This policy describes the store and customer data the app uses.</p>
        <h2>Data from the store</h2>
        <ul>
          <li>Shop domain, app installation, and the session needed to call Shopify on the merchant’s behalf.</li>
          <li>Bundle and subscription settings the merchant creates, including selected products, variants, discounts, and delivery frequency.</li>
          <li>The app plan the merchant selects. Paid plans are billed by Shopify.</li>
        </ul>
        <h2>Data from buyers</h2>
        <ul>
          <li>Subscription contracts created in Shopify, including the product, price, delivery schedule, status, and next charge date.</li>
          <li>The customer and order identifiers needed to show those subscriptions in the customer account and in the merchant’s Bundlify admin.</li>
        </ul>
        <p>Card numbers are not stored by Bundlify. A buyer who chooses to update a payment method receives Shopify’s secure update email. Cancellation is handled in the buyer’s Shopify customer account.</p>
        <h2>How the data is used</h2>
        <p>The data is used to show bundles, apply bundle discounts, create subscription plans, bill due subscription cycles, and let buyers view, cancel, or update payment for their own subscriptions. It is not sold.</p>
        <h2>Removal</h2>
        <p>When the app is uninstalled, Bundlify deletes the shop’s saved sessions and app records after Shopify sends the uninstall and shop-redact notifications. Customer data requests and customer redact requests are handled through Shopify’s required privacy webhooks.</p>
        <p><Link className={styles.link} to="/">Back to Bundlify</Link></p>
      </div>
    </div>
  );
}
