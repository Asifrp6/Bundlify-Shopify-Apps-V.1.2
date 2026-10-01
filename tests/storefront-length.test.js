import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../extensions/buendly-extation/assets/bundlify-subscription.js", import.meta.url), "utf8");
const plan = (id, frequency, length, checked = false) =>
  `<label class="bundlify-option"><input data-plan type="radio" name="plan" value="${id}" ${checked ? "checked" : ""}${length ? ` data-length="${length}" data-frequency="${frequency}"` : ""}></label>`;
async function fixture(t, plans) {
  const dom = new JSDOM(`<section id="shopify-section-product">
    <form action="/cart/add" id="product-form"><input name="id" value="1"><button>Add to cart</button></form>
    <bundlify-subscription data-variant-id="1"><fieldset data-bundlify-plans="1">
      <input data-mode type="radio" name="mode" value="one-time" checked>
      <input data-mode type="radio" name="mode" value="subscription">
      <div data-frequencies hidden>${plans}</div>
    </fieldset><p data-bundlify-error hidden></p></bundlify-subscription>
  </section>`, { url: "https://test.myshopify.com/products/coffee", runScripts: "outside-only" });
  t.after(() => dom.window.close());
  dom.window.eval(source);
  await new Promise(resolve => setTimeout(resolve, 0));
  const { document } = dom.window;
  const subscribe = () => document.querySelector('[data-mode][value="subscription"]').click();
  const frequency = id => document.querySelector(`[data-plan][value="${id}"]`).click();
  const dialog = () => document.querySelector("[data-length-dialog]");
  const isOpen = () => !!dialog()?.hasAttribute("open");
  const count = () => dialog().querySelector("[data-length-times]");
  const type = value => {
    count().value = value;
    count().dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  };
  const unlimited = () => dialog().querySelector('input[type=radio][value="unlimited"]').click();
  const confirm = () => dialog().querySelector("[data-length-confirm]").click();
  const error = () => dialog().querySelector("[data-length-error]");
  const data = () => new dom.window.FormData(document.getElementById("product-form"));
  const sellingPlan = () => data().get("selling_plan");
  const times = () => data().get("properties[Subscription length]");
  const visiblePlans = () => [...document.querySelectorAll("[data-plan]")].filter(input => !input.closest("label").hidden).map(input => input.value);
  return { window: dom.window, document, subscribe, frequency, dialog, isOpen, count, type, unlimited, confirm, error, sellingPlan, times, visiblePlans };
}
// Server creates one ongoing "Unlimited" plan per frequency when the length popup is enabled.
const lengthPlans = plan(11, "Monthly", "Unlimited") + plan(21, "Weekly", "Unlimited");

test("with the length feature off, frequency clicks never open a popup or add a length", async t => {
  const { subscribe, frequency, dialog, sellingPlan, times, document } = await fixture(t, plan(101, "", "", true) + plan(102, "", ""));
  subscribe();
  assert.equal(document.querySelector("[data-frequencies]").hidden, false);
  assert.equal(sellingPlan(), "101");
  frequency(102);
  assert.equal(dialog(), null);
  assert.equal(document.querySelector("[data-length-summary]"), null);
  assert.equal(sellingPlan(), "102");
  assert.equal(times(), null);
});

test("clicking Subscribe & Save shows frequencies without opening the length popup", async t => {
  const { subscribe, isOpen, sellingPlan, visiblePlans, document } = await fixture(t, lengthPlans);
  subscribe();
  assert.equal(document.querySelector("[data-frequencies]").hidden, false);
  assert.equal(isOpen(), false);
  assert.deepEqual(visiblePlans(), ["11", "21"]);
  assert.equal(document.querySelector("[data-length-summary]").hidden, true);
  assert.equal(sellingPlan(), null);
});

test("the popup has a times number input and an Unlimited choice", async t => {
  const { subscribe, frequency, dialog, isOpen, count } = await fixture(t, lengthPlans);
  subscribe();
  frequency(21);
  assert.ok(isOpen());
  assert.equal(dialog().querySelector("[data-length-frequency]").textContent, "Weekly delivery");
  const input = count();
  assert.equal(input.type, "number");
  assert.equal(input.min, "1");
  assert.equal(input.max, "99");
  assert.equal(input.step, "1");
  assert.match(input.closest("label").textContent, /times/);
  const radios = [...dialog().querySelectorAll("[data-length-choices] input[type=radio]")];
  assert.deepEqual(radios.map(radio => radio.value), ["count", "unlimited"]);
  assert.equal(radios.find(radio => radio.checked).value, "count", "the number row is selected, not Unlimited");
  assert.equal(input.value, "");
  assert.equal(input.hasAttribute("placeholder"), false, "no placeholder that looks like a typed number");
});

