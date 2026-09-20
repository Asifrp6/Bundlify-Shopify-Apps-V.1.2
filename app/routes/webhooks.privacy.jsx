import db from "../db.server";
import { handlePrivacyWebhook } from "../services/privacy-webhooks.server";

export const action = ({ request }) => handlePrivacyWebhook(request, {
  db,
  secret: process.env.SHOPIFY_API_SECRET,
});

export const loader = () => new Response(null, {
  status: 405,
  headers: { Allow: "POST" },
});
