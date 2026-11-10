const baseUrl = (process.env.SENTINEL_BASE_URL || "https://sentinel.ivmaladin.workers.dev").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body, contentType: response.headers.get("content-type") || "" };
}

function check(name, condition, detail) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!condition) process.exitCode = 1;
}

console.log(`Sentinel production smoke test: ${baseUrl}`);

// Public dashboard shell: this is an HTTP check, not a real browser/Privy UI test.
const home = await request("/");
check("dashboard responds", home.status === 200 && home.contentType.includes("text/html"), `HTTP ${home.status}`);

// Protected scan routes must fail closed without a fresh Turnstile token.
// This smoke check intentionally does not create a scan record or consume provider quota.
for (const path of ["/api/guest/investigate"]) {
  const response = await request(path, {
    method: "POST",
    body: JSON.stringify({
      sender_account: "agent.testnet",
      receiver_account: "merchant.testnet",
      amount_near: 0.1
    })
  });
  check(
    `POST ${path} rejects a missing Turnstile token before scanning`,
    response.status === 400 &&
      response.body?.error === "TURNSTILE_TOKEN_REQUIRED",
    `HTTP ${response.status}; error=${response.body?.error || "none"}`
  );
}

// The public /api/investigate route is a browser-facing route and is gated by
// Turnstile at the Worker edge before its handler checks Privy authentication.
// The isolated signer uses /api/internal/investigate with HMAC + Privy instead.
const authenticatedPreflight = await request("/api/investigate", {
  method: "POST",
  body: JSON.stringify({ receiver_account: "merchant.testnet", amount_near: 0.1 })
});
check(
  "POST /api/investigate rejects a missing Turnstile token before auth or scanning",
  authenticatedPreflight.status === 400 && authenticatedPreflight.body?.error === "TURNSTILE_TOKEN_REQUIRED",
  `HTTP ${authenticatedPreflight.status}; error=${authenticatedPreflight.body?.error || "none"}`
);

// Agent routes must reject unauthenticated callers before invoking AI or signer logic.
for (const path of ["/api/agent/run", "/api/agent/approve"]) {
  const response = await request(path, {
    method: "POST",
    body: JSON.stringify({})
  });
  check(`POST ${path} rejects a missing bearer token`, response.status === 401,
    `HTTP ${response.status}; error=${response.body?.error || "none"}`);
}

// The internal preflight endpoint must reject requests without the signer HMAC,
// even when the request body is otherwise valid. This is a non-mutating negative test.
const unsignedPreflight = await request("/api/internal/investigate", {
  method: "POST",
  body: JSON.stringify({ receiver_account: "merchant.testnet", amount_near: 0.1 })
});
check("POST /api/internal/investigate rejects missing HMAC authentication",
  unsignedPreflight.status === 401 && unsignedPreflight.body?.error === "INVALID_INTERNAL_AUTH",
  `HTTP ${unsignedPreflight.status}; error=${unsignedPreflight.body?.error || "none"}`);

// These are write/AI actions. GET /api/threats is intentionally public/read-only.
const threatWrite = await request("/api/threats", {
  method: "POST",
  body: JSON.stringify({})
});
check("POST /api/threats rejects a missing bearer token", threatWrite.status === 401, `HTTP ${threatWrite.status}`);

const aiReview = await request("/api/ai-review", {
  method: "POST",
  body: JSON.stringify({})
});
check("POST /api/ai-review rejects a missing bearer token", aiReview.status === 401, `HTTP ${aiReview.status}`);

if (process.exitCode) {
  console.error("\nSmoke test FAILED. Inspect the response above and Cloudflare Worker logs.");
} else {
  console.log("\nAll HTTP smoke checks passed. Guest UI interaction still needs a fresh-browser manual check.");
}
