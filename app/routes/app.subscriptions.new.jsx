import styles from "../styles/plan-form.module.css";
import { schedules } from "../services/delivery-options";
import {
  data,
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useRevalidator,
} from "react-router";

import { Banner } from "@shopify/polaris";

import { useState } from "react";

import { authenticate } from "../shopify.server";

import {
  listProducts,
  getProducts,
  productLoadFailure,
} from "../services/products.server";
import { validatePlan } from "../services/validation";
import { createSubscription } from "../services/subscriptions.server";
import prisma from "../db.server";

// ==========================
// LOADER
// ==========================

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  try {
    const products = await listProducts(admin);

    return data({
      products,
      error: null,
    });
  } catch (error) {
    // Authentication recovery responses must reach the router unchanged.
    if (error instanceof Response) throw error;
    const failure = productLoadFailure(error);
    console.error("[Bundlify product load]", {
      code: failure.code,
      status: failure.status,
    });

    return data({
      products: [],
      error: `${failure.message} (${failure.code})`,
    });
  }
}

// ==========================
// ACTION
// ==========================

export async function action({ request }) {
  // Authentication may throw a redirect; let React Router handle it.
  const { admin, session, redirect } = await authenticate.admin(request);
  const form = await request.formData();
  const status = form.get("status") || "ACTIVE";
  if (!["DRAFT", "ACTIVE"].includes(status)) return data({ error: "Choose Draft or Active." }, { status: 400 });
  const { values, errors } = validatePlan(form);
  values.status = status;
  if (Object.keys(errors).length) {
    return data({ error: Object.values(errors).join(" ") }, { status: 400 });
  }
  let product;
  try {
    if (values.productId === "ALL_PRODUCTS") {
      const catalog = await listProducts(admin);
      if (!catalog.length)
        return data(
          { error: "Add products before creating a subscription." },
          { status: 400 },
        );
      values.productIds = catalog.map((item) => item.id);
      product = { title: "All products" };
    } else {
      [product] = await getProducts(admin, [values.productId]);
    }
  } catch (error) {
    if (error instanceof Response) throw error;
    return data(
      { error: "Unable to verify the product. Please try again." },
      { status: 502 },
    );
  }
  if (!product) {
    return data(
      { error: "The selected product is no longer available." },
      { status: 400 },
    );
  }
  try {
    await createSubscription({
      prisma,
      admin,
      shop: session.shop,
      values,
      product,
    });
  } catch (error) {
    return data(
      {
        error:
          error.publicMessage ||
          "Could not create the subscription. Check your plan list before retrying.",
      },
      { status: 502 },
    );
  }
  return redirect("/app/subscriptions?created=1");
}

// ==========================
// FRONTEND
// ==========================

