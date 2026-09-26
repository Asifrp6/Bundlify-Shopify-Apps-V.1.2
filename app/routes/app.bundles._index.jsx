import { discountLabel } from "../services/discounts";
import { creationBlocked } from "../services/app-plans";
import { Link, useLoaderData, useSearchParams, useFetcher, data } from "react-router";
import { Banner } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { createBundleDiscount, removeBundleDiscount } from "../services/bundle-discount.server";
import styles from "../styles/bundles.module.css";

function storefrontBlock(product) {
  if (!product) return "removed from your store";
  if (product.status === "ARCHIVED") return "archived";
  if (product.status !== "ACTIVE") return "a draft";
  if (!product.publishedAt || new Date(product.publishedAt) > new Date()) return "not published to the Online Store";
  return null;
}

async function blockedProducts(admin, bundles) {
  const ids = [...new Set(bundles.flatMap((bundle) => bundle.products.map((product) => product.productId)))];
  const states = new Map();
  for (let index = 0; index < ids.length; index += 250) {
    const response = await admin.graphql(
      `#graphql
        query BundleStorefrontProducts($ids: [ID!]!) {
          nodes(ids: $ids) { ... on Product { id status publishedAt } }
        }`,
      { variables: { ids: ids.slice(index, index + 250) } },
    );
    const result = await response.json();
    if (result.errors?.length || !result.data?.nodes) return null;
    for (const product of result.data.nodes) if (product?.id) states.set(product.id, product);
  }
  return bundles.map((bundle) =>
    bundle.products.flatMap((product) => {
      const reason = storefrontBlock(states.get(product.productId));
      return reason ? [`${product.productTitle} is ${reason}`] : [];
    }),
  );
}

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const usage = await (await import("../services/app-billing.server")).shopUsage(session.shop);
  const bundles = await prisma.bundle.findMany({
    where: { shop: session.shop },
    include: { products: true },
    orderBy: { createdAt: "desc" },
  });
  let blocked = bundles.map(() => []);
  try {
    blocked = (await blockedProducts(admin, bundles)) || blocked;
  } catch {
    blocked = bundles.map(() => []);
  }
  return {
    bundles: bundles.map((bundle, index) => ({ ...bundle, blocked: blocked[index] })),
    bundleLimit: creationBlocked(usage, "bundle", usage?.bundles ?? 0),
    planName: usage?.name || null,
    maxBundles: usage?.maxBundles ?? null,
  };
}

export async function action({ request }) {
  const { admin, session, redirect } = await authenticate.admin(request);
  if (!await (await import("../services/app-billing.server")).shopLimits(session.shop)) throw redirect("/app/pricing");
  const form = await request.formData();
  const id = Number(form.get("bundleId"));
  const status = form.get("status");
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647 || !["ACTIVE", "DRAFT"].includes(status))
    return data({ error: "Invalid bundle or status." }, { status: 400 });
  try {
    const bundle = await prisma.bundle.findFirst({ where: { id, shop: session.shop }, include: { products: true } });
    if (!bundle) return data({ error: "Bundle not found." }, { status: 404 });
    let discountNodeId = bundle.discountNodeId;
    if (status === "ACTIVE" && !discountNodeId) discountNodeId = await createBundleDiscount(admin, bundle);
    if (status === "DRAFT") { await removeBundleDiscount(admin, bundle); discountNodeId = null; }
    const result = await prisma.bundle.updateMany({ where: { id, shop: session.shop }, data: { status, discountNodeId } });
    if (!result.count) return data({ error: "Bundle not found." }, { status: 404 });
    return { status, bundleId: id };
  } catch (error) {
    return data({ error: error.message || "Could not change bundle status. Please try again." }, { status: 500 });
  }
}
/* eslint-disable react/prop-types -- Bundle is a shop-scoped Prisma loader record. */
function BundleActivation({ bundle }) {
  const fetcher = useFetcher();
  const active = bundle.status === "ACTIVE";
  const needsDiscount = active && bundle.discount > 0 && !bundle.discountNodeId;
  return <div className={styles.activation}>
    <fetcher.Form method="post">
      <input type="hidden" name="bundleId" value={bundle.id} />
      <input type="hidden" name="status" value={active && !needsDiscount ? "DRAFT" : "ACTIVE"} />
      <button className={styles.primary} type="submit" disabled={fetcher.state !== "idle"}>
        {fetcher.state !== "idle" ? "Saving…" : needsDiscount ? "Enable bundle discount" : active ? "Deactivate bundle" : "Activate bundle"}
      </button>
    </fetcher.Form>
    {fetcher.data?.error && <p role="alert">{fetcher.data.error}</p>}
    <p>{needsDiscount ? "This bundle is visible, but its discount has not been enabled yet." : bundle.blocked?.length && bundle.products.length - bundle.blocked.length < 2 ? "Hidden on your store. At least two products must be active and published to the Online Store." : bundle.blocked?.length ? "Shown on your store. Draft, archived, or unpublished products are left out." : active ? "Active — add the Bundle offers block to your theme to show it." : "Draft — hidden from your website."}</p>
    {!!bundle.blocked?.length && <p role="status">{bundle.blocked.join(". ")}.</p>}
    <Link to="/app/extensions">Show on website</Link>
  </div>;
}