test("typing 3 selects the number row and confirms 3 times, even after Unlimited was clicked", async t => {
  const { subscribe, frequency, dialog, type, unlimited, confirm, sellingPlan, times } = await fixture(t, lengthPlans);
  subscribe();
  frequency(21);
  unlimited();
  assert.equal(dialog().querySelector('[value="unlimited"]').checked, true);
  type("3");
  assert.equal(dialog().querySelector('[value="count"]').checked, true, "typing moves the selection to the number row");
  assert.equal(dialog().querySelector('[value="unlimited"]').checked, false);
  confirm();
  assert.equal(sellingPlan(), "21");
  assert.equal(times(), "3 times");
});

test("the screenshot state (3 typed, Unlimited still selected) confirms 3 times, not Unlimited", async t => {
  const { subscribe, frequency, dialog, count, unlimited, confirm, isOpen, sellingPlan, times } = await fixture(t, lengthPlans);
  subscribe();
  frequency(21);
  unlimited();
  count().value = "3"; // autofill or a browser that fires no input event
  assert.equal(dialog().querySelector('[value="unlimited"]').checked, true);
  confirm();
  assert.equal(isOpen(), false);
  assert.equal(sellingPlan(), "21");
  assert.equal(times(), "3 times");
});

test("choosing Unlimited clears a previously confirmed count so the two never show together", async t => {
  const { document, subscribe, frequency, dialog, count, type, unlimited, confirm, times } = await fixture(t, lengthPlans);
  subscribe();
  frequency(21);
  type("3");
  confirm();
  assert.equal(times(), "3 times");
  document.querySelector("[data-length-change]").click();
  assert.equal(count().value, "3");
  unlimited();
  assert.equal(count().value, "", "Unlimited empties the number field");
  assert.equal(dialog().querySelector('[value="count"]').checked, false);
  confirm();
  assert.equal(times(), "Unlimited");
  document.querySelector("[data-length-change]").click();
  type("1");
  confirm();
  assert.equal(times(), "1 time");
});

test("focusing or clicking the number field selects the number row", async t => {
  const { window, subscribe, frequency, dialog, count, unlimited } = await fixture(t, lengthPlans);
  subscribe();
  frequency(21);
  unlimited();
  count().click();
  assert.equal(dialog().querySelector('[value="count"]').checked, true);
  unlimited();
  count().dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));
  assert.equal(dialog().querySelector('[value="count"]').checked, true);
});

test("Unlimited is saved only when that row is chosen", async t => {
  const { subscribe, frequency, dialog, isOpen, error, confirm, unlimited, sellingPlan, times, document } = await fixture(t, lengthPlans);
  subscribe();
  frequency(21);
  confirm();
  assert.ok(isOpen(), "an untouched popup cannot confirm Unlimited by default");
  assert.equal(error().hidden, false);
  assert.equal(times(), null);
  assert.equal(sellingPlan(), null);
  unlimited();
  confirm();
  assert.equal(times(), "Unlimited");
  document.querySelector("[data-length-change]").click();
  assert.equal(dialog().querySelector('[value="unlimited"]').checked, true, "a confirmed Unlimited reopens selected");
});

test("typing a number and confirming selects the plan and puts the count on the cart line", async t => {
  const { document, subscribe, frequency, dialog, isOpen, type, confirm, sellingPlan, times } = await fixture(t, lengthPlans);
  subscribe();
  frequency(21);
  assert.equal(sellingPlan(), null, "no selling plan before a length is confirmed");
  type("4");
  assert.equal(dialog().querySelector('[value="count"]').checked, true, "typing switches to the number choice");
  confirm();
  assert.equal(isOpen(), false);
  assert.equal(sellingPlan(), "21");
  assert.equal(times(), "4 times");
  assert.equal(document.querySelector("[data-length-summary]").hidden, false);
  assert.equal(document.querySelector("[data-length-current]").textContent, "4 times");

  document.querySelector("[data-length-change]").click();
  assert.ok(isOpen(), "Change reopens the popup");
  assert.equal(dialog().querySelector("[data-length-times]").value, "4", "the confirmed count is prefilled");
  type("1");
  confirm();
  assert.equal(times(), "1 time");
});

test("choosing Unlimited needs no number", async t => {
  const { subscribe, frequency, type, unlimited, confirm, isOpen, sellingPlan, times } = await fixture(t, lengthPlans);
  subscribe();
  frequency(11);
  type("");
  unlimited();
  confirm();
  assert.equal(isOpen(), false);
  assert.equal(sellingPlan(), "11");
  assert.equal(times(), "Unlimited");
});

test("empty, zero, negative, decimal and too-large counts are rejected", async t => {
  const { subscribe, frequency, dialog, count, type, confirm, error, isOpen, sellingPlan, times } = await fixture(t, lengthPlans);
  subscribe();
  frequency(11);
  for (const value of ["", "0", "-3", "2.5", "100", "1e2"]) {
    type(value);
    dialog().querySelector('[value="count"]').click();
    confirm();
    assert.ok(isOpen(), `"${value}" keeps the popup open`);
    assert.equal(error().hidden, false);
    assert.equal(count().getAttribute("aria-invalid"), "true");
    assert.equal(sellingPlan(), null);
    assert.equal(times(), null);
  }
  type("99");
  confirm();
  assert.equal(isOpen(), false);
  assert.equal(times(), "99 times");
});

