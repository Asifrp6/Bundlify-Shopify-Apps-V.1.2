import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { discountLabel } from "../services/discounts";
import { GIFT_LABELS, GIFT_NAME_MAX, formatGiftPrice, giftImageUrl, readGiftImage } from "../services/gift-options";
import { deleteGiftOption, giftStore, loadGiftEnabled, repairGiftProducts, saveGiftOption } from "../services/gift-options.server";
import { creationBlocked } from "../services/app-plans";
import { Link, useLoaderData, useSearchParams, useFetcher, data } from "react-router";
import { Banner } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { createBundleDiscount, removeBundleDiscount } from "../services/bundle-discount.server";
import { CUSTOM_APPLY_SUCCESS, CUSTOM_BUNDLE_DELETE_INTENT, CUSTOM_DISABLED_SUCCESS, customBundleOffer } from "../services/custom-bundle";
import { getCustomBundleSettings, saveCustomBundleProducts } from "../services/custom-bundle.server";
import { getProducts } from "../services/products.server";
import { bundleActivationError, storefrontIssue } from "../services/product-selection";
import styles from "../styles/bundles.module.css";

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
      const reason = storefrontIssue(states.get(product.productId));
      return reason ? [`${product.productTitle} is ${reason}`] : [];
    }),
  );
}

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  let [usage, bundles, giftOptions, currency, giftEnabled, customSettings] = await Promise.all([
    import("../services/app-billing.server").then(({ shopUsage }) => shopUsage(session.shop)),
    prisma.bundle.findMany({
      where: { shop: session.shop },
      include: { products: true },
      orderBy: { createdAt: "desc" },
    }),
    giftStore(prisma).list(session.shop),
    admin.graphql(`#graphql
      query BundleShopCurrency { shop { currencyCode } }`).then(response => response.json()).then(result => result.data?.shop?.currencyCode || null).catch(() => null),
    loadGiftEnabled(giftStore(prisma), session.shop),
    getCustomBundleSettings(admin).catch(() => null),
  ]);
  try {
    giftOptions = await repairGiftProducts({ store: giftStore(prisma), admin, shop: session.shop, rows: giftOptions });
  } catch {
    // Listing the options must not fail because the repair check could not reach Shopify.
  }
  let blocked = bundles.map(() => []);
  try {
    blocked = (await blockedProducts(admin, bundles)) || blocked;
  } catch {
    blocked = bundles.map(() => []);
  }
  let customProducts = [];
  if (customSettings?.productIds?.length) {
    try {
      customProducts = await getProducts(admin, customSettings.productIds);
    } catch {
      customProducts = [];
    }
  }
  const customBundle = customBundleOffer(customSettings ? { ...customSettings, currency: customSettings.currency || currency } : null, customProducts);
  return {
    bundles: bundles.map((bundle, index) => ({ ...bundle, blocked: blocked[index] })),
    bundleLimit: creationBlocked(usage, "bundle", usage?.bundles ?? 0),
    planName: usage?.name || null,
    maxBundles: usage?.maxBundles ?? null,
    giftOptions: giftOptions.map(option => ({ ...option, imageUrl: giftImageUrl(option.imageUrl) })),
    giftEnabled,
    currency,
    customBundle,
  };
}

async function giftAction(form, { admin, shop }) {
  const store = giftStore(prisma);
  if (form.get("intent") === "gift-toggle") {
    const enabled = form.get("enabled") === "true";
    await store.setEnabled(shop, enabled);
    return { giftEnabled: enabled };
  }
  const rawId = form.get("giftId");
  const id = rawId ? Number(rawId) : null;
  if (form.get("intent") === "gift-delete") {
    const result = await deleteGiftOption({ store, admin, shop, id });
    return result.error ? data(result, { status: result.status }) : result;
  }
  const image = await readGiftImage(form.get("image"));
  if (image.error) return data({ error: image.error }, { status: 400 });
  const result = await saveGiftOption({ store, admin, shop, id, image: image.value, input: { kind: form.get("kind"), name: form.get("name"), price: form.get("price") } });
  // A saved option whose fee product failed to sync still changes the list, so keep a 2xx status for revalidation.
  return result.error && !result.option ? data(result, { status: result.status }) : result;
}

