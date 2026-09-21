import test from "node:test";
import assert from "node:assert/strict";
import { defaults, validateAppearance, colorKeys } from "../app/services/appearance.js";
test("appearance settings validate each block independently", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries(defaults.bundle)) form.set(key, value);
  form.set("buttonText", "Buy this bundle");
  assert.equal(validateAppearance("bundle", form).buttonText, "Buy this bundle");
  assert.equal(defaults.subscription.buttonText, "Subscribe & Save");
  form.set("accent", "red; background:url(x)");
  assert.throws(() => validateAppearance("bundle", form), /hex color/);
  form.set("accent", "#123456");
  form.set("logoUrl", "javascript:alert(1)");
  assert.throws(() => validateAppearance("bundle", form), /HTTPS/);
  assert.throws(() => validateAppearance("__proto__", form), /valid block/);
});

test("card settings validate every color and restrict icons to safe choices", () => {
  for (const kind of Object.keys(defaults)) {
    const form = new FormData();
    for (const [key, value] of Object.entries(defaults[kind])) form.set(key, value);
    assert.deepEqual(validateAppearance(kind, form), defaults[kind]);
    for (const key of colorKeys) {
      form.set(key, "#ffffff; background:url(https://example.com)");
      assert.throws(() => validateAppearance(kind, form), /hex color/);
      form.set(key, defaults[kind][key]);
    }
    const icon = kind === "bundle" ? "presetIcon" : "oneTimeIcon";
    form.set(icon, "none");
    assert.equal(validateAppearance(kind, form)[icon], "none");
    form.set(icon, "<svg onload=alert(1)>");
    assert.throws(() => validateAppearance(kind, form), /available icon/);
  }
});
