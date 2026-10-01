export const iconOptions = { gift: "Gift", grid: "Build a bundle", box: "Package", repeat: "Recurring delivery", heart: "Heart", star: "Star", none: "No icon" };
export const cardColors = {
  borderColor: "#e1e4e8", groupBackground: "#f1f5f3", cardBackground: "#fafcfb", cardText: "#525a64", cardBorder: "#dfe2e7",
  hoverBackground: "#edf0f4", hoverText: "#243c5c", hoverBorder: "#b2bcca",
  selectedBackground: "#e1e7ef", selectedText: "#0550d8", selectedBorder: "#8193aa",
  selectedHoverBackground: "#d5dde8", selectedHoverText: "#0550d8", selectedHoverBorder: "#6e819b",
  iconColor: "#525a64", selectedIconColor: "#0550d8", hoverIconColor: "#243c5c", focusColor: "#375c8d",
};
export const colorKeys = ["background", "text", "accent", "buttonTextColor", ...Object.keys(cardColors)];
// Every palette the app has shipped as a default. block-appearance.liquid keeps the same list for its storefront check.
export const knownDefaultColors = [
  "#ffffff", "#f1f3f8", "#0e1b3d", "#20382b", "#0a1435", "#0a6ff0", "#285c43", "#020b3f",
  "#e1e4e8", "#f1f5f3", "#fafcfb", "#525a64", "#dfe2e7", "#edf0f4", "#243c5c", "#b2bcca", "#e1e7ef", "#0550d8", "#8193aa", "#d5dde8", "#6e819b", "#375c8d",
  "#e1e8e4", "#52645b", "#dfe7e2", "#edf4ef", "#2e5140", "#b2cabc", "#e1efe6", "#234e38", "#81aa90", "#d5e8dc", "#6e9b7e", "#477d5c",
];
// Accepts #rrggbb, rrggbb, #rgb, or rgb (surrounding whitespace allowed); returns #rrggbb or null.
export function normalizeHex(input) {
  const raw = String(input ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) return "#" + raw.replace(/./g, "$&$&").toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(raw)) return "#" + raw.toLowerCase();
  return null;
}
// Settings saved before the switch existed match the store unless the merchant picked a non-default color.
export function resolveMatchStore(saved = {}) {
  if (typeof saved.matchStore === "boolean") return saved.matchStore;
  return colorKeys.every((key) => saved[key] == null || knownDefaultColors.includes(String(saved[key]).toLowerCase()));
}
export const fields = {
  borderColor: "Block / group border", groupBackground: "Card group background", cardBackground: "Card background", cardText: "Card text", cardBorder: "Card border",
  hoverBackground: "Hover background", hoverText: "Hover text", hoverBorder: "Hover border",
  selectedBackground: "Selected background", selectedText: "Selected text", selectedBorder: "Selected border",
  selectedHoverBackground: "Selected hover background", selectedHoverText: "Selected hover text", selectedHoverBorder: "Selected hover border",
  iconColor: "Icon color", selectedIconColor: "Selected icon color", hoverIconColor: "Hover icon color", focusColor: "Keyboard focus color",
  presetText: "Our bundle label", presetDescription: "Our bundle description", customText: "Custom bundle label", customDescription: "Custom bundle description", customUnavailableText: "Custom bundle unavailable message",
  purchaseHint: "Purchase options subtitle", oneTimeDescription: "One-time purchase description", subscriptionDescription: "Subscription description", subscriptionUnavailableText: "Subscription unavailable message",
  presetIcon: "Our bundle icon", customIcon: "Custom bundle icon", oneTimeIcon: "One-time purchase icon", subscriptionIcon: "Subscription icon",
  fontSize: "Font size", matchStore: "Match my store's font and colors",
  background: "Background color", text: "Text color", accent: "Button / selected color", buttonTextColor: "Button / selected text color", logoUrl: "Logo image URL", heading: "Heading", buttonText: "Button label", oneTimeText: "One-time purchase label",
};
export const defaults = {
  bundle: { matchStore: true, background: "#ffffff", text: "#0e1b3d", accent: "#0a6ff0", buttonTextColor: "#ffffff", fontSize: "16", logoUrl: "", heading: "Better together", buttonText: "Add bundle to cart" },
  subscription: { matchStore: true, background: "#f1f3f8", text: "#0a1435", accent: "#020b3f", buttonTextColor: "#ffffff", fontSize: "16", logoUrl: "", heading: "Purchase options", buttonText: "Subscribe & Save", oneTimeText: "One-time purchase" },
};
Object.assign(defaults.bundle, cardColors, { presetText: "Our bundle", presetDescription: "Ready-made combinations for you", customText: "Custom bundle", customDescription: "Pick your favorites. Make it yours.", customUnavailableText: "Not available yet", presetIcon: "gift", customIcon: "grid" });
Object.assign(defaults.subscription, cardColors, { purchaseHint: "Choose how to purchase", oneTimeDescription: "Buy once, without a subscription", subscriptionDescription: "Choose your delivery schedule", subscriptionUnavailableText: "No subscription available for this option", oneTimeIcon: "box", subscriptionIcon: "repeat" });
export function validateAppearance(kind, form) {
  if (!Object.hasOwn(defaults, kind)) throw new Error("Choose a valid block.");
  const values = {};
  for (const key of Object.keys(defaults[kind])) {
    if (key === "matchStore") { values.matchStore = ["on", "true"].includes(String(form.get(key))); continue; }
    const value = String(form.get(key) ?? (key === "fontSize" ? "16" : "")).trim();
    if (key === "fontSize") {
      if (!/^\d+$/.test(value) || Number(value) < 12 || Number(value) > 24) throw new Error("Font size must be a whole number from 12 to 24 pixels.");
    } else if (colorKeys.includes(key)) {
      if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(fields[key] + ": use a six-digit hex color.");
    } else if (key.endsWith("Icon")) {
      if (!Object.hasOwn(iconOptions, value)) throw new Error(fields[key] + ": choose an available icon.");
    } else if (key === "logoUrl") {
      if (value) { let url; try { url = new URL(value); } catch { throw new Error("Enter a valid HTTPS logo image URL."); }
        if (url.protocol !== "https:" || url.username || url.password || value.length > 2048) throw new Error("Enter a valid HTTPS logo image URL."); }
    } else if (!value || value.length > 100) throw new Error(fields[key] + ": enter 1?100 characters.");
    values[key] = value;
  }
  return values;
}