export async function action({ request }) {
  const { admin, session, redirect } = await authenticate.admin(request);
  if (!await (await import("../services/app-billing.server")).shopLimits(session.shop)) throw redirect("/app/pricing");
  const form = await request.formData();
  if (["gift-save", "gift-delete", "gift-toggle"].includes(form.get("intent"))) {
    try {
      return await giftAction(form, { admin, shop: session.shop });
    } catch (error) {
      if (error instanceof Response) throw error;
      return data({ error: error.message || "Could not save this option. Please try again." }, { status: 500 });
    }
  }
  if (form.get("intent") === CUSTOM_BUNDLE_DELETE_INTENT) {
    try {
      await saveCustomBundleProducts(admin, []);
      return { customDeleted: true };
    } catch (error) {
      if (error instanceof Response) throw error;
      return data({ error: error.message || "Could not delete the custom bundle. Please try again." }, { status: 500 });
    }
  }
  const id = Number(form.get("bundleId"));
  const status = form.get("status");
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647 || !["ACTIVE", "DRAFT"].includes(status))
    return data({ error: "Invalid bundle or status." }, { status: 400 });
  try {
    const bundle = await prisma.bundle.findFirst({ where: { id, shop: session.shop }, include: { products: true } });
    if (!bundle) return data({ error: "Bundle not found." }, { status: 404 });
    if (status === "ACTIVE") {
      const found = new Map((await getProducts(admin, bundle.products.map(product => product.productId))).map(product => [product.id, product]));
      const inactive = bundleActivationError(bundle.products.map(row => ({ id: row.productId, missing: !found.has(row.productId), ...found.get(row.productId), title: row.productTitle })));
      if (inactive) return data({ error: inactive }, { status: 400 });
    }
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
  const deactivating = active && !needsDiscount;
  return <div className={styles.activation}>
    <fetcher.Form method="post">
      <input type="hidden" name="bundleId" value={bundle.id} />
      <input type="hidden" name="status" value={deactivating ? "DRAFT" : "ACTIVE"} />
      <button className={deactivating ? styles.deactivate : styles.primary} type="submit" disabled={fetcher.state !== "idle"}>
        {fetcher.state !== "idle" ? "Saving…" : needsDiscount ? "Enable bundle discount" : active ? "Deactivate bundle" : "Activate bundle"}
      </button>
    </fetcher.Form>
    {fetcher.data?.error && <p role="alert">{fetcher.data.error}</p>}
    <p>{needsDiscount ? "This bundle is visible, but its discount has not been enabled yet." : bundle.blocked?.length && bundle.products.length - bundle.blocked.length < 2 ? "Hidden on your store. At least two products must be active and published to the Online Store." : bundle.blocked?.length ? "Shown on your store. Draft, archived, or unpublished products are left out." : active ? "Active — add the Bundle selection block to a product template. It shows on every product page with that block." : "Draft — hidden from your website."}</p>
    {!!bundle.blocked?.length && <p role="status">{bundle.blocked.join(". ")}.</p>}
    <Link to="/app/extensions">Show on website</Link>
  </div>;
}