export default function NewSubscription() {
  const { products, error } = useLoaderData();

  const result = useActionData();

  const navigation = useNavigation();
  const revalidator = useRevalidator();

  const submitting = navigation.state !== "idle";
  const [status, setStatus] = useState("DRAFT");

  const [name, setName] = useState("");

  const [options, setOptions] = useState([
    { frequency: "Monthly", discount: 0 },
  ]);

  const [productId, setProductId] = useState("");

  const selectedProduct = products.find((product) => product.id === productId);
  const updateOption = (index, key, value) =>
    setOptions((current) =>
      current.map((option, i) =>
        i === index ? { ...option, [key]: value } : option,
      ),
    );
  const addOption = () =>
    setOptions((current) => [
      ...current,
      {
        frequency: Object.keys(schedules).find(
          (frequency) =>
            !current.some((option) => option.frequency === frequency),
        ),
        discount: 0,
      },
    ]);

  return (
    <div className={styles.page}>
      <Link to="/app/subscriptions" className={styles.back}>
        <span aria-hidden="true">&rarr;</span> Subscription plans
      </Link>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>SUBSCRIPTIONS</p>
          <h1>Create subscription plan</h1>
          <p>Turn one-time purchases into repeat deliveries.</p>
        </div>
        <span className={styles.tag}>New plan</span>
      </header>
      <Form method="post" className={styles.form} aria-busy={submitting}>
        {error && (
          <Banner
            tone="critical"
            action={{
              content: "Retry loading products",
              onAction: () => revalidator.revalidate(),
              loading: revalidator.state !== "idle",
            }}
          >
            {error}
          </Banner>
        )}
        {result?.error && <Banner tone="critical">{result.error}</Banner>}
        {!products.length && !error && (
          <Banner>
            Add products in Shopify before creating a subscription.
          </Banner>
        )}
        <div className={styles.layout}>
          <div className={styles.sections}>
            <section
              className={styles.card}
              aria-labelledby="plan-details-heading"
            >
              <div className={styles.sectionHeading}>
                <span className={styles.number}>01</span>
                <div>
                  <h2 id="plan-details-heading">Plan details</h2>
                  <p>Give your subscription a name customers will recognize.</p>
                </div>
              </div>
              <label className={styles.field} htmlFor="plan-name">
                Plan name{" "}
                <input
                  id="plan-name"
                  name="name"
                  required
                  maxLength={120}
                  autoComplete="off"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Monthly Coffee Club"
                  aria-describedby="name-help"
                />
              </label>
              <p className={styles.help} id="name-help">
                Customers will see this name in their purchase options.
              </p>
            </section>
            <section className={styles.card} aria-labelledby="products-heading">
              <div className={styles.sectionHeading}>
                <span className={styles.number}>02</span>
                <div>
                  <h2 id="products-heading">Choose products</h2>
                  <p>Decide where this subscription will be available.</p>
                </div>
              </div>
              <label className={styles.field} htmlFor="plan-product">
                Apply plan to
                <select
                  id="plan-product"
                  name="productId"
                  required
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                  aria-describedby="product-help"
                >
                  <option value="" disabled>
                    Select a product
                  </option>
                  <option value="ALL_PRODUCTS">All current products</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </select>
              </label>
              <p className={styles.help} id="product-help">
                {productId === "ALL_PRODUCTS"
                  ? "Includes your current catalog. Products added later aren't included automatically."
                  : "Choose one product, or offer this plan across your current catalog."}
              </p>
            </section>
            <section className={styles.card} aria-labelledby="delivery-heading">
              <div className={styles.sectionHeading}>
                <span className={styles.number}>03</span>
                <div>
                  <h2 id="delivery-heading">Delivery & savings</h2>
                  <p>
                    Let customers choose how often they receive their order.
                  </p>
                </div>
              </div>
              <input
                type="hidden"
                name="deliveryOptions"
                value={JSON.stringify(options)}
              />
              <div className={styles.options}>
                {options.map((option, index) => (
                  <div className={styles.option} key={index}>
                    <div className={styles.optionHeader}>
                      <span>Delivery option {index + 1}</span>
                      <button
                        type="button"
                        className={styles.remove}
                        disabled={submitting || options.length === 1}
                        aria-label={"Remove delivery option " + (index + 1)}
                        onClick={() =>
                          setOptions((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <div className={styles.optionFields}>
                      <label
                        className={styles.field}
                        htmlFor={"frequency-" + index}
                      >
                        Delivery frequency
                        <select
                          id={"frequency-" + index}
                          value={option.frequency}
                          onChange={(event) =>
                            updateOption(index, "frequency", event.target.value)
                          }
                        >
                          {Object.keys(schedules).map((frequency) => (
                            <option
                              key={frequency}
                              disabled={options.some(
                                (other, i) =>
                                  i !== index && other.frequency === frequency,
                              )}
                            >
                              {frequency}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label
                        className={styles.field}
                        htmlFor={"discount-" + index}
                      >
                        Customer discount
                        <div className={styles.inputSuffix}>
                          <input
                            id={"discount-" + index}
                            type="number"
                            required
                            min="0"
                            max="100"
                            step="1"
                            value={option.discount}
                            onChange={(event) =>
                              updateOption(
                                index,
                                "discount",
                                event.target.value,
                              )
                            }
                          />
                          <span aria-hidden="true">%</span>
                        </div>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className={styles.add}
                type="button"
                disabled={submitting || options.length >= 5}
                onClick={addOption}
              >
                <span aria-hidden="true">+</span> Add delivery option
              </button>
              <p className={styles.help}>
                Offer up to 5 frequencies. Set 0% to keep the regular price.
              </p>
            </section>
          </div>
          <aside className={styles.summary} aria-labelledby="summary-heading">
            <label className={styles.summaryLabel}>Plan status<select name="status" value={status} onChange={event => setStatus(event.target.value)} style={{ display: "block", width: "100%", padding: 10, margin: "8px 0 16px", borderRadius: 8 }}><option value="DRAFT">Draft ? save for later</option><option value="ACTIVE">Active ? publish to storefront</option></select></label>
            <div className={styles.summaryTop}>
              <span className={styles.eyebrow}>AT A GLANCE</span>
              <span className={styles.previewTag}>Live summary</span>
            </div>
            <h2 id="summary-heading">
              {name.trim() || "Your subscription plan"}
            </h2>
            <p className={styles.summaryDescription}>
              A recurring delivery, on your customer&apos;s schedule.
            </p>
            <div className={styles.productSummary}>
              <span>APPLIES TO</span>
              <strong>
                {productId === "ALL_PRODUCTS"
                  ? "All current products"
                  : selectedProduct?.title || "No product selected yet"}
              </strong>
            </div>
            <p className={styles.summaryLabel}>
              DELIVERY OPTIONS &middot; {options.length}
            </p>
            <ul className={styles.previewOptions}>
              {options.map((option, index) => (
                <li key={index}>
                  <span>{option.frequency}</span>
                  <strong>
                    {option.discount === ""
                      ? "Set discount"
                      : Number(option.discount) === 0
                        ? "Regular price"
                        : option.discount + "% off"}
                  </strong>
                </li>
              ))}
            </ul>
            <p className={styles.summaryNote}>
              Customers choose one delivery option when they subscribe.
            </p>
            <div className={styles.summaryFooter}>
              Review your details, then create your plan.
            </div>
          </aside>
        </div>
        <footer className={styles.actions}>
          <p>Your plan will be created when you save.</p>
          <div>
            <Link to="/app/subscriptions" className={styles.cancel}>
              Cancel
            </Link>
            <button
              type="submit"
              className={styles.primary}
              disabled={submitting || !products.length || !!error}
            >
              {submitting ? "Saving plan..." : status === "DRAFT" ? "Save subscription draft" : "Create active subscription"}
              <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </footer>
      </Form>
    </div>
  );
}
