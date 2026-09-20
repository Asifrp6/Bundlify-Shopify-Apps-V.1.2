# Bundlify

Embedded Shopify app built with React Router, Polaris, and Prisma/SQLite.

## Current features

- `/app`: dashboard showing store-specific bundle and subscription counts.
- `/app/subscriptions`: saved subscription plans and their actual local creation status.
- `/app/subscriptions/new`: creates a Shopify selling plan with matching billing and delivery intervals, associates the selected product or the entire current catalog (in batches of 250), and saves the Shopify group ID. Rejected requests show errors; interrupted requests retain a recovery record. A failed local save attempts to roll back the newly created Shopify group.
- `/app/bundles`: saved bundle drafts.
- `/app/bundles/:id`: edits a draft's products, name, and planned discount, or deletes it after confirmation. Reads and writes are scoped to the authenticated shop.
- `/app/bundles/new`: selects real Shopify products and saves a draft with a planned percentage discount. Drafts do not create Shopify bundle products or apply checkout discounts.
- `/api/products`: authenticated product listing with pagination through the Shopify catalog.

The previous `/bundles` and `/bundles/new` URLs redirect to the embedded app routes.

## Local setup and checks

### Customer-created bundles

In **Apps → Bundlify → Bundles → Manage custom bundle products**, select 2–50 eligible products and save. The dashboard also links directly to this page. The shop-wide list is saved as a Shopify product-reference metafield and used by every **Bundle offers** app block. Clear the selection and save to disable custom bundles. Existing theme-editor selections are replaced by this app-managed list; select and save the desired products in the app after updating.

Keep the **Bundle offers** app block in your product template. Two subscription-style icon buttons, **Our bundle** and **Custom bundle**, switch between preset offers and the custom picker without losing selections. The custom option is enabled when at least two eligible products resolve on the storefront. Customers choose their available variants and add one of each selected product. Unavailable and subscription-only products cannot be selected. The preset bundle product-page filter does not filter the custom list.

Set **Custom bundle discount (%)** on the same management page (0–100). The storefront displays the original current-price total, discounted total, and savings percentage. This percentage applies to current prices; it is separate from preset bundle discounts. At 0%, any existing catalog sale savings are shown instead. Items are added as individual cart lines with a shared private group property. Shopify's discount function requires at least two distinct eligible products in the same custom group and excludes subscriptions and noneligible products. Removing products in the cart can remove eligibility.

Deploy the app server, theme extension, and updated bundle discount function before saving a nonzero custom discount. No database migration is required. The saved shop configuration activates only its matching discount node, so old nodes cannot apply stale discounts. Test variant changes, cart edits, and a checkout on the live store after deployment.

```sh
npm ci
npm run setup
npm run dev
```

`setup` generates Prisma Client and applies migrations. Keep the SQLite file on persistent storage in production. Before deploying elsewhere, run the migrations there too (the Docker startup command does this).

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Tests cover validation, selling-plan product associations, pagination, pricing-policy mapping, rejected requests, uncertain remote outcomes, compensating rollback, and storefront purchase-mode changes. Live checkout and recurring billing are not covered by these local tests.

## Shopify configuration

Both TOML configurations include lifecycle webhooks and product access. They target API version `2025-10`, matching `app/shopify.server.js` and GraphQL code generation. Both `shopify.app.toml` and `shopify.app.bundlify.toml` target the selected Bundlify app with client ID `597fad9e0520214bdfa371cb2953e5df`.

