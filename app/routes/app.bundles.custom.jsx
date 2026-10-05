import BundleProductFields from "../components/BundleProductFields";
import { SELECTED_PRODUCTS, bundleInitialMode, bundleSelectionChange, withMissingProducts } from "../services/product-selection";
import { Form, Link, data, useLoaderData, useActionData, useNavigation } from 'react-router';
import { useState } from 'react';
import { Banner } from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { listProducts } from '../services/products.server';
import { customApplyPath } from '../services/custom-bundle';
import { getCustomBundleSettings, saveCustomBundleProducts } from '../services/custom-bundle.server';
import styles from '../styles/bundle-editor.module.css';
import setup from '../styles/custom-bundle-setup.module.css';

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const [limits, products, settings] = await Promise.all([
    import("../services/app-billing.server").then(({ shopLimits }) => shopLimits(session.shop)),
    listProducts(admin),
    getCustomBundleSettings(admin),
  ]);
  return { products, selectedIds: settings.productIds, percentage: settings.discount.discountType === 'fixed' ? settings.discount.fixedAmount || 0 : settings.discount.percentage || 0, discountType: settings.discount.discountType || 'percentage', currency: settings.currency, maxProducts: limits?.maxProducts ?? 5 };
}

export async function action({ request }) {
  const { admin, session, redirect } = await authenticate.admin(request);
  const limits = await (await import("../services/app-billing.server")).shopLimits(session.shop);
  if (!limits) throw redirect('/app/pricing');
  const form = await request.formData();
  try {
    const percentage = form.get('percentage');
    if (typeof percentage !== 'string' || !percentage.trim()) throw new Error('Enter a discount value.');
    const productIds = form.getAll('productIds');
    await saveCustomBundleProducts(admin, productIds, Number(percentage), String(form.get('discountType') || 'percentage'), limits.maxProducts);
    return redirect(customApplyPath(productIds));
  } catch (error) {
    if (error instanceof Response) throw error;
    return data({ error: error.message || 'Could not save custom bundle products.' }, { status: 400 });
  }
}

