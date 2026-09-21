export const iconOptions = { gift: "Gift", grid: "Build a bundle", box: "Package", repeat: "Recurring delivery", heart: "Heart", star: "Star", none: "No icon" };
export const cardColors = {
  borderColor: "#e1e8e4", groupBackground: "#f1f5f3", cardBackground: "#fafcfb", cardText: "#52645b", cardBorder: "#dfe7e2",
  hoverBackground: "#edf4ef", hoverText: "#2e5140", hoverBorder: "#b2cabc",
  selectedBackground: "#e1efe6", selectedText: "#234e38", selectedBorder: "#81aa90",
  selectedHoverBackground: "#d5e8dc", selectedHoverText: "#234e38", selectedHoverBorder: "#6e9b7e",
  iconColor: "#52645b", selectedIconColor: "#234e38", hoverIconColor: "#2e5140", focusColor: "#477d5c",
};
export const colorKeys = ["background", "text", "accent", "buttonTextColor", ...Object.keys(cardColors)];
export const fields = {
  borderColor: "Block / group border", groupBackground: "Card group background", cardBackground: "Card background", cardText: "Card text", cardBorder: "Card border",
  hoverBackground: "Hover background", hoverText: "Hover text", hoverBorder: "Hover border",
  selectedBackground: "Selected background", selectedText: "Selected text", selectedBorder: "Selected border",
  selectedHoverBackground: "Selected hover background", selectedHoverText: "Selected hover text", selectedHoverBorder: "Selected hover border",
  iconColor: "Icon color", selectedIconColor: "Selected icon color", hoverIconColor: "Hover icon color", focusColor: "Keyboard focus color",
  presetText: "Our bundle label", presetDescription: "Our bundle description", customText: "Custom bundle label", customDescription: "Custom bundle description", customUnavailableText: "Custom bundle unavailable message",
  purchaseHint: "Purchase options subtitle", oneTimeDescription: "One-time purchase description", subscriptionDescription: "Subscription description", subscriptionUnavailableText: "Subscription unavailable message",
  presetIcon: "Our bundle icon", customIcon: "Custom bundle icon", oneTimeIcon: "One-time purchase icon", subscriptionIcon: "Subscription icon",
  fontSize: "Font size",
  background: "Background color", text: "Text color", accent: "Button / selected color", buttonTextColor: "Button / selected text color", logoUrl: "Logo image URL", heading: "Heading", buttonText: "Button label", oneTimeText: "One-time purchase label",
};
export const defaults = {
  bundle: { background: "#ffffff", text: "#20382b", accent: "#285c43", buttonTextColor: "#ffffff", fontSize: "16", logoUrl: "", heading: "Better together", buttonText: "Add bundle to cart" },
  subscription: { background: "#f1f3f8", text: "#0a1435", accent: "#020b3f", buttonTextColor: "#ffffff", fontSize: "16", logoUrl: "", heading: "Purchase options", buttonText: "Subscribe & Save", oneTimeText: "One-time purchase" },
};
Object.assign(defaults.bundle, cardColors, { presetText: "Our bundle", presetDescription: "Ready-made combinations for you", customText: "Custom bundle", customDescription: "Pick your favorites. Make it yours.", customUnavailableText: "Not available yet", presetIcon: "gift", customIcon: "grid" });
Object.assign(defaults.subscription, cardColors, { purchaseHint: "Choose how to purchase", oneTimeDescription: "Buy once, without a subscription", subscriptionDescription: "Choose your delivery schedule", subscriptionUnavailableText: "No subscription available for this option", oneTimeIcon: "box", subscriptionIcon: "repeat" });
export function validateAppearance(kind, form) {
  if (!Object.hasOwn(defaults, kind)) throw new Error("Choose a valid block.");
  const values = {};
  for (const key of Object.keys(defaults[kind])) {
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
