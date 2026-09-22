import db from "../db.server";
import { handleUninstall } from "../services/uninstall.server";

export const action = ({ request }) => handleUninstall(request, {
  db,
  secret: process.env.SHOPIFY_API_SECRET,
});
export const loader = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
