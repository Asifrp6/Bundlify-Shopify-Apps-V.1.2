import { useState } from "react";
import { Form, useLoaderData, useActionData, useNavigation, data } from "react-router";
import { authenticate } from "../shopify.server";
import { defaults, fields, validateAppearance } from "../services/appearance";
import { getAppearance, saveAppearance } from "../services/appearance.server";
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
  const result = useActionData();
  const navigation = useNavigation();
  const title = kind === "bundle" ? "Bundle block" : "Subscription block";
  return <section className={styles.section}>
    <h2>{title}</h2>
    <Form method="post" className={styles.layout}>
      <input type="hidden" name="kind" value={kind} />
      <div className={styles.controls}>
        {Object.keys(defaults[kind]).map(key => <label key={key}>
          {fields[key]}{kind === "subscription" && key === "buttonText" ? " (subscription choice)" : ""}
          <input name={key} type={["background", "text", "accent", "buttonTextColor"].includes(key) ? "color" : key === "logoUrl" ? "url" : "text"}
            value={values[key]} onChange={event => setValues({ ...values, [key]: event.target.value })}
            required={key !== "logoUrl"} maxLength={key === "logoUrl" ? 2048 : 100} />
        </label>)}
        <p>Paste an HTTPS image link from Shopify Content ? Files. Leave it empty to hide the logo.</p>
        {result?.error && result.kind === kind && <p role="alert">{result.error}</p>}
        {result?.saved === kind && navigation.state === "idle" && <p role="status">Saved. Refresh your storefront to see the changes.</p>}
        <div className={styles.actions}><button type="submit" disabled={navigation.state !== "idle"}>Save {kind} settings</button>
        <button type="button" onClick={() => setValues({ ...defaults[kind] })}>Restore defaults</button></div>
      </div>
      <div><p className={styles.caption}>LIVE PREVIEW ? EXAMPLE CONTENT</p>
        <div className={styles.preview} style={{ background: values.background, color: values.text }}>
          {/^https:\/\//.test(values.logoUrl) && <img src={values.logoUrl} alt="Block logo" />}
          <h3>{values.heading}</h3>
          {kind === "bundle" ? <><p>Product one</p><hr /><p>Product two</p><hr /><p>Bundle total <strong>$90.00</strong></p><p>You save $10.00 (10%)</p></> : <><p>Choose how to purchase</p><p>{values.oneTimeText}</p></>}
          <div className={styles.previewButton} style={{ background: values.accent, color: values.buttonTextColor }}>{values.buttonText}</div>
          {kind === "subscription" && <p>Monthly delivery ? Save 10%</p>}
        </div>
      </div>
    </Form>
  </section>;
}
export default function Settings() {
  const { settings } = useLoaderData();
  return <main className={styles.page}><h1>Settings</h1><p>Customize your subscription and bundle blocks separately. Saved changes apply to every instance of that block in your store.</p>
    <BlockSettings kind="subscription" initial={settings.subscription} />
    <BlockSettings kind="bundle" initial={settings.bundle} />
  </main>;
}
