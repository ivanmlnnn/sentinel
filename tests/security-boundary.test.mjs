import test from "node:test";
import assert from "node:assert/strict";
import { applySecurityHeaders, validateMutationRequest } from "../src/http-security.mjs";
import { isSentinelAdmin, canReadInvestigation, readJson, readTextLimited } from "../functions/api/_shared.js";
import { onRequestGet as publicThreatFeed } from "../functions/api/threats.js";
import { onRequestGet as publicMetrics } from "../functions/api/metrics.js";

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

test("public threat feed never selects or returns free-form evidence", async () => {
  let selectedSql = "";
  const response = await publicThreatFeed({
    request: new Request("https://sentinel.example/api/threats?status=verified"),
    env: { DB: { prepare(sql) { selectedSql = sql; return { async all() {
      return { results: [{ id: "report-1", account_id: "wallet.testnet", category: "phishing", status: "verified" }] };
    } }; } } }
  });
  assert.equal(response.status, 200);
  assert.doesNotMatch(selectedSql, /evidence/i);
  const body = await response.json();
  assert.equal("evidence" in body.reports[0], false);
});

test("unverified threat reports are denied to non-admin visitors", async () => {
  const response = await publicThreatFeed({
    request: new Request("https://sentinel.example/api/threats?status=unverified"),
    env: { SENTINEL_ADMIN_DIDS: "did:privy:admin" }
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "ADMIN_REQUIRED");
});

test("public metrics contain aggregate counts but no individual wallet activity", async () => {
  const response = await publicMetrics({
    env: { DB: { prepare(sql) {
      return { async first() {
        return sql.includes("FROM investigations")
          ? { total: 7, allowed: 5, warned: 1, blocked: 1 }
          : { total: 2, verified: 1 };
      } };
    } } }
  });
  const body = await response.json();
  assert.equal(body.totals.total, 7);
  assert.deepEqual(body.recent, []);
  assert.equal(body.threats.total, 2);
});

test("investigation evidence is visible only to its owner or configured admin", async () => {
  const env = {
    SENTINEL_ADMIN_DIDS: "did:privy:admin",
    DB: { prepare() { return { bind(id) { return { async first() {
      return id === "owned-1" ? { actor: "did:privy:owner" } : null;
    } }; } }; } }
  };
  assert.equal(await canReadInvestigation(env, "owned-1", { sub: "did:privy:owner" }), true);
  assert.equal(await canReadInvestigation(env, "owned-1", { sub: "did:privy:other" }), false);
  assert.equal(await canReadInvestigation(env, "guest-scan", { sub: "did:privy:owner" }), false);
  assert.equal(await canReadInvestigation(env, "guest-scan", { sub: "did:privy:admin" }), true);
});