function GiftThumb({ src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return <img className={styles.giftThumb} src={src} alt="" onError={() => setFailed(true)} />;
}

function GiftFields({ option, kind, currency }) {
  const label = GIFT_LABELS[kind];
  return <>
    <input type="hidden" name="intent" value="gift-save" />
    <input type="hidden" name="kind" value={kind} />
    {option && <input type="hidden" name="giftId" value={option.id} />}
    <div className={styles.giftFields}>
      <label><span>{label} name</span><input name="name" defaultValue={option?.name} maxLength={GIFT_NAME_MAX} placeholder={kind === "PACKAGE" ? "Kraft gift box" : "Red ribbon wrap"} required /></label>
      <label><span>Price ({currency || "store currency"})</span><input name="price" defaultValue={option?.price} inputMode="decimal" pattern="\d+(\.\d{1,2})?" placeholder="4.99" required /></label>
      <div className={styles.giftFile}>
        <label>
          <span>Image <span className={styles.giftOptional}>{option?.imageUrl ? "optional · replaces the current image" : "optional · JPEG, PNG, WebP, or GIF"}</span></span>
          <input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif" />
        </label>
        <GiftThumb src={option?.imageUrl} />
      </div>
    </div>
  </>;
}

function ConfirmDeleteDialog({ titleId, nameId, descId, title, name, description, formId, busy, note, onClose }) {
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    cancelRef.current?.focus({ preventScroll: true });
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll("button:not(:disabled)")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);
  return <div className={styles.confirmOverlay} onClick={() => onCloseRef.current()}>
    <div ref={dialogRef} className={styles.confirmDialog} role="dialog" aria-modal="true" aria-labelledby={`${titleId} ${nameId}`} aria-describedby={descId} onClick={event => event.stopPropagation()}>
      <h2 id={titleId}>{title}</h2>
      <p id={nameId} className={styles.confirmName}>{name}</p>
      <p id={descId} className={styles.confirmText}>{description}</p>
      {note && <p role="alert" className={styles.giftError}>{note}</p>}
      <div className={styles.confirmActions}>
        <button ref={cancelRef} className={styles.edit} type="button" onClick={() => onCloseRef.current()}>Cancel</button>
        <button className={styles.giftDelete} type="submit" form={formId} disabled={busy}>{busy ? "Deleting…" : "Delete"}</button>
      </div>
    </div>
  </div>;
}

function GiftDeleteDialog({ option, formId, busy, note, onClose }) {
  const label = (GIFT_LABELS[option.kind] || "option").toLowerCase();
  return <ConfirmDeleteDialog titleId={`gift-delete-title-${option.id}`} nameId={`gift-delete-name-${option.id}`} descId={`gift-delete-desc-${option.id}`} title={`Delete this ${label}?`} name={option.name} description="It will be removed from the gift box popup." formId={formId} busy={busy} note={note} onClose={onClose} />;
}

function GiftOptionRow({ option, currency }) {
  const fetcher = useFetcher();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [deleteNote, setDeleteNote] = useState("");
  const sawDelete = useRef(false);
  const busy = fetcher.state !== "idle";
  const deleting = removed || (busy && fetcher.formData?.get("intent") === "gift-delete");
  const formId = `gift-delete-${option.id}`;
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.option && !fetcher.data.error) setEditing(false);
  }, [fetcher.state, fetcher.data]);
  useEffect(() => {
    if (fetcher.formData?.get("intent") === "gift-delete") sawDelete.current = true;
    if (fetcher.state !== "idle" || !sawDelete.current) return;
    sawDelete.current = false;
    if (fetcher.data?.deleted) setRemoved(true);
    setDeleteNote(fetcher.data?.error || fetcher.data?.warning || "");
  }, [fetcher.state, fetcher.formData, fetcher.data]);
  const feedback = fetcher.data?.error || fetcher.data?.warning;
  if (editing) return <li className={styles.giftRow}>
    <fetcher.Form method="post" encType="multipart/form-data" className={styles.giftForm}>
      <GiftFields option={option} kind={option.kind} currency={currency} />
      <div className={styles.giftActions}>
        <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <button className={styles.edit} type="button" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
      </div>
    </fetcher.Form>
    {feedback && <p role="alert" className={styles.giftError}>{feedback}</p>}
  </li>;
  return <li className={styles.giftRow}>
    <div className={styles.giftSummary}>
      <span className={styles.giftThumbSlot}><GiftThumb src={option.imageUrl} /></span>
      <strong className={styles.giftName}>{option.name}</strong>
      <span className={styles.giftPrice}>{formatGiftPrice(option.price, currency)}</span>
      <div className={styles.giftActions}>
        <button className={styles.edit} type="button" onClick={() => setEditing(true)} disabled={busy}>Edit</button>
        <button className={styles.giftDelete} type="button" onClick={() => { setDeleteNote(""); setConfirming(true); }} disabled={busy || removed}>{deleting ? "Deleting…" : "Delete"}</button>
        <fetcher.Form method="post" id={formId} className={styles.giftDeleteForm}>
          <input type="hidden" name="intent" value="gift-delete" />
          <input type="hidden" name="giftId" value={option.id} />
        </fetcher.Form>
      </div>
    </div>
    {confirming && createPortal(
      <GiftDeleteDialog option={option} formId={formId} busy={deleting} note={deleteNote} onClose={() => setConfirming(false)} />,
      document.body,
    )}
    {option.syncError && <p role="alert" className={styles.giftError}>Hidden from customers: {option.syncError} Edit and save to retry.</p>}
    {feedback && <p role="alert" className={styles.giftError}>{feedback}</p>}
  </li>;
}

