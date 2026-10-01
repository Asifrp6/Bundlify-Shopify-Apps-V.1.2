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
  normalizeHex,
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

// Neutral stand-in for the merchant's theme in the admin preview; the storefront reads the real theme.
const storePreviewColors = {
  background: "#ffffff", text: "#1a1a1a", accent: "#1a1a1a", buttonTextColor: "#ffffff",
  borderColor: "#e3e3e3", groupBackground: "#ffffff", cardBackground: "#ffffff", cardText: "#1a1a1a", cardBorder: "#dcdcdc",
  hoverBackground: "#f7f7f7", hoverText: "#1a1a1a", hoverBorder: "#a8a8a8",
  selectedBackground: "#f5f5f5", selectedText: "#1a1a1a", selectedBorder: "#1a1a1a",
  selectedHoverBackground: "#efefef", selectedHoverText: "#1a1a1a", selectedHoverBorder: "#1a1a1a",
  iconColor: "#5c5c5c", selectedIconColor: "#1a1a1a", hoverIconColor: "#1a1a1a", focusColor: "#1a1a1a",
};

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
  const [hexDrafts, setHexDrafts] = useState({});
  const clearDraft = (key) =>
    setHexDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  const updateColor = (key, value) => {
    update(key, value);
    clearDraft(key);
  };
  const colors = values.matchStore ? storePreviewColors : values;
  const selectedStyle = {
    background: colors.accent,
    color: colors.buttonTextColor,
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
          <div className={styles.controls} role="region" aria-label={title + " design controls"}>
            <fieldset className={styles.group}>
              <legend>Colors</legend>
              <label className={styles.matchStore}>
                <input
                  type="checkbox"
                  name="matchStore"
                  value="true"
                  checked={values.matchStore}
                  onChange={(event) => update("matchStore", event.target.checked)}
                />
                <span>
                  {fields.matchStore}
                  <small>
                    {values.matchStore
                      ? "On: the block uses your theme's font, text color, and button colors, so it fits any theme you switch to."
                      : "Off: the block uses the colors below. Your theme's font is still used."}
                  </small>
                </span>
              </label>
              <div hidden={values.matchStore}>
              <p className={styles.hint}>{bundle ? "Button / selected color and Button / selected text color set the custom bundle popup button." : "A palette that feels like your store."}</p>
              <div className={styles.colorGrid}>
                {colorKeys.map((key) => (
                  <div className={styles.colorField} key={key}>
                    <span>{fields[key]}</span>
                    <div className={styles.colorControl}>
                      <input
                        aria-label={fields[key]}
                        name={key}
                        type="color"
                        value={values[key]}
                        onChange={(event) => updateColor(key, event.target.value)}
                      />
                      <input
                        aria-label={fields[key] + " hex code"}
                        className={styles.hexInput}
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={9}
                        value={hexDrafts[key] ?? values[key].toUpperCase()}
                        onChange={(event) => {
                          const text = event.target.value;
                          setHexDrafts((current) => ({ ...current, [key]: text }));
                          const hex = normalizeHex(text);
                          if (hex) update(key, hex);
                        }}
                        onPaste={(event) => {
                          const hex = normalizeHex(event.clipboardData.getData("text"));
                          if (!hex) return;
                          event.preventDefault();
                          updateColor(key, hex);
                        }}
                        onBlur={() => clearDraft(key)}
                      />
                    </div>
                  </div>
                ))}
              </div>
              </div>
              {values.matchStore && (
                <p className={styles.hint}>
                  Your saved colors are kept. Turn this off to use them again.
                </p>
              )}
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
                The storefront block uses your theme&apos;s heading and body
                fonts. Sizes scale together from 12–24 px.
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
                      key !== "matchStore" &&
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
                  background: colors.background,
                  color: colors.text,
                  borderColor: colors.borderColor,
                  ...Object.fromEntries(
                    colorKeys.map((key) => ["--bl-" + key, colors[key]]),
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
                            {index ? "B" : "A"}
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
                      <span aria-hidden="true">✓</span>
                      <div>
                        <strong>Every month</strong>
                        <small>Save 10% on every delivery</small>
                      </div>
                      <b>$90.00</b>
                    </div>
                    <p className={styles.details}>
                      Subscription details <span aria-hidden="true">›</span>
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
              onClick={() => {
                setValues({ ...defaults[kind] });
                setHexDrafts({});
              }}
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
