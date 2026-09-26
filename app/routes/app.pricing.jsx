import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect } from "react";
import { Banner } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { plans } from "../services/app-plans";
import styles from "../styles/pricing.module.css";

const icons = {
  free: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4 18-7Z"/></svg>,
  starter: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 22V12"/><path d="M12 12C12 7 8 4 4 4c0 6 4 8 8 8Z"/><path d="M12 12c0-5 4-8 8-8 0 6-4 8-8 8Z"/></svg>,
  growth: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/></svg>,
  unlimited: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 17h18"/><path d="M4 17 3 9l5 4 4-7 4 7 5-4-1 8"/></svg>,
};

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const { syncShopPlan } = await import("../services/app-billing.server");
  const chargeId = new URL(request.url).searchParams.get("charge_id");
  try {
    const handle = await syncShopPlan(admin, session.shop);
    return { handle, error: null, declined: Boolean(chargeId) && !handle };
  } catch (error) {
    if (error instanceof Response) throw error;
    return { handle: null, error: "Shopify could not confirm your plan. Refresh and try again.", declined: false };
  }
}

export async function action({ request }) {
  const { admin, session, redirect } = await authenticate.admin(request);
  const { billingTestMode, chooseShopPlan } = await import("../services/app-billing.server");
  const handle = String((await request.formData()).get("handle") || "");
  const returnUrl = new URL("/app", process.env.SHOPIFY_APP_URL || new URL(request.url).origin).toString();
  try {
    const result = await chooseShopPlan({
      admin,
      shop: session.shop,
      handle,
      returnUrl,
      test: billingTestMode(),
    });
    if (result.confirmationUrl) return { confirmationUrl: result.confirmationUrl };
    return redirect("/app");
  } catch (error) {
    if (error instanceof Response) throw error;
    return { error: error.message || "Could not change the plan." };
  }
}

export default function Pricing() {
  const { handle, error, declined } = useLoaderData();
  const result = useActionData();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const pending = String(navigation.formData?.get("handle") || "");
  useEffect(() => {
    if (result?.confirmationUrl) window.open(result.confirmationUrl, "_top");
  }, [result]);

  return <main className={styles.page}>
    {(error || result?.error) && <div className={styles.message}><Banner tone="critical">{error || result.error}</Banner></div>}
    {declined && !result?.error && <div className={styles.message}><Banner tone="warning">Shopify did not activate that plan. Choose it again to approve the charge.</Banner></div>}
    <header className={styles.intro}>
      <p className={styles.eyebrow}>SIMPLE PRICING. BIGGER POSSIBILITIES.</p>
      <h1>Choose the Right Plan for Your Store</h1>
      <p>Unlock more bundles and subscription options as your business grows.</p>
    </header>
    <div className={styles.grid}>
      {plans.map((plan) => {
        const current = handle === plan.handle;
        return <article key={plan.handle} className={`${styles.card} ${styles[plan.tone]}`}>
          {plan.popular && <span className={styles.badge}>Most Popular</span>}
          <span className={`${styles.icon} ${styles[`${plan.tone}Icon`]}`}>{icons[plan.handle]}</span>
          <h2>{plan.name}</h2>
          <p className={styles.tagline}>{plan.tagline}</p>
          <p className={styles.price}>${plan.price}<span>/month</span></p>
          <ul className={styles.features}>
            {plan.features.map((feature) => <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>)}
          </ul>
          <Form method="post">
            <input type="hidden" name="handle" value={plan.handle} />
            <button className={`${styles.button} ${current ? styles.current : styles[`${plan.tone}Button`]}`} type="submit" disabled={busy || current}>
              {current ? "Current plan" : busy && pending === plan.handle ? "Opening Shopify…" : `Choose ${plan.name}`}
            </button>
          </Form>
        </article>;
      })}
    </div>
  </main>;
}
