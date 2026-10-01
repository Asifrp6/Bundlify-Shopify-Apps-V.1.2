(() => {
  const current = document.currentScript;
  const src = current?.src?.replace(/bundlify-subscription-loader\.js(\?.*)?$/, "bundlify-subscription.js$1");
  if (!src || customElements.get("bundlify-subscription") || document.querySelector('script[data-bundlify-subscription], script[src*="/bundlify-subscription.js"]')) return;
  const script = document.createElement("script");
  script.src = src;
  script.async = false;
  script.dataset.bundlifySubscription = "";
  current.after(script);
})();