export default function CustomBundleProducts() {
  const { products, selectedIds, percentage: savedPercentage, discountType: savedType, currency, maxProducts = 5 } = useLoaderData();
  const [discountType, setDiscountType] = useState(savedType);
  const [percentage, setPercentage] = useState(String(savedPercentage));
  const [selected, setSelected] = useState(selectedIds);
  const [step, setStep] = useState(1);
  const result = useActionData();
  const busy = useNavigation().state !== 'idle';
  const choices = withMissingProducts(products, selectedIds);
  const [mode, setMode] = useState(() => bundleInitialMode(selectedIds, choices));
  const [pickerKey, setPickerKey] = useState(0);
  const reset = () => {
    const next = bundleSelectionChange(mode, SELECTED_PRODUCTS, [], choices);
    setMode(next.mode);
    setSelected(next.selected);
    setPickerKey(key => key + 1);
  };
  return <main className={styles.page}>
    <Link className={styles.back} to="/app/bundles">All bundles</Link>
    <header className={styles.header}><div><h1>Custom bundle products</h1><p>Choose which products customers can combine into their own bundle.</p></div></header>
    {result?.error && <Banner tone="critical">{result.error}</Banner>}
    <p role="status">Step {step} of 2: {step === 1 ? 'Select products' : 'Set discount and apply'}</p>
    <Form method="post" onSubmit={event => {
      if (step === 1) { event.preventDefault(); if (selected.length !== 1 && selected.length <= maxProducts) setStep(2); }
    }}>
      {selected.map(id => <input key={id} type="hidden" name="productIds" value={id} />)}
      <section className={styles.card} hidden={step !== 1}>
        <div className={styles.sectionHeading}><div><h2>Eligible products</h2><p>Select 2–{maxProducts} products. Customers must choose at least 2 different products from this list.</p></div><b className={styles.count}>{selected.length} selected</b></div>
        <p>Keep the Bundle selection app block on your product template. This list shows on every product page where that block is added. Only available products published to your online store can be purchased.</p>
        <BundleProductFields key={pickerKey} products={choices} mode={mode} onModeChange={setMode} selected={selected} onSelectedChange={setSelected} maxProducts={maxProducts} disabled={busy} idPrefix="custom-bundle-product" label="Eligible custom bundle products" emptyText="No products found." missingText="Remove this unavailable product before saving." emptyHelp="Choose a product, select products by category, or include your current catalog. Leave empty to keep custom bundles disabled." />
        <p>Your selection stays unpublished until you click Apply in the next step. Clear the selection and apply to disable custom bundles.</p>
        {selected.length === 1 && <p role="status">Select at least one more product, or clear the selection to disable custom bundles.</p>}
        <div className={setup.stepActions}>
          <button className={setup.reset} type="button" disabled={busy || !selected.length} onClick={reset}>Reset</button>
          <button className={styles.primary} type="button" disabled={busy || selected.length === 1 || selected.length > maxProducts} onClick={() => setStep(2)}>Next: Set discount</button>
        </div>
      </section>
      <section className={setup.layout} hidden={step !== 2}>
        <div className={setup.editor}>
          <div className={setup.editorHeading}><span className={setup.headingIcon} aria-hidden="true">%</span><span className={setup.eyebrow}>CUSTOM BUNDLE &middot; DISCOUNT</span></div>
          <h2>Set your bundle discount</h2>
          <p className={setup.description}>Give customers a little extra when they build their own bundle.</p>
          <fieldset className={setup.typeChoices} disabled={busy}>
            <legend>Choose your discount type</legend>
            {[{ value: 'percentage', icon: '%', title: 'Percentage', detail: 'A percentage off the bundle' }, { value: 'fixed', icon: currency, title: 'Fixed amount', detail: 'A set amount off the bundle' }].map(type => <label className={setup.typeCard} key={type.value}>
              <input type="radio" name="discountType" value={type.value} checked={discountType === type.value} onChange={() => { setDiscountType(type.value); setPercentage('0'); }} />
              <span className={setup.typeIcon} aria-hidden="true">{type.icon}</span>
              <strong>{type.title}</strong><small>{type.detail}</small>
            </label>)}
          </fieldset>
          <label className={setup.label} htmlFor="bundle-percentage">{discountType === 'fixed' ? 'Discount amount (' + currency + ')' : 'Discount percentage'}</label>
          <div className={setup.inputWrap}><input id="bundle-percentage" aria-describedby="discount-help" name="percentage" type="number" min="0" max={discountType === 'fixed' ? '1000000' : '100'} step={discountType === 'fixed' ? '0.01' : '1'} required={step === 2} value={percentage} disabled={busy} onChange={event => setPercentage(event.target.value)} /><span aria-hidden="true">{discountType === 'fixed' ? currency : '%'}</span></div>
          <p id="discount-help" className={setup.description}>{discountType === 'fixed' ? 'Amount off the entire bundle in your store currency, once per bundle group. Capped at the bundle total. Use 0 for no extra discount.' : 'Choose a whole number from 0 to 100. Use 0 for no extra discount.'}</p>
          <p className={setup.presetLabel}>Quick select</p>
          <div className={setup.presets} aria-label="Suggested discounts">{[0, 5, 10, 15, 20].map(value => <button key={value} type="button" disabled={busy} aria-pressed={percentage === String(value)} onClick={() => setPercentage(String(value))}>{value === 0 ? 'No discount' : discountType === 'fixed' ? `${value} ${currency}` : `${value}%`}</button>)}</div>
          <div className={setup.note}><span className={setup.noteIcon} aria-hidden="true">i</span><div><strong>A little extra for buying together</strong><p>The discount applies when customers add at least two different eligible products to their custom bundle.</p></div></div>
        </div>
        <aside className={setup.summary} aria-label="Bundle summary">
          <div className={setup.summaryHeading}><div><span className={setup.eyebrow}>YOUR OFFER</span><h2>Bundle summary</h2></div><span className={setup.productCount}>{selected.length} products</span></div>
          <div className={setup.discount}><span>Customer savings</span><strong>{percentage.trim() !== '' && Number.isFinite(Number(percentage)) && Number(percentage) >= 0 && Number(percentage) <= (discountType === 'fixed' ? 1000000 : 100) ? (discountType === 'fixed' ? `${percentage} ${currency}` : `${percentage}%`) : '—'}</strong><small>{discountType === 'fixed' ? 'off each eligible bundle' : 'off the bundle total'}</small></div>
          <p className={setup.productsLabel}>Included products</p>
          <ul className={setup.products}>{choices.filter(product => selected.includes(product.id)).map(product => <li key={product.id}><span className={setup.productMark} aria-hidden="true">&#10003;</span>{product.title}</li>)}</ul>
          <p className={setup.description}>{selected.length ? 'Your selected products become available after Apply succeeds.' : 'Applying with no products selected will disable custom bundles.'}</p>
          <button className={setup.apply} type="submit" disabled={busy || selected.length === 1 || selected.length > maxProducts}>{busy ? 'Applying...' : selected.length ? 'Apply bundle settings' : 'Disable custom bundles'}</button>
          <button className={setup.back} type="button" disabled={busy} onClick={() => setStep(1)}>&larr; Back to products</button>
        </aside>
      </section>
    </Form>
  </main>;
}
