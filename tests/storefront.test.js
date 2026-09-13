import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../extensions/buendly-extation/assets/bundlify-subscription.js", import.meta.url), "utf8");
const options = id => `<fieldset data-bundlify-plans="${id}">
  <input data-mode type="radio" name="mode-${id}" value="one-time" checked>
  <input data-mode type="radio" name="mode-${id}" value="subscription">
  <div data-frequencies>
    <input data-plan type="radio" name="plan-${id}" value="101" checked>
    <input data-plan type="radio" name="plan-${id}" value="102">
  </div>
</fieldset>`;
async function fixture(t) {
  const dom = new JSDOM(`<section id="shopify-section-product">
    <form action="/en/cart/add" id="product-form"><input name="id" value="1"><input name="quantity" value="3"><button>Add to cart</button></form>
    <bundlify-subscription data-variant-id="1">${options(1)}${options(2)}<p data-bundlify-error hidden></p></bundlify-subscription>
    <form action="/cart/add" id="recommendation"><input name="id" value="99"></form>
  </section>`, { url: "https://test.myshopify.com/products/coffee", runScripts: "outside-only" });
  t.after(() => dom.window.close());
  dom.window.eval(source);
  await new Promise(resolve => setTimeout(resolve, 0));
  return { window: dom.window, document: dom.window.document, form: dom.window.document.getElementById("product-form") };
}
function select(window, selector) {
  const input = window.document.querySelector(selector);
  input.checked = true;
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
}
test("initial selection is one-time and subscription choices start hidden", async t => {
  const { window, document, form } = await fixture(t);
  assert.equal(new window.FormData(form).has('selling_plan'), false);
  assert.equal(document.querySelector('[data-bundlify-plans="1"] [data-frequencies]').hidden, true);
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  assert.equal(document.querySelector('[data-bundlify-plans="1"] [data-frequencies]').hidden, false);
});
test("repeated synchronization does not trigger theme DOM observers again", async t => {
  const { window, document } = await fixture(t);
  const observer = new window.MutationObserver(() => {});
  observer.observe(document.body, { attributes: true, childList: true, subtree: true });
  document.querySelector('bundlify-subscription').update();
  assert.equal(observer.takeRecords().length, 0);
  observer.disconnect();
});
test("subscription goes through existing localized cart form with original quantity and button", async t => {
  const { window, document, form } = await fixture(t);
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  select(window, '[data-bundlify-plans="1"] [data-plan][value="102"]');
  const data = new window.FormData(form);
  assert.equal(data.get("selling_plan"), "102");
  assert.equal(data.get("quantity"), "3");
  assert.equal(data.get("id"), "1");
  assert.equal(document.querySelectorAll("button").length, 1);
  assert.equal(document.querySelector("#recommendation [name=selling_plan]"), null);
  select(window, '[data-bundlify-plans="1"] [data-mode][value="one-time"]');
  assert.equal(new window.FormData(form).has("selling_plan"), false);
});
test("variant changes retain the chosen subscription and update the existing form", async t => {
  const { window, form, document } = await fixture(t);
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  select(window, '[data-bundlify-plans="1"] [data-plan][value="102"]');
  form.elements.namedItem("id").value = "2";
  form.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(new window.FormData(form).get("selling_plan"), "102");
  assert.equal(document.querySelector('[data-bundlify-plans="1"]').hidden, true);
  assert.equal(document.querySelector('[data-bundlify-plans="2"]').hidden, false);
});
test("a plan unavailable on the new variant cannot silently become a one-time purchase", async t => {
  const { window, form, document } = await fixture(t);
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  select(window, '[data-bundlify-plans="1"] [data-plan][value="102"]');
  document.querySelector('[data-bundlify-plans="2"] [data-plan][value="102"]').remove();
  form.elements.namedItem("id").value = "2";
  form.dispatchEvent(new window.Event("change", { bubbles: true }));
  const event = new window.Event("submit", { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(document.querySelector('[data-bundlify-error]').hidden, false);
});
test("theme form replacement is detected and receives the selected plan", async t => {
  const { window, form, document } = await fixture(t);
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  const replacement = form.cloneNode(true);
  replacement.querySelector('[name=selling_plan]').remove();
  form.replaceWith(replacement);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(new window.FormData(replacement).get("selling_plan"), "101");
  document.querySelector('bundlify-subscription').remove();
  assert.equal(replacement.querySelector('[name=selling_plan]'), null);
});

test("one-time choice persists when returning to a previously subscribed variant", async t => {
  const { window, form } = await fixture(t);
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  form.elements.namedItem('id').value = '2';
  form.dispatchEvent(new window.Event('change', { bubbles: true }));
  select(window, '[data-bundlify-plans="2"] [data-mode][value="one-time"]');
  form.elements.namedItem('id').value = '1';
  form.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(new window.FormData(form).has('selling_plan'), false);
});

test("disabled plans and unavailable variants cannot be submitted", async t => {
  const { window, form, document } = await fixture(t);
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  const field = document.querySelector('[data-bundlify-plans="1"]');
  field.querySelector('[data-plan]:checked').disabled = true;
  let event = new window.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  field.querySelector('[data-plan]:checked').disabled = false;
  field.dataset.available = 'false';
  event = new window.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
});

test("a standalone app section sends the selected plan through the external product form", async t => {
  const { window, document, form } = await fixture(t);
  const section = document.createElement('section');
  section.id = 'shopify-section-apps';
  document.body.append(section);
  section.append(document.querySelector('bundlify-subscription'));
  await new Promise(resolve => setTimeout(resolve, 0));
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  select(window, '[data-bundlify-plans="1"] [data-plan][value="102"]');
  const payload = new window.FormData(form);
  assert.equal(payload.get('selling_plan'), '102');
  assert.equal(payload.get('quantity'), '3');
  assert.equal(document.querySelector('[data-bundlify-error]').hidden, true);
  select(window, '[data-bundlify-plans="1"] [data-mode][value="one-time"]');
  assert.equal(new window.FormData(form).has('selling_plan'), false);
});

test("a form replaced immediately before submit receives the plan before theme serialization", async t => {
  const { window, document, form } = await fixture(t);
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  select(window, '[data-bundlify-plans="1"] [data-plan][value="102"]');
  const replacement = form.cloneNode(true);
  replacement.querySelector('[name=selling_plan]').remove();
  form.replaceWith(replacement);
  let payload;
  window.fetch = async (url, request) => { payload = request.body; return { ok: false, json: async () => ({ description: 'Test failure' }) }; };
  replacement.addEventListener('submit', event => {
    event.preventDefault();
    payload = new window.FormData(replacement);
  });
  replacement.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(payload.get('selling_plan'), '102');
  assert.equal(payload.get('quantity'), '3');
  assert.equal(document.querySelector('#recommendation [name=selling_plan]'), null);
  await new Promise(resolve => setTimeout(resolve, 0));
});

test("a standalone widget does not guess between multiple matching product forms", async t => {
  const { window, document, form } = await fixture(t);
  const section = document.createElement('section');
  section.id = 'shopify-section-apps';
  document.body.append(section);
  section.append(document.querySelector('bundlify-subscription'));
  const other = form.cloneNode(true);
  other.id = 'other-product-form';
  other.querySelector('[name=selling_plan]')?.remove();
  form.after(other);
  await new Promise(resolve => setTimeout(resolve, 0));
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  assert.equal(new window.FormData(form).has('selling_plan'), false);
  assert.equal(new window.FormData(other).has('selling_plan'), false);
  assert.equal(document.querySelector('[data-bundlify-error]').hidden, false);
});

test("theme subscription helper cannot append an empty plan after the widget selection", async t => {
  const { window, form } = await fixture(t);
  const original = () => '';
  window.getCurrentSellingPlanId = original;
  let payload;
  window.fetch = async (url, request) => { payload = request.body; return { ok: false, json: async () => ({ description: 'Test failure' }) }; };
  // Reproduces the live Generated Data Theme product-form.js submission path.
  form.addEventListener('submit', event => {
    event.preventDefault();
    payload = new window.FormData(form);
    payload.append('selling_plan', window.getCurrentSellingPlanId());
  });
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  select(window, '[data-bundlify-plans="1"] [data-plan][value="102"]');
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.deepEqual(payload.getAll('selling_plan'), ['102']);
  assert.equal(payload.get('quantity'), '3');
  await Promise.resolve();
  assert.equal(window.getCurrentSellingPlanId, original);
  await new Promise(resolve => setTimeout(resolve, 0));
  select(window, '[data-bundlify-plans="1"] [data-mode][value="one-time"]');
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.deepEqual(payload.getAll('selling_plan'), []);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(window.getCurrentSellingPlanId, original);
});

test("both blocks load the script matching the shared selector markup", async () => {
  for (const name of ['subscription_selector', 'star_rating']) {
    const block = await readFile(new URL(`../extensions/buendly-extation/blocks/${name}.liquid`, import.meta.url), 'utf8');
    assert.match(block, /"javascript": "bundlify-subscription.js"/);
  }
});

async function cartFixture(t) {
  const context = await fixture(t);
  const widget = context.document.querySelector('bundlify-subscription');
  const navigations = [];
  widget.navigateToCart = url => navigations.push(url);
  return { ...context, widget, navigations };
}

test("cart submission adds the selected plan, quantity and properties once before navigating", async t => {
  const { window, form, widget, navigations } = await cartFixture(t);
  form.insertAdjacentHTML('beforeend', '<input name="properties[Gift]" value="Yes">');
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  select(window, '[data-bundlify-plans="1"] [data-plan][value="102"]');
  const calls = [];
  let complete;
  window.fetch = (url, request) => {
    calls.push({ url, request });
    return new Promise(resolve => { complete = resolve; });
  };
  const pending = widget.addToCart();
  await widget.addToCart();
  assert.equal(calls.length, 1);
  assert.deepEqual(navigations, []);
  assert.equal(calls[0].url, '/en/cart/add.js');
  assert.equal(calls[0].request.body.get('selling_plan'), '102');
  assert.equal(calls[0].request.body.get('quantity'), '3');
  assert.equal(calls[0].request.body.get('properties[Gift]'), 'Yes');
  complete({ ok: true, json: async () => ({ id: 1 }) });
  await pending;
  assert.deepEqual(navigations, ['/en/cart']);
});

test("cart submission shows Shopify errors without redirecting and allows retry as one-time", async t => {
  const { window, widget, navigations } = await cartFixture(t);
  window.fetch = async () => ({ ok: false, json: async () => ({ description: 'This item is sold out.', status: 422 }) });
  await widget.addToCart();
  assert.deepEqual(navigations, []);
  assert.equal(widget.querySelector('[data-bundlify-error]').textContent, 'This item is sold out.');
  assert.equal(widget.productForms()[0].querySelector('button').disabled, false);
  let payload;
  window.fetch = async (url, request) => {
    payload = request.body;
    return { ok: true, json: async () => ({ id: 1 }) };
  };
  await widget.addToCart();
  assert.equal(payload.has('selling_plan'), false);
  assert.deepEqual(navigations, ['/en/cart']);
});

test("cart submission rejects unavailable plans and network failures without navigation", async t => {
  const { window, widget, navigations } = await cartFixture(t);
  let calls = 0;
  window.fetch = async () => { calls++; throw new Error('Network unavailable'); };
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  const plan = widget.querySelector('[data-bundlify-plans="1"] [data-plan]:checked');
  plan.disabled = true;
  await widget.addToCart();
  assert.equal(calls, 0);
  plan.disabled = false;
  await widget.addToCart();
  assert.equal(calls, 1);
  assert.deepEqual(navigations, []);
  assert.equal(widget.querySelector('[data-bundlify-error]').textContent, 'Network unavailable');
});

test("existing Add to cart button submits subscription once and opens the cart", async t => {
  const { window, document, form, navigations } = await cartFixture(t);
  const calls = [];
  let themeSubmissions = 0;
  form.addEventListener('submit', event => { event.preventDefault(); themeSubmissions++; });
  window.fetch = async (url, request) => {
    calls.push(request.body);
    return { ok: true, json: async () => ({ id: 1 }) };
  };
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  select(window, '[data-bundlify-plans="1"] [data-plan][value="102"]');
  form.querySelector('button').click();
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].get('selling_plan'), '102');
  assert.equal(themeSubmissions, 0);
  assert.deepEqual(navigations, ['/en/cart']);
  assert.equal(document.querySelectorAll('button').length, 1);
});

test("default purchase adds the basic-price item and opens the cart", async t => {
  const { window, form, navigations } = await cartFixture(t);
  let payload;
  window.fetch = async (url, request) => {
    payload = request.body;
    return { ok: true, json: async () => ({ id: 1 }) };
  };
  form.querySelector('button').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(payload.has('selling_plan'), false);
  assert.equal(payload.get('id'), '1');
  assert.equal(payload.get('quantity'), '3');
  assert.deepEqual(navigations, ['/en/cart']);
});
