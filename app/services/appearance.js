export const fields = {
  fontSize: "Font size",
  background: "Background color", text: "Text color", accent: "Button / selected color", buttonTextColor: "Button / selected text color", logoUrl: "Logo image URL", heading: "Heading", buttonText: "Button label", oneTimeText: "One-time purchase label",
};
export const defaults = {
  bundle: { background: "#ffffff", text: "#20382b", accent: "#285c43", buttonTextColor: "#ffffff", fontSize: "16", logoUrl: "", heading: "Better together", buttonText: "Add bundle to cart" },
  subscription: { background: "#f1f3f8", text: "#0a1435", accent: "#020b3f", buttonTextColor: "#ffffff", fontSize: "16", logoUrl: "", heading: "Purchase options", buttonText: "Subscribe & Save", oneTimeText: "One-time purchase" },
};
export function validateAppearance(kind, form) {
  if (!Object.hasOwn(defaults, kind)) throw new Error("Choose a valid block.");
  const values = {};
  for (const key of Object.keys(defaults[kind])) {
    const value = String(form.get(key) ?? (key === "fontSize" ? "16" : "")).trim();
    if (key === "fontSize") {
      if (!/^\d+$/.test(value) || Number(value) < 12 || Number(value) > 24) throw new Error("Font size must be a whole number from 12 to 24 pixels.");
    } else if (["background", "text", "accent", "buttonTextColor"].includes(key)) {
      if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(fields[key] + ": use a six-digit hex color.");
    } else if (key === "logoUrl") {
      if (value) { let url; try { url = new URL(value); } catch { throw new Error("Enter a valid HTTPS logo image URL."); }
        if (url.protocol !== "https:" || url.username || url.password || value.length > 2048) throw new Error("Enter a valid HTTPS logo image URL."); }
    } else if (!value || value.length > 100) throw new Error(fields[key] + ": enter 1?100 characters.");
    values[key] = value;
  }
  return values;
}
