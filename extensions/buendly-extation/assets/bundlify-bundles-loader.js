(() => {
  const current = document.currentScript;
  const src = current?.src?.replace(/bundlify-bundles-loader\.js(\?.*)?$/, "bundlify-bundles.js$1");
  if (!src || document.querySelector("script[data-bundlify-bundles]")) return;
  const script = document.createElement("script");
  script.src = src;
  script.async = false;
  script.dataset.bundlifyBundles = "";
  current.after(script);
})();
