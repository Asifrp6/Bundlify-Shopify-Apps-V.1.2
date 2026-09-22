import { Form, redirect, useLoaderData } from "react-router";
import { login } from "../shopify.server";
import styles from "../styles/landing.module.css";

export async function loader({ request }) {
  const url = new URL(request.url);
  if (url.searchParams.get("shop"))
    throw redirect(`/app?${url.searchParams.toString()}`);
  return { showForm: process.env.NODE_ENV !== "production" && Boolean(login) };
}

export default function Landing() {
  const { showForm } = useLoaderData();
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Bundlify</h1>
        <p className={styles.text}>
          Manage product subscription plans and organize bundle drafts for your
          Shopify store.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input
                className={styles.input}
                type="text"
                name="shop"
                placeholder="your-store.myshopify.com"
                required
              />
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        {!showForm && <p className={styles.text}>Open Bundlify from the Apps section of your Shopify admin. New installations start on Shopify.</p>}
      </div>
    </div>
  );
}
