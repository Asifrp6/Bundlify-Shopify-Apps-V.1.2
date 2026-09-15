# Bundle discounts

This Function discounts only complete sets of the configured products carrying matching
`_bundlify_bundle` and `_bundlify_group` line properties. Regular purchases and subscription
lines are excluded. Removing a required product removes the discount; excess quantities
are charged normally. The percentage and required products come from an app-owned
discount metafield, never from a price supplied by the browser.

## Enable on a store

1. Run `npm install` and `npm run setup` on the app host.
2. Deploy the app extensions and configuration with `npm run deploy`.
3. Approve the new `write_discounts` permission when Shopify requests it.
4. Activate the bundle in the app. For previously active bundles, deactivate and
   activate again. Activation creates the Shopify automatic discount. A failed
   activation shows an error instead of advertising an unapplied discount.

Editing an active bundle removes its discount and returns it to draft. Activate it
again to publish the new product selection and percentage. Each active discounted
bundle uses one Shopify automatic discount slot, subject to Shopify's store limits
and Function eligibility.

The storefront uses the theme's `cart-drawer` section renderer when available.
Other themes use an accessible Bundlify cart dialog populated from Shopify's Cart
API, with links to the cart and checkout. All drawer prices come from Shopify.

## Verify

`node --test tests/bundle-cart.test.js tests/bundle-discount.test.js` (from app root)

`shopify app function build --path extensions/bundle-discount`

On a development store, add a discounted bundle, change its variants, remove a
component, and add an ordinary product separately. Confirm cart and checkout
discounts apply only to complete bundle quantities.

References: [Discount Functions](https://shopify.dev/docs/apps/build/discounts/build-discount-function?extension=javascript),
[Cart API and section rendering](https://shopify.dev/docs/api/ajax/reference/cart).
