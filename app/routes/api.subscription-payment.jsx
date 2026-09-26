import { customerSession } from "../services/customer-session.server";
import { unauthenticated } from "../shopify.server";
import { sendPaymentUpdate } from "../services/subscription-portal.server";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body, status = 200) {
  return Response.json(body, { status, headers });
}

export async function loader({ request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  return json({ error: "Use POST." }, 405);
}

export async function action({ request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const session = customerSession(token, {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
  });
  if (!session) return json({ error: "Sign in to manage this subscription." }, 401);
  let contractId = "";
  try { contractId = (await request.json()).contractId; }
  catch { return json({ error: "Choose a subscription first." }, 400); }
  if (!/^gid:\/\/shopify\/SubscriptionContract\/\d+$/.test(contractId || ""))
    return json({ error: "Choose a subscription first." }, 400);
  try {
    const { admin } = await unauthenticated.admin(session.shop);
    await sendPaymentUpdate(admin, { contractId, customerId: session.customerId });
    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || "The payment update email could not be sent." }, 502);
  }
}
