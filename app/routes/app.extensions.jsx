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
    bundles: themeBlock(session.shop, "star_rating"),
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
      <li>Add the Bundle offers app block to the product template.</li>
      <li>Save the theme. Buyers choose a bundle name, then see its products and discount.</li>
    </ol>
    </section>
    <section className={styles.collection}>
      <div className={styles.collectionHeader}><div><h2>Subscriptions</h2><p>Offer one-time purchase and Subscribe &amp; Save on the same product.</p></div></div>
      <p>Add the Subscription app block to the product template. It is separate from Bundle offers.</p>
    </section>
    <div className={styles.actions}>
      <a href={bundles} target="_top" className={styles.primary}>Add bundle block</a>
      <a href={subscriptions} target="_top" className={styles.primary}>Add subscription block</a>
    </div>
    <p>Active bundles appear for products that are active and published to the Online Store. A bundle stays visible when at least two of its products are published. Turn on “Only show bundles containing this product” in the block settings for product-specific offers.</p>
    <p>An active bundle discount is applied automatically at checkout.</p>
    <section className={styles.collection}>
      <div className={styles.collectionHeader}><div><h2>Customer accounts</h2><p>Buyers manage subscriptions from the same login as their orders.</p></div></div>
      <ol>
        <li>In the checkout and accounts editor, add the Subscriptions page, the order status block, and the profile block.</li>
        <li>Order confirmation emails open the order status page, where Manage subscription links to that page.</li>
        <li>On the product page in Shopify admin, pin Bundlify subscriptions to create a plan for selected variants.</li>
      </ol>
    </section>
  </div>;
}
