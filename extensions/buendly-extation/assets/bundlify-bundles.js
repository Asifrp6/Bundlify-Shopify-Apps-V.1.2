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
        this.controller?.abort();
      }
      async load() {
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        const hasCustom = !!this.querySelector('[data-custom-bundle]');
        this.prepareCustom(controller.signal);
        if (hasCustom) this.hidden = false;
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const root = (this.dataset.root || "/").replace(/\/$/, "");
          const url = new URL(`${root}/apps/bundlify/bundles`, location.origin);
          if (this.dataset.product)
            url.searchParams.set("productId", this.dataset.product);
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error("Request failed");
          const { bundles } = await response.json();
          if (!Array.isArray(bundles)) throw new Error("Invalid response");
          if (!this.isConnected || this.controller !== controller) return;
          const list = this.querySelector("[data-list]");
          list.replaceChildren();
          // Share requests between bundles in this load, without caching stale prices.
          const productRequests = new Map();
          for (const bundle of bundles) {
            const card = document.createElement("article");
            const title = document.createElement("h3");
            title.textContent = bundle.name;
            card.append(title);
            list.append(card);
            this.preparePurchase(
              card,
              bundle,
              root,
              controller.signal,
              productRequests,
            );
          }
          this.hidden = !hasCustom && !bundles.length && this.dataset.editor !== "true";
          this.querySelector("[data-message]").textContent = bundles.length || hasCustom
            ? ""
            : "Activate a bundle in Bundlify. Its products must be published and match this product page.";
          if (!bundles.length && hasCustom) {
            this.querySelector('[data-message]').textContent = 'No ready-made bundles are available right now. Create your own custom bundle.';
          }
        } catch {
          if (!this.isConnected || this.controller !== controller) return;
          this.hidden = !hasCustom && this.dataset.editor !== "true";
          this.querySelector("[data-message]").textContent =
            hasCustom ? "" : "Unable to load bundles. Check that the app server is running and the app proxy is deployed.";
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
          const onDone = dialog ? (selectedProducts) => {
            resultController?.abort();
            resultController = new AbortController();
            result.replaceChildren();
            const heading = document.createElement('h3');
            heading.textContent = 'Your custom bundle';
            heading.tabIndex = -1;
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.textContent = 'Edit products';
            edit.addEventListener('click', () => toggle.click(), { signal: resultController.signal });
            result.append(heading, edit);
            hasResult = true;
            result.hidden = false;
            this.preparePurchase(result, { custom: true, review: true, discount, products: selectedProducts },
              (this.dataset.root || '/').replace(/\/$/, ''), resultController.signal);
            dialog.addEventListener('close', () => { heading.focus(); result.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, { once: true });
            dialog.close();
          } : null;
          this.preparePurchase(card, { custom: true, discount, products, onDone },
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
        const buttonLabel = bundle.onDone ? 'Done' : bundle.custom ? "Add custom bundle to cart" : this.dataset.buttonText || "Add bundle to cart";
        const button = document.createElement("button");
        button.type = "button";
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
            total.replaceChildren();
            const label = document.createElement("span");
            label.textContent = "Bundle total";
            const value = document.createElement("strong");
            value.textContent = money(subtotal - savings);
            total.append(label);
            const displayedOriginal = bundle.custom && !discount ? originalTotal : subtotal;
            const displayedSavings = displayedOriginal - (subtotal - savings);
            const displayedPercentage = bundle.custom && !discount
              ? (displayedOriginal > 0 ? Math.round(displayedSavings * 1000 / displayedOriginal) / 10 : 0)
              : discount;
            if (displayedSavings > 0) {
              const was = document.createElement("s");
              was.textContent = money(displayedOriginal);
              was.setAttribute(
                "aria-label",
                `Original total ${money(displayedOriginal)}`,
              );
              const saving = document.createElement("small");
              saving.textContent = `You save ${money(displayedSavings)} (${displayedPercentage}%)`;
              total.append(was, value, saving);
            } else total.append(value);
            if (bundle.custom) {
              const count = entries.filter(entry => entry.checkbox.checked).length;
              button.disabled = count < 2;
              message.textContent = `${count} products selected. Choose at least 2.`;
            }
          };
          const products = await Promise.all(
            bundle.products.map((product) => {
              const url = `${root}/products/${encodeURIComponent(product.handle)}.js`;
              if (!productRequests.has(url)) {
                productRequests.set(
                  url,
                  fetch(url, {
                    signal: AbortSignal.any([
                      signal,
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
          if (signal.aborted || !this.isConnected) return;
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
            label.textContent = "Choose option";
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
                    items: selectedEntries.map(({ select }) => ({
                      id: select.value,
                      quantity: 1,
                      properties: {
                        ...(bundle.custom ? { _bundlify_custom: 'true' } : { _bundlify_bundle: String(bundle.id) }),
                        _bundlify_group: group,
                      },
                    })),
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
                message.textContent = "Bundle added to your cart.";
                button.textContent = "Added to cart";
                cart.hidden = false;
                // Drawer rendering is separate from adding: never retry a successful cart write.
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
