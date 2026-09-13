import { Link, useLoaderData, useSearchParams } from "react-router";
import { Banner } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import styles from "../styles/bundles.module.css";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  return {
    bundles: await prisma.bundle.findMany({
      where: { shop: session.shop },
      include: { products: true },
      orderBy: { createdAt: "desc" },
    }),
  };
}

function BundleIcon() {
  return <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 10 11-5 11 5v13l-11 5-11-5V10Z"/><path d="m5 10 11 5 11-5M16 15v13M10 7.7l11 5v6"/></svg>;
}

export default function Bundles() {
  const { bundles } = useLoaderData();
  const [params] = useSearchParams();
  const products = new Set(bundles.flatMap(bundle => bundle.products.map(product => product.productId))).size;

  return <div className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>BETTER TOGETHER</span><h1>Bundle drafts</h1><p>Bring great products together. Create an offer worth coming back for.</p></div>
      <Link className={styles.primary} to="/app/bundles/new"><span aria-hidden="true">+</span> Create bundle draft</Link>
    </header>
    {params.get("updated") === "1" && <Banner tone="success">Bundle draft updated successfully.</Banner>}
    {params.get("deleted") === "1" && <Banner tone="success">Bundle draft deleted successfully.</Banner>}
    {params.get("created") === "1" && <Banner tone="success">Bundle draft created successfully.</Banner>}

    <div className={styles.info}><span className={styles.infoIcon} aria-hidden="true">i</span><p><strong>A little space to plan something great.</strong> Drafts help you organize offers. They don’t change storefront prices or apply checkout discounts.</p></div>

    <section className={styles.collection} aria-labelledby="bundle-collection-title">
      <div className={styles.collectionHeader}><div><h2 id="bundle-collection-title">Your bundles <span>{bundles.length}</span></h2><p>A home for your next great product pairing.</p></div><span className={styles.productCount}>{products} unique {products === 1 ? "product" : "products"}</span></div>
      {!bundles.length ? <div className={styles.empty}>
        <div className={styles.illustration} aria-hidden="true"><span className={styles.orbit}/><span className={styles.smallBox}><BundleIcon /></span><span className={styles.bigBox}><BundleIcon /></span><span className={styles.plus}>+</span></div>
        <span className={styles.eyebrow}>YOUR FIRST BUNDLE STARTS HERE</span>
        <h2>Great products. Even better together.</h2>
        <p>Pair your favorites, choose a planned discount, and save your next offer as a draft.</p>
        <Link className={styles.primary} to="/app/bundles/new"><span aria-hidden="true">+</span> Create your first bundle</Link>
        <span className={styles.helper}>Start with two or more products from your store.</span>
      </div> : <div className={styles.grid}>{bundles.map(bundle => <article className={styles.card} key={bundle.id}>
        <div className={styles.cardHeading}><span className={styles.cardIcon}><BundleIcon /></span><div><Link to={`/app/bundles/${bundle.id}`}><h3>{bundle.name}</h3></Link><p>{bundle.products.length} products in this bundle</p></div><span className={styles.badge}>Draft</span></div>
        <div className={styles.discount}><span>Planned discount</span><strong>{bundle.discount}% <small>off</small></strong></div>
        <div className={styles.productList}><span className={styles.label}>THE LINEUP</span><ul>{bundle.products.map(product => <li key={product.productId}>{product.productTitle}</li>)}</ul></div>
        <footer className={styles.cardFooter}><Link className={styles.edit} to={`/app/bundles/${bundle.id}`}>Edit bundle <span aria-hidden="true">?</span></Link><Link className={styles.delete} to={`/app/bundles/${bundle.id}#delete-bundle`} aria-label={`Delete ${bundle.name}`}>Delete draft</Link></footer>
      </article>)}</div>}
      <div className={styles.steps}>
        <div><span>01</span><div><h3>Pick your products</h3><p>Find the perfect combination.</p></div></div>
        <div><span>02</span><div><h3>Plan the savings</h3><p>Choose a discount for your offer.</p></div></div>
        <div><span>03</span><div><h3>Save your idea</h3><p>Keep a draft to revisit and refine.</p></div></div>
      </div>
    </section>
    <p className={styles.footnote}>Room to experiment. Edit or remove your drafts whenever you need.</p>
  </div>;
}
