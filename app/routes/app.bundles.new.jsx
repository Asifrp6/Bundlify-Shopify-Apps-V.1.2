import { validDiscount as isValidDiscount, discountLabel } from "../services/discounts";
import ProductCategoryFilter from "../components/ProductCategoryFilter";
import { capProductSelection, categoryLabel, filterBundleProducts, selectCategoryProducts } from "../services/product-categories";
import {
  Form,
  Link,
  data,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { Banner } from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { listProducts, getProducts } from "../services/products.server";
import { validateBundle } from "../services/validation";
import { creationBlocked } from "../services/app-plans";
import styles from "../styles/bundle-editor.module.css";

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const usage = await (await import("../services/app-billing.server")).shopUsage(session.shop);
  const limits = usage;
  try {
    return { products: await listProducts(admin), error: null, maxProducts: limits?.maxProducts ?? 5, bundleLimit: creationBlocked(usage, "bundle", usage?.bundles ?? 0) };
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      products: [],
      error: "Products could not be loaded. Refresh the page to try again.",
    };
  }
}

export async function action({ request }) {
  const { admin, session, redirect } = await authenticate.admin(request);
  const usage = await (await import("../services/app-billing.server")).shopUsage(session.shop);
  if (!usage) throw redirect("/app/pricing");
  const blocked = creationBlocked(usage, "bundle", usage.bundles);
  if (blocked) return data({ error: blocked }, { status: 403 });
  const limits = usage;
  const form = await request.formData();
  const publish = form.get("status") === "ACTIVE";
  if (!["ACTIVE", "DRAFT"].includes(String(form.get("status"))))
    return data({ error: "Choose draft or active before saving." }, { status: 400 });
  const { values, errors } = validateBundle(form, limits);
  if (Object.keys(errors).length) return data({ errors }, { status: 400 });
  let products;
  try {
    products = await getProducts(admin, values.productIds);
  } catch (error) {
    if (error instanceof Response) throw error;
    return data(
      { error: "Could not verify the selected products. Please try again." },
      { status: 502 },
    );
  }
  if (products.length !== values.productIds.length) {
    return data(
      {
        errors: {
          productIds:
            "A selected product is no longer available. Refresh the page and select products again.",
        },
      },
      { status: 400 },
    );
  }
  let created;
  try {
    created = await prisma.bundle.create({
      data: {
        shop: session.shop,
        status: publish ? "ACTIVE" : "DRAFT",
        name: values.name,
        discount: values.discount,
        discountType: values.discountType,
        products: {
          create: products.map((product) => ({
            productId: product.id,
            productTitle: product.title,
          })),
        },
      },
      include: { products: true },
    });
  } catch {
    return data(
      { error: "The bundle could not be saved. Please try again." },
      { status: 500 },
    );
  }
  if (publish) {
    try {
      const { createBundleDiscount } = await import("../services/bundle-discount.server");
      const discountNodeId = await createBundleDiscount(admin, created);
      if (discountNodeId) await prisma.bundle.update({ where: { id: created.id }, data: { discountNodeId } });
    } catch (error) {
      await prisma.bundle.update({ where: { id: created.id }, data: { status: "DRAFT" } });
      const message = String(error?.message || "Could not activate this bundle.").slice(0, 240);
      return redirect(`/app/bundles/${created.id}?error=${encodeURIComponent(`${message} It was saved as a draft.`)}`);
    }
  }
  return redirect("/app/bundles?created=1");
}

