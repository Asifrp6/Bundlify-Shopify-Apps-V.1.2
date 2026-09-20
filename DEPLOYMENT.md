# Bundlify production deployment

Production domain: https://bundlify.imranwebstudio.me

Shopify client ID: `597fad9e0520214bdfa371cb2953e5df`.

## Server layout

- Current release: `/var/www/bundlify-releases/release-20260920`.
- Web process: PM2 `bundlify-web`, listening on port `3001`.
- Worker process: PM2 `bundlify-billing`, calling the local web server every five minutes.
- Web environment: `.env` in the current release. Node loads it using `--env-file=.env`.
- Worker environment: `.env.billing` in the current release. It contains only the local endpoint URL and billing authentication secret.
- Persistent database: `/var/www/Bundlify-Shopify-Apps-V.1.2/prisma/dev.sqlite`, symlinked into the release. Do not replace this file when deploying code.
- Database backup before this release: `/var/www/Bundlify-Shopify-Apps-V.1.2/prisma/pre-release-20260920.sqlite`.
- Previous web process: PM2 `bundlify`, stopped. Its files remain in `/var/www/Bundlify-Shopify-Apps-V.1.2`.

Keep environment files private and out of source control. Change production credentials in the current release's `.env`, then restart `bundlify-web`. If changing `BILLING_CRON_SECRET`, update `.env.billing` as well and restart both processes.

## HTTPS and process recovery

Public traffic is handled by the `nginx-ui` Docker container, not the host Nginx installation. Its Bundlify configuration is in `/var/lib/docker/volumes/nginx_nginx_data/_data/sites-enabled/bundlify` and proxies to `172.19.0.1:3001`. A firewall rule permits access from the container at `172.19.0.2`; update it if the container's network address changes.

Certbot manages the domain certificate. `/etc/letsencrypt/renewal-hooks/deploy/bundlify-nginx.sh` copies renewed certificates into the container's mounted configuration volume and reloads Nginx after validation.

The `pm2-pias` systemd service is enabled. Run `pm2 save` after intentional process-list changes.

## Verification and outstanding work

The initial deployment passed migrations, lint, type checks, all 77 tests, and the production build. Public HTTPS and direct origin TLS returned HTTP 200. An unauthenticated billing request returned HTTP 401. Shopify configuration and extensions were released as `bundlify-3`.

The existing test-store offline session was expired, and the authenticated billing check returned HTTP 502 with an app session/permissions error. Reopen the app in the test store to renew authorization, then verify billing logs and complete a test checkout and renewal. A running worker does not establish that renewals succeed.

Theme Check reported that `bundlify-bundles.js` exceeds its configured app-block JavaScript size threshold. Shopify accepted the deployment, but this remains an App Store readiness issue to address.

This deployment does not submit or approve an App Store listing. Privacy webhooks, subscription management requirements, distribution settings, and review preparation remain separate work.
