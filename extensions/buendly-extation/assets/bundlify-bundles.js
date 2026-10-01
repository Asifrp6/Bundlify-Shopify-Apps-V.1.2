(() => {
  if (customElements.get("bundlify-bundles")) return;
  customElements.define(
    "bundlify-bundles",
    class extends HTMLElement {
      connectedCallback() {
        queueMicrotask(() => {
          if (this.isConnected) this.load();
        });
      }
      disconnectedCallback() {
        this.querySelector('[data-custom-dialog]')?.close();
        this.closeDialog(this.querySelector('[data-gift-preview]'));
        this.closeDialog(this.querySelector('[data-gift-dialog]'));
        this.bundleView?.abort();
        this.controller?.abort();
      }
      async load() {
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        const hasCustom = !!this.querySelector('[data-custom-bundle]');
        this.prepareCustom(controller.signal);
        this.hidden = false;
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const root = (this.dataset.root || "/").replace(/\/$/, "");
          const url = new URL(`${root}/apps/bundlify/bundles`, location.origin);
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error("Request failed");
          const { bundles, giftOptions, giftEnabled } = await response.json();
          if (!Array.isArray(bundles)) throw new Error("Invalid response");
          if (!this.isConnected || this.controller !== controller) return;
          // Older app responses have no flag; only an explicit false turns the gift steps off.
          const gift = giftEnabled === false ? null : this.giftChoices(giftOptions);
          const list = this.querySelector("[data-list]");
          list.replaceChildren();
          list.parentElement?.querySelector("[data-bundle-options]")?.remove();
          this.closeDialog(this.querySelector('[data-gift-preview]'));
          this.querySelector('[data-gift-preview]')?.remove();
          this.querySelector('[data-gift-dialog]')?.remove();
          const dialog = this.giftDialog(controller.signal);
          // Share requests between bundles in this load, without caching stale prices.
          const productRequests = new Map();
          const renderBundle = (bundle, choice) => {
            this.bundleView?.abort();
            const view = new AbortController();
            this.bundleView = view;
            controller.signal.addEventListener("abort", () => view.abort(), { once: true });
            const card = document.createElement("article");
            card.className = "bundlify-bundle-detail";
            const title = document.createElement("h3");
            title.id = `bundlify-gift-title-${crypto.randomUUID?.() || Date.now()}`;
            title.tabIndex = -1;
            title.textContent = bundle.name;
            card.append(title);
            dialog.querySelector('.bundlify-bundle-detail')?.remove();
            dialog.append(card);
            dialog.setAttribute('aria-labelledby', title.id);
            dialog.returnFocus = choice;
            this.preparePurchase(card, { ...bundle, gift, popup: true }, root, view.signal, productRequests);
            this.openDialog(dialog, title);
          };
          if (bundles.length) {
            const options = document.createElement("div");
            options.className = "bundlify-bundle-options";
            options.dataset.bundleOptions = "";
            options.setAttribute("role", "group");
            options.setAttribute("aria-label", "Choose a bundle");
            for (const bundle of bundles) {
              const choice = document.createElement("button");
              choice.type = "button";
              choice.className = "bundlify-bundle-option";
              const count = Array.isArray(bundle.products) ? bundle.products.length : 0;
              const save = Number.isInteger(bundle.discount) && bundle.discount > 0 ? `Save ${bundle.discount}%` : "";
              const mark = document.createElement("span");
              mark.className = "bundlify-bundle-option-mark";
              mark.setAttribute("aria-hidden", "true");
              mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 20 7.5 12 12 4 7.5 12 3Z"/><path d="M20 7.5V16.5L12 21 4 16.5V7.5"/><path d="M12 12v9"/></svg>';
              const copy = document.createElement("span");
              copy.className = "bundlify-bundle-option-copy";
              const name = document.createElement("strong");
              name.textContent = bundle.name || "Bundle";
              const meta = document.createElement("small");
              meta.textContent = [count ? `${count} product${count === 1 ? "" : "s"}` : "Bundle offer", save].filter(Boolean).join(" · ");
              copy.append(name, meta);
              const radio = document.createElement("span");
              radio.className = "bundlify-bundle-option-radio";
              radio.setAttribute("aria-hidden", "true");
              choice.append(mark, copy, radio);
              choice.setAttribute("aria-pressed", "false");
              choice.addEventListener("click", () => {
                if (choice.getAttribute("aria-pressed") === "true" && dialog.querySelector('.bundlify-bundle-detail')) {
                  dialog.returnFocus = choice;
                  this.openDialog(dialog, dialog.querySelector('.bundlify-bundle-detail > h3'));
                  return;
                }
                for (const node of options.querySelectorAll("button")) node.setAttribute("aria-pressed", "false");
                choice.setAttribute("aria-pressed", "true");
                renderBundle(bundle, choice);
              }, { signal: controller.signal });
              options.append(choice);
            }
            list.before(options);
          }
          this.hidden = false;
          this.querySelector("[data-message]").textContent = bundles.length
            ? ""
            : this.dataset.editor === "true"
              ? "No active bundles found. In Bundle Base, activate a bundle with at least two products published to the Online Store."
              : hasCustom
                ? "No ready-made bundles are available right now. Create your own custom bundle."
                : "No bundle offers are available right now.";
        } catch {
          if (!this.isConnected || this.controller !== controller) return;
          this.hidden = false;
          this.querySelector("[data-message]").textContent =
            hasCustom ? "Ready-made bundles could not be loaded. You can still create a custom bundle."
              : this.dataset.editor === "true"
                ? "Unable to load bundles. Check that the app server is running and the app proxy is deployed."
                : "Bundle offers could not be loaded. Please refresh the page to try again.";
        } finally {
          clearTimeout(timeout);
        }
      }
      prepareCustom(signal) {
        const toggle = this.querySelector('[data-custom-toggle]');
        const card = this.querySelector('[data-custom-picker]');
        if (!toggle || !card) return;
        const preset = this.querySelector('[data-preset-toggle]');
        const panel = this.querySelector('[data-preset-panel]');
        const dialog = this.querySelector('[data-custom-dialog]');
        let result = this.querySelector('[data-custom-result]');
        if (result) result.remove();
        result = document.createElement('article');
        result.dataset.customResult = '';
        result.hidden = true;
        this.querySelector('[data-custom-bundle]').append(result);
        let hasResult = false;
        let resultController;
        signal.addEventListener('abort', () => resultController?.abort(), { once: true });
        if (dialog?.open) dialog.close();
        const resetMode = () => {
          card.hidden = true;
          result.hidden = !hasResult;
          if (panel) panel.hidden = hasResult;
          preset?.setAttribute('aria-pressed', String(!hasResult));
          toggle.setAttribute('aria-pressed', String(hasResult));
          toggle.setAttribute('aria-expanded', 'false');
        };
        dialog?.addEventListener('close', () => {
          resetMode();
          if (this.isConnected) toggle.focus();
        }, { signal });
        this.querySelector('[data-custom-close]')?.addEventListener('click', () => dialog.close(), { signal });
        dialog?.addEventListener('click', event => {
          if (event.target !== dialog) return;
          const bounds = dialog.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
        }, { signal });
        // Rebuild on reconnect so aborted listeners and stale prices are discarded.
        while (card.children.length > 2) card.lastElementChild.remove();
        card.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-pressed', 'false');
        if (panel) panel.hidden = false;
        preset?.setAttribute('aria-pressed', 'true');
        preset?.addEventListener('click', () => {
          if (dialog?.open) dialog.close();
          card.hidden = true;
          result.hidden = true;
          if (panel) panel.hidden = false;
          preset.setAttribute('aria-pressed', 'true');
          toggle.setAttribute('aria-pressed', 'false');
          toggle.setAttribute('aria-expanded', 'false');
        }, { signal });
        let prepared = false;
        toggle.addEventListener('click', () => {
          card.hidden = preset ? false : !card.hidden;
          toggle.setAttribute('aria-expanded', String(!card.hidden));
          toggle.setAttribute('aria-pressed', String(!card.hidden));
          if (panel) panel.hidden = dialog ? false : !card.hidden;
          preset?.setAttribute('aria-pressed', String(card.hidden));
          if (dialog && !dialog.open) dialog.showModal();
          if (prepared) return;
          prepared = true;
          const products = Array.from(this.querySelectorAll('[data-custom-products] [data-handle]'), node => ({ handle: node.dataset.handle, title: node.dataset.title }));
          const discount = Number(this.querySelector('[data-custom-bundle]')?.dataset.customDiscount || 0);
          const config = this.querySelector('[data-custom-bundle]')?.dataset || {};
          const fixed = config.discountType === 'fixed';
          const rate = this.dataset.currency === config.shopCurrency ? 1 : Number(window.Shopify?.currency?.rate);
          const fixedAmount = fixed && Number.isFinite(rate) && rate > 0 ? Math.round(Number(config.fixedAmount || 0) * rate * 100) : 0;
          const fixedEstimate = fixed && this.dataset.currency !== config.shopCurrency;
          const onDone = dialog ? (selectedProducts) => {
            resultController?.abort();
            resultController = new AbortController();
            result.replaceChildren();
            const heading = document.createElement('h3');
            heading.textContent = 'Your custom bundle';
            heading.tabIndex = -1;
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'bundlify-edit-action';
            edit.textContent = 'Edit products';
            edit.addEventListener('click', () => toggle.click(), { signal: resultController.signal });
            result.append(heading, edit);
            hasResult = true;
            result.hidden = false;
            this.preparePurchase(result, { custom: true, review: true, discount, fixed, fixedAmount, fixedEstimate, products: selectedProducts },
              (this.dataset.root || '/').replace(/\/$/, ''), resultController.signal);
            dialog.addEventListener('close', () => { heading.focus(); result.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, { once: true });
            dialog.close();
          } : null;
          this.preparePurchase(card, { custom: true, discount, fixed, fixedAmount, fixedEstimate, products, onDone },
            (this.dataset.root || '/').replace(/\/$/, ''), signal);
        }, { signal });
      }
      async preparePurchase(
        card,
        bundle,
        root,
        signal,
        productRequests = new Map(),
      ) {
        const buttonLabel = bundle.onDone ? 'Done' : bundle.custom ? "Add custom bundle to cart" : bundle.popup ? "Add to cart" : this.dataset.buttonText || "Add bundle to cart";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "bundlify-purchase-action";
        button.textContent = "Loading purchase options…";
        button.disabled = true;
        const message = document.createElement("p");
        message.setAttribute("role", "status");
        const cart = document.createElement("a");
        cart.href = `${root}/cart`;
        cart.textContent = "View cart";
        cart.hidden = true;
        card.append(button, message, cart);
        const selects = [];
        const entries = [];
        const total = document.createElement("div");
        total.className = "bundlify-total";
        total.setAttribute("aria-live", "polite");
        card.insertBefore(total, button);
        const productGrid = document.createElement('div');
        productGrid.className = 'bundlify-product-grid';
        card.insertBefore(productGrid, total);
        try {
          const currency =
            this.dataset.currency || window.Shopify?.currency?.active;
          if (!currency)
            throw new Error(
              "Unable to determine your currency. Refresh this page.",
            );
          const formatter = new Intl.NumberFormat(
            document.documentElement.lang || "en",
            { style: "currency", currency, currencyDisplay: "code" },
          );
          const money = (cents) => formatter.format(cents / 100);
          if (!bundle.custom && bundle.discountType === 'fixed') {
            const rate = currency === bundle.shopCurrency ? 1 : Number(window.Shopify?.currency?.rate);
            bundle.fixed = true;
            bundle.fixedAmount = Number.isFinite(rate) && rate > 0 ? Math.round(Number(bundle.fixedDiscount || 0) * rate * 100) : 0;
            bundle.fixedEstimate = currency !== bundle.shopCurrency;
          }
          const steps = bundle.gift && !bundle.custom
            ? this.giftSteps(card, { bundle, button, message, productGrid, total, money, currency, signal })
            : null;
          const discount =
            Number.isInteger(bundle.discount) &&
            bundle.discount >= 0 &&
            bundle.discount <= 100
              ? bundle.discount
              : 0;
          const updatePrices = () => {
            let subtotal = 0;
            let savings = 0;
            let originalTotal = 0;
            for (const entry of entries) {
              const variant = entry.variants.find(
                (v) => String(v.id) === entry.select.value,
              );
              const price = Number(variant.price);
              const original = Math.max(
                price,
                Number(variant.compare_at_price) || 0,
              );
              if (!entry.checkbox || entry.checkbox.checked) {
                subtotal += price;
                savings += Math.floor((price * discount) / 100);
                originalTotal += original;
              }
              const finalPrice = price - Math.floor(price * discount / 100);
              const displayedPrice = bundle.custom ? finalPrice : price;
              const originalPrice = bundle.custom && discount > 0 ? price : original;
              entry.price.textContent = money(displayedPrice);
              entry.was.textContent = money(originalPrice);
              entry.was.hidden = originalPrice <= displayedPrice;
              const salePercentage = bundle.custom && discount > 0 ? discount : original > price ? Math.round((original - price) * 1000 / original) / 10 : 0;
              entry.sale.textContent = salePercentage > 0 ? `Save ${salePercentage}%` : '';
              entry.sale.hidden = salePercentage <= 0;
              const source =
                variant.featured_image?.src ||
                entry.details.featured_image ||
                entry.details.images?.[0];
              entry.image.hidden = !source;
              entry.placeholder.hidden = !!source;
              if (source) entry.image.src = source;
            }
            if (bundle.fixed) {
              const count = entries.filter(entry => !entry.checkbox || entry.checkbox.checked).length;
              savings = count >= 2 ? Math.min(subtotal, Math.max(0, bundle.fixedAmount || 0)) : 0;
            }
            total.replaceChildren();
            const label = document.createElement("span");
            label.className = "bundlify-total-label";
            label.textContent = "Bundle total";
            const value = document.createElement("strong");
            value.textContent = money(subtotal - savings);
            total.append(label);
            const displayedOriginal = bundle.custom && !discount && !bundle.fixed ? originalTotal : subtotal;
            const displayedSavings = displayedOriginal - (subtotal - savings);
            const displayedPercentage = bundle.custom && !discount && !bundle.fixed
              ? (displayedOriginal > 0 ? Math.round(displayedSavings * 1000 / displayedOriginal) / 10 : 0)
              : discount;
            if (displayedSavings > 0 || (bundle.custom && displayedOriginal > 0)) {
              const was = document.createElement("s");
              was.textContent = money(displayedOriginal);
              was.setAttribute(
                "aria-label",
                `Original total ${money(displayedOriginal)}`,
              );
              const saving = document.createElement("small");
              saving.className = "bundlify-total-save";
              saving.textContent = bundle.fixed ? `${bundle.fixedEstimate ? 'Estimated savings' : 'You save'} ${money(displayedSavings)} off this bundle`
                : bundle.custom ? `You save ${money(displayedSavings)} (${displayedPercentage}%)`
                : `Save ${displayedPercentage}% · ${money(displayedSavings)}`;
              total.append(was, value);
              if (displayedSavings > 0) total.append(saving);
              if (bundle.fixedEstimate) { const note = document.createElement('small'); note.className = 'bundlify-total-note'; note.textContent = 'Final discount and currency conversion are calculated at checkout.'; total.append(note); }
            } else total.append(value);
            if (bundle.custom) {
              const count = entries.filter(entry => entry.checkbox.checked).length;
              button.disabled = count < 2;
              message.textContent = count < 2 ? `Select ${2 - count} more product${count === 1 ? "" : "s"}.` : `${count} products in this bundle`;
            }
            steps?.update(subtotal - savings);
          };
          const products = await Promise.all(
            bundle.products.map((product) => {
              const url = `${root}/products/${encodeURIComponent(product.handle)}.js`;
              if (!productRequests.has(url)) {
                productRequests.set(
                  url,
                  fetch(url, {
                    signal: AbortSignal.any([
                      this.controller?.signal || signal,
                      AbortSignal.timeout(10000),
                    ]),
                  }).then((response) => {
                    if (!response.ok)
                      throw new Error(
                        "Could not load product options. Refresh and try again.",
                      );
                    return response.json();
                  }),
                );
              }
              return bundle.custom ? productRequests.get(url).catch(() => null) : productRequests.get(url);
            }),
          );
          if (signal.aborted || !card.isConnected || !this.isConnected) return;
          for (const [index, product] of bundle.products.entries()) {
            const details = products[index];
            if (bundle.custom && !details) continue;
            const variants =
              details.variants?.filter(
                (v) =>
                  v.available &&
                  !details.requires_selling_plan &&
                  !v.requires_selling_plan,
              ) || [];
            if (bundle.custom && !variants.length) continue;
            if (!variants.length)
              throw new Error(
                `${product.title} is unavailable for a one-time bundle purchase.`,
              );
            if (variants.some((v) => !Number.isFinite(v.price) || v.price < 0))
              throw new Error(
                "Product prices could not be loaded. Refresh and try again.",
              );
            const row = document.createElement("div");
            row.className = "bundlify-product";
            const image = document.createElement("img");
            image.alt = details.title || product.title;
            image.width = 96;
            image.height = 112;
            image.hidden = true;
            image.loading = "lazy";
            const placeholder = document.createElement("span");
            placeholder.className = "bundlify-image-placeholder";
            placeholder.textContent = "No image";
            image.addEventListener(
              "error",
              () => {
                image.hidden = true;
                placeholder.hidden = false;
              },
              { signal },
            );
            const info = document.createElement("div");
            const link = document.createElement("a");
            link.href = `${root}/products/${encodeURIComponent(product.handle)}`;
            link.textContent = details.title || product.title;
            const prices = document.createElement("div");
            prices.className = "bundlify-product-price";
            const was = document.createElement("s");
            was.setAttribute("aria-label", "Original price");
            const price = document.createElement("strong");
            const sale = document.createElement('small');
            sale.className = 'bundlify-sale-badge';
            prices.append(was, price, sale);
            const label = document.createElement("label");
            const labelText = document.createElement("span");
            labelText.className = "bundlify-variant-label";
            labelText.textContent = "Choose option";
            label.append(labelText);
            const select = document.createElement("select");
            for (const variant of variants) {
              const option = document.createElement("option");
              option.value = String(variant.id);
              option.textContent =
                variant.public_title || variant.title || "Default";
              select.append(option);
            }
            label.append(select);
            if (product.variantId && variants.some(variant => String(variant.id) === product.variantId)) select.value = product.variantId;
            label.hidden =
              variants.length === 1 && variants[0].title === "Default Title";
            info.append(link, prices, label);
            let checkbox;
            if (bundle.custom) {
              const choice = document.createElement('label');
              choice.className = 'bundlify-custom-choice';
              checkbox = document.createElement('input');
              checkbox.type = 'checkbox';
              checkbox.checked = !!bundle.review;
              choice.hidden = !!bundle.review;
              checkbox.setAttribute('aria-label', `Include ${details.title || product.title}`);
              const choiceText = document.createElement('span');
              choiceText.textContent = 'Add to bundle';
              choice.append(checkbox, choiceText);
              checkbox.addEventListener('change', () => {
                choiceText.textContent = checkbox.checked ? 'Selected' : 'Add to bundle';
              }, { signal });
              info.prepend(choice);
              checkbox.addEventListener('change', updatePrices, { signal });
            }
            row.append(image, placeholder, info);
            productGrid.append(row);
            selects.push(select);
            entries.push({
              select,
              variants,
              details,
              price,
              was,
              image,
              placeholder,
              checkbox,
              sale,
              product,
            });
            select.addEventListener("change", updatePrices, { signal });
          }
          if (selects.length < 2)
            throw new Error(
              "This bundle needs at least two available products.",
            );
          button.disabled = false;
          updatePrices();
          button.textContent = buttonLabel;
          steps?.ready();
          button.addEventListener(
            "click",
            async () => {
              if (button.disabled) return;
              const selectedEntries = entries.filter(entry => !entry.checkbox || entry.checkbox.checked);
              if (selectedEntries.length < 2) return;
              if (bundle.onDone) {
                bundle.onDone(selectedEntries.map(entry => ({ ...entry.product, variantId: entry.select.value })));
                return;
              }
              button.disabled = true;
              entries.forEach(entry => { if (entry.checkbox) entry.checkbox.disabled = true; });
              selects.forEach((select) => {
                select.disabled = true;
              });
              button.textContent = "Adding…";
              message.textContent = "";
              cart.hidden = true;
              steps?.lock(true);
              try {
                const drawer = document.querySelector("cart-drawer");
                const sections =
                  drawer
                    ?.getSectionsToRender?.()
                    .map((section) => section.id)
                    .slice(0, 5) || [];
                drawer?.setActiveElement?.(button);
                const group = crypto.randomUUID();
                const response = await fetch(`${root}/cart/add.js`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                  },
                  body: JSON.stringify({
                    items: [...selectedEntries.map(({ select }) => ({
                      id: select.value,
                      quantity: 1,
                      properties: {
                        ...(bundle.custom ? { _bundlify_custom: 'true' } : { _bundlify_bundle: String(bundle.id) }),
                        _bundlify_group: group,
                      },
                    })), ...(steps?.items(group) || [])],
                    ...(sections.length
                      ? { sections, sections_url: location.pathname }
                      : {}),
                  }),
                  signal: AbortSignal.timeout(15000),
                });
                const result = await response.json();
                if (!response.ok)
                  throw new Error(
                    result.description ||
                      result.message ||
                      "Could not add the bundle. Check your cart before trying again.",
                  );
                message.textContent = steps?.addedMessage() || "Bundle added to your cart.";
                button.textContent = "Added to cart";
                cart.hidden = false;
                // Drawer rendering is separate from adding: never retry a successful cart write.
                if (bundle.popup) {
                  const dialog = card.closest('[data-gift-dialog]');
                  if (dialog?.open || dialog?.hasAttribute('open')) {
                    await new Promise(resolve => {
                      dialog.addEventListener('close', resolve, { once: true });
                      this.closeDialog(dialog);
                    });
                  }
                }
                if (bundle.custom) {
                  const dialog = this.querySelector('[data-custom-dialog]');
                  if (dialog?.open) {
                    // Finish close/focus restoration before the cart drawer takes focus.
                    await new Promise(resolve => {
                      dialog.addEventListener('close', resolve, { once: true });
                      dialog.close();
                    });
                  }
                }
                try {
                  await this.openCart(cart.href, result, drawer, sections);
                } catch {
                  message.textContent =
                    "Bundle added. Open your cart to see the updated totals.";
                }
                button.textContent = buttonLabel;
                button.disabled = false;
                selects.forEach((select) => {
                  select.disabled = false;
                });
                entries.forEach(entry => { if (entry.checkbox) entry.checkbox.disabled = false; });
                steps?.lock(false);
              } catch (error) {
                message.textContent =
                  error.name === "TimeoutError" || error instanceof TypeError
                    ? "Could not confirm the cart update. Check your cart before trying again."
                    : error.message;
                cart.hidden = false;
                button.textContent = buttonLabel;
                button.disabled = false;
                selects.forEach((select) => {
                  select.disabled = false;
                });
                entries.forEach(entry => { if (entry.checkbox) entry.checkbox.disabled = false; });
                steps?.lock(false);
              }
            },
            { signal },
          );
        } catch (error) {
          if (signal.aborted) return;
          button.textContent = "Bundle unavailable";
          message.textContent = error.message;
        }
      }
      giftCardImage(value) {
        try {
          const url = new URL(String(value || ""), "https://invalid.local");
          const host = url.hostname.toLowerCase();
          const shopify = host === "cdn.shopify.com" || host.endsWith(".shopify.com") || host.endsWith(".shopifycdn.com") || host.endsWith(".myshopify.com");
          return url.protocol === "https:" && !url.username && !url.password && shopify ? url.href : "";
        } catch {
          return "";
        }
      }
      giftChoices(raw) {
        const pick = list => (Array.isArray(list) ? list : [])
          .filter(option => option?.name && /^\d+$/.test(String(option.variantId)) && Number.isFinite(Number(option.price)) && Number(option.price) >= 0)
          .map(option => ({ id: String(option.id), name: String(option.name), price: String(option.price), variantId: String(option.variantId), imageUrl: this.giftCardImage(option.imageUrl) }));
        return { packages: pick(raw?.packages), wraps: pick(raw?.wraps) };
      }
      giftDialog(signal) {
        const dialog = document.createElement('dialog');
        dialog.className = 'bundlify-gift-dialog';
        dialog.dataset.giftDialog = '';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'bundlify-builder-close';
        close.setAttribute('aria-label', 'Close');
        close.innerHTML = '<span aria-hidden="true">×</span>';
        close.addEventListener('click', () => this.closeDialog(dialog), { signal });
        dialog.addEventListener('click', event => {
          if (event.target !== dialog) return;
          const bounds = dialog.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) this.closeDialog(dialog);
        }, { signal });
        dialog.addEventListener('close', () => {
          this.closeDialog(this.querySelector('[data-gift-preview]'));
          if (this.isConnected) dialog.returnFocus?.focus({ preventScroll: true });
        }, { signal });
        dialog.append(close);
        this.append(dialog);
        return dialog;
      }
      openDialog(dialog, focusTarget) {
        if (!dialog.open && !dialog.hasAttribute('open')) {
          if (typeof dialog.showModal === 'function') dialog.showModal();
          else dialog.setAttribute('open', '');
        }
        focusTarget?.focus({ preventScroll: true });
      }
      closeDialog(dialog) {
        if (!dialog || (!dialog.open && !dialog.hasAttribute('open'))) return;
        if (typeof dialog.close === 'function') dialog.close();
        else {
          dialog.removeAttribute('open');
          dialog.dispatchEvent(new Event('close'));
        }
      }
      // Large image above the gift steps. Closing it leaves the package or wrap selection unchanged.
      openGiftPreview(src, returnFocus, signal) {
        if (!src || signal?.aborted) return;
        const existing = this.querySelector('[data-gift-preview]');
        if (existing) {
          existing.dataset.skipFocus = 'true';
          this.closeDialog(existing);
        }
        const dialog = document.createElement('dialog');
        dialog.className = 'bundlify-gift-preview';
        dialog.dataset.giftPreview = '';
        dialog.setAttribute('aria-label', 'Image preview');
        const image = document.createElement('img');
        image.src = src;
        image.alt = '';
        image.decoding = 'async';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'bundlify-builder-close';
        close.setAttribute('aria-label', 'Close');
        close.innerHTML = '<span aria-hidden="true">×</span>';
        const closePreview = () => this.closeDialog(dialog);
        close.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          closePreview();
        });
        dialog.addEventListener('click', event => {
          event.stopPropagation();
          if (event.target !== dialog) return;
          const bounds = dialog.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closePreview();
        });
        dialog.addEventListener('keydown', event => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          closePreview();
        });
        dialog.addEventListener('cancel', event => {
          event.preventDefault();
          event.stopPropagation();
          closePreview();
        });
        const onAbort = () => closePreview();
        signal?.addEventListener('abort', onAbort, { once: true });
        dialog.addEventListener('close', () => {
          signal?.removeEventListener('abort', onAbort);
          const x = window.scrollX;
          const y = window.scrollY;
          dialog.remove();
          if (dialog.dataset.skipFocus !== 'true' && this.isConnected && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
          if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
        });
        dialog.append(image, close);
        this.append(dialog);
        const host = this.querySelector('[data-gift-dialog]');
        const top = host?.scrollTop || 0;
        const x = window.scrollX;
        const y = window.scrollY;
        this.openDialog(dialog, close);
        if (host) host.scrollTop = top;
        if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
      }
      // Ready-made bundle popup: products → package → wrap → summary. Package and wrap fees are real variants
      // added next to the bundle lines, so checkout charges them.
      giftSteps(card, { bundle, button, message, productGrid, total, money, currency, signal }) {
        const { packages, wraps } = bundle.gift;
        const rate = currency === bundle.shopCurrency ? 1 : Number(window.Shopify?.currency?.rate);
        const converted = Number.isFinite(rate) && rate > 0 ? rate : 1;
        const cents = option => option ? Math.round(Number(option.price) * converted * 100) : 0;
        const make = (tag, className, text) => {
          const node = document.createElement(tag);
          if (className) node.className = className;
          if (text != null) node.textContent = text;
          return node;
        };
        const action = (label, primary) => {
          const node = make('button', `bundlify-gift-button${primary ? ' bundlify-gift-primary' : ''}`, label);
          node.type = 'button';
          return node;
        };
        const heading = text => {
          const node = make('h4', 'bundlify-gift-heading', text);
          node.tabIndex = -1;
          return node;
        };
        const state = { step: 'products', history: [], packageId: '', wrapId: '', productCents: 0 };
        const uid = Math.random().toString(36).slice(2);
        const title = card.querySelector('h3');

        const nav = make('div', 'bundlify-gift-nav');
        const back = make('button', 'bundlify-gift-back', 'Back');
        back.type = 'button';
        back.setAttribute('aria-label', 'Back to the previous step');
        const progress = make('p', 'bundlify-gift-progress');
        nav.append(back, progress);
        title.after(nav);

        const productActions = make('div', 'bundlify-gift-actions');
        const giftBox = action('Gift Box', true);
        const skipProducts = action('Skip');
        giftBox.disabled = skipProducts.disabled = true;
        productActions.append(giftBox, skipProducts);

        const packageStep = make('section', 'bundlify-gift-step');
        packageStep.dataset.giftStep = 'package';
        const packageHeading = heading('Choose a package');
        packageHeading.id = `bundlify-package-${uid}`;
        packageStep.append(packageHeading);
        const choices = (headingNode, key, options) => {
          const group = make('div', 'bundlify-gift-choices');
          group.setAttribute('role', 'radiogroup');
          group.setAttribute('aria-labelledby', headingNode.id);
          const inputs = options.map(option => {
            const label = make('label', 'bundlify-gift-choice');
            const input = make('input');
            input.type = 'radio';
            input.name = `${headingNode.id}-choice`;
            input.value = option.id;
            input.addEventListener('change', () => { state[key] = option.id; }, { signal });
            label.append(input);
            const imageUrl = this.giftCardImage(option.imageUrl);
            if (imageUrl) {
              const media = make('button', 'bundlify-gift-choice-media');
              media.type = 'button';
              const img = make('img', 'bundlify-gift-choice-image');
              img.src = imageUrl;
              img.alt = '';
              img.width = 64;
              img.height = 64;
              img.decoding = 'async';
              const view = make('span', 'bundlify-gift-choice-view', 'View');
              label.classList.add('bundlify-gift-choice-with-image');
              media.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                this.openGiftPreview(imageUrl, media, signal);
              }, { signal });
              img.addEventListener('error', () => {
                label.classList.remove('bundlify-gift-choice-with-image');
                media.remove();
              }, { signal });
              media.append(img, view);
              label.append(media);
            }
            label.append(make('span', 'bundlify-gift-choice-name', option.name), make('strong', 'bundlify-gift-choice-price', money(cents(option))));
            group.append(label);
            return input;
          });
          return { group, inputs };
        };
        let radios = [];
        if (packages.length) {
          const built = choices(packageHeading, 'packageId', packages);
          radios = built.inputs;
          packageStep.append(built.group);
        } else packageStep.append(make('p', 'bundlify-gift-empty', 'No packages are set up yet. You can skip this step.'));
        const packageActions = make('div', 'bundlify-gift-actions');
        const wrapBox = action('Wrap a Box', true);
        const skipPackage = action('Skip');
        packageActions.append(wrapBox, skipPackage);
        packageStep.append(packageActions);

        const wrapStep = make('section', 'bundlify-gift-step');
        wrapStep.dataset.giftStep = 'wrap';
        const wrapHeading = heading('Wrap Your Gift Box');
        wrapHeading.id = `bundlify-wrap-${uid}`;
        wrapStep.append(wrapHeading);
        let wrapRadios = [];
        if (wraps.length) {
          const built = choices(wrapHeading, 'wrapId', [{ id: '', name: 'No wrap', price: 0 }, ...wraps]);
          wrapRadios = built.inputs;
          wrapRadios[0].checked = true;
          wrapStep.append(built.group);
        } else wrapStep.append(make('p', 'bundlify-gift-empty', 'No wraps are set up yet. Continue without a wrap.'));
        const wrapActions = make('div', 'bundlify-gift-actions');
        const continueButton = action('Continue', true);
        wrapActions.append(continueButton);
        wrapStep.append(wrapActions);

        const summaryStep = make('section', 'bundlify-gift-step');
        summaryStep.dataset.giftStep = 'summary';
        const summaryHeading = heading('Order summary');
        const summary = make('dl', 'bundlify-gift-summary');
        summaryStep.append(summaryHeading, summary);
        if (currency !== bundle.shopCurrency && (packages.length || wraps.length))
          summaryStep.append(make('p', 'bundlify-gift-note', 'Gift prices are converted from the store currency. The final amount is confirmed at checkout.'));
        summaryStep.append(button);
        message.before(productActions, packageStep, wrapStep, summaryStep);

        const selected = () => ({
          pack: packages.find(option => option.id === state.packageId) || null,
          wrap: wraps.find(option => option.id === state.wrapId) || null,
        });
        const renderSummary = () => {
          const { pack, wrap } = selected();
          const rows = [['Product price', state.productCents], ['Box price', cents(pack), pack?.name]];
          if (wrap) rows.push(['Wrap price', cents(wrap), wrap.name]);
          rows.push(['Total', state.productCents + cents(pack) + cents(wrap)]);
          summary.replaceChildren();
          for (const [label, amount, detail] of rows) {
            const row = make('div', label === 'Total' ? 'bundlify-gift-summary-total' : null);
            const term = make('dt', null, label);
            if (detail) term.append(make('small', null, detail));
            row.append(term, make('dd', null, money(amount)));
            summary.append(row);
          }
        };
        const order = ['products', 'package', 'wrap', 'summary'];
        const names = { products: 'Products', package: 'Package', wrap: 'Wrap', summary: 'Summary' };
        const sections = { package: [packageStep, packageHeading], wrap: [wrapStep, wrapHeading], summary: [summaryStep, summaryHeading] };
        const show = (step, focus = true) => {
          state.step = step;
          const onProducts = step === 'products';
          for (const node of [productGrid, total, productActions]) node.hidden = !onProducts;
          for (const [name, [section]] of Object.entries(sections)) section.hidden = name !== step;
          back.hidden = onProducts;
          progress.textContent = `Step ${order.indexOf(step) + 1} of 4 · ${names[step]}`;
          card.dataset.giftCurrent = step;
          if (step === 'summary') renderSummary();
          if (!focus) return;
          message.textContent = '';
          (onProducts ? title : sections[step][1]).focus({ preventScroll: true });
          const dialog = card.closest('[data-gift-dialog]');
          if (dialog) dialog.scrollTop = 0;
        };
        const go = (step, changes = {}) => {
          state.history.push(state.step);
          Object.assign(state, changes);
          if (!state.packageId) for (const radio of radios) radio.checked = false;
          if (!state.wrapId && wrapRadios.length) wrapRadios[0].checked = true;
          show(step);
        };
        giftBox.addEventListener('click', () => go('package'), { signal });
        skipProducts.addEventListener('click', () => go('summary', { packageId: '', wrapId: '' }), { signal });
        wrapBox.addEventListener('click', () => go('wrap'), { signal });
        skipPackage.addEventListener('click', () => go('summary', { wrapId: '' }), { signal });
        continueButton.addEventListener('click', () => go('summary'), { signal });
        back.addEventListener('click', () => show(state.history.pop() || 'products'), { signal });
        show('products', false);
        return {
          ready() { giftBox.disabled = skipProducts.disabled = false; },
          update(productCents) {
            state.productCents = productCents;
            if (state.step === 'summary') renderSummary();
          },
          lock(locked) { back.disabled = locked; },
          items(group) {
            const { pack, wrap } = selected();
            const line = (option, label) => option && { id: option.variantId, quantity: 1, properties: { [label]: option.name, Bundle: bundle.name, _bundlify_gift_for: group } };
            return [line(pack, 'Gift box'), line(wrap, 'Gift wrap')].filter(Boolean);
          },
          addedMessage() {
            const extras = Object.values(selected()).filter(Boolean).map(option => option.name);
            return extras.length ? `Bundle added to your cart with ${extras.join(' and ')}.` : 'Bundle added to your cart.';
          },
        };
      }
      async openCart(url, result, drawer, sections) {
        if (drawer?.renderContents && sections.length) {
          if (
            sections.some((id) => typeof result.sections?.[id] !== "string")
          ) {
            const refresh = new URL(url);
            refresh.searchParams.set("sections", sections.join(","));
            const response = await fetch(refresh, {
              signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) throw new Error("Cart refresh failed");
            result.sections = await response.json();
          }
          if (sections.some((id) => typeof result.sections?.[id] !== "string"))
            throw new Error("Cart sections unavailable");
          drawer.classList.remove("is-empty");
          drawer.renderContents(result);
          return;
        }
        const response = await fetch(`${url}.js`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error("Cart refresh failed");
        const cart = await response.json();
        const money = (cents) =>
          new Intl.NumberFormat(document.documentElement.lang || "en", {
            style: "currency",
            currency: cart.currency,
            currencyDisplay: "code",
          }).format(cents / 100);
        const dialog = document.createElement("dialog");
        dialog.className = "bundlify-cart-drawer";
        dialog.setAttribute("aria-label", "Shopping cart");
        const heading = document.createElement("h2");
        heading.textContent = "Your cart";
        const close = document.createElement("button");
        close.type = "button";
        close.textContent = "Close cart";
        close.addEventListener("click", () => dialog.close());
        dialog.addEventListener("close", () => {
          dialog.remove();
          this.querySelector("button")?.focus();
        });
        dialog.append(close, heading);
        for (const item of cart.items) {
          const row = document.createElement("div");
          row.className = "bundlify-cart-row";
          const name = document.createElement("p");
          name.textContent = `${item.product_title || item.title} × ${item.quantity}`;
          row.append(name);
          if (item.original_line_price > item.final_line_price) {
            const was = document.createElement("s");
            was.textContent = money(item.original_line_price);
            row.append(was);
          }
          const price = document.createElement("strong");
          price.textContent = money(item.final_line_price);
          row.append(price);
          dialog.append(row);
        }
        const total = document.createElement("h3");
        total.textContent = `Total ${money(cart.total_price)}`;
        const view = document.createElement("a");
        view.href = url;
        view.textContent = "View cart";
        const checkout = document.createElement("a");
        checkout.href = url.replace(/\/cart$/, "/checkout");
        checkout.textContent = "Checkout";
        dialog.append(total, view, checkout);
        document.body.append(dialog);
        dialog.showModal();
      }
    },
  );
})();
