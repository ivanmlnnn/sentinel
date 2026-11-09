import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { verifyPrivyAccessToken } from "../functions/api/_shared.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const APP_ID = "sentinel-test-app";
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");

async function signedToken(overrides = {}) {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  jwk.kid = "sentinel-test-key";
  const header = encode({ alg: "ES256", typ: "JWT", kid: jwk.kid });
  const now = Math.floor(Date.now() / 1000);
  const payload = encode({
    iss: "privy.io",
    aud: APP_ID,
    sub: "did:privy:test-user",
    iat: now,
    exp: now + 300,
    ...overrides
  });
  const input = header + "." + payload;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    pair.privateKey,
    new TextEncoder().encode(input)
  );
  return {
    token: input + "." + Buffer.from(signature).toString("base64url"),
    jwk
  };
}

function request(token) {
  return new Request("https://sentinel.example/api/protected", {
    headers: token ? { authorization: "Bearer " + token } : {}
  });
}

test("missing bearer token is rejected without a JWKS request", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("should not fetch"); };
  try {
    assert.equal(await verifyPrivyAccessToken(request(null), { PRIVY_APP_ID: APP_ID }), null);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("valid Privy ES256 access token is verified against the app JWKS", async () => {
  const originalFetch = globalThis.fetch;
  const { token, jwk } = await signedToken();
  globalThis.fetch = async url => {
    assert.equal(String(url), `https://auth.privy.io/api/v1/apps/${APP_ID}/jwks.json`);
    return new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    const claims = await verifyPrivyAccessToken(request(token), { PRIVY_APP_ID: APP_ID });
    assert.equal(claims?.sub, "did:privy:test-user");
    assert.equal(claims?.aud, APP_ID);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("expired access token is rejected before key retrieval", async () => {
  const originalFetch = globalThis.fetch;
  const { token } = await signedToken({ exp: Math.floor(Date.now() / 1000) - 10 });
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("should not fetch"); };
  try {
    assert.equal(await verifyPrivyAccessToken(request(token), { PRIVY_APP_ID: APP_ID }), null);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wrong audience is rejected", async () => {
  const originalFetch = globalThis.fetch;
  const { token } = await signedToken({ aud: "another-app" });
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("should not fetch"); };
  try {
    assert.equal(await verifyPrivyAccessToken(request(token), { PRIVY_APP_ID: APP_ID }), null);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tampered signature is rejected", async () => {
  const originalFetch = globalThis.fetch;
  const { token, jwk } = await signedToken();
  const parts = token.split(".");
  parts[1] = encode({ iss: "privy.io", aud: APP_ID, sub: "did:privy:attacker", iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+300 });
  const tampered = parts.join(".");
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
  try {
    assert.equal(await verifyPrivyAccessToken(request(tampered), { PRIVY_APP_ID: APP_ID }), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
