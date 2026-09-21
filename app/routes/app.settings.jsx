import { useState } from "react";
import {
  data,
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import AppearanceIcon from "../components/AppearanceIcon";
import {
  colorKeys,
  defaults,
  fields,
  iconOptions,
  validateAppearance,
} from "../services/appearance";
import { getAppearance, saveAppearance } from "../services/appearance.server";
import { authenticate } from "../shopify.server";
import styles from "../styles/settings.module.css";
export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  return getAppearance(admin);
}
export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const kind = String(form.get("kind"));
  try {
    const values = validateAppearance(kind, form);
    const { shopId } = await getAppearance(admin);
    await saveAppearance(admin, shopId, kind, values);
    return { saved: kind };
  } catch (error) {
    if (error instanceof Response) throw error;
    return data({ error: error.message, kind }, { status: 400 });
  }
}
/* eslint-disable react/prop-types */

function BlockSettings({ kind, initial }) {
  const [values, setValues] = useState(initial);
  const [previewChoice, setPreviewChoice] = useState(0);
  const result = useActionData();
  const navigation = useNavigation();
  const bundle = kind === "bundle";
  const title = bundle ? "Bundle block" : "Subscription block";
  const saving =
    navigation.state !== "idle" && navigation.formData?.get("kind") === kind;
  const update = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }));
  const selectedStyle = {
    background: values.accent,
    color: values.buttonTextColor,
  };
  return (
    <section
      id={kind}
      className={styles.section}
      aria-labelledby={kind + "-title"}
    >
      <header className={styles.sectionHeader}>
        <span className={styles.blockIcon} aria-hidden="true">
          <AppearanceIcon name={bundle ? "gift" : "repeat"} />
        </span>
        <div>
          <h2 id={kind + "-title"}>{title}</h2>
          <p>
            {bundle
              ? "Make your product pairings feel like your brand."
              : "Give your purchase options a personal touch."}
          </p>
        </div>
        <span className={styles.badge}>Storefront</span>
      </header>
      <Form method="post">
        <input type="hidden" name="kind" value={kind} />
        <div className={styles.layout}>
          <div className={styles.controls}>
            <fieldset className={styles.group}>
              <legend>Colors</legend>
              <p className={styles.hint}>A palette that feels like</p>
              <div className={styles.colorGrid}>
                {colorKeys.map((key) => (
                  <label className={styles.colorField} key={key}>
                    <span>{fields[key]}</span>
                    <div className={styles.colorControl}>
                      <input
                        aria-label={fields[key]}
                        name={key}
                        type="color"
                        value={values[key]}
                        onChange={(event) => update(key, event.target.value)}
                      />
                      <span>{values[key].toUpperCase()}</span>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className={styles.group}>
              <legend>Typography</legend>
              <label className={styles.textField}>
                <span>Font size (px)</span>
                <input
                  name="fontSize"
                  type="number"
                  min="12"
                  max="24"
                  step="1"
                  required
                  value={values.fontSize}
                  onChange={(event) => update("fontSize", event.target.value)}
                />
              </label>
              <p className={styles.hint}>
                Automatically matches your store’s body and heading fonts. Sizes
                scale together from 12–24 px. This preview uses the app font;
                your storefront uses your theme font.
              </p>
            </fieldset>

            <fieldset className={styles.group}>
              <legend>Typography</legend>
              <label className={styles.textField}>
                <span>Font size (px)</span>
                <input
                  name="fontSize"
                  type="number"
                  min="12"
                  max="24"
                  step="1"
                  required
                  value={values.fontSize}
                  onChange={(event) => update("fontSize", event.target.value)}
                />
              </label>
              <p className={styles.hint}>
                Automatically matches your store’s body and heading fonts. Sizes
                scale together from 12–24 px. This preview uses the app font;
                your storefront uses your theme font.
              </p>
            </fieldset>

            <fieldset className={styles.group}>
              <legend>Brand logo</legend>
              <label className={styles.textField}>
                <span>
                  Image URL <em>Optional</em>
                </span>
                <input
                  name="logoUrl"
                  type="url"
                  placeholder="https://cdn.shopify.com/your-logo.png"
                  value={values.logoUrl}
                  onChange={(event) => update("logoUrl", event.target.value)}
                  maxLength={2048}
                />
              </label>
              <p className={styles.hint}>
                Paste an image link from Shopify Content → Files. Leave blank to
                hide your logo.
              </p>
            </fieldset>
            <fieldset className={styles.group}>
              <legend>Card icons</legend>
              <div className={styles.textGrid}>
                {Object.keys(defaults[kind])
                  .filter((key) => key.endsWith("Icon"))
                  .map((key) => (
                    <label className={styles.textField} key={key}>
                      <span>{fields[key]}</span>
                      <select
                        name={key}
                        value={values[key]}
                        onChange={(event) => update(key, event.target.value)}
                      >
                        {Object.entries(iconOptions).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
              </div>
            </fieldset>
            <fieldset className={styles.group}>
              <legend>Text & labels</legend>
              <div className={styles.textGrid}>
                {Object.keys(defaults[kind])
                  .filter(
                    (key) =>
                      !colorKeys.includes(key) &&
                      key !== "logoUrl" &&
                      key !== "fontSize" &&
                      !key.endsWith("Icon"),
                  )
                  .map((key) => (
                    <label className={styles.textField} key={key}>
                      <span>
                        {key === "buttonText" && !bundle
                          ? "Subscription choice label"
                          : fields[key]}
                      </span>
                      <input
                        name={key}
                        type="text"
                        value={values[key]}
                        onChange={(event) => update(key, event.target.value)}
                        required
                        maxLength={100}
                      />
                    </label>
                  ))}
              </div>
            </fieldset>
          </div>
          <aside
            className={styles.previewPanel}
            aria-label={title + " preview"}
          >
            <div className={styles.previewHeader}>
              <span>
                <i />
                Live preview
              </span>
              <span>Example content</span>
            </div>
            <div className={styles.previewStage}>
              <div
                className={styles.preview}
                style={{
                  background: values.background,
                  color: values.text,
                  borderColor: values.borderColor,
                  ...Object.fromEntries(
                    colorKeys.map((key) => ["--bl-" + key, values[key]]),
                  ),
                  "--preview-font-scale":
                    Math.min(24, Math.max(12, Number(values.fontSize) || 16)) /
                    16,
                }}
              >
                {/^https:\/\//.test(values.logoUrl) && (
                  <img
                    className={styles.customLogo}
                    src={values.logoUrl}
                    alt="Block logo"
                  />
                )}
                <h3>{values.heading}</h3>
                {!bundle && (
                  <p className={styles.purchaseHint}>{values.purchaseHint}</p>
                )}
                <div
                  className={styles.optionCards}
                  role="group"
                  aria-label="Preview option cards"
                >
                  {(bundle
                    ? [
                        [
                          values.presetIcon,
                          values.presetText,
                          values.presetDescription,
                        ],
                        [
                          values.customIcon,
                          values.customText,
                          values.customDescription,
                        ],
                      ]
                    : [
                        [
                          values.oneTimeIcon,
                          values.oneTimeText,
                          values.oneTimeDescription,
                        ],
                        [
                          values.subscriptionIcon,
                          values.buttonText,
                          values.subscriptionDescription,
                        ],
                      ]
                  ).map(([icon, label, description], index) => (
                    <button
                      type="button"
                      key={index}
                      aria-pressed={previewChoice === index}
                      onClick={() => setPreviewChoice(index)}
                    >
                      <AppearanceIcon name={icon} />
                      <strong>{label}</strong>
                      <small>{description}</small>
                      {!bundle && index === 0 && <b>$100.00</b>}
                    </button>
                  ))}
                </div>
                {bundle ? (
                  <>
                    {["Everyday essentials", "The perfect companion"].map(
                      (name, index) => (
                        <div className={styles.product} key={name}>
                          <span
                            className={styles.productArt}
                            aria-hidden="true"
                          >
                            {index ? "?" : "?"}
                          </span>
                          <div>
                            <strong>{name}</strong>
                            <small>Example product</small>
                            <b>{index ? "$40.00" : "$60.00"}</b>
                          </div>
                        </div>
                      ),
                    )}
                    <div className={styles.total}>
                      <span>
                        Bundle total<small>You save $10.00 (10%)</small>
                      </span>
                      <strong>
                        <s>$100.00</s>$90.00
                      </strong>
                    </div>
                    <div className={styles.previewButton} style={selectedStyle}>
                      {values.buttonText}
                    </div>
                  </>
                ) : (
                  <>
                    <p className={styles.frequency}>DELIVERY FREQUENCY</p>
                    <div className={styles.delivery} style={selectedStyle}>
                      <span aria-hidden="true">?</span>
                      <div>
                        <strong>Every month</strong>
                        <small>Save 10% on every delivery</small>
                      </div>
                      <b>$90.00</b>
                    </div>
                    <p className={styles.details}>
                      Subscription details <span aria-hidden="true">?</span>
                    </p>
                  </>
                )}
              </div>
            </div>
            <p className={styles.previewNote}>
              Your changes appear here as you edit.
              <br />
              Save when you’re ready to update your store.
            </p>
          </aside>
        </div>
        <footer className={styles.footer}>
          <div aria-live="polite">
            {result?.error && result.kind === kind ? (
              <p className={styles.error} role="alert">
                {result.error}
              </p>
            ) : result?.saved === kind && navigation.state === "idle" ? (
              <p className={styles.success}>
                Settings saved. Refresh your storefront to see them.
              </p>
            ) : (
              <p>Changes apply to all {kind} blocks in your store.</p>
            )}
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setValues({ ...defaults[kind] })}
            >
              Restore defaults
            </button>
            <button
              className={styles.primary}
              type="submit"
              disabled={navigation.state !== "idle"}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </footer>
      </Form>
    </section>
  );
}
export default function Settings() {
  const { settings } = useLoaderData();
  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>MAKE IT YOURS</span>
          <h1>Storefront settings</h1>
          <p>
            Your brand, down to the details. Customize each block to fit your
            store.
          </p>
        </div>
        <span className={styles.pageBadge}>
          <i />
          Two blocks. Your style.
        </span>
      </header>
      <BlockSettings kind="subscription" initial={settings.subscription} />
      <BlockSettings kind="bundle" initial={settings.bundle} />
    </main>
  );
}
