/* Integrate with the theme's existing product form and AJAX cart. */
if (!customElements.get("bundlify-subscription")) {
  customElements.define(
    "bundlify-subscription",
    class extends HTMLElement {
      connectedCallback() {
        queueMicrotask(() => this.connect());
      }
      connect() {
        if (!this.isConnected || this.controller) return;
        this.controller = new AbortController();
        const options = { signal: this.controller.signal };
        this.scope = this.closest('[id^="shopify-section-"]') || document;
        this.forms = new Set();
        this.addEventListener("change", () => {
          this.update();
          // Both legacy and current blocks can be added to the same product.
          // Keep their choices in sync before either serializes the cart form.
          for (const peer of document.querySelectorAll("bundlify-subscription")) {
            if (peer === this || !peer.controller) continue;
            const field = [...peer.querySelectorAll("[data-bundlify-plans]")]
              .find(item => item.dataset.bundlifyPlans === this.lastVariant);
            if (!field) continue;
            field.querySelectorAll("[data-mode]").forEach(input => { input.checked = input.value === this.lastMode; });
            field.querySelectorAll("[data-plan]").forEach(input => { input.checked = input.value === this.lastPlan; });
            peer.update();
          }
        }, options);
        document.addEventListener("change", event => {
          if (!event.target.closest("bundlify-subscription")) this.update();
        }, options);
        document.addEventListener(
          "submit",
          (event) => {
            // Discover replacement forms synchronously, before the theme serializes them.
            if (!this.productForms().includes(event.target)) return;
            if (!this.update(event.target)) {
              event.preventDefault();
              event.stopImmediatePropagation();
              return;
            }
            // Let the theme serialize the form and manage its cart drawer.
            const original = window.getCurrentSellingPlanId;
            if (typeof original === "function") {
              const form = event.target;
              const selectedPlan = () =>
                form.querySelector("[data-bundlify-selling-plan]")?.value || "";
              window.getCurrentSellingPlanId = selectedPlan;
              // Browser-dispatched events can run microtasks between listeners.
              // Restore only after all synchronous theme submit handlers finish.
              setTimeout(() => {
                if (window.getCurrentSellingPlanId === selectedPlan)
                  window.getCurrentSellingPlanId = original;
              });
            }
          },
          { ...options, capture: true },
        );
        this.observer = new MutationObserver(records => {
          if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
            node.nodeType === 1 && (node.matches('form, input[name="id"], [data-bundlify-plans]') ||
              node.querySelector('form, input[name="id"], [data-bundlify-plans]'))
          ))) this.update();
        });
        this.observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
        this.update();
      }
      productForms() {
        const ids = new Set(
          [...this.querySelectorAll("[data-bundlify-plans]")].map(
            (field) => field.dataset.bundlifyPlans,
          ),
        );
        const candidates = [
          ...document.querySelectorAll("form[action]"),
        ].filter((form) => {
          const url = new URL(form.action, location.href);
          return (
            url.origin === location.origin &&
            /\/cart\/add(?:\.js)?\/?$/.test(url.pathname) &&
            ids.has(String(form.elements.namedItem("id")?.value))
          );
        });
        const local = candidates.filter((form) => this.scope.contains(form));
        // Standalone app sections may sit beside the product section. Only bind an
        // external form when the match is unambiguous and has no local widget.
        if (local.length) return local;
        if (candidates.length !== 1) return [];
        const section = candidates[0].closest('[id^="shopify-section-"]');
        if (section?.querySelector("bundlify-subscription")) return [];
        return candidates;
      }
      update(submittingForm) {
        const fields = [...this.querySelectorAll("[data-bundlify-plans]")];
        const forms = this.productForms();
        const main = submittingForm || forms[0];
        const variant = String(
          main?.elements.namedItem("id")?.value || this.dataset.variantId,
        );
        const active = fields.find(
          (field) => field.dataset.bundlifyPlans === variant,
        );
        if (
          active &&
          this.lastVariant &&
          variant !== this.lastVariant &&
          this.lastMode
        ) {
          active.querySelectorAll("[data-mode]").forEach((input) => {
            input.checked = input.value === this.lastMode;
          });
          if (this.lastMode === "subscription") {
            active.querySelectorAll("[data-plan]").forEach((input) => {
              input.checked = input.value === this.lastPlan;
            });
          }
        }
        fields.forEach((field) => {
          if (field.hidden !== (field !== active))
            field.hidden = field !== active;
          if (field.disabled !== (field !== active))
            field.disabled = field !== active;
        });
        const mode = active?.querySelector("[data-mode]:checked")?.value;
        const selected = active?.querySelector("[data-plan]:checked")?.value;
        const plan = mode === "subscription" ? selected : "";
        this.lastVariant = variant;
        this.lastMode = mode;
        this.lastPlan = selected;
        const frequencies = active?.querySelector("[data-frequencies]");
        if (frequencies && frequencies.hidden !== (mode !== "subscription"))
          frequencies.hidden = mode !== "subscription";
        const valid =
          !!active &&
          active.dataset.available !== "false" &&
          !!mode &&
          !active.querySelector("[data-mode]:checked")?.disabled &&
          (mode !== "subscription" ||
            (!!plan && !active.querySelector("[data-plan]:checked")?.disabled));
        const error = this.querySelector("[data-bundlify-error]");
        if (error) {
          const message = !forms.length
            ? "Subscription selection is unavailable: product form not found."
            : !valid
              ? "Choose an available purchase option."
              : "";
          if (error.textContent !== message) error.textContent = message;
          if (error.hidden !== !message) error.hidden = !message;
        }
        for (const form of forms) {
          if (!this.forms.has(form)) {
            this.forms.add(form);
            form.addEventListener(
              "formdata",
              (event) => {
                this.update(form);
                const input = form.querySelector(
                  "[data-bundlify-selling-plan]",
                );
                if (input?.value)
                  event.formData.set("selling_plan", input.value);
                else event.formData.delete("selling_plan");
              },
              { signal: this.controller.signal },
            );
          }
          if (String(form.elements.namedItem("id")?.value) !== variant)
            continue;
          let input = form.querySelector('[name="selling_plan"]');
          if (!input) {
            input = document.createElement("input");
            input.type = "hidden";
            input.name = "selling_plan";
            form.append(input);
          }
          if (!input.hasAttribute("data-bundlify-selling-plan"))
            input.dataset.bundlifySellingPlan = "";
          if (input.value !== (plan || "")) input.value = plan || "";
          if (input.disabled !== !plan) input.disabled = !plan;
        }
        return valid && !!main;
      }
      disconnectedCallback() {
        this.controller?.abort();
        this.observer?.disconnect();
        for (const form of this.forms || [])
          form.querySelector("[data-bundlify-selling-plan]")?.remove();
        this.controller = null;
      }





      
    },
  );
}
