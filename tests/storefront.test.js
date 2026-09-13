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
  // Reproduces the live Generated Data Theme product-form.js submission path.
  form.addEventListener('submit', event => {
    event.preventDefault();
    payload = new window.FormData(form);
    payload.append('selling_plan', window.getCurrentSellingPlanId());
  });
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  select(window, '[data-bundlify-plans="1"] [data-plan][value="102"]');
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.deepEqual(payload.getAll('selling_plan'), ['102', '102']);
  assert.equal(payload.get('quantity'), '3');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(window.getCurrentSellingPlanId, original);
  await new Promise(resolve => setTimeout(resolve, 0));
  select(window, '[data-bundlify-plans="1"] [data-mode][value="one-time"]');
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.deepEqual(payload.getAll('selling_plan'), ['']);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(window.getCurrentSellingPlanId, original);
});

test("both blocks load the script matching the shared selector markup", async () => {
  for (const name of ['subscription_selector', 'star_rating']) {
    const block = await readFile(new URL(`../extensions/buendly-extation/blocks/${name}.liquid`, import.meta.url), 'utf8');
    assert.match(block, /"javascript": "bundlify-subscription.js"/);
  }
});


for (const subscription of [false, true]) {
  test(`theme owns the drawer submission for ${subscription ? 'subscription' : 'one-time'} purchases`, async t => {
    const { window, form } = await fixture(t);
    window.fetch = () => assert.fail('Widget must not submit a separate cart request');
    form.insertAdjacentHTML('beforeend', '<input name="properties[Gift]" value="Yes">');
    if (subscription) {
      select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
      select(window, '[data-bundlify-plans="1"] [data-plan][value="102"]');
    }
    let submissions = 0;
    form.addEventListener('submit', event => {
      assert.equal(event.defaultPrevented, false);
      event.preventDefault();
      submissions++;
      const payload = new window.FormData(form);
      assert.equal(payload.get('selling_plan'), subscription ? '102' : null);
      assert.equal(payload.get('quantity'), '3');
      assert.equal(payload.get('properties[Gift]'), 'Yes');
    });
    form.querySelector('button').click();
    assert.equal(submissions, 1);
    assert.equal(form.querySelector('button').disabled, false);
    assert.equal(window.location.pathname, '/products/coffee');
  });
}

test("theme helper retains the selected plan through an inter-listener microtask checkpoint", async t => {
  const { window, form } = await fixture(t);
  const original = () => '';
  window.getCurrentSellingPlanId = original;
  select(window, '[data-bundlify-plans="1"] [data-mode][value="subscription"]');
  select(window, '[data-bundlify-plans="1"] [data-plan][value="102"]');
  let observed;
  form.addEventListener('submit', event => {
    event.preventDefault();
    observed = Promise.resolve().then(() => window.getCurrentSellingPlanId());
  });
  form.querySelector('button').click();
  assert.equal(await observed, '102');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(window.getCurrentSellingPlanId, original);
});
