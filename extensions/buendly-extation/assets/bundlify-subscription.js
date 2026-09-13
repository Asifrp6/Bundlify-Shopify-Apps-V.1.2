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
        this.addEventListener("change", () => this.update(), options);
        document.addEventListener("change", () => this.update(), options);
        document.addEventListener("click", () => this.update(), {
          ...options,
          capture: true,
        });
        document.addEventListener(
          "submit",
          (event) => {
            // Discover replacement forms synchronously, before the theme serializes them.
            if (!this.productForms().includes(event.target)) return;
            if (this.pending) {
              event.preventDefault();
              event.stopImmediatePropagation();
              return;
            }
            if (!this.update(event.target)) {
              event.preventDefault();
              event.stopImmediatePropagation();
              return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            void this.addToCart(event.target, event.submitter);
          },
          { ...options, capture: true },
        );
        this.observer = new MutationObserver(() => this.update());
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
          const message = this.cartError || (!forms.length
            ? "Subscription selection is unavailable: product form not found."
            : !valid
              ? "Choose an available purchase option."
              : "");
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
      async addToCart(form = this.productForms()[0], submitter) {
        if (this.pending) return;
        this.cartError = "";
        if (!this.update(form) || !form.reportValidity()) return;
        const data = new FormData(form);
        // Normalize after theme formdata listeners have run.
        const plan = form.querySelector("[data-bundlify-selling-plan]")?.value;
        if (plan) data.set("selling_plan", plan);
        else data.delete("selling_plan");
        const root = new URL(form.action).pathname.replace(/cart\/add(?:\.js)?\/?$/, "");
        const button = submitter || form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]');
        const wasDisabled = button?.disabled;
        this.pending = true;
        if (button) button.disabled = true;
        this.setAttribute("aria-busy", "true");
        try {
          const response = await fetch(`${root}cart/add.js`, {
            method: "POST",
            headers: { Accept: "application/json" },
            body: data,
          });
          const result = await response.json();
          if (!response.ok || result.status >= 400) {
            throw new Error(result.description || result.message || "Unable to add this purchase option to your cart.");
          }
          this.navigateToCart(`${root}cart`);
        } catch (error) {
          this.cartError = error.message || "Unable to reach the cart. Please try again.";
          this.pending = false;
          if (button) button.disabled = wasDisabled;
          this.removeAttribute("aria-busy");
          this.update();
        }
      }
      navigateToCart(url) {
        window.location.assign(url);
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
