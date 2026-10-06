import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  embeddedAppRedirect,
  subscriptionSavedPath,
} from "../app/services/embedded-navigation.server.js";

test("a deleted plan redirects inside the app with an empty 302", async () => {
  const response = embeddedAppRedirect(subscriptionSavedPath("delete"));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "/app/subscriptions?deleted=1");
  assert.equal(await response.text(), "");
});

test("an updated plan returns to the same list", () => {
  assert.equal(subscriptionSavedPath("update"), "/app/subscriptions?updated=1");
});

test("the plan editor throws that redirect instead of returning a status document", () => {
  const source = readFileSync(new URL("../app/routes/app.subscriptions.$id.jsx", import.meta.url), "utf8");
  assert.match(source, /throw embeddedAppRedirect\(subscriptionSavedPath\(intent\)\)/);
  assert.doesNotMatch(source, /return redirect\(/);
});