function GiftOptionAdd({ kind, currency }) {
  const fetcher = useFetcher();
  const form = useRef(null);
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.option) form.current?.reset();
  }, [fetcher.state, fetcher.data]);
  return <fetcher.Form method="post" encType="multipart/form-data" className={styles.giftForm} ref={form}>
    <GiftFields kind={kind} currency={currency} />
    <div className={styles.giftActions}><button className={styles.primary} type="submit" disabled={busy}>{busy ? "Saving…" : `Add ${GIFT_LABELS[kind].toLowerCase()}`}</button></div>
    {fetcher.data?.error && <p role="alert" className={styles.giftError}>{fetcher.data.error}</p>}
  </fetcher.Form>;
}

function GiftSwitch({ enabled }) {
  const fetcher = useFetcher();
  const pending = fetcher.formData?.get("enabled");
  const on = pending != null ? pending === "true" : fetcher.data?.giftEnabled ?? enabled;
  const toggle = () => fetcher.submit({ intent: "gift-toggle", enabled: String(!on) }, { method: "post" });
  return <div className={styles.giftSwitch}>
    <div>
      <span id="gift-switch-label" className={styles.giftSwitchLabel}>Offer gift box and wrap</span>
      <p id="gift-switch-help">On: customers can add a package and wrap. Off: the bundle popup goes straight to Add to cart.</p>
      {fetcher.data?.error && <p role="alert" className={styles.giftError}>{fetcher.data.error}</p>}
    </div>
    <button type="button" role="switch" aria-checked={on} aria-labelledby="gift-switch-label" aria-describedby="gift-switch-help"
      className={styles.switch} onClick={toggle} disabled={fetcher.state !== "idle"}>
      <span className={styles.switchTrack} aria-hidden="true"><span className={styles.switchThumb} /></span>
      <span className={styles.switchState}>{on ? "On" : "Off"}</span>
    </button>
  </div>;
}

function GiftOptions({ options, currency, enabled }) {
  const groups = [
    { kind: "PACKAGE", title: "Packages", text: "Gift boxes customers can add in step 2 of the bundle popup." },
    { kind: "WRAP", title: "Wraps", text: "Wrapping customers can add in step 3, after choosing a package." },
  ];
  return <section className={styles.giftSetup} aria-labelledby="gift-options-heading">
    <div className={styles.giftIntro}>
      <h2 id="gift-options-heading">Gift box options</h2>
      <p>Shown in the popup when a customer selects a ready-made bundle. Each option is charged at checkout through a hidden Shopify product that Bundle Base keeps in sync with the name and price you set here. Add an image so customers can see the package or wrap before they choose it.</p>
    </div>
    <GiftSwitch enabled={enabled} />
    <div className={styles.giftGroups}>{groups.map(group => {
      const rows = options.filter(option => option.kind === group.kind);
      return <div className={styles.giftGroup} key={group.kind}>
        <h3>{group.title} <span>{rows.length}</span></h3>
        <p>{group.text}</p>
        {rows.length ? <ul>{rows.map(option => <GiftOptionRow key={option.id} option={option} currency={currency} />)}</ul> : <p className={styles.giftEmpty}>No {group.title.toLowerCase()} yet. Customers can still skip this step.</p>}
        <GiftOptionAdd kind={group.kind} currency={currency} />
      </div>;
    })}</div>
  </section>;
}

