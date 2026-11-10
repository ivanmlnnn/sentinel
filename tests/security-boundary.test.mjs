import test from "node:test";
import assert from "node:assert/strict";
import { applySecurityHeaders, validateMutationRequest } from "../src/http-security.mjs";
import { isSentinelAdmin, readJson, readTextLimited } from "../functions/api/_shared.js";

test("security headers are applied without exposing API responses to caches", async () => {
  const url = new URL("https://sentinel.example/api/metrics");
  const response = applySecurityHeaders(new Response("{}", { headers: { "content-type": "application/json" } }), url);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy"), /object-src 'none'/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("strict-transport-security"), /max-age=31536000/);
});

test("static responses receive clickjacking and MIME protections too", () => {
  const response = applySecurityHeaders(new Response("ok"), new URL("https://sentinel.example/"));
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("cache-control"), null);
});

test("API mutations require same-origin JSON", () => {
  const url = new URL("https://sentinel.example/api/agent/run");
  assert.equal(validateMutationRequest(new Request(url, {
    method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" }, body: "{}"
  }), url), "CROSS_ORIGIN_NOT_ALLOWED");
  assert.equal(validateMutationRequest(new Request(url, {
    method: "POST", headers: { origin: "https://sentinel.example", "content-type": "application/x-www-form-urlencoded" }, body: "x=1"
  }), url), "JSON_CONTENT_TYPE_REQUIRED");
  assert.equal(validateMutationRequest(new Request(url, {
    method: "POST", headers: { origin: "https://sentinel.example", "content-type": "application/json" }, body: "{}"
  }), url), null);
});

test("bounded request parser rejects oversized and malformed input", async () => {
  const tooLarge = await readTextLimited(new Request("https://sentinel.example/api", {
    method: "POST", body: "123456789"
  }), 8);
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.reason, "BODY_TOO_LARGE");
  assert.equal(await readJson(new Request("https://sentinel.example/api", {
    method: "POST", body: "{bad json"
  }), 100), null);
});

test("admin role fails closed and matches exact Privy subject only", () => {
  const env = { SENTINEL_ADMIN_DIDS: "did:privy:admin-1, did:privy:admin-2" };
  assert.equal(isSentinelAdmin({ sub: "did:privy:admin-1" }, env), true);
  assert.equal(isSentinelAdmin({ sub: "did:privy:admin-10" }, env), false);
  assert.equal(isSentinelAdmin({ sub: "did:privy:admin-1" }, {}), false);
  assert.equal(isSentinelAdmin({ sub: "user@example.com" }, env), false);
});
