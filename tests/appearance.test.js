import test from "node:test";
import assert from "node:assert/strict";
import { defaults, validateAppearance } from "../app/services/appearance.js";
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
