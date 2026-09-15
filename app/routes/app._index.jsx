import { Link, useLoaderData } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import styles from "../styles/dashboard.module.css";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  const [bundles, subscriptions, activeSubscriptions] = await Promise.all([
    prisma.bundle.count({ where: { shop: session.shop } }),
    prisma.subscriptionPlan.count({ where: { shop: session.shop } }),
    prisma.subscriptionPlan.count({
      where: {
        shop: session.shop,
        status: "ACTIVE",
        sellingPlanGroupId: { not: null },
      },
    }),
  ]);
  return { bundles, subscriptions, activeSubscriptions };
}

function PackageSymbol() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="m5 10 11-5 11 5v13l-11 5-11-5V10Z" />
      <path d="m5 10 11 5 11-5M16 15v13M10 7.7l11 5v6" />
    </svg>
  );
}
function RepeatSymbol() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M20 10a8 8 0 0 0-14-4L3 9m0-5v5h5M4 14a8 8 0 0 0 14 4l3-3m0 5v-5h-5" />
    </svg>
  );
}

export default function Dashboard() {
  const counts = useLoaderData();
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>YOUR STORE, AT A GLANCE</span>
          <h1>Dashboard</h1>
        </div>
        <span className={styles.workspace}>Bundlify workspace</span>
      </header>
      <section className={styles.hero} aria-labelledby="welcome-title">
        <div className={styles.heroCopy}>
          <span className={styles.heroEyebrow}>A LITTLE MORE POSSIBILITY</span>
          <h2 id="welcome-title">
            Great products.
            <br />
            Lasting connections.
          </h2>
          <p>
            Welcome to Bundlify. Bring products together and give customers more
            reasons to come back.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primary} to="/app/subscriptions/new">
              <span aria-hidden="true">+</span> Create subscription
            </Link>
            <Link className={styles.secondary} to="/app/bundles/new">
              Create bundle <span aria-hidden="true">?</span>
            </Link>
          </div>
        </div>
        <div className={styles.art} aria-hidden="true">
          <div className={styles.ring} />
          <div className={styles.ringInner} />
          <div className={styles.artBox}>
            <PackageSymbol />
          </div>
          <div className={styles.artRepeat}>
            <RepeatSymbol />
          </div>
          <span className={styles.spark}>?</span>
          <span className={styles.dot} />
        </div>
      </section>

      <section aria-labelledby="overview-title">
        <div className={styles.sectionHeading}>
          <h2 id="overview-title">Your store overview</h2>
          <span>Small steps. More possibilities.</span>
        </div>
        <div className={styles.stats}>
          <Link className={styles.stat} to="/app/bundles">
            <div className={styles.statTop}>
              <span className={styles.icon}>
                <PackageSymbol />
              </span>
              <span className={styles.arrow} aria-hidden="true">
                ?
              </span>
            </div>
            <strong>{counts.bundles}</strong>
            <h3>Total bundles</h3>
            <p>Draft and active product pairings</p>
          </Link>
          <Link className={styles.stat} to="/app/subscriptions">
            <div className={styles.statTop}>
              <span className={styles.icon}>
                <RepeatSymbol />
              </span>
              <span className={styles.arrow} aria-hidden="true">
                ?
              </span>
            </div>
            <strong>{counts.subscriptions}</strong>
            <h3>Total subscription plans</h3>
            <p>Your recurring purchase collection</p>
          </Link>
          <div className={`${styles.stat} ${styles.activeStat}`}>
            <div className={styles.statTop}>
              <span className={styles.icon}>
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="m8 12 3 3 5-6" />
                </svg>
              </span>
              <span className={styles.status}>
                <span />
                Active
              </span>
            </div>
            <strong>{counts.activeSubscriptions}</strong>
            <h3>Active plans</h3>
            <p>Available for recurring purchases</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="next-title">
        <div className={styles.sectionHeading}>
          <h2 id="next-title">Make your next move</h2>
          <span>Everything you need, right here.</span>
        </div>
        <div className={styles.actions}>
          <Link to="/app/subscriptions" className={styles.action}>
            <span className={styles.actionIcon}>
              <RepeatSymbol />
            </span>
            <div>
              <span className={styles.label}>KEEP THEM COMING BACK</span>
              <h3>Manage subscriptions</h3>
              <p>Fine-tune delivery schedules and subscriber savings.</p>
              <span className={styles.actionLink}>
                View subscription plans <span aria-hidden="true">?</span>
              </span>
            </div>
          </Link>
          <Link to="/app/bundles" className={styles.action}>
            <span className={styles.actionIcon}>
              <PackageSymbol />
            </span>
            <div>
              <span className={styles.label}>BETTER TOGETHER</span>
              <h3>Explore your bundles</h3>
              <p>Organize product combinations and plan your next offer.</p>
              <span className={styles.actionLink}>
                View bundles <span aria-hidden="true">?</span>
              </span>
            </div>
          </Link>
        </div>
      </section>
      <div className={styles.note}>
        <span aria-hidden="true">i</span>
        <p>
          Bundle drafts are your space to plan. They don’t change storefront
          prices or apply checkout discounts.
        </p>
      </div>
    </div>
  );
}
