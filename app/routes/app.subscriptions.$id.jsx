import { discountLabel } from "../services/discounts";
import styles from "../styles/plan-form.module.css";
import { planOptions, schedules } from "../services/delivery-options";
import {
  data,
  Form,
  Link,
  useLoaderData,
  useActionData,
  useNavigation,
} from "react-router";
import { Banner } from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { validatePlan } from "../services/validation";
import { changeSubscription } from "../services/subscription-management.server";

async function findPlan(id, shop) {
  if (
    !/^[1-9]\d*$/.test(id || "") ||
    !Number.isSafeInteger(Number(id)) ||
    Number(id) > 2147483647
  )
    throw new Response("Not found", { status: 404 });
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { id: Number(id), shop },
    include: { deliveryOptions: true },
  });
  if (!plan) throw new Response("Not found", { status: 404 });
  return plan;
}
export async function loader({ request, params }) {
  const { session } = await authenticate.admin(request);
  return { plan: await findPlan(params.id, session.shop) };
}
export async function action({ request, params }) {
  const { admin, session, redirect } = await authenticate.admin(request);
  const plan = await findPlan(params.id, session.shop);
  const form = await request.formData();
  const intent = form.get("intent");
  if (!["update", "delete"].includes(intent))
    return data({ error: "Invalid action." }, { status: 400 });
  if (intent === "delete" && form.get("confirmDelete") !== "yes")
    return data(
      { error: "Confirm deletion before continuing." },
      { status: 400 },
    );
  form.set("productId", plan.productId);
  for (const id of JSON.parse(plan.productIdsJson || "[]")) form.append("productIds", id);
  const { values, errors } = validatePlan(form);
  if (intent === "update" && Object.keys(errors).length)
    return data({ error: Object.values(errors).join(" ") }, { status: 400 });
  try {
    await changeSubscription({
      prisma,
      admin,
      plan,
      values,
      remove: intent === "delete",
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    return data(
      { error: error.message || "Unable to change the plan." },
      { status: 502 },
    );
  }
  return redirect(
    `/app/subscriptions?${intent === "delete" ? "deleted" : "updated"}=1`,
  );
}
export default function EditSubscription() {
  const { plan } = useLoaderData();
  const result = useActionData();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const [name, setName] = useState(plan.name);
  const [options, setOptions] = useState(planOptions(plan));

  const [confirm, setConfirm] = useState(false);

  const productTitle =
    plan.productTitle ||
    (plan.productId === "ALL_PRODUCTS" ? "All products" : plan.productId);
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
  const deleting = busy && navigation.formData?.get("intent") === "delete";
  return (
    <div className={styles.page}>
      <Link to="/app/subscriptions" className={styles.back}>
        <span aria-hidden="true">&larr;</span> Subscription plans
      </Link>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>SUBSCRIPTIONS</p>
          <h1>Edit subscription plan</h1>
          <p>Fine-tune your delivery options and customer savings.</p>
        </div>
        <span className={styles.tag}>Edit plan</span>
      </header>
      <div className={styles.sections}>
        {result?.error && <Banner tone="critical">{result.error}</Banner>}
        <div className={styles.infoNote}>
          <strong>For future purchases</strong>
          <p>
            Changes apply to the selling plan offered for future purchases.
            Existing customer subscriptions are not changed or cancelled.
          </p>
        </div>
        <Form method="post" className={styles.form} aria-busy={busy}>
          <input type="hidden" name="intent" value="update" />
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
                    <p>Keep your subscription easy to recognize.</p>
                  </div>
                </div>
                <label className={styles.field} htmlFor="plan-name">
                  Plan name
                  <input
                    id="plan-name"
                    name="name"
                    required
                    maxLength={120}
                    autoComplete="off"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    aria-describedby="name-help"
                  />
                </label>
                <p className={styles.help} id="name-help">
                  Customers will see this name in their purchase options.
                </p>
                <div className={styles.assignedProduct}>
                  <span>ASSIGNED PRODUCT</span>
                  <strong>{productTitle}</strong>
                  <p>This plan stays linked to its current products.</p>
                </div>
              </section>
              <section
                className={styles.card}
                aria-labelledby="delivery-heading"
              >
                <div className={styles.sectionHeading}>
                  <span className={styles.number}>02</span>
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
                          disabled={busy || options.length === 1}
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
                              updateOption(
                                index,
                                "frequency",
                                event.target.value,
                              )
                            }
                          >
                            {Object.keys(schedules).map((frequency) => (
                              <option
                                key={frequency}
                                disabled={options.some(
                                  (other, i) =>
                                    i !== index &&
                                    other.frequency === frequency,
                                )}
                              >
                                {frequency}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.field}>Discount type<select value={option.discountType || "percentage"} onChange={event => { updateOption(index, "discountType", event.target.value); updateOption(index, "discount", 0); }}><option value="percentage">Percentage (%)</option><option value="fixed">Fixed amount (store currency)</option></select></label>
                        <label className={styles.field} htmlFor={"discount-" + index}
                        >
                          Customer discount
                          <div className={styles.inputSuffix}>
                            <input
                              id={"discount-" + index}
                              type="number"
                              required
                              min="0"
                              max={option.discountType === "fixed" ? "1000000" : "100"}
                              step={option.discountType === "fixed" ? "0.01" : "1"}
                              value={option.discount}
                              onChange={(event) =>
                                updateOption(
                                  index,
                                  "discount",
                                  event.target.value,
                                )
                              }
                            />
                            <span aria-hidden="true">{option.discountType === "fixed" ? "off" : "%"}</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  className={styles.add}
                  type="button"
                  disabled={busy || options.length >= 5}
                  onClick={addOption}
                >
                  <span aria-hidden="true">+</span> Add delivery option
                </button>
                <p className={styles.help}>
                  Offer up to 5 frequencies. Fixed amounts are deducted per item in store currency on each delivery. Set 0 for the regular price.
                </p>
              </section>
            </div>
            <aside className={styles.summary} aria-labelledby="summary-heading">
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
                <strong>{productTitle}</strong>
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
                          : discountLabel(option.discount, option.discountType)}
                    </strong>
                  </li>
                ))}
              </ul>
              <p className={styles.summaryNote}>
                Customers choose one delivery option when they subscribe.
              </p>
              <div className={styles.summaryFooter}>
                Changes apply to future purchases.
              </div>
            </aside>
          </div>
          <footer className={styles.actions}>
            <p>Review your changes before saving.</p>
            <div>
              <Link to="/app/subscriptions" className={styles.cancel}>
                Cancel
              </Link>
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy && !deleting ? "Saving changes..." : "Save changes"}
                <span aria-hidden="true">&rarr;</span>
              </button>
            </div>
          </footer>
        </Form>
        <section
          id="delete-plan"
          className={styles.danger}
          aria-labelledby="delete-heading"
        >
          <div>
            <p className={styles.dangerLabel}>PLAN MANAGEMENT</p>
            <h2 id="delete-heading">Delete this plan</h2>
            <p>
              Remove this selling plan from Shopify and your plan list. This
              cannot be undone.
            </p>
          </div>
          <Form
            method="post"
            className={styles.deleteForm}
            aria-busy={deleting}
          >
            <label className={styles.confirm}>
              <input
                type="checkbox"
                name="confirmDelete"
                value="yes"
                required
                checked={confirm}
                onChange={(event) => setConfirm(event.target.checked)}
                disabled={busy}
              />
              I confirm I want to delete this plan
            </label>
            <input type="hidden" name="intent" value="delete" />
            <button
              type="submit"
              className={styles.dangerButton}
              disabled={busy || !confirm}
            >
              {deleting ? "Deleting plan..." : "Delete plan"}
            </button>
          </Form>
        </section>
      </div>
    </div>
  );
}
