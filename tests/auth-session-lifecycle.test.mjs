import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const auth = readFileSync(new URL("../public/auth.js", import.meta.url), "utf8");

test("sign out clears Guest state, waits for Privy logout, then reloads login", () => {
  assert.match(auth, /button\.textContent = 'Signing out…'/);
  assert.match(auth, /window\.SENTINEL_GUEST = false;[\s\S]*sessionStorage\.removeItem\('sentinel_privy_guest'\);[\s\S]*await logout\(\);[\s\S]*refreshLoginAfterSignOut\(\)/);
  assert.match(auth, /window\.location\.replace\(next\.toString\(\)\)/);
  assert.match(auth, /button\.disabled = false;[\s\S]*setAuthError\('Sign out could not be completed/);
});

test("Guest creation sets its session marker before requesting a guest account", () => {
  assert.match(auth, /window\.SENTINEL_GUEST = true;[\s\S]*sessionStorage\.setItem\('sentinel_privy_guest', '1'\);[\s\S]*createGuestAccount\(\)/);
});

test("Guest creation has a timeout and clears loading on failure", () => {
  assert.match(auth, /GUEST_SESSION_TIMEOUT/);
  assert.match(auth, /setGuestLoading\(false\)/);
});

test("email login clears a previous Guest marker", () => {
  assert.match(auth, /window\.SENTINEL_GUEST = false;[\s\S]*sessionStorage\.removeItem\('sentinel_privy_guest'\);[\s\S]*login\(\);/);
});

test("dashboard imports the cache-busted app bundle", () => {
  assert.match(auth, /app\.js\?v=20261111-future-console2/);
});


test("Guest login reports Privy disabled-feature errors separately", () => {
  assert.match(auth, /function describeGuestAuthFailure/);
  assert.match(auth, /Privy rejected Guest login because Guest Accounts appear to be disabled/);
  assert.match(auth, /error\?\.privyErrorCode/);
});

test("Guest login distinguishes network and origin errors instead of blaming Guest settings for every failure", () => {
  assert.match(auth, /Could not reach Privy to create a Guest session/);
  assert.match(auth, /Privy rejected this site origin or app configuration/);
  assert.match(auth, /Guest login failed \(' \+ code \+ '\): ' \+ detail/);
});
