import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../extensions/buendly-extation/assets/bundlify-bundles.js", import.meta.url), "utf8");

test("fallback cart shows the selling plan name only on subscription lines", async (t) => {
  const dom = new JSDOM('<bundlify-bundles data-root="/"><div data-list></div><p data-message></p></bundlify-bundles>', {
    url: "https://store.test/products/coffee",
    runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { if (!this.open) return; this.open = false; this.dispatchEvent(new w.Event("close")); };
  w.AbortSignal.timeout = () => undefined;
  w.fetch = async (url) => {
    if (String(url).endsWith("/cart.js")) {
      return Response.json({
        currency: "USD",
        total_price: 3000,
        items: [
          {
            product_title: "Coffee",
            title: "Coffee - Small",
            quantity: 1,
            original_line_price: 2000,
            final_line_price: 2000,
            selling_plan_allocation: { selling_plan: { name: "Deliver every month" } },
          },
          {
            product_title: "Mug",
            title: "Mug",
            quantity: 2,
            original_line_price: 1000,
            final_line_price: 1000,
            selling_plan_allocation: null,
          },
        ],
      });
    }
    return Response.json({ bundles: [], giftEnabled: false });
  };
  w.eval(source);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const widget = w.document.querySelector("bundlify-bundles");
  await widget.openCart("/cart", {}, null, []);
  const rows = [...w.document.querySelectorAll(".bundlify-cart-row")];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].querySelector("p").textContent, "Coffee × 1");
  assert.equal(rows[0].querySelector(".bundlify-cart-plan").textContent, "Deliver every month");
  assert.equal(rows[1].querySelector("p").textContent, "Mug × 2");
  assert.equal(rows[1].querySelector(".bundlify-cart-plan"), null);
  assert.doesNotMatch(rows[1].textContent, /Deliver every month/);
});
