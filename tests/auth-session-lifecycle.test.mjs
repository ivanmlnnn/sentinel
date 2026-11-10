import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const auth = readFileSync(new URL("../public/auth.js", import.meta.url), "utf8");

test("sign out clears the Guest flag and reloads the app module lifecycle", () => {
  assert.match(auth, /await logout\(\);[\s\S]*window\.SENTINEL_GUEST = false;[\s\S]*sessionStorage\.removeItem\('sentinel_privy_guest'\);[\s\S]*window\.location\.reload\(\);/);
});

test("Guest session is set before Privy creates the guest account", () => {
  assert.match(auth, /window\.SENTINEL_GUEST = true;[\s\S]*sessionStorage\.setItem\('sentinel_privy_guest', '1'\);[\s\S]*await createGuestAccount\(\);/);
});

test("email login clears any previous Guest session flag", () => {
  assert.match(auth, /window\.SENTINEL_GUEST = false;[\s\S]*sessionStorage\.removeItem\('sentinel_privy_guest'\);[\s\S]*login\(\);/);
});


test("Guest loading state resets when Privy auth state changes after logout", () => {
  assert.match(auth, /setGuestLoading\(false\);[\s\S]*if \(authenticated\)/);
});
