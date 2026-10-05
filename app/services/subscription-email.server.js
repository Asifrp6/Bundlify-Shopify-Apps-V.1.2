import net from "node:net";
import tls from "node:tls";

// Same destination as the order status block: extension handle customer-subscriptions.
const SUBSCRIPTION_PAGE = "customer-subscriptions";

export const PORTAL_QUERY = `#graphql
query BundlifySubscriptionPortal($id: ID!) {
  subscriptionContract(id: $id) {
    customer {
      defaultEmailAddress {
        emailAddress
      }
    }
  }
  shop {
    name
    customerAccountsV2 {
      url
    }
  }
}`;

export function subscriptionPortalUrl(accountRoot) {
  let url;
  try { url = new URL(String(accountRoot || "")); }
  catch { return null; }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "bundlify.imranwebstudio.me" || host === "bundlebase.imranwebstudio.me" || host === "admin.shopify.com") return null;
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith(`/pages/${SUBSCRIPTION_PAGE}`) ? path : `${path}/pages/${SUBSCRIPTION_PAGE}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function subscriptionNotice({ portalUrl, shopName }) {
  const store = String(shopName || "the store").replace(/[\r\n]+/g, " ").trim() || "the store";
  const text = [
    `Your subscription with ${store} is active.`,
    "View the product, price, and delivery schedule, update the payment method, or cancel in your customer account:",
    portalUrl,
  ].join("\n\n");
  return { subject: "Manage your subscription", text };
}

// Uses SMTP settings already present in the server environment. No third-party mail API.
export function mailSettings(env = process.env) {
  const host = env.SMTP_HOST?.trim();
  const from = env.SMTP_FROM?.trim();
  if (!host || !from) return null;
  const port = Number(env.SMTP_PORT);
  return {
    host,
    port: Number.isInteger(port) && port > 0 ? port : 587,
    user: env.SMTP_USER?.trim() || "",
    password: env.SMTP_PASSWORD || env.SMTP_PASS || "",
    from,
  };
}

function buyerEmail(contract, payload) {
  const candidates = [
    contract?.customer?.defaultEmailAddress?.emailAddress,
    payload?.email,
    payload?.customer?.email,
  ];
  return candidates.map(value => String(value || "").trim()).find(value => /^[^\s@]+@[^\s@]+$/.test(value) && !/[\r\n]/.test(value)) || null;
}

export async function emailSubscriptionPortal({ admin, contractId, payload, settings, transport = smtpSend } = {}) {
  if (!admin || !contractId) return { status: "skipped", reason: "missing" };
  const response = await admin.graphql(PORTAL_QUERY, { variables: { id: contractId } });
  const result = await response.json();
  if (result.errors?.length) throw new Error(result.errors.map(error => error.message).join(" "));
  const contract = result.data?.subscriptionContract;
  if (!contract) return { status: "skipped", reason: "not-found" };
  const to = buyerEmail(contract, payload);
  const portalUrl = subscriptionPortalUrl(result.data?.shop?.customerAccountsV2?.url);
  if (!to) return { status: "skipped", reason: "no-recipient" };
  if (!portalUrl) return { status: "skipped", reason: "no-portal" };
  const notice = subscriptionNotice({ portalUrl, shopName: result.data?.shop?.name });
  const config = settings === undefined ? mailSettings() : settings;
  if (!config) return { status: "skipped", reason: "not-configured", to, ...notice };
  await transport({ to, ...notice, settings: config });
  return { status: "sent", to, ...notice };
}

function once(socket, event) {
  return new Promise((resolve, reject) => {
    const fail = (error) => { socket.off(event, done); reject(error); };
    const done = () => { socket.off("error", fail); resolve(); };
    socket.once(event, done);
    socket.once("error", fail);
  });
}

function readReply(socket) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const fail = (error) => { cleanup(); reject(error); };
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\r\n").filter(Boolean);
      const last = lines.at(-1) || "";
      if (!/^\d{3} /.test(last)) return;
      cleanup();
      const code = Number(last.slice(0, 3));
      if (code >= 400) reject(new Error(last));
      else resolve(code);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", fail);
    };
    socket.on("data", onData);
    socket.on("error", fail);
  });
}

function sendLine(socket, line) {
  socket.write(`${line}\r\n`);
  return readReply(socket);
}

function addressOf(from) {
  const match = /<([^<>\s]+)>/.exec(from);
  return (match ? match[1] : from).trim();
}

export function smtpSend({ to, subject, text, settings }) {
  const port = settings.port;
  const implicitTls = port === 465;
  const socket = implicitTls
    ? tls.connect({ host: settings.host, port, servername: settings.host })
    : net.connect({ host: settings.host, port });
  socket.setTimeout(3000);
  socket.on("timeout", () => socket.destroy(new Error("SMTP timed out")));
  const greeting = readReply(socket);
  greeting.catch(() => {});
  const ready = implicitTls ? once(socket, "secureConnect") : once(socket, "connect");
  return ready.then(async () => {
    await greeting;
    let channel = socket;
    await sendLine(channel, "EHLO bundlebase");
    if (!implicitTls) {
      await sendLine(channel, "STARTTLS");
      channel = tls.connect({ socket, servername: settings.host });
      channel.setTimeout(3000);
      channel.on("timeout", () => channel.destroy(new Error("SMTP timed out")));
      await once(channel, "secureConnect");
      await sendLine(channel, "EHLO bundlebase");
    }
    if (settings.user) {
      await sendLine(channel, "AUTH LOGIN");
      await sendLine(channel, Buffer.from(settings.user).toString("base64"));
      await sendLine(channel, Buffer.from(settings.password).toString("base64"));
    }
    const from = addressOf(settings.from);
    await sendLine(channel, `MAIL FROM:<${from}>`);
    await sendLine(channel, `RCPT TO:<${to}>`);
    await sendLine(channel, "DATA");
    const header = (value) => String(value).replace(/[\r\n]+/g, " ");
    const body = text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    const accepted = readReply(channel);
    channel.write([
      `From: ${header(settings.from)}`,
      `To: ${header(to)}`,
      `Subject: ${header(subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
      ".",
      "",
    ].join("\r\n"));
    await accepted;
    await sendLine(channel, "QUIT");
    channel.end();
  }).catch((error) => {
    socket.destroy();
    throw error;
  });
}