test("closing the popup without confirming keeps the frequency but applies no length", async t => {
  const { subscribe, frequency, dialog, isOpen, type, sellingPlan, times, document } = await fixture(t, lengthPlans);
  subscribe();
  frequency(11);
  type("3");
  dialog().querySelector("[data-length-cancel]").click();
  assert.equal(isOpen(), false);
  assert.equal(document.querySelector("[data-mode]:checked").value, "subscription");
  assert.equal(document.querySelector("[data-plan]:checked").value, "11");
  assert.equal(document.querySelector("[data-length-summary]").hidden, true);
  assert.equal(sellingPlan(), null);
  assert.equal(times(), null);
  assert.equal(document.querySelector("[data-bundlify-error]").textContent, "Choose a subscription length.");
});

test("an unconfirmed length cannot be submitted", async t => {
  const { window, document, subscribe, frequency, dialog } = await fixture(t, lengthPlans);
  subscribe();
  frequency(21);
  dialog().querySelector("[data-length-cancel]").click();
  const event = new window.Event("submit", { bubbles: true, cancelable: true });
  document.getElementById("product-form").dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
});

test("older groups with preset lengths show one ongoing plan per frequency", async t => {
  const { window, document, subscribe, frequency, type, confirm, sellingPlan, times, visiblePlans } = await fixture(t,
    plan(31, "Weekly", "6 weeks") + plan(32, "Weekly", "Unlimited") + plan(41, "Monthly", "3 months"));
  subscribe();
  assert.deepEqual(visiblePlans(), ["32", "41"], "Unlimited is preferred, otherwise the frequency's only plan");
  frequency(32);
  type("3");
  confirm();
  assert.equal(sellingPlan(), "32");
  assert.equal(times(), "3 times");
  // A hidden preset plan cannot be submitted even if something checks it.
  const widget = document.querySelector("bundlify-subscription");
  document.querySelector('[data-plan][value="31"]').checked = true;
  widget.applyLength = () => {};
  const event = new window.Event("submit", { bubbles: true, cancelable: true });
  document.getElementById("product-form").dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
});

test("popup CSS keeps the selected style, shows the number input and action colours", async () => {
  const css = await readFile(new URL("../extensions/buendly-extation/assets/bundlify-subscription.css", import.meta.url), "utf8");
  assert.match(css, /\.bundlify-length-choice:has\(input:checked\) \{[^}]*border-color: var\(--bl-accent\)/);
  assert.match(css, /--bl-accent: var\(--bundlify-action-background/);
  assert.match(css, /\.bundlify-length-eyebrow\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.bundlify-length-choice input\[type="radio"\] \{ position: absolute; opacity: 0;/, "only radios are visually hidden");
  assert.match(css, /\.bundlify-length-count input\[type="number"\] \{/);
  assert.match(css, /\.bundlify-length-error\[hidden\] \{ display: none; \}/);
  const confirm = css.slice(css.indexOf(".bundlify-length-confirm"));
  assert.match(confirm, /border-radius: 999px/);
  assert.match(confirm, /var\(--bundlify-action-background/);
  assert.match(confirm, /var\(--bundlify-action-text/);
  const snippet = await readFile(new URL("../extensions/buendly-extation/snippets/subscription-options.liquid", import.meta.url), "utf8");
  assert.match(snippet, /plan_option.name == 'Subscription length'/);
  assert.match(snippet, /data-length="\{\{ plan_length \| escape \}\}"/);
  assert.match(snippet, /forloop.first and plan_length == blank %\}checked/);
});

test("the confirmed count is a visible cart line property submitted with selling_plan", async t => {
  const { document, subscribe, frequency, type, confirm } = await fixture(t, lengthPlans);
  subscribe();
  frequency(11);
  type("3");
  confirm();
  const property = document.querySelector("[data-bundlify-times]");
  assert.equal(property.name, "properties[Subscription length]", "no leading underscore, so carts and checkout print it");
  assert.equal(property.disabled, false);
  assert.equal(property.value, "3 times");
  assert.equal(document.querySelector('[name="selling_plan"]').value, "11");
});

test("plans with the length popup explain the charge count before checkout", async () => {
  const snippet = await readFile(new URL("../extensions/buendly-extation/snippets/subscription-options.liquid", import.meta.url), "utf8");
  assert.match(snippet, /\{% assign has_length = true %\}/);
  assert.match(snippet, /\{% if has_length %\}[^{]*number of times you choose[^{]*Subscription length on the cart line and at checkout/);
});
