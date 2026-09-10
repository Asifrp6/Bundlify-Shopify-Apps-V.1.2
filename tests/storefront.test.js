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
