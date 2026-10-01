import { Link, redirect } from "react-router";
import styles from "../styles/landing.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop"))
    throw redirect(`/app?${url.searchParams.toString()}`);
  return null;
};

export default function Landing() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>
          <img className={styles.lockup} src="/bundle-base-logo.png" alt="Bundle Base" width="696" height="570" />
        </h1>
        <p className={styles.text}>
          Manage product subscription plans and organize bundle drafts for your
          Shopify store.
        </p>
        <p className={styles.note}>
          Open Bundle Base from the Apps section of your Shopify admin. New
          installations start on Shopify.
        </p>
        <Link className={styles.link} to="/privacy">Privacy policy</Link>
      </div>
    </div>
  );
}
