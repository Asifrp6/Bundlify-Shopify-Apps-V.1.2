import { discountLabel } from "../services/discounts";
import { creationBlocked } from "../services/app-plans";
import { useState } from "react";
import { Link, useLoaderData, useSearchParams, useFetcher, data } from "react-router";
import { setSubscriptionStatus } from "../services/subscription-status.server";
import { Banner } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { reportRouteFailure } from "../services/route-diagnostics.server";
import styles from "../styles/subscriptions.module.css";

export async function loader({ request }) {
  let session;
  let admin;
  try {
    ({ session, admin } = await authenticate.admin(request));
  } catch (error) {
    reportRouteFailure(error, "subscription-list authentication");
    throw error;
  }
  try {
    const usage = await (await import("../services/app-billing.server")).shopUsage(session.shop);
    const subscriptions = await prisma.subscriptionPlan.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      include: { deliveryOptions: true },
    });
    let contracts = [];
    try {
      contracts = await (await import("../services/subscription-portal.server")).listSubscriberContracts(admin, session.shop);
    } catch {
      contracts = [];
    }
    return {
      subscriptions,
      contracts,
      planLimit: creationBlocked(usage, "plan", usage?.plans ?? subscriptions.length),
      planName: usage?.name || null,
      maxPlans: usage?.maxPlans ?? null,
    };
  } catch (error) {
    reportRouteFailure(error, "subscription-list database");
    throw error;
  }
}

export async function action({ request }) {
  const { admin, session, redirect } = await authenticate.admin(request);
  if (!await (await import("../services/app-billing.server")).shopLimits(session.shop)) throw redirect("/app/pricing");
  const form = await request.formData();
  const id = Number(form.get("planId"));
  const status = form.get("status");
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647 || !["DRAFT", "ACTIVE"].includes(status)) return data({ error: "Invalid plan or status." }, { status: 400 });
  const plan = await prisma.subscriptionPlan.findFirst({ where: { id, shop: session.shop }, include: { deliveryOptions: true } });
  if (!plan) return data({ error: "Plan not found." }, { status: 404 });
  try {
    await setSubscriptionStatus({ prisma, admin, plan, status });
    return { success: true };
  } catch (error) {
    if (error instanceof Response) throw error;
    return data({ error: error.message }, { status: 502 });
  }
}

/* eslint-disable react/prop-types */
function PlanStatus({ plan }) {
  const fetcher = useFetcher();
  return <div>
    {plan.status !== "PENDING" && <fetcher.Form method="post">
      <input type="hidden" name="planId" value={plan.id} />
      <input type="hidden" name="status" value={plan.status === "ACTIVE" ? "DRAFT" : "ACTIVE"} />
      <button className={styles.editButton} type="submit" disabled={fetcher.state !== "idle"}>{fetcher.state !== "idle" ? "Saving…" : plan.status === "ACTIVE" ? "Move to draft" : "Activate subscription"}</button>
    </fetcher.Form>}
    {fetcher.data?.error && <p role="alert" className={styles.notice}>{fetcher.data.error}</p>}
  </div>;
}
/* eslint-enable react/prop-types */
function PlanSymbol() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Z"/><path d="m4 7 8 4 8-4M12 11v10M8 5l8 4"/></svg>;
}

const statusOf = plan => plan.status === "ACTIVE" && plan.sellingPlanGroupId ? "active" : plan.status === "PENDING" ? "review" : "draft";