function CustomBundleSection({ bundle }) {
  const fetcher = useFetcher();
  const [confirming, setConfirming] = useState(false);
  const busy = fetcher.state !== "idle";
  const deleted = Boolean(fetcher.data?.customDeleted);
  const deleteError = fetcher.data?.error || "";
  const formId = "custom-bundle-delete";
  if (!bundle || deleted) return <>
    {deleted && <Banner tone="info">Custom bundle deleted successfully.</Banner>}
    <section className={styles.customSetup} aria-labelledby="custom-bundle-heading"><span className={styles.cardIcon}><BundleIcon /></span><div><h2 id="custom-bundle-heading">Customer-created bundles</h2><p>Choose the products customers can mix into their own bundle.</p></div><Link className={styles.edit} to="/app/bundles/custom">Manage products <span aria-hidden="true">→</span></Link></section>
  </>;
  return <section className={`${styles.collection} ${styles.customBundle}`} aria-labelledby="custom-bundle-heading">
    <div className={styles.collectionHeader}><div><h2 id="custom-bundle-heading">Customer-created bundles <span>1</span></h2></div></div>
    <div className={styles.grid}><article className={styles.card}>
      <div className={styles.cardHeading}><span className={styles.cardIcon}><BundleIcon /></span><div className={styles.cardTitle}><Link to={bundle.editTo}><h3>{bundle.name}</h3></Link><p>Customer-created</p></div><span className={`${styles.badge} ${styles.activeBadge}`}><span aria-hidden="true" />Active</span></div>
      <div className={styles.cardMeta}><div><span>Products</span><strong>{bundle.products.length}</strong></div><div className={styles.discount}><span>Bundle discount</span><strong>{bundle.discountText}</strong></div></div>
      <div className={styles.productList}><span className={styles.label}>THE LINEUP</span><ul>{bundle.products.map(product => <li key={product.productId}>{product.productTitle}</li>)}</ul></div>
      {deleteError && !confirming && <div className={styles.activation}><p role="alert">{deleteError}</p></div>}
      <footer className={styles.cardFooter}><Link className={styles.edit} to={bundle.editTo}>Edit bundle <span aria-hidden="true">→</span></Link><button className={styles.delete} type="button" onClick={() => setConfirming(true)} disabled={busy} aria-label={`Delete ${bundle.name}`}>Delete bundle</button></footer>
    </article></div>
    <fetcher.Form method="post" id={formId} className={styles.giftDeleteForm}>
      <input type="hidden" name="intent" value={CUSTOM_BUNDLE_DELETE_INTENT} />
    </fetcher.Form>
    {confirming && createPortal(
      <ConfirmDeleteDialog titleId="custom-bundle-delete-title" nameId="custom-bundle-delete-name" descId="custom-bundle-delete-desc" title="Delete this custom bundle?" name={bundle.name} description="It will be removed from your store. Customers will no longer be able to build this bundle." formId={formId} busy={busy} note={deleteError} onClose={() => setConfirming(false)} />,
      document.body,
    )}
  </section>;
}

/* eslint-enable react/prop-types */
function BundleIcon() {
  return <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 10 11-5 11 5v13l-11 5-11-5V10Z"/><path d="m5 10 11 5 11-5M16 15v13M10 7.7l11 5v6"/></svg>;
}

