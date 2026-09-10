// Shopify CLI supplies the public tunnel URL while the server receives local URLs.
// Allow only this app's configured host for proxied form submissions.
const appUrl = process.env.SHOPIFY_APP_URL || process.env.HOST;

/** @type {import('@react-router/dev/config').Config} */
export default {
  allowedActionOrigins: appUrl ? [new URL(appUrl).host] : [],
};