export default function Subscriptions() {
  const { subscriptions, contracts, planLimit, planName, maxPlans } = useLoaderData();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const activeCount = subscriptions.filter(plan => statusOf(plan) === "active").length;
  const reviewCount = subscriptions.filter(plan => statusOf(plan) === "review").length;
  const filtered = subscriptions.filter(plan => (filter === "all" || statusOf(plan) === filter) && `${plan.name} ${plan.productTitle || plan.productId}`.toLowerCase().includes(query.trim().toLowerCase()));
  const tabs = [{id:"all",label:"All plans",count:subscriptions.length},{id:"active",label:"Active",count:activeCount},{id:"draft",label:"Drafts",count:subscriptions.length-activeCount-reviewCount},{id:"review",label:"Needs review",count:reviewCount}];

  return <div className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>RECURRING PURCHASES</span><h1>Subscription plans</h1><p>Thoughtful plans. More reasons for customers to come back.</p></div>
      {planLimit ? <Link className={styles.primaryButton} to="/app/pricing">Upgrade plan</Link> : <Link className={styles.primaryButton} to="/app/subscriptions/new"><span aria-hidden="true">+</span> Create subscription</Link>}
    </header>
    {params.get("created") === "1" && <Banner tone="success">Subscription plan saved successfully.</Banner>}
    {params.get("updated") === "1" && <Banner tone="success">Subscription plan updated successfully.</Banner>}
    {params.get("deleted") === "1" && <Banner tone="success">Subscription plan deleted successfully.</Banner>}
    {planLimit && <Banner tone="warning">{planLimit}</Banner>}
    {planName && <p>{maxPlans == null ? `${planName} plan includes unlimited subscription plans.` : `${planName} plan: ${subscriptions.length} of ${maxPlans} subscription plans.`}</p>}

    <section className={styles.stats} aria-label="Plan overview">
      <div className={styles.stat}><div className={styles.statTop}><span>Total plans</span><span className={styles.miniIcon}><PlanSymbol /></span></div><strong>{subscriptions.length}</strong><p>Your subscription collection</p></div>
      <div className={`${styles.stat} ${styles.activeStat}`}><div className={styles.statTop}><span>Active plans</span><span className={styles.liveDot} aria-hidden="true" /></div><strong>{activeCount}</strong><p>Available for recurring purchases</p></div>
      <div className={styles.stat}><div className={styles.statTop}><span>Needs review</span><span className={styles.reviewIcon} aria-hidden="true">!</span></div><strong>{reviewCount}</strong><p>{reviewCount ? "Check interrupted plan creation" : "No plans waiting for review"}</p></div>
    </section>

    <section className={styles.collection} aria-label="Subscriber contracts">
      <div className={styles.collectionHeading}><div><h2>Subscribers <span>{contracts.length}</span></h2><p>Each purchase links to the customer and the Shopify order.</p></div></div>
      <div className={styles.cards}>
        {contracts.length ? contracts.map(contract => <article key={contract.id} className={styles.planCard}>
          <div className={styles.planHeading}><div className={styles.planTitle}><h3>{contract.customerName}</h3><p>{contract.frequency} · {contract.status}</p></div></div>
          <p className={styles.notice}>{contract.lines.map(line => `${line.quantity} × ${line.title}${line.amount ? ` · ${line.amount} ${line.currencyCode}` : ""}`).join(", ") || "No products on this contract."}{contract.nextBillingDate ? ` Next charge ${new Date(contract.nextBillingDate).toLocaleDateString()}.` : ""}</p>
          <footer className={styles.cardFooter}>
            <span>{contract.orderName || "No order yet"}</span>
            <div>
              {contract.customerUrl && <a className={styles.editButton} href={contract.customerUrl} target="_top">Customer</a>}
              {contract.orderUrl && <a className={styles.editButton} href={contract.orderUrl} target="_top">{contract.orderName || "Order"}</a>}
            </div>
          </footer>
        </article>) : <p className={styles.notice}>No subscription purchases yet. New contracts appear here after a customer subscribes.</p>}
      </div>
    </section>

    <section className={styles.collection} aria-label="Your subscription plans">
      <div className={styles.collectionHeading}><div><h2>Your plans <span>{subscriptions.length}</span></h2><p>Manage delivery schedules and subscriber savings.</p></div></div>
      <div className={styles.toolbar}>
        <div className={styles.filters} aria-label="Filter by status">{tabs.map(tab => <button key={tab.id} type="button" aria-pressed={filter === tab.id} className={filter === tab.id ? styles.selectedFilter : styles.filter} onClick={() => setFilter(tab.id)}>{tab.label}<span>{tab.count}</span></button>)}</div>
        <label className={styles.search}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input aria-label="Search subscription plans" placeholder="Search plans…" value={query} onChange={event => setQuery(event.target.value)} type="search" /></label>
      </div>
      <div className={styles.cards}>
        {filtered.map(plan => {
          const status = statusOf(plan);
          const options = plan.deliveryOptions?.length ? plan.deliveryOptions : [{frequency:plan.frequency,discount:plan.discount}];
          return <article key={plan.id} className={styles.planCard}>
            <div className={styles.planHeading}><div className={styles.productIcon}>{plan.productImage ? <img src={plan.productImage} alt="" loading="lazy" /> : <PlanSymbol />}</div><div className={styles.planTitle}><Link to={`/app/subscriptions/${plan.id}`}><h3>{plan.name}</h3></Link><p>{plan.productId === "ALL_PRODUCTS" ? "All products" : plan.productTitle || plan.productId}</p></div><span className={`${styles.badge} ${styles[status]}`}><span aria-hidden="true" />{status === "active" ? "Active" : status === "review" ? "Needs review" : "Draft"}</span></div>
            <div className={styles.delivery}><span className={styles.detailLabel}>DELIVERY & SAVINGS</span><div className={styles.options}>{options.map((option,index) => <div className={styles.option} key={`${option.frequency}-${index}`}><span className={styles.frequency}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16"/></svg>{option.frequency}</span><span className={styles.savings}>{discountLabel(option.discount, option.discountType)}</span></div>)}</div></div>
            {status === "review" && <p className={styles.notice}>Review this plan in Shopify before creating another.</p>}
            {status === "draft" && <p className={styles.notice}>Saved locally. This plan is not active in Shopify.</p>}
            <PlanStatus plan={plan} />
            <footer className={styles.cardFooter}><span>{options.length} delivery {options.length === 1 ? "option" : "options"}</span><div><Link className={styles.editButton} to={`/app/subscriptions/${plan.id}`} aria-label={`Edit ${plan.name}`}>Edit plan <span aria-hidden="true">?</span></Link><Link className={styles.deleteButton} to={`/app/subscriptions/${plan.id}#delete-plan`} aria-label={`Delete ${plan.name}`} title="Delete plan"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/></svg></Link></div></footer>
          </article>;
        })}
        {!filtered.length && <div className={styles.empty}><span className={styles.productIcon}><PlanSymbol /></span><h3>{subscriptions.length ? "No matching plans" : "Start something recurring"}</h3><p>{subscriptions.length ? "Try another search or status to find your plan." : "Create your first subscription plan and give customers a reason to return."}</p>{subscriptions.length ? <button className={styles.editButton} onClick={() => {setQuery("");setFilter("all");}}>Clear filters</button> : planLimit ? <Link className={styles.primaryButton} to="/app/pricing">Upgrade plan</Link> : <Link className={styles.primaryButton} to="/app/subscriptions/new">Create your first plan</Link>}</div>}
      </div>
      <div className={styles.collectionFooter} role="status">Showing {filtered.length} of {subscriptions.length} plans</div>
    </section>
    <p className={styles.footnote}><span aria-hidden="true">?</span> Plan changes apply to future purchases. Existing customer subscriptions stay unchanged.</p>
  </div>;
}
