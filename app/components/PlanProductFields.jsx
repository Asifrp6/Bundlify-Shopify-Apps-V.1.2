/* eslint-disable react/prop-types */
import ProductPicker from "./ProductPicker";
import { ALL_PRODUCTS, SELECTED_PRODUCTS } from "../services/product-selection";

export default function PlanProductFields({
  products,
  productId,
  onProductIdChange,
  selected,
  onSelectedChange,
  maxProducts,
  disabled,
  styles,
  id = "plan-product",
  label = "Apply plan to",
  selectName = "productId",
  pickerProps = {
    name: "productIds",
    idPrefix: "subscription-product",
    label: "Subscription products",
    missingText: "No longer available in Shopify. Uncheck it to save.",
  },
  help,
  alert,
}) {
  const helpId = `${id}-help`;
  return <>
    <label className={styles.field} htmlFor={id}>
      {label}
      <select id={id} name={selectName || undefined} required={!!selectName} value={productId} onChange={event => onProductIdChange(event.target.value)} aria-describedby={helpId}>
        <option value="" disabled>Select a product</option>
        <option value={ALL_PRODUCTS}>All current products</option>
        <option value={SELECTED_PRODUCTS}>Choose products or categories</option>
        {products.map(product => <option key={product.id} value={product.id}>{product.title}</option>)}
      </select>
    </label>
    {productId === SELECTED_PRODUCTS && <ProductPicker
      products={products}
      selected={selected}
      onChange={onSelectedChange}
      maxProducts={maxProducts}
      disabled={disabled}
      {...pickerProps}
    />}
    {alert && <p className={styles.error} role="alert">{alert}</p>}
    <p className={styles.help} id={helpId}>
      {help ?? (productId === ALL_PRODUCTS
        ? "Includes your current catalog. Products added later aren't included automatically."
        : productId === SELECTED_PRODUCTS
          ? `Select 1–${maxProducts} products. Products added to these categories later are not included automatically.`
          : "Choose a product, select products by category, or include your current catalog.")}
    </p>
  </>;
}
