import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { Banner } from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { plans } from "../services/app-plans";
import { hostedPlanSelectionPath, hostedPlanSelectionUrl, isApprovedCharge } from "../services/billing-return";
import styles from "../styles/pricing.module.css";

const icons = {
  free: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4 18-7Z"/></svg>,
  starter: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 22V12"/><path d="M12 12C12 7 8 4 4 4c0 6 4 8 8 8Z"/><path d="M12 12c0-5 4-8 8-8 0 6-4 8-8 8Z"/></svg>,
  growth: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/></svg>,
  unlimited: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 17h18"/><path d="M4 17 3 9l5 4 4-7 4 7 5-4-1 8"/></svg>,
};

export async function loader({ request }) {
  const { admin, session, redirect } = await authenticate.admin(request);
  const { activeSubscriptionId, syncShopPlan } = await import("../services/app-billing.server");
  const chargeId = new URL(request.url).searchParams.get("charge_id");
  try {
    const handle = await syncShopPlan(admin, session.shop);
    if (chargeId && handle && isApprovedCharge(await activeSubscriptionId(session.shop), chargeId)) return redirect("/app");
    return { handle, error: null, declined: Boolean(chargeId), pricingUrl: hostedPlanSelectionUrl({ shop: session.shop }) };
  } catch (error) {
    if (error instanceof Response) throw error;
    let pricingUrl = null;
    try { pricingUrl = hostedPlanSelectionUrl({ shop: session.shop }); } catch { /* session shop is not a store handle */ }
    return { handle: null, error: "Shopify could not confirm your plan. Refresh and try again.", declined: false, pricingUrl };
  }
}

export async function action({ request }) {
  const { admin, session, redirect } = await authenticate.admin(request);
  const { chooseShopPlan } = await import("../services/app-billing.server");
  const handle = String((await request.formData()).get("handle") || "");
  try {
    const result = await chooseShopPlan({ admin, shop: session.shop, handle });
    // shopify://admin is the embedded redirect. A raw admin.shopify.com URL from this
    // action is a data request, so the helper answers 401 and the app renders it.
    if (result.pricingUrl) return redirect(hostedPlanSelectionPath(), { target: "_top" });
    return redirect("/app");
  } catch (error) {
    if (error instanceof Response) throw error;
    const message = error.message || "Could not change the plan.";
    return { error: message.includes("Cannot use the Billing API") ? "Shopify hosts these plans. Choose Starter, Growth, or Unlimited on Shopify's plan page." : message };
  }
}

// Forward the App Bridge reauthorize header when a paid-plan post breaks out of the iframe.
export const headers = (headersArgs) => boundary.headers(headersArgs);

export default function Pricing() {
  const { handle, error, declined, pricingUrl } = useLoaderData();
  const result = useActionData();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const pending = String(navigation.formData?.get("handle") || "");

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
          <div className={styles.cardHead}>
            <span className={`${styles.icon} ${styles[`${plan.tone}Icon`]}`}>{icons[plan.handle]}</span>
            <h2>{plan.name}</h2>
            <p className={styles.tagline}>{plan.tagline}</p>
          </div>
          <p className={styles.price}>${plan.price}<span>/month</span></p>
          <ul className={styles.features}>
            {plan.features.map((feature) => <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>)}
          </ul>
          <div className={styles.action}>
            {current ? <button className={`${styles.button} ${styles.current}`} type="button" disabled>Current plan</button>
              : plan.price > 0 && pricingUrl ? <a className={`${styles.button} ${styles[`${plan.tone}Button`]}`} href={pricingUrl} target="_top">{`Choose ${plan.name}`}</a>
              : plan.price > 0 ? <button className={`${styles.button} ${styles[`${plan.tone}Button`]}`} type="button" disabled>{`Choose ${plan.name}`}</button>
              : <Form method="post">
                <input type="hidden" name="handle" value={plan.handle} />
                <button className={`${styles.button} ${styles.freeButton}`} type="submit" disabled={busy}>
                  {busy && pending === plan.handle ? "Switching…" : `Choose ${plan.name}`}
                </button>
              </Form>}
          </div>
        </article>;
      })}
    </div>
  </main>;
}
