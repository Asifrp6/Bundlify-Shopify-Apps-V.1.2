import { useLoaderData, Link } from "react-router";
import { authenticate } from "../shopify.server";
import styles from "../styles/bundles.module.css";
function themeBlock(shop, handle) {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const editor = `https://${shop}/admin/themes/current/editor?template=product`;
  if (!apiKey) return editor;
  return `${editor}&addAppBlockId=${apiKey}/${handle}&target=mainSection`;
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  return {
    bundles: themeBlock(session.shop, "bundle_selection"),
    subscriptions: themeBlock(session.shop, "subscription_selector"),
  };
}
export default function Extensions() {
  const { bundles, subscriptions } = useLoaderData();
  return <div className={styles.page}>
    <h1>Storefront blocks</h1>
    <section className={styles.collection}>
    <div className={styles.collectionHeader}><div><h2>Bundles</h2><p>Show active bundles as named choices on the product page.</p></div></div>
    <ol>
      <li><Link to="/app/bundles">Open Bundles</Link> and save a bundle as active.</li>
      <li>Add the Bundle selection app block to the product template.</li>
      <li>Save the theme. Buyers choose a bundle name, then see its products and discount.</li>
    </ol>
    </section>
    <section className={styles.collection}>
      <div className={styles.collectionHeader}><div><h2>Subscriptions</h2><p>Offer one-time purchase and Subscribe &amp; Save on the same product.</p></div></div>
      <p>Add the Subscription app block to the product template. It shows only on product pages and is separate from Bundle selection.</p>
    </section>
    <div className={styles.actions}>
      <a href={bundles} target="_top" className={styles.primary}>Add bundle block</a>
      <a href={subscriptions} target="_top" className={styles.primary}>Add subscription block</a>
    </div>
    <p>A bundle stays visible when at least two of its products are active and published to the Online Store. Every qualifying active bundle shows on each product page where the Bundle selection block is added.</p>
    <p>An active bundle discount is applied automatically at checkout.</p>
    <section className={styles.collection}>
      <div className={styles.collectionHeader}><div><h2>Customer accounts</h2><p>Buyers manage subscriptions from the same login as their orders.</p></div></div>
      <ol>
        <li>In the checkout and accounts editor, add the Subscriptions page, the order status block, and the profile block.</li>
        <li>After a subscription contract is created, the buyer is emailed a link to the customer account Subscriptions page. The order confirmation email also links to the order status page, where Manage subscription opens that same page after the buyer signs in.</li>
        <li>On the product page in Shopify admin, pin Bundle Base subscriptions to create a plan for selected variants.</li>
      </ol>
    </section>
  </div>;
}
