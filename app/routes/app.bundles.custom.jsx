import { Form, Link, data, useLoaderData, useActionData, useNavigation } from 'react-router';
import { useState } from 'react';
import { Banner } from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { listProducts } from '../services/products.server';
import { getCustomBundleSettings, saveCustomBundleProducts } from '../services/custom-bundle.server';
import styles from '../styles/bundle-editor.module.css';

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
  const result = useActionData();
  const busy = useNavigation().state !== 'idle';
  const choices = [...products, ...selectedIds.filter(id => !products.some(product => product.id === id)).map(id => ({ id, title: 'Unavailable product', missing: true }))];
  const visible = choices.filter(product => product.title.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle = id => { setDirty(true); setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); };
  return <main className={styles.page}>
    <Link className={styles.back} to="/app/bundles">All bundles</Link>
    <header className={styles.header}><div><h1>Custom bundle products</h1><p>Choose which products customers can combine into their own bundle.</p></div></header>
    {result?.error && <Banner tone="critical">{result.error}</Banner>}
    {result?.saved && !dirty && <Banner tone="success">Custom bundle products saved. Your storefront uses this list.</Banner>}
    <Form method="post" onSubmit={() => setDirty(false)}>
      {selected.map(id => <input key={id} type="hidden" name="productIds" value={id} />)}
      <section className={styles.card}>
        <div className={styles.sectionHeading}><div><h2>Eligible products</h2><p>Select 2–50 products. Customers must choose at least 2 different products from this list.</p></div><b className={styles.count}>{selected.length} selected</b></div>
        <p>Keep the Bundle offers app block on your product template. This list applies to all bundle blocks. Only available products published to your online store can be purchased.</p>
        <label className={styles.field}>Custom bundle discount (%)<input name="percentage" type="number" min="0" max="100" step="1" required value={percentage} disabled={busy} onChange={event => { setPercentage(event.target.value); setDirty(true); }} /></label>
        <p>Applied to current product prices when the cart contains at least two different eligible products in the same custom bundle. Set 0 for no extra discount.</p>
        <label className={styles.search}><span className={styles.srOnly}>Search products</span><input type="search" placeholder="Search products" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className={styles.list} role="group" aria-label="Eligible custom bundle products">
          {visible.map(product => <label className={styles.product} key={product.id} data-selected={selected.includes(product.id)}>
            <input type="checkbox" checked={selected.includes(product.id)} onChange={() => toggle(product.id)} disabled={busy || (!selected.includes(product.id) && (selected.length >= 50 || product.missing))} />
            <span><strong>{product.title}</strong>{product.missing && <small>Remove this unavailable product before saving.</small>}</span>
          </label>)}
          {!visible.length && <p className={styles.empty}>No products found.</p>}
        </div>
        <div className={styles.listFooter}><span>{visible.length} products shown</span><button type="button" disabled={busy || !selected.length} onClick={() => { setSelected([]); setDirty(true); }}>Clear selection</button></div>
        <p>Clear the selection and save to hide the custom bundle button.</p>
        {selected.length === 1 && <p role="status">Select at least one more product, or clear the selection to disable custom bundles.</p>}
        <button className={styles.primary} type="submit" disabled={busy || selected.length === 1 || selected.length > 50}>{busy ? 'Saving…' : 'Save eligible products'}</button>
      </section>
    </Form>
  </main>;
}
