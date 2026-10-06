import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { colorKeys, defaults, knownDefaultColors, normalizeHex, resolveMatchStore, retiredDescriptions, validateAppearance } from "../app/services/appearance.js";

const read = (path) => readFile(new URL("../extensions/buendly-extation/" + path, import.meta.url), "utf8");

test("pasted or typed hex codes normalize to a savable six-digit color", () => {
  for (const input of ["#226506", "226506", " #226506 ", "\t226506\n"]) {
    assert.equal(normalizeHex(input), "#226506", JSON.stringify(input));
  }
  assert.equal(normalizeHex("#ABCDEF"), "#abcdef");
  assert.equal(normalizeHex("#fA3"), "#ffaa33");
  assert.equal(normalizeHex("fa3"), "#ffaa33");
  for (const input of ["", "#", "#22", "#2265", "#22650", "#2265061", "#ggg", "red", null, undefined]) {
    assert.equal(normalizeHex(input), null, JSON.stringify(input));
  }
  const form = new FormData();
  for (const [key, value] of Object.entries(defaults.subscription)) form.set(key, value);
  form.set("accent", normalizeHex(" 226506 "));
  assert.equal(validateAppearance("subscription", form).accent, "#226506");
});

test("every settings color field accepts a pasted hex code in both blocks", async () => {
  const settings = await readFile(new URL("../app/routes/app.settings.jsx", import.meta.url), "utf8");
  assert.match(settings, /\{colorKeys\.map\(\(key\) =>/, "all color fields render from colorKeys");
  assert.match(settings, /onPaste=\{\(event\) => \{\s*const hex = normalizeHex\(event\.clipboardData\.getData\("text"\)\)/);
  for (const kind of Object.keys(defaults)) {
    const hexKeys = Object.keys(defaults[kind]).filter((key) => /^#[0-9a-f]{6}$/i.test(String(defaults[kind][key])));
    assert.deepEqual([...hexKeys].sort(), [...colorKeys].sort(), kind + " has no color outside the shared hex input");
    const form = new FormData();
    for (const [key, value] of Object.entries(defaults[kind])) form.set(key, value);
    for (const key of colorKeys) form.set(key, normalizeHex(" AbC "));
    const saved = validateAppearance(kind, form);
    for (const key of colorKeys) assert.equal(saved[key], "#aabbcc", kind + "." + key);
  }
});

test("store matching is on by default and the switch round-trips through validation", () => {
  for (const kind of Object.keys(defaults)) {
    assert.equal(defaults[kind].matchStore, true);
    const form = new FormData();
    for (const [key, value] of Object.entries(defaults[kind])) form.set(key, value);
    assert.equal(validateAppearance(kind, form).matchStore, true);
    form.delete("matchStore");
    const off = validateAppearance(kind, form);
    assert.equal(off.matchStore, false, "an unchecked box turns matching off");
    assert.equal(off.accent, defaults[kind].accent, "saved colors are kept when matching is off");
  }
});

test("settings saved before the switch match the store only while every color is a shipped default", () => {
  assert.equal(resolveMatchStore({}), true);
  assert.equal(resolveMatchStore({ text: "#20382B", accent: "#285c43", heading: "Better together" }), true, "legacy green defaults");
  assert.equal(resolveMatchStore({ ...defaults.bundle, matchStore: undefined }), true);
  assert.equal(resolveMatchStore({ accent: "#ff0066" }), false, "a picked color keeps the merchant palette");
  assert.equal(resolveMatchStore({ accent: "#ff0066", matchStore: true }), true, "an explicit choice wins");
  assert.equal(resolveMatchStore({ matchStore: false }), false);
});

test("storefront card descriptions use the short defaults and treat a saved previous default as unset", async () => {
  const bundles = await read("snippets/bundle-options.liquid");
  const subscription = await read("snippets/subscription-options.liquid");
  const cards = [
    [bundles, "preset_description", "presetDescription", "Ready-made bundle."],
    [bundles, "custom_description", "customDescription", "Pick your favorites."],
    [subscription, "one_time_description", "oneTimeDescription", "Buy once"],
    [subscription, "subscription_unavailable", "subscriptionUnavailableText", "No subscription available"],
  ];
  for (const [source, variable, field, current] of cards) {
    const retired = retiredDescriptions[field];
    const kind = field === "presetDescription" || field === "customDescription" ? "bundle" : "subscription";
    assert.equal(defaults[kind][field], current);
    assert.match(source, new RegExp(`${variable} == blank or ${variable} == '${retired.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`));
    assert.match(source, new RegExp(`assign ${variable} = '${current.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`));
    assert.match(source, new RegExp(`\\{\\{ ${variable} \\| escape \\}\\}`));
    assert.doesNotMatch(source, new RegExp(`default:\\s*'${retired.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`));
  }
  assert.match(bundles, /default: 'Our bundle'/);
  assert.match(bundles, /default: 'Custom bundle'/);
  assert.match(subscription, /default: 'One-time purchase'/);
  assert.match(subscription, /default: 'Subscribe & Save'/);
});

test("the storefront snippet mirrors the admin's match-store rule and never loads Poppins", async () => {
  const snippet = await read("snippets/block-appearance.liquid");
  assert.doesNotMatch(snippet, /Poppins|fonts\.googleapis|fonts\.gstatic/);
  assert.match(snippet, /appearance\.matchStore == false/);
  const known = snippet.match(/assign known_colors = '([^']+)'/)[1].split("|").filter(Boolean);
  assert.deepEqual([...known].sort(), [...knownDefaultColors].sort());
  const keys = snippet.match(/assign color_keys = '([^']+)'/)[1].split(",");
  assert.deepEqual(keys, colorKeys);
  const merchant = snippet.slice(snippet.indexOf("{%- unless match_store %}"), snippet.indexOf("{%- endunless %}"));
  for (const property of ["--bl-selectedBackground", "--bundlify-action-background", "appearance.accent", "appearance.text"]) {
    assert.ok(merchant.includes(property), property + " is only written when store matching is off");
    assert.ok(!snippet.replace(merchant, "").includes(property), property + " must not leak into store-match mode");
  }
});

test("both widgets inherit the theme font and derive colors from theme variables", async () => {
  for (const [file, root] of [["assets/bundlify-bundles.css", "bundlify-bundles"], ["assets/bundlify-subscription.css", "bundlify-subscription"]]) {
    const css = await read(file);
    assert.doesNotMatch(css, /Poppins/);
    assert.match(css, /font-family: var\(--font-body-family, inherit\)/);
    assert.match(css, /font-family: ?var\(--font-heading-family, inherit\)/);
    assert.match(css, /@property --bundlify-theme-accent \{ syntax: "<color>"; inherits: true;/);
    assert.match(css, /rgb\(var\(--color-button-rgb, var\(--color-button\)\)\)/, "Dawn-style rgb triplets");
    assert.match(css, /var\(--color-primary-button-background, var\(--color-button-background, var\(--color-button,/, "full-color themes");
    assert.match(css, /--bundlify-accent: var\(--bundlify-action-background, var\(--bundlify-theme-accent\)\)/, "merchant accent still overrides");
    assert.doesNotMatch(css, /#0550d8|#6251e5|#0a1435/, root + " has no hardcoded brand blue or navy");
  }
  const bundles = await read("assets/bundlify-bundles.css");
  const selected = bundles.match(/button\.bundlify-mode-card\.bundlify-mode-card\[aria-pressed="true"\] \{([^}]*)\}/)[1];
  assert.match(selected, /border-color: color-mix\(in srgb, var\(--bl-selectedBorder, var\(--bundlify-ring\)\) 40%, var\(--bundlify-ring\)\)/);
  assert.match(selected, /color: var\(--bl-selectedText, var\(--bundlify-accent\)\)/);
  assert.match(bundles, /bundlify-bundles > h2 \{[^}]*color: var\(--bundlify-accent\)/);
  assert.match(bundles, /\.bundlify-product-price strong \{[^}]*color:var\(--bundlify-accent\)/);
  assert.match(selected, /background: var\(--bundlify-selected-tint\) var\(--bundlify-glass-strong\)/, "selected mode card is tinted glass, not a solid fill");
  assert.match(selected, /box-shadow: var\(--bundlify-selected-shadow\)/);
  const subscription = await read("assets/bundlify-subscription.css");
  assert.match(subscription, /\.bundlify-subscription-widget > h3 \{[^}]*color:var\(--bundlify-accent\)/);
  assert.match(subscription, /\.bundlify-purchase-card > strong \{[^}]*color: var\(--bundlify-accent\)/);
  const checked = subscription.match(/\.bundlify-purchase-card:has\(input:checked\) \{([^}]*background: var\(--bundlify-selected-tint\) var\(--bundlify-glass-strong\)[^}]*)\}/)[1];
  assert.match(checked, /border-color: color-mix\(in srgb, var\(--bl-selectedBorder, var\(--bundlify-ring\)\) 40%, var\(--bundlify-ring\)\)/);
  assert.match(checked, /box-shadow: var\(--bundlify-selected-shadow\)/);
  for (const css of [bundles, subscription]) {
    assert.match(css, /--bundlify-ring: var\(--bl-selectedIconColor, var\(--bundlify-accent\)\)/, "selection follows the theme button color unless the merchant palette is on");
    assert.match(css, /--bundlify-selected-tint: linear-gradient\([^;]*var\(--bundlify-ring\) 14%, transparent\)/, "selected tint stays light");
    assert.doesNotMatch(css, /--bundlify-selected-tint:[^;]*#[0-9a-f]{3,6}/i, "selected tint has no hardcoded color");
  }
  assert.match(bundles, /\[aria-pressed="true"\]::before \{ opacity: 1;/, "selected mode card shows a check");
  assert.match(subscription, /:has\(input:checked\)::before \{ opacity: 1;/, "selected purchase card shows a check");
  const disabledMode = bundles.match(/button\.bundlify-mode-card\.bundlify-mode-card:disabled \{([^}]*)\}/)[1];
  const disabledCard = subscription.match(/\[data-variant-id\] \.bundlify-purchase-card\[aria-disabled="true"\] \{\s([^}]*)\}/)[1];
  for (const rule of [disabledMode, disabledCard]) {
    assert.match(rule, /opacity: 1;/, "unavailable cards are not washed out");
    assert.match(rule, /border-style: dashed;/);
  }
  assert.match(subscription, /\.bundlify-subscription-widget legend \{[^}]*color:var\(--bundlify-muted, inherit\)/);
  const option = subscription.match(/\[data-variant-id\] \.bundlify-option:has\(input:checked\) \{([^}]*)\}/)[1];
  assert.doesNotMatch(option, /background: var\(--bundlify-accent\)/, "selected frequency is outlined, not filled");
});

test("both widgets use a glass card treatment that follows the theme or the merchant palette", async () => {
  for (const file of ["assets/bundlify-bundles.css", "assets/bundlify-subscription.css"]) {
    const css = await read(file);
    assert.match(css, /@property --bundlify-theme-surface \{ syntax: "<color>"; inherits: true; initial-value: transparent; \}/);
    assert.match(css, /--bundlify-theme-surface: rgb\(var\(--color-background\)\)/, "Dawn-style background triplet");
    assert.match(css, /--bundlify-glass: color-mix\(in srgb, var\(--bl-cardBackground, var\(--bundlify-theme-surface\)\) var\(--bundlify-glass-alpha\), transparent\)/, "saved palette stays translucent when matching is off");
    assert.match(css, /--bundlify-glass-strong: color-mix\(in srgb, var\(--bl-selectedBackground, var\(--bundlify-theme-surface\)\)/);
    assert.match(css, /--bundlify-glass-blur: blur\(1[2-8]px\)/);
    assert.match(css, /-webkit-backdrop-filter: var\(--bundlify-glass-blur\); backdrop-filter: var\(--bundlify-glass-blur\)/);
    assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{[^}]*--bundlify-glass-alpha: (8|9)\d%/, "more opaque fallback without backdrop-filter");
    assert.doesNotMatch(css, /box-shadow: 0 0 0 1px var\(--bl-selected/, "selected outline is the thin border only");
  }
  const cardStyles = await read("snippets/subscription-card-styles.liquid");
  assert.doesNotMatch(cardStyles, /#0a1435|linear-gradient/);
});

test("the subscription block still loads the small loader and keeps the stack-on-narrow container query", async () => {
  const block = await read("blocks/subscription_selector.liquid");
  assert.match(block, /"javascript": "bundlify-subscription-loader.js"/);
  const subscription = await read("assets/bundlify-subscription.css");
  assert.match(subscription, /@container bundlify-subscription \(max-width: 380px\) \{\s*bundlify-subscription\.bundlify-subscription-widget\[data-variant-id\] \.bundlify-purchase-cards \{ grid-template-columns: minmax\(0, 1fr\)/);
  const bundles = await read("assets/bundlify-bundles.css");
  assert.match(bundles, /@container bundlify \(max-width: 359px\)/);
});

test("bundle choice cards sit side by side until a 480px viewport", async () => {
  const bundles = await read("assets/bundlify-bundles.css");
  assert.match(bundles, /bundlify-bundles \.bundlify-mode-cards \{\s*display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(bundles, /@media \(max-width: 480px\) \{\s*bundlify-bundles \.bundlify-mode-cards \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(bundles, /bundlify-bundles \.bundlify-mode-cards\.bundlify-mode-cards\[role="group"\] \{\s*display: grid; grid-auto-flow: row; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(bundles, /\[role="group"\] > button\.bundlify-mode-card:nth-child\(1\) \{ grid-column: 1; \}/);
  assert.match(bundles, /\[role="group"\] > button\.bundlify-mode-card:nth-child\(2\) \{ grid-column: 2; \}/);
  assert.match(bundles, /@media \(max-width: 480px\) \{\s*bundlify-bundles \.bundlify-mode-cards\.bundlify-mode-cards\[role="group"\] \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.doesNotMatch(bundles, /@container bundlify \(max-width: 480px\)[\s\S]*?bundlify-mode-cards \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(bundles, /@container bundlify \(max-width: 640px\) \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  const purchase = await read("assets/bundlify-subscription.css");
  assert.match(purchase, /@container bundlify-subscription \(max-width: 380px\)/);
});
