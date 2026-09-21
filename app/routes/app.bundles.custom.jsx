import { Form, Link, data, useLoaderData, useActionData, useNavigation } from 'react-router';
import { useState } from 'react';
import { Banner } from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { listProducts } from '../services/products.server';
import { getCustomBundleSettings, saveCustomBundleProducts } from '../services/custom-bundle.server';
import styles from '../styles/bundle-editor.module.css';
import setup from '../styles/custom-bundle-setup.module.css';

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const [products, settings] = await Promise.all([listProducts(admin), getCustomBundleSettings(admin)]);
  return { products, selectedIds: settings.productIds, percentage: settings.discount.percentage || 0 };
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  try {
    const percentage = form.get('percentage');
    if (typeof percentage !== 'string' || !percentage.trim()) throw new Error('Enter a discount percentage.');
    await saveCustomBundleProducts(admin, form.getAll('productIds'), Number(percentage));
    return { saved: true };
  } catch (error) {
    if (error instanceof Response) throw error;
    return data({ error: error.message || 'Could not save custom bundle products.' }, { status: 400 });
  }
}

export default function CustomBundleProducts() {
  const { products, selectedIds, percentage: savedPercentage } = useLoaderData();
  const [percentage, setPercentage] = useState(String(savedPercentage));
  const [selected, setSelected] = useState(selectedIds);
  const [search, setSearch] = useState('');
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState(1);
  const result = useActionData();
  const busy = useNavigation().state !== 'idle';
  const choices = [...products, ...selectedIds.filter(id => !products.some(product => product.id === id)).map(id => ({ id, title: 'Unavailable product', missing: true }))];
  const visible = choices.filter(product => product.title.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle = id => { setDirty(true); setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); };
  return <main className={styles.page}>
    <Link className={styles.back} to="/app/bundles">All bundles</Link>
    <header className={styles.header}><div><h1>Custom bundle products</h1><p>Choose which products customers can combine into their own bundle.</p></div></header>
    {result?.error && <Banner tone="critical">{result.error}</Banner>}
    {result?.saved && !dirty && <Banner tone="success">Applied successfully. Your selected products are now available for custom bundles.</Banner>}
    <p role="status">Step {step} of 2: {step === 1 ? 'Select products' : 'Set discount and apply'}</p>
    <Form method="post" onSubmit={event => {
      if (step === 1) { event.preventDefault(); if (selected.length !== 1) setStep(2); return; }
      setDirty(false);
    }}>
      {selected.map(id => <input key={id} type="hidden" name="productIds" value={id} />)}
      <section className={styles.card} hidden={step !== 1}>
        <div className={styles.sectionHeading}><div><h2>Eligible products</h2><p>Select 2–50 products. Customers must choose at least 2 different products from this list.</p></div><b className={styles.count}>{selected.length} selected</b></div>
        <p>Keep the Bundle offers app block on your product template. This list applies to all bundle blocks. Only available products published to your online store can be purchased.</p>
        <label className={styles.search}><span className={styles.srOnly}>Search products</span><input type="search" placeholder="Search products" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className={styles.list} role="group" aria-label="Eligible custom bundle products">
          {visible.map(product => <label className={styles.product} key={product.id} data-selected={selected.includes(product.id)}>
            <input type="checkbox" checked={selected.includes(product.id)} onChange={() => toggle(product.id)} disabled={busy || (!selected.includes(product.id) && (selected.length >= 50 || product.missing))} />
            <span><strong>{product.title}</strong>{product.missing && <small>Remove this unavailable product before saving.</small>}</span>
          </label>)}
          {!visible.length && <p className={styles.empty}>No products found.</p>}
        </div>
        <div className={styles.listFooter}><span>{visible.length} products shown</span><button type="button" disabled={busy || !selected.length} onClick={() => { setSelected([]); setDirty(true); }}>Clear selection</button></div>
        <p>Your selection stays unpublished until you click Apply in the next step. Clear the selection and apply to disable custom bundles.</p>
        {selected.length === 1 && <p role="status">Select at least one more product, or clear the selection to disable custom bundles.</p>}
        <button className={styles.primary} type="button" disabled={busy || selected.length === 1 || selected.length > 50} onClick={() => setStep(2)}>Next: Set discount</button>
      </section>
      <section className={setup.layout} hidden={step !== 2}>
        <div className={setup.editor}>
          <span className={setup.eyebrow}>MAKE IT A BETTER DEAL</span>
          <h2>Set your bundle discount</h2>
          <p className={setup.description}>Give customers a little extra when they build their own bundle.</p>
          <label className={setup.label} htmlFor="bundle-percentage">Discount percentage</label>
          <div className={setup.inputWrap}><input id="bundle-percentage" aria-describedby="discount-help" name="percentage" type="number" min="0" max="100" step="1" required={step === 2} value={percentage} disabled={busy} onChange={event => { setPercentage(event.target.value); setDirty(true); }} /><span aria-hidden="true">%</span></div>
          <p id="discount-help" className={setup.description}>Choose a whole number from 0 to 100. Use 0 for no extra discount.</p>
          <div className={setup.presets} aria-label="Suggested discounts">{[0, 5, 10, 15, 20].map(value => <button key={value} type="button" disabled={busy} aria-pressed={percentage === String(value)} onClick={() => { setPercentage(String(value)); setDirty(true); }}>{value === 0 ? 'No discount' : `${value}%`}</button>)}</div>
          <div className={setup.note}><strong>How it works</strong><p>The discount applies when customers add at least two different eligible products to their custom bundle.</p></div>
        </div>
        <aside className={setup.summary} aria-label="Bundle summary">
          <div className={setup.summaryHeading}><h2>Ready to apply?</h2><span>{selected.length} products</span></div>
          <ul className={setup.products}>{choices.filter(product => selected.includes(product.id)).map(product => <li key={product.id}><span aria-hidden="true">✓</span>{product.title}</li>)}</ul>
          <div className={setup.discount}><span>Bundle discount</span><strong>{percentage.trim() !== '' && Number.isInteger(Number(percentage)) && Number(percentage) >= 0 && Number(percentage) <= 100 ? `${percentage}%` : '—'}</strong></div>
          <p className={setup.description}>{selected.length ? 'Your selected products become available after Apply succeeds.' : 'Applying with no products selected will disable custom bundles.'}</p>
          <button className={styles.primary} type="submit" disabled={busy || selected.length === 1 || selected.length > 50}>{busy ? 'Applying…' : selected.length ? 'Apply bundle settings' : 'Disable custom bundles'}</button>
          <button className={setup.back} type="button" disabled={busy} onClick={() => setStep(1)}>← Back to products</button>
        </aside>
      </section>
    </Form>
  </main>;
}
