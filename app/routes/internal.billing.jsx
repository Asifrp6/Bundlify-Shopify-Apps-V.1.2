import { timingSafeEqual } from "node:crypto";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { runRecurringBilling } from "../services/recurring-billing.server";

export async function action({ request }) {
  const secret = process.env.BILLING_CRON_SECRET;
  if (!secret) return new Response("Billing scheduler is not configured", { status: 503 });
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") || "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return new Response("Unauthorized", { status: 401 });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const sessions = await prisma.session.findMany({ where: { isOnline: false }, select: { shop: true }, distinct: ["shop"] });
  const results = [];
  for (const { shop } of sessions) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      results.push({ shop, contracts: await runRecurringBilling({ admin, shop }) });
    } catch {
      results.push({ shop, error: "Billing run failed. Check the app session and subscription permissions." });
    }
  }
  const failed = results.some(result => result.error || result.contracts?.some(item => ["error", "failed", "action_required"].includes(item.status)));
  return Response.json({ results }, { status: failed ? 502 : 200, headers: { "Cache-Control": "no-store" } });
}
