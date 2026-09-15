import { useLoaderData, Link } from "react-router";
import { authenticate } from "../shopify.server";
import styles from "../styles/bundles.module.css";
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  return { editor: `https://${session.shop}/admin/themes/current/editor` };
}
export default function Extensions() {
  const { editor } = useLoaderData();
  return <div className={styles.page}>
    <h1>Storefront blocks</h1>
    <section className={styles.collection}>
    <div className={styles.collectionHeader}><div><h2>Bundles</h2><p>Display your active product bundles in a separate section.</p></div></div>
    <ol>
      <li><Link to="/app/bundles">Open Bundles</Link> and click Activate bundle.</li>
      <li>Open your theme editor and choose the page template.</li>
      <li>Select Add section → Apps → Bundlify bundles, then save the theme.</li>
    </ol>
    </section>
    <section className={styles.collection}>
      <div className={styles.collectionHeader}><div><h2>Subscriptions</h2><p>Keep the previous purchase cards and delivery-frequency design.</p></div></div>
      <p>Add the Subscription Selector app block to your product template. This contains the one-time purchase and Subscribe &amp; Save options. It operates separately from the Bundlify bundles block.</p>
      <p>Use Subscription Selector for subscriptions. Bundle offers (the former duplicate block) and Bundlify bundles display active bundles independently.</p>
    </section>
    <a href={editor} target="_blank" rel="noreferrer" className={styles.primary}>Open theme editor</a>
    <p>All pages show active bundles, up to 12. Enable ?Only show bundles containing this product? in the block settings if you want product-specific offers. Bundle products must be active and published to the Online Store.</p>
    <p>If the block is missing, start the development preview or deploy the extension and reload the editor. Planned discounts are not applied at checkout.</p>
  </div>;
}
