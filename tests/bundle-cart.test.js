import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
const source = await readFile(new URL('../extensions/buendly-extation/assets/bundlify-bundles.js', import.meta.url), 'utf8');
async function fixture(t, { unavailable = false, fail = false, drawer = false, brokenDrawer = false, custom = false, proxyFail = false, customDiscount = 0, modal = false, fixedDiscount = null } = {}) {
  const dom = new JSDOM('<bundlify-bundles data-currency="USD" data-root="/fr/"><div data-list></div><p data-message></p></bundlify-bundles>', { url: 'https://store.test/fr/products/a', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
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
    if (String(url).includes('/apps/')) return proxyFail ? Response.json({}, { status: 502 }) : Response.json({ bundles: custom ? [] : [{ id: '7', discount: fixedDiscount === null ? 10 : 0, discountType: fixedDiscount === null ? 'percentage' : 'fixed', fixedDiscount, shopCurrency: 'USD', name: 'Pair', products: [{ title: 'A', handle: 'a' }, { title: 'B', handle: 'b' }] }] });
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
  const button = widget.querySelector('button');
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
  assert.equal(widget.querySelector('button').disabled, true);
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
test('cart failure displays Shopify error and allows retry without claiming success', async t => {
  const { widget, destination } = await fixture(t, { fail: true });
  widget.querySelector('button').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(widget.textContent, /Not enough inventory/);
  assert.equal(widget.querySelector('button').disabled, false);
  assert.equal(destination(), undefined);
});

test('bundle add refreshes the theme drawer using Shopify sections', async t => {
  const { widget, posts, rendered } = await fixture(t, { drawer: true });
  widget.querySelector('button').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(posts[0].body.sections, ['cart-drawer', 'cart-icon-bubble']);
  assert.equal(posts[0].body.sections_url, '/fr/products/a');
  assert.match(rendered().sections['cart-drawer'], /Discounted cart/);
  assert.equal(widget.ownerDocument.querySelector('cart-drawer').classList.contains('is-empty'), false);
});

test('drawer rendering failure does not add the items again or report a cart-write failure', async t => {
  const { widget, posts } = await fixture(t, { drawer: true, brokenDrawer: true });
  widget.querySelector('button').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(posts.length, 1);
  assert.match(widget.textContent, /Bundle added. Open your cart/);
  assert.equal(widget.querySelector('button').disabled, false);
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
    if (String(url).includes('/apps/')) return Response.json({ bundles: [bundle, { ...bundle, id: '8' }] });
    requests.push(url);
    await gate;
    return Response.json({ title: 'Product', featured_image: 'https://cdn.shopify.com/product.jpg',
      variants: [{ id: 1, title: 'Default Title', price: 10000, available: true }] });
  };
  w.eval(source);
  await new Promise(resolve => setTimeout(resolve, 0));
  // Both requests must start before either resolves, even with overlapping bundles.
  assert.deepEqual(requests, ['/products/a.js', '/products/b.js']);
  assert.equal(w.document.querySelectorAll('.bundlify-product').length, 0);
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(w.document.querySelectorAll('.bundlify-product').length, 4);
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
