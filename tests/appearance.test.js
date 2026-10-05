import test from "node:test";
import assert from "node:assert/strict";
import { defaults, retiredDescriptions, unsetRetiredDescriptions, validateAppearance, colorKeys } from "../app/services/appearance.js";
import { getAppearance } from "../app/services/appearance.server.js";
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

test("card description defaults are the short copy and titles stay the same", () => {
  assert.equal(defaults.bundle.presetText, "Our bundle");
  assert.equal(defaults.bundle.presetDescription, "Ready-made bundle.");
  assert.equal(defaults.bundle.customText, "Custom bundle");
  assert.equal(defaults.bundle.customDescription, "Pick your favorites.");
  assert.equal(defaults.subscription.oneTimeText, "One-time purchase");
  assert.equal(defaults.subscription.oneTimeDescription, "Buy once");
  assert.equal(defaults.subscription.buttonText, "Subscribe & Save");
  assert.equal(defaults.subscription.subscriptionUnavailableText, "No subscription available");
});

test("a saved description that is still the previous default is treated as unset", async () => {
  const saved = unsetRetiredDescriptions({
    presetDescription: "Ready-made combinations for you",
    customDescription: "Staff picks",
    oneTimeDescription: "Buy once, without a subscription",
    subscriptionUnavailableText: "Ask us about a plan",
    heading: "Shop the set",
  });
  assert.equal(saved.presetDescription, undefined);
  assert.equal(saved.customDescription, "Staff picks");
  assert.equal(saved.oneTimeDescription, undefined);
  assert.equal(saved.subscriptionUnavailableText, "Ask us about a plan");
  assert.equal(saved.heading, "Shop the set");
  assert.equal(unsetRetiredDescriptions({ presetDescription: "Ready-made combinations for you." }).presetDescription, "Ready-made combinations for you.");
  assert.equal(unsetRetiredDescriptions({ oneTimeDescription: "buy once, without a subscription" }).oneTimeDescription, "buy once, without a subscription");

  const admin = {
    graphql: async () => ({
      json: async () => ({
        data: {
          shop: {
            id: "gid://shopify/Shop/1",
            bundle: { value: JSON.stringify({ presetDescription: retiredDescriptions.presetDescription, customDescription: "Staff picks", heading: "Shop the set" }) },
            subscription: { value: JSON.stringify({ oneTimeDescription: retiredDescriptions.oneTimeDescription, subscriptionUnavailableText: retiredDescriptions.subscriptionUnavailableText, subscriptionDescription: "Ships on your schedule", buttonText: "Subscribe & Save" }) },
          },
        },
      }),
    }),
  };
  const { settings } = await getAppearance(admin);
  assert.equal(settings.bundle.presetDescription, "Ready-made bundle.");
  assert.equal(settings.bundle.customDescription, "Staff picks");
  assert.equal(settings.bundle.heading, "Shop the set");
  assert.equal(settings.bundle.presetText, "Our bundle");
  assert.equal(settings.subscription.oneTimeDescription, "Buy once");
  assert.equal(settings.subscription.subscriptionUnavailableText, "No subscription available");
  assert.equal(settings.subscription.subscriptionDescription, "Ships on your schedule");
  assert.equal(settings.subscription.buttonText, "Subscribe & Save");
  assert.equal(settings.subscription.oneTimeText, "One-time purchase");
});
