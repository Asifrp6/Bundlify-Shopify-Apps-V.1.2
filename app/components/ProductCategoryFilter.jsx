/* eslint-disable react/prop-types */
import { productCategories } from "../services/product-categories";
import styles from "../styles/bundle-editor.module.css";

export default function ProductCategoryFilter({ products, value, onChange, disabled }) {
  return <fieldset className={styles.categoryFilter} disabled={disabled}>
    <legend>Select product categories</legend>
    <div className={styles.categoryChoices}>
      {productCategories(products).filter(category => category.id !== "unavailable").map(category => <label key={category.id}>
        <input type="checkbox" checked={value.includes(category.id)} onChange={event => onChange(category.id, event.target.checked)} />
        <span>{category.label} ({category.count})</span>
      </label>)}
    </div>
    <small>Select multiple categories to add all their products, then uncheck any products you want to exclude. Unchecking a category removes its products. One discount applies to the final selection (maximum 50 products).</small>
  </fieldset>;
}