export default function NewBundle() {
  const { products, bundle, error: loadError, maxProducts = 5, bundleLimit } = useLoaderData();
  const result = useActionData();
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const [name, setName] = useState(bundle?.name || "");
  const [discountType, setDiscountType] = useState(bundle?.discountType || "percentage");
  const [discount, setDiscount] = useState(String(bundle?.discount ?? 0));
  const [selected, setSelected] = useState(bundle?.products.map(product => product.productId) || []);
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState(false);
  const missing = (bundle?.products || []).filter(saved => !products.some(product => product.id === saved.productId));
  const choices = [...products, ...missing.map(product => ({ id: product.productId, title: product.productTitle, missing: true }))];
  const [category, setCategory] = useState([]);
  const changeCategory = (id, checked) => {
    setCategory(current => checked ? [...new Set([...current, id])] : current.filter(value => value !== id));
    setSelected(current => capProductSelection(current, selectCategoryProducts(choices, current, id, checked), maxProducts));
    
  };
  const visible = filterBundleProducts(choices, search, category);
  const submitting = navigation.state !== "idle";
  const pendingStatus = navigation.formData?.get("status");
  const validDiscount = isValidDiscount(discount, discountType);
  const saveDisabled = !!loadError || selected.length < 2 || selected.length > maxProducts || !name.trim() || !validDiscount || submitting;
  const toggle = id => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  if (bundleLimit && !bundle) return <main className={styles.page}>
    <Link to="/app/bundles" className={styles.back}>All bundles</Link>
    <Banner tone="warning">{bundleLimit}</Banner>
    <p><Link to="/app/pricing">Choose a higher plan</Link></p>
  </main>;
  return <main className={styles.page}>
    <Link to="/app/bundles" className={styles.back}>? All bundles</Link>
    <header className={styles.header}><div><span className={styles.eyebrow}>BETTER TOGETHER</span><h1>{bundle ? "Edit your bundle" : "Create a bundle"}</h1><p>Pair great products. Give customers a reason to choose more.</p></div><span className={styles.badge}>{bundle?.status === "ACTIVE" ? "Active offer" : bundle ? "Draft offer" : "New offer"}</span></header>
    {(loadError || result?.error || params.get("error")) && <Banner tone="critical">{loadError || result?.error || params.get("error")}</Banner>}
    <Form method="post" className={styles.layout}>
      {bundle && <input type="hidden" name="intent" value="update" />}
      {selected.map(id => <input key={id} type="hidden" name="productIds" value={id} />)}
      <div className={styles.sections}>
        <section className={styles.card}><div className={styles.sectionHeading}><span>01</span><div><h2>Bundle details</h2><p>Start with a name your customers will remember.</p></div></div>
          <label className={styles.field}>Bundle name<input name="name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. The everyday essentials" autoComplete="off" maxLength={120} required aria-invalid={!!result?.errors?.name} /></label>
          {result?.errors?.name && <p className={styles.error} role="alert">{result.errors.name}</p>}
        </section>
        <section className={styles.card}><div className={styles.sectionHeading}><span>02</span><div><h2>Choose your products</h2><p>Select 2?{maxProducts} products to build your bundle.</p></div><b className={styles.count}>{selected.length} selected</b></div>
          <label className={styles.search}><span className={styles.srOnly}>Search products</span><input type="search" placeholder="Search your products?" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <ProductCategoryFilter products={choices} value={category} onChange={changeCategory} disabled={submitting} />
          {selected.length > maxProducts && <p className={styles.error} role="alert">{selected.length} products selected. Remove {selected.length - maxProducts} products before continuing; bundles support up to {maxProducts} products.</p>}
          <div className={styles.list} role="group" aria-label="Bundle products">
            {visible.map(product => <label key={product.id} className={styles.product} data-selected={selected.includes(product.id)}>
              <input type="checkbox" checked={selected.includes(product.id)} onChange={() => toggle(product.id)} disabled={!selected.includes(product.id) && selected.length >= maxProducts} />
              <span className={styles.productIcon} aria-hidden="true">{product.title.slice(0, 1).toUpperCase()}</span><span><strong>{product.title}</strong><small className={styles.categoryLabel}>{categoryLabel(product)}</small>{product.missing && <small>No longer available. Remove this product to save.</small>}</span>
              {selected.includes(product.id) && <span className={styles.selectedLabel}>Selected</span>}
            </label>)}
            {!visible.length && <div className={styles.empty}>{products.length ? "No products match your search." : "Add at least two products to your store to get started."}</div>}
          </div>
          <div className={styles.listFooter}><span>{visible.length} products shown</span><button type="button" disabled={!selected.length} onClick={() => { setSelected([]); setCategory([]); }}>Clear selection</button></div>
          {result?.errors?.productIds && <p className={styles.error} role="alert">{result.errors.productIds}</p>}
        </section>
        <section className={styles.card}><div className={styles.sectionHeading}><span>03</span><div><h2>Set your bundle discount</h2><p>A little incentive to bring it all together.</p></div></div>
          <div className={styles.discountFields}>
          <label className={styles.field}>Discount type<select className={styles.discountSelect} name="discountType" value={discountType} onChange={event => { setDiscountType(event.target.value); setDiscount("0"); }}><option value="percentage">Percentage (%)</option><option value="fixed">Fixed amount (store currency)</option></select></label>
          <label className={styles.field}>{discountType === "fixed" ? "Discount amount" : "Discount percentage"}<div className={styles.discountInput}><input aria-describedby="bundle-discount-help" name="discount" type="number" min="0" max={discountType === "fixed" ? "1000000" : "100"} step={discountType === "fixed" ? "0.01" : "1"} required value={discount} onChange={event => setDiscount(event.target.value)} /><span>{discountType === "fixed" ? "off" : "% off"}</span></div></label>
          </div>
          <p id="bundle-discount-help" className={styles.discountHelp}>{discountType === "fixed" ? "Amount off each complete bundle in store currency, capped at its total. Applied after activation." : "Applied to complete bundles after activation."}</p>
          {result?.errors?.discount && <p className={styles.error} role="alert">{result.errors.discount}</p>}
        </section>
      </div>
      <aside className={styles.sidebar}><section className={styles.summary}><div className={styles.summaryTop}><span className={styles.eyebrow}>YOUR BUNDLE</span><span className={styles.badge}>{bundle?.status === "ACTIVE" ? "Active" : "Draft"}</span></div><h2>{name.trim() || "Your bundle name"}</h2><p className={styles.hint}>Here?s how your offer is coming together.</p>
        <div className={styles.metrics}><div><strong>{selected.length}</strong><span>Products</span></div><div><strong>{validDiscount ? discountLabel(discount, discountType) : "?"}</strong><span>Bundle savings</span></div></div>
        <div className={styles.summaryProducts}>{selected.length ? choices.filter(product => selected.includes(product.id)).map(product => <p key={product.id}><span aria-hidden="true">?</span>{product.title}</p>) : <p className={styles.hint}>Your selected products will appear here.</p>}</div>
        <div className={styles.note}><strong>Save as draft or activate now.</strong><p>A draft stays hidden. Save and activate to show this bundle on your store and apply the discount in the cart and at checkout.</p></div>
        <button className={styles.primary} name="status" value="ACTIVE" type="submit" disabled={saveDisabled}>{submitting && pendingStatus === "ACTIVE" ? "Activating…" : "Save and activate"}</button>
        <button className={styles.secondary} name="status" value="DRAFT" type="submit" disabled={saveDisabled}>{submitting && pendingStatus === "DRAFT" ? "Saving…" : "Save as draft"}</button>
        <Link className={styles.cancel} to="/app/bundles">Cancel</Link>
      </section></aside>
    </Form>
    {bundle && <section id="delete-bundle" className={styles.danger}><div><h2>Delete bundle</h2><p>Permanently remove this saved offer.</p></div><Form method="post"><input type="hidden" name="intent" value="delete" /><input type="hidden" name="confirmDelete" value={confirm ? "yes" : "no"} /><label><input type="checkbox" checked={confirm} onChange={event => setConfirm(event.target.checked)} /> I confirm I want to delete this bundle</label><button type="submit" disabled={!confirm || submitting}>Delete draft</button></Form></section>}
  </main>;
}
