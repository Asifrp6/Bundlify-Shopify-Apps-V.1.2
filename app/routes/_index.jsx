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
        <span className={styles.logo}>
          <img src="/bundlify-icon.png?v=3" alt="" width="637" height="637" />
        </span>
        <h1 className={styles.heading}>Bundlify</h1>
        <p className={styles.text}>
          Manage product subscription plans and organize bundle drafts for your
          Shopify store.
        </p>
        <p className={styles.note}>
          Open Bundlify from the Apps section of your Shopify admin. New
          installations start on Shopify.
        </p>
        <Link className={styles.link} to="/privacy">Privacy policy</Link>
      </div>
    </div>
  );
}
