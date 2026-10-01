import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
const source = await readFile(new URL('../extensions/buendly-extation/assets/bundlify-bundles.js', import.meta.url), 'utf8');
// jsdom does not implement native dialog methods.
function polyfillDialog(w) {
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { if (!this.open) return; this.open = false; this.dispatchEvent(new w.Event('close')); };
}
const GIFTS = {
  packages: [{ id: '1', name: 'Kraft box', price: '5.00', variantId: '901' }, { id: '2', name: 'Velvet box', price: '12.50', variantId: '902' }],
  wraps: [{ id: '3', name: 'Red ribbon', price: '2.50', variantId: '903' }],
};
async function fixture(t, { unavailable = false, fail = false, drawer = false, brokenDrawer = false, custom = false, proxyFail = false, customDiscount = 0, modal = false, fixedDiscount = null, giftOptions = GIFTS, giftEnabled } = {}) {
  const dom = new JSDOM('<bundlify-bundles data-currency="USD" data-root="/fr/"><div data-list></div><p data-message></p></bundlify-bundles>', { url: 'https://store.test/fr/products/a', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  polyfillDialog(w);
  if (custom) w.document.querySelector('bundlify-bundles').insertAdjacentHTML('beforeend', '<div data-custom-bundle><button data-custom-toggle type="button">Create custom bundle</button><article data-custom-picker hidden><h3>Create your bundle</h3><p>Choose at least 2.</p></article><div data-custom-products hidden><span data-handle="a" data-title="A"></span><span data-handle="b" data-title="B"></span><span data-handle="c" data-title="C"></span></div></div>');
  w.AbortSignal.any = () => undefined;
  if (custom) {
    const widget = w.document.querySelector('bundlify-bundles');
    widget.querySelector('[data-custom-bundle]').dataset.customDiscount = String(customDiscount);
    const preset = w.document.createElement('button');
    preset.dataset.presetToggle = '';
    preset.textContent = 'Our bundle';
    const panel = w.document.createElement('div');
    panel.dataset.presetPanel = '';
    panel.append(widget.querySelector('[data-list]'), widget.querySelector('[data-message]'));
    widget.prepend(preset, panel);
    if (modal) {
      const dialog = w.document.createElement('dialog');
      dialog.dataset.customDialog = '';
      const close = w.document.createElement('button');
      close.dataset.customClose = '';
      close.textContent = 'Close';
      widget.querySelector('[data-custom-bundle]').append(dialog);
      dialog.append(close, widget.querySelector('[data-custom-picker]'));
      // jsdom does not implement native dialog methods.
      dialog.showModal = () => { dialog.open = true; close.focus(); };
      dialog.close = () => { if (!dialog.open) return; dialog.open = false; setTimeout(() => dialog.dispatchEvent(new w.Event('close')), 0); };
    }
  }
  w.AbortSignal.timeout = () => undefined;
  const posts = [];
  let rendered;
  if (drawer) {
    const element = w.document.createElement('cart-drawer');
    element.classList.add('is-empty');
    element.getSectionsToRender = () => [{ id: 'cart-drawer' }, { id: 'cart-icon-bubble' }];
    element.renderContents = result => { if (brokenDrawer) throw new Error('Render failed'); rendered = result; };
    w.document.body.append(element);
  }
  w.fetch = async (url, options = {}) => {
    if (String(url).includes('/apps/')) return proxyFail ? Response.json({}, { status: 502 }) : Response.json({ giftOptions, giftEnabled, bundles: custom ? [] : [{ id: '7', discount: fixedDiscount === null ? 10 : 0, discountType: fixedDiscount === null ? 'percentage' : 'fixed', fixedDiscount, shopCurrency: 'USD', name: 'Pair', products: [{ title: 'A', handle: 'a' }, { title: 'B', handle: 'b' }] }] });
    if (String(url).endsWith('/cart/add.js')) {
      posts.push({ url, body: JSON.parse(options.body) });
      return fail ? Response.json({ description: 'Not enough inventory' }, { status: 422 }) : Response.json({ items: [], sections: { 'cart-drawer': '<div>Discounted cart</div>', 'cart-icon-bubble': '<span>2</span>' } });
    }
    const id = String(url).includes('/a.js') ? 1 : String(url).includes('/c.js') ? 3 : 2;
    return Response.json({ title: `Product ${id}`, featured_image: "https://cdn.shopify.com/product.jpg", variants: [{ id, title: 'Small', price: 10000, compare_at_price: 12000, available: !unavailable }, { id: id + 10, title: 'Large', price: 15000, compare_at_price: null, available: !unavailable }] });
  };
  w.eval(source);
  await new Promise(resolve => setTimeout(resolve, 20));
  const widget = w.document.querySelector('bundlify-bundles');
  const choice = widget.querySelector('[data-bundle-options] button');
  if (choice) {
    choice.click();
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  let destination;
  if (!drawer) widget.openCart = url => { destination = url; };
  return { widget, posts, destination: () => destination, rendered: () => rendered };
}

test('bundle block remains visible when the proxy fails without custom products', async t => {
  const { widget } = await fixture(t, { proxyFail: true });
  assert.equal(widget.hidden, false);
  assert.match(widget.querySelector('[data-message]').textContent, /could not be loaded/);
});

test('bundle block remains visible with an empty response', async t => {
  const { widget } = await fixture(t);
  widget.ownerDocument.defaultView.fetch = async () => Response.json({ bundles: [] });
  await widget.load();
  assert.equal(widget.hidden, false);
  assert.equal(widget.querySelector('[data-list]').children.length, 0);
  assert.match(widget.querySelector('[data-message]').textContent, /No bundle offers/);
});

test('custom bundles remain visible without proxy, require two products and submit only chosen variants', async t => {
  const { widget, posts } = await fixture(t, { custom: true, proxyFail: true });
  assert.equal(widget.hidden, false);
  const toggle = widget.querySelector('[data-custom-toggle]');
  toggle.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  const picker = widget.querySelector('[data-custom-picker]');
  assert.equal(picker.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  const choices = picker.querySelectorAll('input[type=checkbox]');
  assert.equal(choices.length, 3);
  const add = picker.querySelector('button');
  const change = node => node.dispatchEvent(new widget.ownerDocument.defaultView.Event('change'));
  assert.equal(add.disabled, true);
  choices[0].checked = true; change(choices[0]);
  assert.equal(add.disabled, true);
  choices[2].checked = true; change(choices[2]);
  assert.equal(add.disabled, false);
  assert.match(picker.querySelector('.bundlify-total strong').textContent, /200\.00/);
  assert.match(picker.querySelector('.bundlify-total s').textContent, /240\.00/);
  const selects = picker.querySelectorAll('select');
  selects[2].value = '13'; change(selects[2]);
  assert.match(picker.querySelector('.bundlify-total strong').textContent, /250\.00/);
  assert.match(picker.querySelector('.bundlify-total s').textContent, /270\.00/);
  choices[0].checked = false; change(choices[0]);
  assert.equal(add.disabled, true);
  choices[0].checked = true; change(choices[0]);
  add.click(); add.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body.items.map(item => item.id), ['1', '13']);
  assert.equal(posts[0].body.items[0].properties._bundlify_custom, 'true');
  assert.equal(posts[0].body.items[0].properties._bundlify_bundle, undefined);
  assert.equal(posts[0].body.items[0].properties._bundlify_group, posts[0].body.items[1].properties._bundlify_group);
  toggle.click(); toggle.click();
  assert.equal(picker.querySelectorAll('input[type=checkbox]').length, 3);
});

test('custom bundles cannot submit when eligible products are unavailable', async t => {
  const { widget, posts } = await fixture(t, { custom: true, unavailable: true });
  widget.querySelector('[data-custom-toggle]').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  const picker = widget.querySelector('[data-custom-picker]');
  assert.equal(picker.querySelector('button').disabled, true);
  assert.match(picker.textContent, /at least two available products/);
  assert.equal(posts.length, 0);
});

for (const fail of [false, true]) test(`Done previews the custom bundle before cart submission (failure: ${fail})`, async t => {
  const { widget, posts, destination } = await fixture(t, { custom: true, modal: true, fail });
  const toggle = widget.querySelector('[data-custom-toggle]');
  const dialog = widget.querySelector('dialog');
  toggle.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(dialog.open, true);
  assert.equal(widget.querySelector('[data-preset-panel]').hidden, false);
  const choices = dialog.querySelectorAll('input[type=checkbox]');
  for (const choice of Array.from(choices).slice(0, 2)) {
    choice.checked = true;
    choice.dispatchEvent(new widget.ownerDocument.defaultView.Event('change'));
  }
  dialog.querySelector('[data-custom-close]').click();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(dialog.open, false);
  assert.equal(widget.ownerDocument.activeElement, toggle);
  toggle.click();
  assert.equal(choices[0].checked, true);
  assert.equal(dialog.querySelectorAll('input[type=checkbox]').length, 3);
  dialog.querySelector('[data-custom-picker] > button').click();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(posts.length, 0);
  assert.equal(dialog.open, false);
  const result = widget.querySelector('[data-custom-result]');
  assert.equal(result.hidden, false);
  assert.equal(result.querySelectorAll('.bundlify-product').length, 2);
  const add = Array.from(result.querySelectorAll('button')).find(button => button.textContent === 'Add custom bundle to cart');
  assert.equal(add.disabled, false);
  add.click();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(posts.length, 1);
  assert.equal(dialog.open, false);
  if (fail) assert.match(result.textContent, /Not enough inventory/);
  else assert.equal(destination(), 'https://store.test/fr/cart');
});

test('bundle mode buttons preserve custom selections and display the owner discount', async t => {
  const { widget } = await fixture(t, { custom: true, customDiscount: 20 });
  const custom = widget.querySelector('[data-custom-toggle]');
  const preset = widget.querySelector('[data-preset-toggle]');
  custom.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  const picker = widget.querySelector('[data-custom-picker]');
  const choices = picker.querySelectorAll('input[type=checkbox]');
  for (const choice of Array.from(choices).slice(0, 2)) {
    choice.checked = true;
    choice.dispatchEvent(new widget.ownerDocument.defaultView.Event('change'));
  }
  assert.equal(widget.querySelector('[data-preset-panel]').hidden, true);
  assert.match(picker.querySelector('.bundlify-total s').textContent, /200\.00/);
  assert.match(picker.querySelector('.bundlify-total strong').textContent, /160\.00/);
  assert.match(picker.querySelector('.bundlify-total small').textContent, /40\.00.*20%/);
  assert.match(picker.querySelector('.bundlify-product-price strong').textContent, /80\.00/);
  assert.equal(picker.querySelector('.bundlify-sale-badge').textContent, 'Save 20%');
  preset.click();
  assert.equal(picker.hidden, true);
  assert.equal(preset.getAttribute('aria-pressed'), 'true');
  custom.click();
  assert.equal(picker.hidden, false);
  assert.equal(choices[0].checked, true);
  assert.equal(picker.querySelectorAll('input[type=checkbox]').length, 3);
});
test('bundle button adds selected variants together once and opens localized cart', async t => {
  const { widget, posts, destination } = await fixture(t);
  widget.querySelector('select').value = '11';
  const button = widget.querySelector('.bundlify-purchase-action');
  button.click(); button.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, '/fr/cart/add.js');
  assert.deepEqual(posts[0].body.items.map(({id,quantity})=>({id,quantity})), [{ id: '11', quantity: 1 }, { id: '2', quantity: 1 }]);
  assert.equal(posts[0].body.items[0].properties._bundlify_bundle, '7');
  assert.equal(posts[0].body.items[0].properties._bundlify_group, posts[0].body.items[1].properties._bundlify_group);
  assert.equal(destination(), 'https://store.test/fr/cart');
});
test('unavailable products prevent bundle purchase', async t => {
  const { widget, posts } = await fixture(t, { unavailable: true });
  assert.equal(widget.querySelector('.bundlify-purchase-action').disabled, true);
  assert.match(widget.textContent, /unavailable/);
  assert.equal(posts.length, 0);
});
test('product images, original prices, sale prices and totals follow variant selection', async t => {
  const { widget } = await fixture(t);
  assert.equal(widget.querySelectorAll('.bundlify-product img').length, 2);
  assert.equal(widget.querySelector('img').alt, 'Product 1');
  assert.match(widget.querySelector('.bundlify-product-price s').textContent, /120\.00/);
  assert.match(widget.querySelector('.bundlify-product-price strong').textContent, /100\.00/);
  assert.match(widget.querySelector('.bundlify-total strong').textContent, /180\.00/);
  assert.match(widget.querySelector('.bundlify-total small').textContent, /20\.00/);
  const select = widget.querySelector('select');
  select.value = '11';
  select.dispatchEvent(new widget.ownerDocument.defaultView.Event('change', { bubbles: true }));
  assert.equal(widget.querySelector('.bundlify-product-price s').hidden, true);
  assert.match(widget.querySelector('.bundlify-product-price strong').textContent, /150\.00/);
  assert.match(widget.querySelector('.bundlify-total strong').textContent, /225\.00/);
  assert.match(widget.querySelector('.bundlify-total small').textContent, /25\.00/);
});
test('selected bundle renders the compact detail markup with accessible variant selects', async t => {
  const { widget } = await fixture(t);
  assert.equal(widget.querySelector('[data-list]').children.length, 0);
  const card = widget.querySelector('[data-gift-dialog] > article.bundlify-bundle-detail');
  assert.ok(card);
  assert.equal(card.querySelectorAll('.bundlify-product').length, 2);
  for (const label of card.querySelectorAll('.bundlify-product label')) {
    assert.equal(label.querySelector('.bundlify-variant-label').textContent, 'Choose option');
    assert.ok(label.querySelector('select'));
  }
  assert.equal(card.querySelector('.bundlify-total-label').textContent, 'Bundle total');
  assert.match(card.querySelector('.bundlify-total-save').textContent, /^Save 10% · .*20\.00$/);
  assert.ok(card.querySelector('button.bundlify-purchase-action'));
});
test('cart failure displays Shopify error and allows retry without claiming success', async t => {
  const { widget, destination } = await fixture(t, { fail: true });
  widget.querySelector('.bundlify-purchase-action').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(widget.textContent, /Not enough inventory/);
  assert.equal(widget.querySelector('.bundlify-purchase-action').disabled, false);
  assert.equal(destination(), undefined);
});

test('bundle add refreshes the theme drawer using Shopify sections', async t => {
  const { widget, posts, rendered } = await fixture(t, { drawer: true });
  widget.querySelector('.bundlify-purchase-action').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(posts[0].body.sections, ['cart-drawer', 'cart-icon-bubble']);
  assert.equal(posts[0].body.sections_url, '/fr/products/a');
  assert.match(rendered().sections['cart-drawer'], /Discounted cart/);
  assert.equal(widget.ownerDocument.querySelector('cart-drawer').classList.contains('is-empty'), false);
});

test('drawer rendering failure does not add the items again or report a cart-write failure', async t => {
  const { widget, posts } = await fixture(t, { drawer: true, brokenDrawer: true });
  widget.querySelector('.bundlify-purchase-action').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(posts.length, 1);
  assert.match(widget.textContent, /Bundle added. Open your cart/);
  assert.equal(widget.querySelector('.bundlify-purchase-action').disabled, false);
});

test('products load concurrently and shared bundle products are fetched only once', async t => {
  const dom = new JSDOM('<bundlify-bundles data-currency="USD"><div data-list></div><p data-message></p></bundlify-bundles>', {
    url: 'https://store.test/products/a', runScripts: 'outside-only',
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.AbortSignal.any = () => undefined;
  w.AbortSignal.timeout = () => undefined;
  const requests = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const bundle = { id: '7', name: 'Pair', discount: 10, products: [{ handle: 'a' }, { handle: 'b' }] };
  w.fetch = async url => {
    if (String(url).includes('/apps/')) return Response.json({ bundles: [bundle, { ...bundle, id: '8', name: 'Second' }] });
    requests.push(url);
    await gate;
    return Response.json({ title: 'Product', featured_image: 'https://cdn.shopify.com/product.jpg',
      variants: [{ id: 1, title: 'Default Title', price: 10000, available: true }] });
  };
  w.eval(source);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.length, 0);
  assert.equal(w.document.querySelectorAll('[data-bundle-options] button').length, 2);
  w.document.querySelector('[data-bundle-options] button').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  // Both requests must start before either resolves, even with overlapping bundles.
  assert.deepEqual(requests, ['/products/a.js', '/products/b.js']);
  assert.equal(w.document.querySelectorAll('.bundlify-product').length, 0);
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(w.document.querySelector('[data-gift-dialog] h3').textContent, 'Pair');
  assert.equal(w.document.querySelectorAll('.bundlify-product').length, 2);
  w.document.querySelectorAll('[data-bundle-options] button')[1].click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(requests, ['/products/a.js', '/products/b.js']);
  assert.equal(w.document.querySelector('[data-gift-dialog] h3').textContent, 'Second');
  assert.equal(w.document.querySelector('[data-bundle-options] button[aria-pressed="true"] strong').textContent, 'Second');
  assert.equal(w.document.querySelectorAll('.bundlify-product').length, 2);
  for (const img of w.document.querySelectorAll('.bundlify-product img')) {
    assert.equal(img.hidden, false);
    assert.equal(img.getAttribute('src'), 'https://cdn.shopify.com/product.jpg');
  }
  for (const placeholder of w.document.querySelectorAll('.bundlify-image-placeholder')) assert.equal(placeholder.hidden, true);
  for (const button of w.document.querySelectorAll('button')) assert.equal(button.disabled, false);
});


test('preset fixed discounts update totals, cap at subtotal and survive variant changes', async t => {
  const { widget } = await fixture(t, { fixedDiscount: 12.5 });
  const total = widget.querySelector('.bundlify-total');
  assert.match(total.textContent, /187.50/);
  assert.match(total.textContent, /12.50 off this bundle/);
  const select = widget.querySelector('select');
  select.value = '11';
  select.dispatchEvent(new widget.ownerDocument.defaultView.Event('change'));
  assert.match(total.textContent, /237.50/);
  const capped = await fixture(t, { fixedDiscount: 500 });
  assert.match(capped.widget.querySelector('.bundlify-total strong').textContent, /0.00/);
});

// Gift box popup: products → package → wrap → summary.
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const giftCard = widget => widget.querySelector('[data-gift-dialog] > .bundlify-bundle-detail');
const giftButton = (widget, label) => Array.from(giftCard(widget).querySelectorAll('button')).find(button => button.textContent === label && !button.closest('[hidden]'));
const visibleStep = widget => giftCard(widget).dataset.giftCurrent;
const summaryRows = widget => Array.from(giftCard(widget).querySelectorAll('.bundlify-gift-summary > div'), row => [row.querySelector('dt').firstChild.textContent, row.querySelector('dd').textContent.replace(/[^\d.]/g, '')]);
const choosePackage = (widget, name) => {
  const input = Array.from(giftCard(widget).querySelectorAll('.bundlify-gift-choice')).find(label => label.textContent.includes(name)).querySelector('input');
  input.checked = true;
  input.dispatchEvent(new widget.ownerDocument.defaultView.Event('change', { bubbles: true }));
};

test('selecting a bundle row opens one popup; step 1 offers Gift Box and Skip instead of Add to cart', async t => {
  const { widget } = await fixture(t);
  const dialog = widget.querySelector('[data-gift-dialog]');
  assert.equal(dialog.open, true);
  assert.equal(widget.ownerDocument.activeElement, giftCard(widget).querySelector('h3'));
  assert.equal(visibleStep(widget), 'products');
  assert.equal(giftCard(widget).querySelectorAll('.bundlify-product').length, 2);
  assert.ok(giftButton(widget, 'Gift Box'));
  assert.ok(giftButton(widget, 'Skip'));
  assert.equal(giftButton(widget, 'Add to cart'), undefined);
  assert.equal(giftCard(widget).querySelector('.bundlify-gift-back').hidden, true);
  assert.match(giftCard(widget).querySelector('.bundlify-gift-progress').textContent, /Step 1 of 4/);
  dialog.querySelector('button[aria-label="Close"]').click();
  assert.equal(dialog.open, false);
  assert.equal(widget.ownerDocument.activeElement, widget.querySelector('[data-bundle-options] button'));
  widget.querySelector('[data-bundle-options] button').click();
  assert.equal(dialog.open, true);
  assert.equal(giftCard(widget).querySelectorAll('.bundlify-product').length, 2);
});

for (const giftEnabled of [true, undefined]) test(`gift switch ${giftEnabled === undefined ? 'missing (older response)' : 'on'} keeps Gift Box and Skip on step 1`, async t => {
  const { widget } = await fixture(t, { giftEnabled });
  assert.equal(visibleStep(widget), 'products');
  assert.ok(giftButton(widget, 'Gift Box'));
  assert.ok(giftButton(widget, 'Skip'));
  assert.equal(giftButton(widget, 'Add to cart'), undefined);
  assert.ok(giftCard(widget).querySelector('[data-gift-step="package"]'));
});

test('gift switch off opens the popup with products and only Add to cart, no package or wrap steps', async t => {
  const { widget, posts, destination } = await fixture(t, { giftEnabled: false });
  const dialog = widget.querySelector('[data-gift-dialog]');
  assert.equal(dialog.open, true);
  const card = giftCard(widget);
  assert.equal(card.querySelectorAll('.bundlify-product').length, 2);
  assert.match(card.querySelector('.bundlify-total strong').textContent, /180\.00/);
  assert.equal(giftButton(widget, 'Gift Box'), undefined);
  assert.equal(giftButton(widget, 'Skip'), undefined);
  assert.equal(card.querySelector('[data-gift-step]'), null);
  assert.equal(card.querySelector('.bundlify-gift-nav'), null);
  assert.doesNotMatch(card.textContent, /Gift Box|Choose a package|Wrap/);
  const add = giftButton(widget, 'Add to cart');
  assert.ok(add);
  assert.equal(add.disabled, false);
  add.click();
  await tick(); await tick();
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body.items.map(item => item.id), ['1', '2']);
  assert.ok(posts[0].body.items.every(item => item.properties._bundlify_bundle === '7'));
  assert.equal(dialog.open, false);
  assert.equal(destination(), 'https://store.test/fr/cart');
});

test('Skip on step 1 goes to the summary with no package or wrap and adds only the bundle', async t => {
  const { widget, posts } = await fixture(t);
  giftButton(widget, 'Skip').click();
  assert.equal(visibleStep(widget), 'summary');
  assert.deepEqual(summaryRows(widget), [['Product price', '180.00'], ['Box price', '0.00'], ['Total', '180.00']]);
  giftButton(widget, 'Add to cart').click();
  await tick();
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body.items.map(item => item.id), ['1', '2']);
  assert.equal(widget.querySelector('[data-gift-dialog]').open, false);
});

test('package Skip keeps the chosen package, adds its price and charges its variant', async t => {
  const { widget, posts } = await fixture(t);
  giftButton(widget, 'Gift Box').click();
  assert.equal(visibleStep(widget), 'package');
  assert.equal(giftCard(widget).querySelector('.bundlify-product-grid').hidden, true);
  assert.match(giftCard(widget).textContent, /Kraft box.*5\.00.*Velvet box.*12\.50/);
  choosePackage(widget, 'Velvet box');
  giftButton(widget, 'Skip').click();
  assert.deepEqual(summaryRows(widget), [['Product price', '180.00'], ['Box price', '12.50'], ['Total', '192.50']]);
  giftButton(widget, 'Add to cart').click();
  await tick();
  const items = posts[0].body.items;
  assert.deepEqual(items.map(item => item.id), ['1', '2', '902']);
  assert.equal(items[2].properties['Gift box'], 'Velvet box');
  assert.equal(items[2].properties._bundlify_gift_for, items[0].properties._bundlify_group);
  assert.equal(items[2].properties._bundlify_bundle, undefined);
});

test('Gift Box → package → Wrap a Box → Continue totals products + package + wrap; Back keeps the product list', async t => {
  const { widget, posts } = await fixture(t);
  giftButton(widget, 'Gift Box').click();
  choosePackage(widget, 'Kraft box');
  giftButton(widget, 'Wrap a Box').click();
  assert.equal(visibleStep(widget), 'wrap');
  assert.equal(giftCard(widget).querySelector('[data-gift-step="wrap"] h4').textContent, 'Wrap Your Gift Box');
  const wrapStep = giftCard(widget).querySelector('[data-gift-step="wrap"]');
  assert.equal(wrapStep.querySelector('select'), null);
  assert.equal(wrapStep.querySelector('.bundlify-gift-choices').getAttribute('role'), 'radiogroup');
  const wrapCards = Array.from(wrapStep.querySelectorAll('label.bundlify-gift-choice'));
  assert.deepEqual(wrapCards.map(card => [card.querySelector('.bundlify-gift-choice-name').textContent, card.querySelector('.bundlify-gift-choice-price').textContent.replace(/[^\d.]/g, '')]), [['No wrap', '0.00'], ['Red ribbon', '2.50']]);
  assert.equal(wrapCards[0].querySelector('input').checked, true);
  choosePackage(widget, 'Red ribbon');
  giftButton(widget, 'Continue').click();
  assert.deepEqual(summaryRows(widget), [['Product price', '180.00'], ['Box price', '5.00'], ['Wrap price', '2.50'], ['Total', '187.50']]);
  const back = giftCard(widget).querySelector('.bundlify-gift-back');
  back.click();
  assert.equal(visibleStep(widget), 'wrap');
  back.click();
  back.click();
  assert.equal(visibleStep(widget), 'products');
  assert.equal(giftCard(widget).querySelectorAll('.bundlify-product').length, 2);
  const variant = giftCard(widget).querySelector('.bundlify-product select');
  variant.value = '11';
  variant.dispatchEvent(new widget.ownerDocument.defaultView.Event('change'));
  giftButton(widget, 'Gift Box').click();
  assert.equal(giftCard(widget).querySelector('.bundlify-gift-choice input').checked, true);
  giftButton(widget, 'Wrap a Box').click();
  giftButton(widget, 'Continue').click();
  assert.deepEqual(summaryRows(widget), [['Product price', '225.00'], ['Box price', '5.00'], ['Wrap price', '2.50'], ['Total', '232.50']]);
  giftButton(widget, 'Add to cart').click();
  await tick();
  assert.deepEqual(posts[0].body.items.map(item => item.id), ['11', '2', '901', '903']);
  assert.equal(posts[0].body.items[3].properties['Gift wrap'], 'Red ribbon');
});

test('package and wrap cards show the uploaded image, and a missing or broken image leaves the card usable', async t => {
  const image = 'https://cdn.shopify.com/s/files/1/box.jpg';
  const wrapImage = 'https://cdn.shopify.com/s/files/1/ribbon.webp?v=2';
  const { widget } = await fixture(t, { giftOptions: {
    packages: [
      { id: '1', name: 'Kraft box', price: '5.00', variantId: '901', imageUrl: image },
      { id: '2', name: 'Velvet box', price: '12.50', variantId: '902', imageUrl: 'javascript:alert(1)' },
    ],
    wraps: [{ id: '3', name: 'Red ribbon', price: '2.50', variantId: '903', imageUrl: wrapImage }],
  } });
  giftButton(widget, 'Gift Box').click();
  const packageCards = Array.from(giftCard(widget).querySelectorAll('[data-gift-step="package"] label.bundlify-gift-choice'));
  const photo = packageCards[0].querySelector('img');
  const view = window => window.querySelector('.bundlify-gift-choice-view');
  assert.equal(photo.getAttribute('src'), image);
  assert.equal(photo.alt, '');
  assert.equal(photo.closest('label'), packageCards[0]);
  assert.equal(photo.closest('button').type, 'button');
  assert.equal(packageCards[0].classList.contains('bundlify-gift-choice-with-image'), true);
  assert.equal(view(packageCards[0]).textContent, 'View');
  assert.equal(packageCards[1].querySelector('img'), null);
  assert.equal(view(packageCards[1]), null);
  assert.equal(packageCards[1].querySelector('.bundlify-gift-choice-name').textContent, 'Velvet box');
  assert.equal(packageCards[1].querySelector('input').type, 'radio');
  packageCards[0].querySelector('.bundlify-gift-choice-name').click();
  assert.equal(packageCards[0].querySelector('input').checked, true);
  const w = widget.ownerDocument.defaultView;
  const giftDialog = widget.querySelector('[data-gift-dialog]');
  photo.click();
  let preview = widget.querySelector('dialog.bundlify-gift-preview');
  assert.equal(preview?.open, true);
  assert.notEqual(preview, giftDialog);
  assert.equal(giftDialog.open, true);
  assert.equal(visibleStep(widget), 'package');
  assert.equal(preview.querySelector('img').getAttribute('src'), image);
  assert.equal([...preview.children].every(node => node.matches('img, button.bundlify-builder-close')), true);
  assert.equal(packageCards[0].querySelector('input').checked, true);
  preview.querySelector('img').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  assert.equal(preview.open, true);
  preview.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(widget.querySelector('dialog.bundlify-gift-preview'), null);
  assert.equal(giftDialog.open, true);
  assert.equal(visibleStep(widget), 'package');
  assert.equal(packageCards[0].querySelector('input').checked, true);
  view(packageCards[0]).click();
  preview = widget.querySelector('dialog.bundlify-gift-preview');
  assert.equal(preview.open, true);
  assert.equal(preview.querySelector('img').getAttribute('src'), image);
  assert.equal(packageCards[0].querySelector('input').checked, true);
  preview.querySelector('button.bundlify-builder-close').click();
  assert.equal(widget.querySelector('dialog.bundlify-gift-preview'), null);
  assert.equal(packageCards[0].querySelector('input').checked, true);
  photo.dispatchEvent(new w.Event('error'));
  assert.equal(packageCards[0].querySelector('img'), null);
  assert.equal(view(packageCards[0]), null);
  assert.equal(packageCards[0].classList.contains('bundlify-gift-choice-with-image'), false);
  assert.equal(packageCards[0].querySelector('.bundlify-gift-choice-name').textContent, 'Kraft box');
  assert.equal(packageCards[0].querySelector('input').checked, true);
  giftButton(widget, 'Wrap a Box').click();
  const wrapCards = Array.from(giftCard(widget).querySelectorAll('[data-gift-step="wrap"] label.bundlify-gift-choice'));
  assert.equal(wrapCards[0].querySelector('.bundlify-gift-choice-name').textContent, 'No wrap');
  assert.equal(wrapCards[0].querySelector('img'), null);
  assert.equal(view(wrapCards[0]), null);
  assert.equal(wrapCards[1].querySelector('img').getAttribute('src'), wrapImage);
  assert.equal(wrapCards[1].querySelector('img').closest('label'), wrapCards[1]);
  assert.equal(view(wrapCards[1]).textContent, 'View');
  assert.equal(wrapCards[0].querySelector('input').checked, true);
  wrapCards[1].querySelector('img').click();
  preview = widget.querySelector('dialog.bundlify-gift-preview');
  assert.equal(preview.open, true);
  assert.equal(preview.querySelector('img').getAttribute('src'), wrapImage);
  assert.equal(wrapCards[0].querySelector('input').checked, true);
  assert.equal(wrapCards[1].querySelector('input').checked, false);
  assert.equal(visibleStep(widget), 'wrap');
  preview.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  assert.equal(widget.querySelector('dialog.bundlify-gift-preview'), null);
  assert.equal(giftDialog.open, true);
  assert.equal(visibleStep(widget), 'wrap');
  assert.equal(wrapCards[0].querySelector('input').checked, true);
  const css = await readFile(new URL('../extensions/buendly-extation/assets/bundlify-bundles.css', import.meta.url), 'utf8');
  assert.match(css, /\.bundlify-gift-choice-image\s*\{[^}]*width:\s*64px/);
  assert.match(css, /border-radius:\s*10px/);
  assert.match(css, /\.bundlify-gift-preview img\s*\{[^}]*max-width:\s*90vw/);
  assert.match(css, /\.bundlify-gift-preview img\s*\{[^}]*max-height:\s*80vh/);
  assert.match(css, /\.bundlify-gift-preview img\s*\{[^}]*object-fit:\s*contain/);
  assert.match(css, /@media \(hover: none\)/);
});

test('Wrap a Box without a package still opens the wrap step with a box price of 0', async t => {
  const { widget } = await fixture(t);
  giftButton(widget, 'Gift Box').click();
  giftButton(widget, 'Wrap a Box').click();
  assert.equal(visibleStep(widget), 'wrap');
  giftButton(widget, 'Continue').click();
  assert.deepEqual(summaryRows(widget), [['Product price', '180.00'], ['Box price', '0.00'], ['Total', '180.00']]);
});

test('empty package and wrap lists say none are set up and Skip / Continue still reach the summary', async t => {
  const { widget, posts } = await fixture(t, { giftOptions: null });
  giftButton(widget, 'Gift Box').click();
  assert.match(giftCard(widget).querySelector('[data-gift-step="package"]').textContent, /No packages are set up yet/);
  giftButton(widget, 'Wrap a Box').click();
  assert.match(giftCard(widget).querySelector('[data-gift-step="wrap"]').textContent, /No wraps are set up yet/);
  assert.equal(giftCard(widget).querySelector('[data-gift-step="wrap"] .bundlify-gift-choice'), null);
  giftButton(widget, 'Continue').click();
  assert.deepEqual(summaryRows(widget), [['Product price', '180.00'], ['Box price', '0.00'], ['Total', '180.00']]);
  giftButton(widget, 'Add to cart').click();
  await tick();
  assert.deepEqual(posts[0].body.items.map(item => item.id), ['1', '2']);
});

test('a failed cart add with a package keeps the popup open, shows the error and never claims the fee was added', async t => {
  const { widget, destination } = await fixture(t, { fail: true });
  giftButton(widget, 'Gift Box').click();
  choosePackage(widget, 'Kraft box');
  giftButton(widget, 'Skip').click();
  giftButton(widget, 'Add to cart').click();
  await tick();
  assert.equal(widget.querySelector('[data-gift-dialog]').open, true);
  assert.match(giftCard(widget).textContent, /Not enough inventory/);
  assert.doesNotMatch(giftCard(widget).textContent, /added to your cart/);
  assert.equal(destination(), undefined);
  assert.equal(giftCard(widget).querySelector('.bundlify-gift-back').disabled, false);
});