/* eslint-enable react/prop-types */
function BundleIcon() {
  return <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 10 11-5 11 5v13l-11 5-11-5V10Z"/><path d="m5 10 11 5 11-5M16 15v13M10 7.7l11 5v6"/></svg>;
}

export default function Bundles() {
  const { bundles, bundleLimit, planName, maxBundles } = useLoaderData();
  const [params] = useSearchParams();
  const products = new Set(bundles.flatMap(bundle => bundle.products.map(product => product.productId))).size;

  return <div className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>BETTER TOGETHER</span><h1>Bundles</h1><p>Bring great products together. Create an offer worth coming back for.</p></div>
      {bundleLimit ? <Link className={styles.primary} to="/app/pricing">Upgrade plan</Link> : <Link className={styles.primary} to="/app/bundles/new"><span aria-hidden="true">+</span> Create bundle</Link>}
    </header>
    {params.get("updated") === "1" && <Banner tone="success">Bundle updated successfully.</Banner>}
    {params.get("deleted") === "1" && <Banner tone="success">Bundle deleted successfully.</Banner>}
    {params.get("created") === "1" && <Banner tone="success">Bundle created successfully.</Banner>}

    {bundleLimit && <Banner tone="warning">{bundleLimit}</Banner>}
    <div className={styles.info}><p>{planName ? `${planName} plan${maxBundles == null ? " includes unlimited bundles" : `: ${bundles.length} of ${maxBundles} bundles`}. ` : ""}Click Activate bundle below to display it in your theme. <Link to="/app/extensions">Set up your storefront block</Link>. Active bundle discounts apply in the cart and at checkout. After deploying the discount extension, reactivate existing bundles to enable their savings.</p></div>

    <section className={styles.customSetup} aria-labelledby="custom-bundle-heading"><span className={styles.cardIcon}><BundleIcon /></span><div><h2 id="custom-bundle-heading">Customer-created bundles</h2><p>Choose the products customers can mix into their own bundle.</p></div><Link className={styles.edit} to="/app/bundles/custom">Manage products <span aria-hidden="true">→</span></Link></section>
    <section className={styles.collection} aria-labelledby="bundle-collection-title">
      <div className={styles.collectionHeader}><div><h2 id="bundle-collection-title">Your bundles <span>{bundles.length}</span></h2><p>A home for your next great product pairing.</p></div><span className={styles.productCount}>{products} unique {products === 1 ? "product" : "products"}</span></div>
      {!bundles.length ? <div className={styles.empty}>
        <div className={styles.illustration} aria-hidden="true"><span className={styles.orbit}/><span className={styles.smallBox}><BundleIcon /></span><span className={styles.bigBox}><BundleIcon /></span><span className={styles.plus}>+</span></div>
        <span className={styles.eyebrow}>YOUR FIRST BUNDLE STARTS HERE</span>
        <h2>Great products. Even better together.</h2>
        <p>Pair your favorites, choose a planned discount, and save your next offer as a draft.</p>
        {bundleLimit ? <Link className={styles.primary} to="/app/pricing">Upgrade plan</Link> : <Link className={styles.primary} to="/app/bundles/new"><span aria-hidden="true">+</span> Create your first bundle</Link>}
        <span className={styles.helper}>Start with two or more products from your store.</span>
      </div> : <div className={styles.grid}>{bundles.map(bundle => <article className={styles.card} key={bundle.id}>
        <div className={styles.cardHeading}><span className={styles.cardIcon}><BundleIcon /></span><div><Link to={`/app/bundles/${bundle.id}`}><h3>{bundle.name}</h3></Link><p>{bundle.products.length} products · Bundle ID: {bundle.id}</p></div><span className={`${styles.badge} ${bundle.status === "ACTIVE" ? styles.activeBadge : ""}`}>{bundle.status === "ACTIVE" ? "Active" : "Draft"}</span></div>
        <div className={styles.discount}><span>Bundle discount</span><strong>{discountLabel(bundle.discount, bundle.discountType)}</strong></div>
        <div className={styles.productList}><span className={styles.label}>THE LINEUP</span><ul>{bundle.products.map(product => <li key={product.productId}>{product.productTitle}</li>)}</ul></div>
        <BundleActivation bundle={bundle} /><footer className={styles.cardFooter}><Link className={styles.edit} to={`/app/bundles/${bundle.id}`}>Edit bundle <span aria-hidden="true">→</span></Link><Link className={styles.delete} to={`/app/bundles/${bundle.id}#delete-bundle`} aria-label={`Delete ${bundle.name}`}>Delete bundle</Link></footer>
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
