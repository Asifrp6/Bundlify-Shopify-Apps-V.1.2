/* eslint-disable react/prop-types */
import PlanProductFields from "./PlanProductFields";
import { ALL_PRODUCTS, SELECTED_PRODUCTS, bundleSelectionChange, limitMessage } from "../services/product-selection";
import styles from "../styles/bundle-editor.module.css";

const fieldStyles = { field: styles.productField, help: styles.productHelp, error: styles.error };

export default function BundleProductFields({ products, mode, onModeChange, selected, onSelectedChange, maxProducts, disabled, idPrefix, label, emptyText, missingText, emptyHelp }) {
  const overLimit = selected.length > maxProducts;
  const help = mode === ALL_PRODUCTS
    ? selected.length < 2
      ? "Your catalog needs at least 2 available products to build a bundle."
      : `Includes your current catalog (${selected.length} products). Products added later aren't included automatically.`
    : mode === SELECTED_PRODUCTS
      ? selected.length === 1
        ? "Select at least one more product. Bundles need 2 or more products."
        : `Select 2–${maxProducts} products. Products added to these categories later are not included automatically.`
      : emptyHelp || "Choose a product, select products by category, or include your current catalog.";
  const change = value => {
    const next = bundleSelectionChange(mode, value, selected, products);
    onModeChange(next.mode);
    onSelectedChange(next.selected);
  };
  return <PlanProductFields
    products={products}
    productId={mode}
    onProductIdChange={change}
    selected={selected}
    onSelectedChange={onSelectedChange}
    maxProducts={maxProducts}
    disabled={disabled}
    styles={fieldStyles}
    id={`${idPrefix}-mode`}
    label="Products in this bundle"
    selectName={null}
    pickerProps={{ idPrefix, label, itemLabel: "products per bundle", emptyText, missingText, storefrontStatus: true }}
    help={help}
    alert={mode === ALL_PRODUCTS && overLimit ? limitMessage(selected.length, maxProducts, "products per bundle") : null}
  />;
}
