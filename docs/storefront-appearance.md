# Storefront appearance settings

## Shop owner guide

1. Open **Shopify admin → Apps → Bundlify → Settings** (`/app/settings`).
2. In **Subscription block**, edit the Purchase options heading and subtitle, One-time purchase label and description, and Subscribe & Save label and description. You can also edit the unavailable message.
3. In **Bundle block**, edit Better together, Our bundle, Custom bundle, their descriptions, the unavailable message, and the add-to-cart button label.
4. Use **Card icons** to choose Gift, Build a bundle, Package, Recurring delivery, Heart, Star, or No icon independently for each card.
5. Use **Colors** to set the block background/text and border, card group background, normal card background/text/border, hover colors, selected colors, and selected-hover colors. Icon colors and keyboard focus color are separate controls. The existing button/selected colors control the bundle action button and selected subscription delivery row.
6. Click each preview card to see its selected state. Hover it to check hover colors. Prices and products in the preview are examples; actual storefront prices come from Shopify.
7. Click **Save changes** in each section you edited, then refresh the storefront product page. Each section saves independently. Settings apply to all blocks of that type in this shop.

**Restore defaults** updates the form and preview; click Save changes to publish those defaults. Text fields accept 1–100 characters. Colors use six-digit hex values. Icons use the supplied safe SVG choices; arbitrary SVG uploads are not supported. Keep text, borders, icons, and focus indicators visible against their backgrounds.

The custom bundle card still requires at least two eligible products. Subscription availability still depends on the product variant's selling plans. Appearance changes do not change pricing, discounts, or eligibility.

## Code map

| File | Purpose |
| --- | --- |
| `app/services/appearance.js` | Defaults, field labels, icon choices, and server-side validation for all new fields. |
| `app/routes/app.settings.jsx` | Merchant form, icon dropdowns, interactive preview, and existing authenticated save action. |
| `app/components/AppearanceIcon.jsx` | Safe SVG icons for the dashboard preview. |
| `app/styles/settings.module.css` | Preview card states and icon/select styling. |
| `extensions/buendly-extation/snippets/bundle-options.liquid` | Reads bundle labels, descriptions, and icons from saved shop appearance. |
| `extensions/buendly-extation/snippets/subscription-options.liquid` | Reads purchase subtitle, descriptions, labels, and icons. |
| `extensions/buendly-extation/snippets/appearance-icon.liquid` | Storefront SVG icon allowlist. Keep paths consistent with AppearanceIcon.jsx when adding icons. |
| `extensions/buendly-extation/snippets/block-appearance.liquid` | Merchant color variables and scoped normal, hover, selected, and keyboard-focus styling. Defaults support shops with older settings. |
| `tests/appearance.test.js` | Validation coverage, including unsafe color and icon rejection. |

The existing `app/services/appearance.server.js` persists JSON in `bundlify.bundle_appearance` and `bundlify.subscription_appearance` shop metafields and merges defaults into older saved settings. No database migration or new API scope is needed. The custom-bundle product setup CSS is separate from storefront appearance settings.

## Release and verification

Deploy the app server and the updated theme extension (`npm run deploy` for Shopify extensions; deploy the server through your hosting workflow). Both updates are required before merchants can use the new settings on a live store.

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. On Windows PowerShell with scripts disabled, use `npm.cmd` in place of `npm`.

On a development store, save distinct colors and labels for each block, refresh the product page, and verify both blocks, selected/unselected hover, keyboard focus, unavailable variants, and persistence after reopening Settings. Confirm bundle add-to-cart and one-time/subscription purchases still work with the theme. Test narrow screens and long labels. Live-store verification requires an authenticated running app and theme.

Shopify reference: [metafieldsSet](https://shopify.dev/docs/api/admin-graphql/2025-10/mutations/metafieldsSet).
