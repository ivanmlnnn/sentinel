import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { verifyPrivyAccessToken } from "../functions/api/_shared.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const APP_ID = "sentinel-test-app";
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);

async function tokenWith(overrides = {}, headerOverrides = {}) {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  jwk.kid = "sentinel-adversarial-key";
  const header = encode({ alg: "ES256", typ: "JWT", kid: jwk.kid, ...headerOverrides });
  const payload = encode({
    iss: "privy.io", aud: APP_ID, sub: "did:privy:lab-user",
    iat: now(), exp: now() + 300, ...overrides
  });
  const input = header + "." + payload;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(input)
  );
  return { jwt: input + "." + Buffer.from(signature).toString("base64url"), jwk };
}

function request(jwt) {
  return new Request("https://sentinel.example/api/protected", {
    headers: { authorization: "Bearer " + jwt }
  });
}

async function withJwks(jwk, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), {
    status: 200, headers: { "content-type": "application/json" }
  });
  try { return await run(); } finally { globalThis.fetch = originalFetch; }
}

test("Privy rejects wrong issuer before fetching JWKS", async () => {
  const { jwt } = await tokenWith({ iss: "attacker.example" });
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected JWKS request"); };
  try {
    assert.equal(await verifyPrivyAccessToken(request(jwt), { PRIVY_APP_ID: APP_ID }), null);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("Privy rejects a future-issued token beyond allowed clock skew", async () => {
  const { jwt } = await tokenWith({ iat: now() + 61 });
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected JWKS request"); };
  try {
    assert.equal(await verifyPrivyAccessToken(request(jwt), { PRIVY_APP_ID: APP_ID }), null);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("Privy rejects missing or malformed subject claims", async () => {
  for (const sub of [undefined, "user-123", "", 42]) {
    const overrides = { sub };
    const { jwt } = await tokenWith(overrides);
    const originalFetch = globalThis.fetch; let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("unexpected JWKS request"); };
    try {
      assert.equal(await verifyPrivyAccessToken(request(jwt), { PRIVY_APP_ID: APP_ID }), null);
      assert.equal(calls, 0);
    } finally { globalThis.fetch = originalFetch; }
  }
});

test("Privy rejects unsupported JWT algorithms before JWKS retrieval", async () => {
  const { jwt } = await tokenWith({}, { alg: "none" });
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected JWKS request"); };
  try {
    assert.equal(await verifyPrivyAccessToken(request(jwt), { PRIVY_APP_ID: APP_ID }), null);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("Privy rejects unknown key IDs and key-type mismatches", async () => {
  const { jwt, jwk } = await tokenWith();
  const wrongKid = { ...jwk, kid: "not-the-token-key" };
  await withJwks(wrongKid, async () => {
    assert.equal(await verifyPrivyAccessToken(request(jwt), { PRIVY_APP_ID: APP_ID }), null);
  });
  const wrongCurve = { ...jwk, crv: "P-384" };
  await withJwks(wrongCurve, async () => {
    assert.equal(await verifyPrivyAccessToken(request(jwt), { PRIVY_APP_ID: APP_ID }), null);
  });
});

test("Privy fails closed when the JWKS endpoint is unavailable or malformed", async () => {
  const { jwt } = await tokenWith();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("upstream unavailable", { status: 503 });
    assert.equal(await verifyPrivyAccessToken(request(jwt), { PRIVY_APP_ID: APP_ID }), null);
    globalThis.fetch = async () => new Response("{", { status: 200 });
    assert.equal(await verifyPrivyAccessToken(request(jwt), { PRIVY_APP_ID: APP_ID }), null);
    globalThis.fetch = async () => { throw new Error("network failure"); };
    assert.equal(await verifyPrivyAccessToken(request(jwt), { PRIVY_APP_ID: APP_ID }), null);
  } finally { globalThis.fetch = originalFetch; }
});

test("Privy accepts the configured app ID inside an audience array", async () => {
  const { jwt, jwk } = await tokenWith({ aud: ["another-app", APP_ID] });
  await withJwks(jwk, async () => {
    const claims = await verifyPrivyAccessToken(request(jwt), { PRIVY_APP_ID: APP_ID });
    assert.equal(claims?.sub, "did:privy:lab-user");
  });
});

test("Privy rejects malformed bearer and malformed JWT encodings", async () => {
  for (const authorization of ["Bearer", "Basic abc", "Bearer a.b", "Bearer a.b.c.d", "Bearer !!!"]) {
    const req = new Request("https://sentinel.example/api/protected", {
      headers: { authorization }
    });
    assert.equal(await verifyPrivyAccessToken(req, { PRIVY_APP_ID: APP_ID }), null);
  }
});
