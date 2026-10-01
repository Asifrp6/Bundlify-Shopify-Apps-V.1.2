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
        if (!this.querySelector("[data-bundlify-plans]")) return;
        this.controller = new AbortController();
        const options = { signal: this.controller.signal };
        this.scope = this.closest('[id^="shopify-section-"]') || document;
        this.forms = new Set();
        this.addEventListener(
          "change",
          (event) => {
            if (event.target.closest?.("[data-length-dialog]")) return;
            this.update();
            // Both legacy and current blocks can be added to the same product.
            // Keep their choices in sync before either serializes the cart form.
            for (const peer of document.querySelectorAll(
              "bundlify-subscription",
            )) {
              if (peer === this || !peer.controller) continue;
              const field = [
                ...peer.querySelectorAll("[data-bundlify-plans]"),
              ].find((item) => item.dataset.bundlifyPlans === this.lastVariant);
              if (!field) continue;
              field.querySelectorAll("[data-mode]").forEach((input) => {
                input.checked = input.value === this.lastMode;
              });
              field.querySelectorAll("[data-plan]").forEach((input) => {
                input.checked = input.value === this.lastPlan;
              });
              if (this.times) peer.times = this.times;
              peer.update();
            }
          },
          options,
        );
        this.addEventListener(
          "click",
          (event) => {
            // The length popup follows a delivery-frequency choice, never the Subscribe card.
            const trigger = event.target.closest?.(
              "[data-length-change], [data-plan][data-length]",
            );
            if (trigger)
              this.openLengthPicker(trigger.closest("[data-bundlify-plans]"));
          },
          options,
        );
        document.addEventListener(
          "change",
          (event) => {
            if (!event.target.closest("bundlify-subscription")) this.update();
          },
          options,
        );
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
        this.observer = new MutationObserver((records) => {
          if (
            records.some((record) =>
              [...record.addedNodes, ...record.removedNodes].some(
                (node) =>
                  node.nodeType === 1 &&
                  (node.matches(
                    'form, input[name="id"], [data-bundlify-plans]',
                  ) ||
                    node.querySelector(
                      'form, input[name="id"], [data-bundlify-plans]',
                    )),
              ),
            )
          )
            this.update();
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
        if (active) this.applyLength(active);
        const mode = active?.querySelector("[data-mode]:checked")?.value;
        const checkedPlan = active?.querySelector("[data-plan]:checked");
        const selected = checkedPlan?.value;
        const lengthOk =
          !checkedPlan?.dataset.length ||
          (!!this.times && !(checkedPlan.closest(".bundlify-option") || checkedPlan).hidden);
        const plan = mode === "subscription" && lengthOk ? selected : "";
        // The customer's typed count travels with the cart line; the selling plan itself is ongoing.
        const times = plan && checkedPlan.dataset.length ? this.timesText() : "";
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
          (mode !== "subscription" || (!!plan && !checkedPlan.disabled));
        const error = this.querySelector("[data-bundlify-error]");
        if (error) {
          const message = !forms.length
            ? "Subscription selection is unavailable: product form not found."
            : !valid
              ? lengthOk
                ? "Choose an available purchase option."
                : "Choose a subscription length."
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
          let length = form.querySelector("[data-bundlify-times]");
          if (!length) {
            length = document.createElement("input");
            length.type = "hidden";
            length.name = "properties[Subscription length]";
            length.dataset.bundlifyTimes = "";
            form.append(length);
          }
          if (length.value !== times) length.value = times;
          if (length.disabled !== !times) length.disabled = !times;
        }
        return valid && !!main;
      }
      timesText() {
        return this.times === "unlimited"
          ? "Unlimited"
          : `${this.times} time${this.times === "1" ? "" : "s"}`;
      }
      // One plan per frequency: its ongoing "Unlimited" plan (older groups may still hold preset lengths).
      applyLength(field) {
        const plans = [...field.querySelectorAll("[data-plan]")];
        const keep = new Map();
        for (const input of plans) {
          const kept = keep.get(input.dataset.frequency);
          if (input.dataset.length && (!kept || (input.dataset.length === "Unlimited" && kept.dataset.length !== "Unlimited")))
            keep.set(input.dataset.frequency, input);
        }
        if (!keep.size) return;
        const checked = plans.find((input) => input.checked);
        for (const input of plans) {
          const row = input.closest(".bundlify-option") || input;
          const hide = !!input.dataset.length && keep.get(input.dataset.frequency) !== input;
          if (row.hidden !== hide) row.hidden = hide;
        }
        if (checked?.dataset.length) keep.get(checked.dataset.frequency).checked = true;
        const panel = field.querySelector("[data-frequencies]");
        if (!panel) return;
        let summary = panel.querySelector("[data-length-summary]");
        if (!summary) {
          summary = document.createElement("div");
          summary.className = "bundlify-length-summary";
          summary.dataset.lengthSummary = "";
          const label = document.createElement("span");
          label.textContent =
            this.dataset.lengthLabel || "Subscription length";
          const value = document.createElement("strong");
          value.dataset.lengthCurrent = "";
          const change = document.createElement("button");
          change.type = "button";
          change.dataset.lengthChange = "";
          change.textContent = this.dataset.lengthChangeText || "Change";
          summary.append(label, value, change);
          panel.prepend(summary);
        }
        const current = summary.querySelector("[data-length-current]");
        const text = this.times ? this.timesText() : "";
        if (current.textContent !== text) current.textContent = text;
        if (summary.hidden !== !text) summary.hidden = !text;
      }
      lengthDialog() {
        if (this.dialog?.isConnected) return this.dialog;
        const id = `bundlify-length-${Math.random().toString(36).slice(2)}`;
        const dialog = document.createElement("dialog");
        dialog.className = "bundlify-length-dialog";
        dialog.dataset.lengthDialog = "";
        dialog.setAttribute("aria-labelledby", `${id}-title`);
        dialog.innerHTML = `<button type="button" class="bundlify-length-close" data-length-cancel aria-label="Close"><span aria-hidden="true">&times;</span></button>
          <span class="bundlify-length-eyebrow" data-length-frequency></span><h4 id="${id}-title"></h4><p></p>
          <div class="bundlify-length-choices" role="radiogroup" aria-labelledby="${id}-title" data-length-choices>
          <label class="bundlify-length-choice bundlify-length-count"><input type="radio" name="${id}" value="count"><input type="number" min="1" max="99" step="1" inputmode="numeric" aria-label="Number of times" data-length-times><span>times</span></label>
          <label class="bundlify-length-choice"><input type="radio" name="${id}" value="unlimited"><span>Unlimited</span></label></div>
          <p class="bundlify-length-error" role="alert" data-length-error hidden></p>
          <button type="button" class="bundlify-length-confirm" data-length-confirm></button>`;
        dialog.querySelector("h4").textContent =
          this.dataset.lengthHeading || "Choose your subscription length";
        dialog.querySelector("p").textContent =
          this.dataset.lengthText ||
          "How long would you like your subscription to run?";
        dialog.querySelector("[data-length-confirm]").textContent =
          this.dataset.lengthConfirm || "Confirm";
        // Any interaction with the number field selects the number row; choosing Unlimited clears the number
        // so a visible count is never paired with a selected Unlimited.
        const sync = (event) => {
          if (event.target.matches("[data-length-times]"))
            dialog.querySelector('[value="count"]').checked = true;
          else if (event.type === "change" && event.target.matches('[value="unlimited"]:checked')) {
            const count = dialog.querySelector("[data-length-times]");
            count.value = "";
            count.removeAttribute("aria-invalid");
            dialog.querySelector("[data-length-error]").hidden = true;
          }
        };
        for (const type of ["input", "change", "focusin", "keydown"])
          dialog.addEventListener(type, sync);
        dialog.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && event.target.matches("[data-length-times]")) {
            event.preventDefault();
            this.closeLengthPicker(true);
          }
        });
        dialog.addEventListener("click", (event) => {
          if (event.target.matches("[data-length-times]"))
            dialog.querySelector('[value="count"]').checked = true;
          else if (event.target.closest("[data-length-confirm]"))
            this.closeLengthPicker(true);
          else if (event.target.closest("[data-length-cancel]"))
            this.closeLengthPicker(false);
          else if (event.target === dialog) {
            // Clicks on the dialog's own padding also target it; only the backdrop cancels.
            const box = dialog.getBoundingClientRect();
            const outside =
              event.clientX < box.left ||
              event.clientX > box.right ||
              event.clientY < box.top ||
              event.clientY > box.bottom;
            if (outside) this.closeLengthPicker(false);
          }
        });
        dialog.addEventListener("cancel", (event) => {
          event.preventDefault();
          this.closeLengthPicker(false);
        });
        this.append(dialog);
        this.dialog = dialog;
        return dialog;
      }
      openLengthPicker(field) {
        if (!field?.querySelector("[data-plan][data-length]")) return;
        this.applyLength(field);
        const frequency = field.querySelector("[data-plan][data-length]:checked")?.dataset.frequency;
        const dialog = this.lengthDialog();
        const eyebrow = dialog.querySelector("[data-length-frequency]");
        eyebrow.textContent = frequency ? `${frequency} delivery` : "";
        eyebrow.hidden = !frequency;
        const count = dialog.querySelector("[data-length-times]");
        // Only a previously confirmed Unlimited reopens with Unlimited selected.
        const unlimited = this.times === "unlimited";
        count.value = !this.times || unlimited ? "" : this.times;
        count.removeAttribute("aria-invalid");
        dialog.querySelector("[data-length-error]").hidden = true;
        const radio = dialog.querySelector(`[value="${unlimited ? "unlimited" : "count"}"]`);
        dialog.querySelectorAll("[data-length-choices] input[type=radio]").forEach((input) => {
          input.checked = input === radio;
        });
        this.lengthField = field;
        this.lengthReturnFocus = document.activeElement;
        this.keepScroll(() => {
          if (!dialog.open) {
            if (typeof dialog.showModal === "function") dialog.showModal();
            else dialog.setAttribute("open", "");
          }
          (unlimited ? radio : count).focus({ preventScroll: true });
        });
      }
      // showModal() and close() move focus without preventScroll; hold the page where the customer is.
      keepScroll(run) {
        const x = window.scrollX;
        const y = window.scrollY;
        run();
        if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
      }
      closeLengthPicker(confirmed) {
        const dialog = this.dialog;
        const field = this.lengthField;
        if (!dialog || !field) return;
        let times = "";
        if (confirmed) {
          const count = dialog.querySelector("[data-length-times]");
          const raw = count.value.trim();
          const typed = /^\d+$/.test(raw) && +raw >= 1 && +raw <= 99 ? String(+raw) : "";
          // A valid typed count always wins; Unlimited applies only with an empty number field.
          times = typed || (!raw && dialog.querySelector('[value="unlimited"]').checked ? "unlimited" : "");
          if (!times) {
            const error = dialog.querySelector("[data-length-error]");
            error.textContent =
              this.dataset.lengthError ||
              "Enter a whole number from 1 to 99, or choose Unlimited.";
            error.hidden = false;
            count.setAttribute("aria-invalid", "true");
            dialog.querySelector('[value="count"]').checked = true;
            count.focus({ preventScroll: true });
            return;
          }
        }
        this.keepScroll(() => {
          if (typeof dialog.close === "function" && dialog.open) dialog.close();
          else dialog.removeAttribute("open");
          this.lengthReturnFocus?.focus?.({ preventScroll: true });
        });
        this.lengthField = null;
        if (times) {
          this.times = times;
          this.applyLength(field);
          field
            .querySelector("[data-plan]:checked")
            ?.dispatchEvent(new Event("change", { bubbles: true }));
        }
        // Cancelling keeps the clicked frequency; update() withholds selling_plan until a length is confirmed.
      }
      disconnectedCallback() {
        if (this.dialog?.open) this.dialog.close?.();
        this.controller?.abort();
        this.observer?.disconnect();
        for (const form of this.forms || [])
          form.querySelectorAll("[data-bundlify-selling-plan], [data-bundlify-times]").forEach((input) => input.remove());
        this.controller = null;
      }
    },
  );
}
