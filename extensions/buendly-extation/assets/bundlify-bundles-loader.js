(() => {
  const current = document.currentScript;
  const src = current?.src?.replace(/bundlify-bundles-loader\.js(\?.*)?$/, "bundlify-bundles.js$1");
  if (!src || customElements.get("bundlify-bundles") || document.querySelector('script[data-bundlify-bundles], script[src*="/bundlify-bundles.js"]')) return;
  const script = document.createElement("script");
  script.src = src;
  script.async = false;
  script.dataset.bundlifyBundles = "";
  current.after(script);
})();
