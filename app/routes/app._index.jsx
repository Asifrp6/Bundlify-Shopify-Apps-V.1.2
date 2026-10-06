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

function HeroArt() {
  return (
    <svg className={styles.scene} viewBox="0 0 560 270" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="bbBagFill" x1="64" y1="62" x2="200" y2="198" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4EA6FF" />
          <stop offset="0.48" stopColor="#0A6FF0" />
          <stop offset="1" stopColor="#0756C4" />
        </linearGradient>
        <linearGradient id="bbGift" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#5B9BFF" />
          <stop offset="1" stopColor="#2F6FE0" />
        </linearGradient>
        <clipPath id="bbBagClip">
          <rect x="64" y="62" width="136" height="136" rx="34" />
        </clipPath>
        <filter id="bbBoardShadow" x="-20%" y="-25%" width="150%" height="160%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#7EA6D4" floodOpacity="0.28" />
        </filter>
        <filter id="bbFloat" x="-40%" y="-40%" width="180%" height="190%">
          <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#6E9AD0" floodOpacity="0.32" />
        </filter>
      </defs>

      <g transform="translate(-24, 4) rotate(-5 372 142)" filter="url(#bbBoardShadow)">
        <rect x="186" y="30" width="356" height="214" rx="26" fill="#F8FBFF" stroke="#E7F0FA" />
        <rect x="214" y="50" width="68" height="7" rx="3.5" fill="#E4EBF4" />
        <rect x="292" y="50" width="108" height="7" rx="3.5" fill="#E7EEF6" />
        <rect x="412" y="50" width="86" height="7" rx="3.5" fill="#EEF3F8" />

        <rect x="214" y="74" width="80" height="94" rx="14" fill="#FFFFFF" stroke="#E5EEF8" />
        <rect x="328" y="74" width="80" height="94" rx="14" fill="#FFFFFF" stroke="#E5EEF8" />
        <rect x="442" y="74" width="80" height="94" rx="14" fill="#FFFFFF" stroke="#E5EEF8" />

        <g fill="#A8B6C8">
          <rect x="303" y="118" width="14" height="3" rx="1.5" />
          <rect x="308.5" y="112.5" width="3" height="14" rx="1.5" />
          <rect x="417" y="118" width="14" height="3" rx="1.5" />
          <rect x="422.5" y="112.5" width="3" height="14" rx="1.5" />
        </g>

        <g transform="translate(230, 96)">
          <path fill="#6D8CB4" d="M8 18 18 9c2.4 6.2 13.6 6.2 16 0l10 9-6.5 6.2V46H14.5V24.2L8 18z" />
          <path fill="#5A7AA4" d="M18 9c2.2 5.2 13.8 5.2 16 0-.4 1.2-3.2 3.2-8 3.2S18.4 10.2 18 9z" />
          <path fill="#7E9CC2" d="M22 18h8l-1.6 4h-4.8L22 18z" />
        </g>

        <g transform="translate(332, 112)">
          <path fill="#F7FAFD" stroke="#243040" strokeWidth="1.5" strokeLinejoin="round" d="M12 26c0-6 3-8 8-8h4l4-8h9l5 8h8c5 0 9 3 9 8v4H12v-4z" />
          <path d="M8 31h52" stroke="#1C2430" strokeWidth="4.2" strokeLinecap="round" />
          <path d="M26 18v7M31 16v9M36 18v7" stroke="#8EA2B6" strokeWidth="1.4" strokeLinecap="round" />
        </g>

        <g transform="translate(456, 88)">
          <ellipse cx="14" cy="12" rx="9" ry="5.5" transform="rotate(-28 14 12)" fill="#E8F2FF" />
          <ellipse cx="34" cy="12" rx="9" ry="5.5" transform="rotate(28 34 12)" fill="#F5FAFF" />
          <circle cx="24" cy="12.5" r="3.3" fill="#FFFFFF" />
          <rect x="7" y="20" width="34" height="26" rx="3" fill="url(#bbGift)" />
          <rect x="5" y="16" width="38" height="8" rx="2" fill="#2E6FDE" />
          <rect x="21" y="16" width="6" height="30" rx="1" fill="#E7F2FF" />
        </g>

        <rect x="214" y="184" width="132" height="7" rx="3.5" fill="#E5EDF5" />
        <rect x="356" y="184" width="96" height="7" rx="3.5" fill="#EEF3F8" />
        <rect x="214" y="202" width="84" height="7" rx="3.5" fill="#F0F4F8" />
      </g>

      <g filter="url(#bbFloat)">
        <g clipPath="url(#bbBagClip)">
          <rect x="64" y="62" width="136" height="136" fill="url(#bbBagFill)" />
          <ellipse cx="108" cy="96" rx="58" ry="32" fill="#FFFFFF" opacity="0.2" />
        </g>
      </g>
      <g transform="translate(96, 90)">
        <path d="M20 30c0-11 6.5-18 15-18s15 7 15 18" stroke="#FFFFFF" strokeWidth="4.4" strokeLinecap="round" />
        <path d="M20 30v7M50 30v7" stroke="#FFFFFF" strokeWidth="4.4" strokeLinecap="round" />
        <path d="M10 36h50l-3.2 30a6 6 0 0 1-6 5H19.2a6 6 0 0 1-6-5L10 36z" fill="#FFFFFF" />
        <path d="M36 36l7 35h9.2a6 6 0 0 0 5.6-5L60 36H36z" fill="#C5DFFF" />
      </g>

      <g filter="url(#bbFloat)">
        <rect x="176" y="4" width="64" height="64" rx="16" fill="#FFFFFF" />
      </g>
      <g transform="translate(196, 24)" fill="none" stroke="#0A6FF0" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M8 16H3v5" />
      </g>
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
        <span className={styles.workspace}>Bundle Base workspace</span>
      </header>
      <section className={styles.hero} aria-labelledby="welcome-title">
        <div className={styles.heroCopy}>
          <p className={styles.welcome}>Welcome to</p>
          <h2 id="welcome-title">
            <span className={styles.brandNavy}>Bundle</span>{" "}
            <span className={styles.brandBlue}>Base</span>
          </h2>
          <p className={styles.heroLead}>
            Create powerful product bundles, custom bundles, subscriptions and gift options.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.heroOutline} to="/app/bundles/custom">
              Manage custom bundle products
            </Link>
            <Link className={styles.heroPale} to="/app/subscriptions/new">
              <span aria-hidden="true">+</span> Create subscription
            </Link>
            <Link className={styles.heroPrimary} to="/app/bundles/new">
              Create bundle <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <HeroArt />
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
                →
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
                →
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
                View subscription plans <span aria-hidden="true">→</span>
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
                View bundles <span aria-hidden="true">→</span>
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
