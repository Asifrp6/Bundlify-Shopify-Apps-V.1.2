import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
const source = await readFile(new URL('../extensions/buendly-extation/assets/bundlify-bundles.js', import.meta.url), 'utf8');
async function fixture(t, { unavailable = false, fail = false, drawer = false, brokenDrawer = false } = {}) {
  const dom = new JSDOM('<bundlify-bundles data-currency="USD" data-root="/fr/"><div data-list></div><p data-message></p></bundlify-bundles>', { url: 'https://store.test/fr/products/a', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.AbortSignal.any = () => undefined;
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
    if (String(url).includes('/apps/')) return Response.json({ bundles: [{ id: '7', discount: 10, name: 'Pair', products: [{ title: 'A', handle: 'a' }, { title: 'B', handle: 'b' }] }] });
    if (String(url).endsWith('/cart/add.js')) {
      posts.push({ url, body: JSON.parse(options.body) });
      return fail ? Response.json({ description: 'Not enough inventory' }, { status: 422 }) : Response.json({ items: [], sections: { 'cart-drawer': '<div>Discounted cart</div>', 'cart-icon-bubble': '<span>2</span>' } });
    }
    const id = String(url).includes('/a.js') ? 1 : 2;
    return Response.json({ title: `Product ${id}`, featured_image: "https://cdn.shopify.com/product.jpg", variants: [{ id, title: 'Small', price: 10000, compare_at_price: 12000, available: !unavailable }, { id: id + 10, title: 'Large', price: 15000, compare_at_price: null, available: !unavailable }] });
  };
  w.eval(source);
  await new Promise(resolve => setTimeout(resolve, 20));
  const widget = w.document.querySelector('bundlify-bundles');
  let destination;
  if (!drawer) widget.openCart = url => { destination = url; };
  return { widget, posts, destination: () => destination, rendered: () => rendered };
}
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
