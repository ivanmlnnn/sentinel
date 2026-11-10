import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const auth = readFileSync(new URL("../public/auth.js", import.meta.url), "utf8");

test("sign out clears Guest state before logout and refreshes the login page", () => {
  assert.match(auth, /sessionStorage\.setItem\('sentinel_signout_refresh', '1'\)/);
  assert.match(auth, /window\.SENTINEL_GUEST = false;[\s\S]*sessionStorage\.removeItem\('sentinel_privy_guest'\);[\s\S]*await logout\(\);[\s\S]*refreshLoginAfterSignOut\(\)/);
  assert.match(auth, /window\.location\.replace\(next\.toString\(\)\)/);
});

test("Guest session is marked before Privy creates the guest account", () => {
  assert.match(auth, /window\.SENTINEL_GUEST = true;[\s\S]*sessionStorage\.setItem\('sentinel_privy_guest', '1'\);[\s\S]*createGuestAccount\(\)/);
});

test("Guest creation has a timeout and resets the loading state on failure", () => {
  assert.match(auth, /GUEST_SESSION_TIMEOUT/);
  assert.match(auth, /setGuestLoading\(false\)/);
});

test("email login clears any previous Guest session flag", () => {
  assert.match(auth, /window\.SENTINEL_GUEST = false;[\s\S]*sessionStorage\.removeItem\('sentinel_privy_guest'\);[\s\S]*login\(\);/);
});

test("Guest loading state resets when Privy auth state changes", () => {
  assert.match(auth, /setGuestLoading\(false\);[\s\S]*if \(authenticated\)/);
});
