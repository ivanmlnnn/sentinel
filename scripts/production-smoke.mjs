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
    [400, 503].includes(response.status) &&
      ["TURNSTILE_TOKEN_REQUIRED", "TURNSTILE_NOT_CONFIGURED"].includes(response.body?.error),
    `HTTP ${response.status}; error=${response.body?.error || "none"}`
  );
}

// Authenticated preflight is used by the isolated signer and must reach Privy auth
// without a browser-only Turnstile token. Missing bearer token must still fail closed.
const authenticatedPreflight = await request("/api/investigate", {
  method: "POST",
  body: JSON.stringify({ receiver_account: "merchant.testnet", amount_near: 0.1 })
});
check("POST /api/investigate uses Privy auth, not guest Turnstile", authenticatedPreflight.status === 401, `HTTP ${authenticatedPreflight.status}`);

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
