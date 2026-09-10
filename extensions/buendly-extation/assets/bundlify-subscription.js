/* Integrate with the theme's existing product form and AJAX cart. */
if (!customElements.get('bundlify-subscription')) {
  customElements.define('bundlify-subscription', class extends HTMLElement {
    connectedCallback() { queueMicrotask(() => this.connect()); }
    connect() {
      if (!this.isConnected || this.controller) return;
      this.controller = new AbortController();
      const options = { signal: this.controller.signal };
      this.scope = this.closest('[id^="shopify-section-"]') || document;
      this.forms = new Set();
      this.addEventListener('change', () => this.update(), options);
      this.scope.addEventListener('change', () => this.update(), options);
      this.scope.addEventListener('click', () => this.update(), { ...options, capture: true });
      this.scope.addEventListener('submit', event => {
        if (!this.forms.has(event.target)) return;
        if (!this.update(event.target)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, { ...options, capture: true });
      this.observer = new MutationObserver(() => this.update());
      this.observer.observe(this.scope, { childList: true, subtree: true });
      this.update();
    }
    update(submittingForm) {
      const fields = [...this.querySelectorAll('[data-bundlify-plans]')];
      const ids = new Set(fields.map(field => field.dataset.bundlifyPlans));
      const forms = [...this.scope.querySelectorAll('form[action]')].filter(form => {
        const path = new URL(form.action, location.href).pathname;
        return /\/cart\/add(?:\.js)?\/?$/.test(path) && ids.has(String(form.elements.namedItem('id')?.value));
      });
      const main = submittingForm || forms[0];
      const variant = String(main?.elements.namedItem('id')?.value || this.dataset.variantId);
      const active = fields.find(field => field.dataset.bundlifyPlans === variant);
      if (active && this.lastVariant && variant !== this.lastVariant && this.lastMode === 'subscription') {
        active.querySelectorAll('[data-mode]').forEach(input => { input.checked = input.value === 'subscription'; });
        active.querySelectorAll('[data-plan]').forEach(input => { input.checked = input.value === this.lastPlan; });
      }
      fields.forEach(field => {
        if (field.hidden !== (field !== active)) field.hidden = field !== active;
        if (field.disabled !== (field !== active)) field.disabled = field !== active;
      });
      const mode = active?.querySelector('[data-mode]:checked')?.value;
      const selected = active?.querySelector('[data-plan]:checked')?.value;
      const plan = mode === 'subscription' ? selected : '';
      this.lastVariant = variant;
      this.lastMode = mode;
      this.lastPlan = selected;
      const frequencies = active?.querySelector('[data-frequencies]');
      if (frequencies && frequencies.hidden !== (mode !== 'subscription')) frequencies.hidden = mode !== 'subscription';
      const valid = !!active && !!mode && !active.querySelector('[data-mode]:checked')?.disabled && (mode !== 'subscription' || !!plan);
      const error = this.querySelector('[data-bundlify-error]');
      if (error) {
        const message = !forms.length ? 'Subscription selection is unavailable: product form not found.' : !valid ? 'Choose an available purchase option.' : '';
        if (error.textContent !== message) error.textContent = message;
        if (error.hidden !== !message) error.hidden = !message;
      }
      for (const form of forms) {
        if (!this.forms.has(form)) {
          this.forms.add(form);
          form.addEventListener('formdata', event => {
            this.update(form);
            const input = form.querySelector('[data-bundlify-selling-plan]');
            if (input?.value) event.formData.set('selling_plan', input.value);
            else event.formData.delete('selling_plan');
          }, { signal: this.controller.signal });
        }
        if (String(form.elements.namedItem('id')?.value) !== variant) continue;
        let input = form.querySelector('[name="selling_plan"]');
        if (!input) {
          input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'selling_plan';
          form.append(input);
        }
        if (!input.hasAttribute('data-bundlify-selling-plan')) input.dataset.bundlifySellingPlan = '';
        if (input.value !== (plan || '')) input.value = plan || '';
        if (input.disabled !== !plan) input.disabled = !plan;
      }
      return valid && !!main;
    }
    disconnectedCallback() {
      this.controller?.abort();
      this.observer?.disconnect();
      for (const form of this.forms || []) form.querySelector('[data-bundlify-selling-plan]')?.remove();
      this.controller = null;
    }
  });
}