The protected `write_own_subscription_contracts` scope is enabled. Confirm that Shopify has approved subscription API access for the selected Bundlify app, then grant the updated store permissions. Setting the client ID does not grant or verify approval. Subscription creation stays disabled until the installed session has the required scopes. See [Shopify's selling-plan requirements](https://shopify.dev/docs/apps/build/purchase-options/subscriptions/selling-plans/build-a-selling-plan).

The theme extension provides subscription selection through the existing theme Add to Cart form. A scheduled billing worker creates renewal orders for due Shopify subscription billing cycles. Customer self-service is not implemented here; handle pause/cancel and payment recovery through your subscription management workflow. Existing local-only plans are migrated to drafts rather than labeled active. Pending plans require checking the corresponding selling plans in Shopify before retrying creation.

## Subscription activation and recurring orders

1. Deploy the app and theme extension to the intended Shopify app/store. Enable **one** Bundlify Subscription or Subscription Selector app block in the product template near the existing Buy buttons. Both block names now use the same selector. Remove duplicate blocks. Use the existing theme Add to cart button. Bundlify synchronizes the selected selling plan; the theme submits the product and handles its cart drawer or page according to theme settings. One-time purchases omit the selling plan. The selector adds no extra button or redirect.
2. Create a plan, choose **All products** or one product, and add weekly/monthly delivery options. All products means the catalog at creation time; it does not automatically include future products. Editing or deleting selling plans does not change existing customer contracts.
3. Set a strong random `BILLING_CRON_SECRET` on the deployed web server and billing worker, and set `SHOPIFY_APP_URL` on the worker. Run `npm run billing:worker` as a persistent supervised process alongside the web server. It checks every five minutes. Alternatively schedule an authenticated POST to `/internal/billing` every five minutes using `Authorization: Bearer <BILLING_CRON_SECRET>`. The endpoint rejects requests when the secret is unset. The worker requires a running, reachable web server and the app's offline Shopify session.
4. Monitor non-200 billing responses and worker logs. Failed payments or authentication-required payments stop automatic billing for that contract until resolved; the worker does not blindly retry declined cards. Shopify processing that is still pending is checked on subsequent runs. Stable keys prevent duplicate attempts when requests overlap or time out. At most one overdue cycle per contract is attempted per run.
5. Complete a test checkout with an eligible payment gateway, verify the cart line carries the selected numeric selling plan ID, and verify a due test renewal creates an order. Also verify one-time purchase, variant changes, quantity, cart drawer, paused/cancelled contracts and declined payments on the actual theme/store before going live. Custom themes that construct cart JSON manually must include the form's `selling_plan` value; this selector supports native forms and FormData-based AJAX carts.

Shopify's billing cycle dates determine weekly, fortnightly, monthly and other renewal timing, including calendar month boundaries. A successful [billing attempt](https://shopify.dev/docs/api/admin-graphql/2025-10/mutations/subscriptionBillingAttemptCreate) creates the renewal order. The merchant or connected fulfillment provider must pack and ship it; this app does not mark an order shipped or arrange a courier. See [Shopify billing cycle inputs](https://shopify.dev/docs/api/admin-graphql/2025-10/input-objects/subscriptionbillingattemptinput).

The scheduler is not activated merely by creating a selling plan or building this repository. Production hosting, credentials, app permissions, theme activation and live payment verification must be configured separately. No schema migration is needed for these changes; billing status remains authoritative in Shopify.

## Original template reference

This is a template for building a [Shopify app](https://shopify.dev/docs/apps/getting-started) using [React Router](https://reactrouter.com/). It was forked from the [Shopify Remix app template](https://github.com/Shopify/shopify-app-template-remix) and converted to React Router.

Rather than cloning this repo, follow the [Quick Start steps](https://github.com/Shopify/shopify-app-template-react-router#quick-start).

Visit the [`shopify.dev` documentation](https://shopify.dev/docs/api/shopify-app-react-router) for more details on the React Router app package.

## Upgrading from Remix

If you have an existing Remix app that you want to upgrade to React Router, please follow the [upgrade guide](https://github.com/Shopify/shopify-app-template-react-router/wiki/Upgrading-from-Remix). Otherwise, please follow the quick start guide below.

## Quick start

### Prerequisites

Before you begin, you'll need to [download and install the Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) if you haven't already.

### Setup

```shell
shopify app init --template=https://github.com/Shopify/shopify-app-template-react-router
```

### Local Development

```shell
shopify app dev
```

Press P to open the URL to your app. Once you click install, you can start development.

Local development is powered by [the Shopify CLI](https://shopify.dev/docs/apps/tools/cli). It logs into your account, connects to an app, provides environment variables, updates remote config, creates a tunnel and provides commands to generate extensions.

### Authenticating and querying data

To authenticate and query data you can use the `shopify` const that is exported from `/app/shopify.server.js`:

```js
export async function loader({ request }) {
  const { admin } = await shopify.authenticate.admin(request);

  const response = await admin.graphql(`
    {
      products(first: 25) {
        nodes {
          title
          description
        }
      }
    }`);

  const {
    data: {
      products: { nodes },
    },
  } = await response.json();

  return nodes;
}
```

This template comes pre-configured with examples of:

1. Setting up your Shopify app in [/app/shopify.server.ts](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/shopify.server.ts)
2. Querying data using Graphql. Please see: [/app/routes/app.\_index.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/app._index.tsx).
3. Responding to webhooks. Please see [/app/routes/webhooks.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/webhooks.app.uninstalled.tsx).
4. Using metafields, metaobjects, and declarative custom data definitions. Please see [/app/routes/app.\_index.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/app._index.tsx) and [shopify.app.toml](https://github.com/Shopify/shopify-app-template-react-router/blob/main/shopify.app.toml).

Please read the [documentation for @shopify/shopify-app-react-router](https://shopify.dev/docs/api/shopify-app-react-router) to see what other API's are available.

## Shopify Dev MCP

This template is configured with the Shopify Dev MCP. This instructs [Cursor](https://cursor.com/), [GitHub Copilot](https://github.com/features/copilot) and [Claude Code](https://claude.com/product/claude-code) and [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) to use the Shopify Dev MCP.

For more information on the Shopify Dev MCP please read [the documentation](https://shopify.dev/docs/apps/build/devmcp).

## Deployment

### Application Storage

This template uses [Prisma](https://www.prisma.io/) to store session data, by default using an [SQLite](https://www.sqlite.org/index.html) database.
The database is defined as a Prisma schema in `prisma/schema.prisma`.

This use of SQLite works in production if your app runs as a single instance.
The database that works best for you depends on the data your app needs and how it is queried.
Here’s a short list of databases providers that provide a free tier to get started:

| Database   | Type             | Hosters                                                                                                                                                                                                                                    |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MySQL      | SQL              | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-mysql), [Planet Scale](https://planetscale.com/), [Amazon Aurora](https://aws.amazon.com/rds/aurora/), [Google Cloud SQL](https://cloud.google.com/sql/docs/mysql) |
| PostgreSQL | SQL              | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-postgresql), [Amazon Aurora](https://aws.amazon.com/rds/aurora/), [Google Cloud SQL](https://cloud.google.com/sql/docs/postgres)                                   |
| Redis      | Key-value        | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-redis), [Amazon MemoryDB](https://aws.amazon.com/memorydb/)                                                                                                        |
| MongoDB    | NoSQL / Document | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-mongodb), [MongoDB Atlas](https://www.mongodb.com/atlas/database)                                                                                                  |

To use one of these, you can use a different [datasource provider](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#datasource) in your `schema.prisma` file, or a different [SessionStorage adapter package](https://github.com/Shopify/shopify-api-js/blob/main/packages/shopify-api/docs/guides/session-storage.md).

### Build

Build the app by running the command below with the package manager of your choice:

Using yarn:

```shell
yarn build
```

Using npm:

```shell
npm run build
```

Using pnpm:

```shell
pnpm run build
```

## Hosting

When you're ready to set up your app in production, you can follow [our deployment documentation](https://shopify.dev/docs/apps/launch/deployment) to host it externally. From there, you have a few options:

- [Google Cloud Run](https://shopify.dev/docs/apps/launch/deployment/deploy-to-google-cloud-run): This tutorial is written specifically for this example repo, and is compatible with the extended steps included in the subsequent [**Build your app**](tutorial) in the **Getting started** docs. It is the most detailed tutorial for taking a React Router-based Shopify app and deploying it to production. It includes configuring permissions and secrets, setting up a production database, and even hosting your apps behind a load balancer across multiple regions.
- [Fly.io](https://fly.io/docs/js/shopify/): Leverages the Fly.io CLI to quickly launch Shopify apps to a single machine.
- [Render](https://render.com/docs/deploy-shopify-app): This tutorial guides you through using Docker to deploy and install apps on a Dev store.
- [Manual deployment guide](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service): This resource provides general guidance on the requirements of deployment including environment variables, secrets, and persistent data.

When you reach the step for [setting up environment variables](https://shopify.dev/docs/apps/deployment/web#set-env-vars), you also need to set the variable `NODE_ENV=production`.

## Gotchas / Troubleshooting

### Database tables don't exist

If you get an error like:

```
The table `main.Session` does not exist in the current database.
```

Create the database for Prisma. Run the `setup` script in `package.json` using `npm`, `yarn` or `pnpm`.

### Navigating/redirecting breaks an embedded app

Embedded apps must maintain the user session, which can be tricky inside an iFrame. To avoid issues:

1. Use `Link` from `react-router` or `@shopify/polaris`. Do not use `<a>`.
2. Use `redirect` returned from `authenticate.admin`. Do not use `redirect` from `react-router`
3. Use `useSubmit` from `react-router`.

This only applies if your app is embedded, which it will be by default.

### Webhooks: shop-specific webhook subscriptions aren't updated

If you are registering webhooks in the `afterAuth` hook, using `shopify.registerWebhooks`, you may find that your subscriptions aren't being updated.

Instead of using the `afterAuth` hook declare app-specific webhooks in the `shopify.app.toml` file. This approach is easier since Shopify will automatically sync changes every time you run `deploy` (e.g: `npm run deploy`). Please read these guides to understand more:

1. [app-specific vs shop-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions)
2. [Create a subscription tutorial](https://shopify.dev/docs/apps/build/webhooks/subscribe/get-started?deliveryMethod=https)

If you do need shop-specific webhooks, keep in mind that the package calls `afterAuth` in 2 scenarios:

- After installing the app
- When an access token expires

During normal development, the app won't need to re-authenticate most of the time, so shop-specific subscriptions aren't updated. To force your app to update the subscriptions, uninstall and reinstall the app. Revisiting the app will call the `afterAuth` hook.

### Webhooks: Admin created webhook failing HMAC validation

Webhooks subscriptions created in the [Shopify admin](https://help.shopify.com/en/manual/orders/notifications/webhooks) will fail HMAC validation. This is because the webhook payload is not signed with your app's secret key.

The recommended solution is to use [app-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions) defined in your toml file instead. Test your webhooks by triggering events manually in the Shopify admin(e.g. Updating the product title to trigger a `PRODUCTS_UPDATE`).

### Webhooks: Admin object undefined on webhook events triggered by the CLI

When you trigger a webhook event using the Shopify CLI, the `admin` object will be `undefined`. This is because the CLI triggers an event with a valid, but non-existent, shop. The `admin` object is only available when the webhook is triggered by a shop that has installed the app. This is expected.

Webhooks triggered by the CLI are intended for initial experimentation testing of your webhook configuration. For more information on how to test your webhooks, see the [Shopify CLI documentation](https://shopify.dev/docs/apps/tools/cli/commands#webhook-trigger).

### Incorrect GraphQL Hints

By default the [graphql.vscode-graphql](https://marketplace.visualstudio.com/items?itemName=GraphQL.vscode-graphql) extension for will assume that GraphQL queries or mutations are for the [Shopify Admin API](https://shopify.dev/docs/api/admin). This is a sensible default, but it may not be true if:

1. You use another Shopify API such as the storefront API.
2. You use a third party GraphQL API.

If so, please update [.graphqlrc.ts](https://github.com/Shopify/shopify-app-template-react-router/blob/main/.graphqlrc.ts).

### Using Defer & await for streaming responses

By default the CLI uses a cloudflare tunnel. Unfortunately cloudflare tunnels wait for the Response stream to finish, then sends one chunk. This will not affect production.

To test [streaming using await](https://reactrouter.com/api/components/Await#await) during local development we recommend [localhost based development](https://shopify.dev/docs/apps/build/cli-for-apps/networking-options#localhost-based-development).

### "nbf" claim timestamp check failed

This is because a JWT token is expired. If you are consistently getting this error, it could be that the clock on your machine is not in sync with the server. To fix this ensure you have enabled "Set time and date automatically" in the "Date and Time" settings on your computer.

### Using MongoDB and Prisma

If you choose to use MongoDB with Prisma, there are some gotchas in Prisma's MongoDB support to be aware of. Please see the [Prisma SessionStorage README](https://www.npmjs.com/package/@shopify/shopify-app-session-storage-prisma#mongodb).

### Unable to require(`C:\...\query_engine-windows.dll.node`).

Unable to require(`C:\...\query_engine-windows.dll.node`).
The Prisma engines do not seem to be compatible with your system.

query_engine-windows.dll.node is not a valid Win32 application.

**Fix:** Set the environment variable:

```shell
PRISMA_CLIENT_ENGINE_TYPE=binary
```

This forces Prisma to use the binary engine mode, which runs the query engine as a separate process and can work via emulation on Windows ARM64.

## Resources

React Router:

- [React Router docs](https://reactrouter.com/home)

Shopify:

- [Intro to Shopify apps](https://shopify.dev/docs/apps/getting-started)
- [Shopify App React Router docs](https://shopify.dev/docs/api/shopify-app-react-router)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- [Shopify App Bridge](https://shopify.dev/docs/api/app-bridge-library).
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components).
- [App extensions](https://shopify.dev/docs/apps/app-extensions/list)
- [Shopify Functions](https://shopify.dev/docs/api/functions)

Internationalization:

- [Internationalizing your app](https://shopify.dev/docs/apps/best-practices/internationalization/getting-started)
