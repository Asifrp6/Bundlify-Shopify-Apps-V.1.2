/* eslint-disable react/prop-types */
import { useState } from "react";
import ProductCategoryFilter from "./ProductCategoryFilter";
import { capProductSelection, categoryLabel, filterBundleProducts, selectCategoryProducts } from "../services/product-categories";
import { limitMessage, storefrontIssue, toggleProduct } from "../services/product-selection";
import styles from "../styles/bundle-editor.module.css";

export default function ProductPicker({
  products,
  selected,
  onChange,
  maxProducts,
  disabled = false,
  name,
  idPrefix = "product",
  label = "Products",
  itemLabel = "products",
  emptyText = "No products match your search.",
  missingText = "No longer available. Remove this product to save.",
  storefrontStatus = false,
}) {
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState([]);
  const visible = filterBundleProducts(products, search, categories);
  const changeCategory = (id, checked) => {
    setCategories(current => checked ? [...new Set([...current, id])] : current.filter(value => value !== id));
    onChange(capProductSelection(selected, selectCategoryProducts(products, selected, id, checked), maxProducts));
  };
  return <>
    {name && selected.map(id => <input key={id} type="hidden" name={name} value={id} />)}
    <label className={styles.search}><span className={styles.srOnly}>Search products</span><input type="search" placeholder="Search products" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)} /></label>
    <ProductCategoryFilter products={products} value={categories} onChange={changeCategory} disabled={disabled} maxProducts={maxProducts} />
    {selected.length > maxProducts && <p className={styles.error} role="alert">{limitMessage(selected.length, maxProducts, itemLabel)}</p>}
    <div className={styles.list} role="group" aria-label={label}>
      {visible.map(product => {
        const checked = selected.includes(product.id);
        const hidden = storefrontStatus && !product.missing && storefrontIssue(product);
        return <label key={product.id} className={styles.product} data-selected={checked} htmlFor={`${idPrefix}-${product.id}`}>
          <input id={`${idPrefix}-${product.id}`} type="checkbox" checked={checked} onChange={() => onChange(toggleProduct(selected, product.id))} disabled={disabled || (!checked && (selected.length >= maxProducts || product.missing))} />
          <span className={styles.productIcon} aria-hidden="true">{product.title.slice(0, 1).toUpperCase()}</span>
          <span><strong>{product.title}</strong><small className={styles.categoryLabel}>{categoryLabel(product)}</small>{product.missing && <small>{missingText}</small>}{hidden && <small className={styles.error}>Not shown on your store: {hidden}</small>}</span>
          {checked && <span className={styles.selectedLabel}>Selected</span>}
        </label>;
      })}
      {!visible.length && <div className={styles.empty}>{emptyText}</div>}
    </div>
    <div className={styles.listFooter}>
      <span role="status">{selected.length} of {maxProducts} selected &middot; {visible.length} shown</span>
      <button type="button" disabled={disabled || !selected.length} onClick={() => { onChange([]); setCategories([]); }}>Clear selection</button>
    </div>
  </>;
}
