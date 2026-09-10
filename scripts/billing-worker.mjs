// Run as a persistent worker alongside the web server, or use an external cron job.
const { SHOPIFY_APP_URL, BILLING_CRON_SECRET } = process.env;
if (!SHOPIFY_APP_URL || !BILLING_CRON_SECRET) throw new Error("Set SHOPIFY_APP_URL and BILLING_CRON_SECRET before starting the billing worker.");
const endpoint = new URL("/internal/billing", SHOPIFY_APP_URL);
let stopped = false;
process.on("SIGTERM", () => { stopped = true; });
process.on("SIGINT", () => { stopped = true; });
while (!stopped) {
  try {
    const response = await fetch(endpoint, {
      method: "POST", headers: { Authorization: `Bearer ${BILLING_CRON_SECRET}` },
      signal: AbortSignal.timeout(240000), redirect: "error",
    });
    console.log(new Date().toISOString(), "Billing run", response.status);
    if (!response.ok) {
      console.error("Billing needs attention:", await response.text());
      if (process.argv.includes("--once")) process.exitCode = 1;
    }
  } catch (error) {
    console.error("Billing worker request failed:", error.message);
    if (process.argv.includes("--once")) process.exitCode = 1;
  }
  if (process.argv.includes("--once")) break;
  for (let second = 0; second < 300 && !stopped; second++) await new Promise(resolve => setTimeout(resolve, 1000));
}