export default function Bundles() {
  const { bundles, bundleLimit, planName, maxBundles, giftOptions, giftEnabled, currency, customBundle } = useLoaderData();
  const [params] = useSearchParams();
  const [toast, setToast] = useState(() => params.get("created") === "1" ? "Bundle created successfully." : params.get("updated") === "1" ? "Bundle updated successfully." : params.get("applied") === "1" ? CUSTOM_APPLY_SUCCESS : params.get("customDisabled") === "1" ? CUSTOM_DISABLED_SUCCESS : "");
  useEffect(() => {
    if (!toast) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("created");
    url.searchParams.delete("updated");
    url.searchParams.delete("applied");
    url.searchParams.delete("customDisabled");
    window.history.replaceState(window.history.state, "", url);
    const timer = setTimeout(() => setToast(""), 2000);
    return () => clearTimeout(timer);
  }, [toast]);
  const products = new Set(bundles.flatMap(bundle => bundle.products.map(product => product.productId))).size;

  return <div className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>BETTER TOGETHER</span><h1>Bundles</h1><p>Bring great products together. Create an offer worth coming back for.</p></div>
      {bundleLimit ? <Link className={styles.primary} to="/app/pricing">Upgrade plan</Link> : <Link className={styles.primary} to="/app/bundles/new"><span aria-hidden="true">+</span> Create bundle</Link>}
    </header>
    {params.get("deleted") === "1" && <Banner tone="info">Bundle deleted successfully.</Banner>}
    <div className={styles.toast} role="status" aria-live="polite">{toast}</div>

    {bundleLimit && <Banner tone="warning">{bundleLimit}</Banner>}
    <div className={styles.info}><p>{planName ? `${planName} plan${maxBundles == null ? " includes unlimited bundles" : `: ${bundles.length} of ${maxBundles} bundles`}. ` : ""}Click Activate bundle below to display it in your theme. <Link to="/app/extensions">Set up your storefront block</Link>. Active bundle discounts apply in the cart and at checkout. After deploying the discount extension, reactivate existing bundles to enable their savings.</p></div>

    <CustomBundleSection bundle={customBundle} />
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
        <div className={styles.cardHeading}><span className={styles.cardIcon}><BundleIcon /></span><div className={styles.cardTitle}><Link to={`/app/bundles/${bundle.id}`}><h3>{bundle.name}</h3></Link><p>Bundle ID: {bundle.id}</p></div><span className={`${styles.badge} ${bundle.status === "ACTIVE" ? styles.activeBadge : ""}`}><span aria-hidden="true" />{bundle.status !== "ACTIVE" ? "Draft" : bundle.products.length - (bundle.blocked?.length || 0) < 2 ? "Active · hidden" : "Active"}</span></div>
        <div className={styles.cardMeta}><div><span>Products</span><strong>{bundle.products.length}</strong></div><div className={styles.discount}><span>Bundle discount</span><strong>{discountLabel(bundle.discount, bundle.discountType)}</strong></div></div>
        <div className={styles.productList}><span className={styles.label}>THE LINEUP</span><ul>{bundle.products.map(product => <li key={product.productId}>{product.productTitle}</li>)}</ul></div>
        <BundleActivation bundle={bundle} /><footer className={styles.cardFooter}><Link className={styles.edit} to={`/app/bundles/${bundle.id}`}>Edit bundle <span aria-hidden="true">→</span></Link><Link className={styles.delete} to={`/app/bundles/${bundle.id}#delete-bundle`} aria-label={`Delete ${bundle.name}`}>Delete bundle</Link></footer>
      </article>)}</div>}
      <div className={styles.steps}>
        <div><span>01</span><div><h3>Pick your products</h3><p>Find the perfect combination.</p></div></div>
        <div><span>02</span><div><h3>Plan the savings</h3><p>Choose a discount for your offer.</p></div></div>
        <div><span>03</span><div><h3>Save your idea</h3><p>Keep a draft to revisit and refine.</p></div></div>
      </div>
    </section>
    <GiftOptions options={giftOptions} currency={currency} enabled={giftEnabled} />
    <p className={styles.footnote}>Room to experiment. Edit or remove your drafts whenever you need.</p>
  </div>;
}
