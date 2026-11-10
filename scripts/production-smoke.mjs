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

// Public Guest investigation. This creates one normal investigation record in D1.
const protectedInvestigation = await request("/api/investigate", {
  method: "POST",
  body: JSON.stringify({ receiver_account: "merchant.testnet", amount_near: 0.1 })
});
check("POST /api/investigate rejects a missing bearer token", protectedInvestigation.status === 401, `HTTP ${protectedInvestigation.status}`);

const investigation = await request("/api/guest/investigate", {
  method: "POST",
  body: JSON.stringify({
    sender_account: "agent.testnet",
    receiver_account: "merchant.testnet",
    amount_near: 0.1
  })
});
check(
  "Guest investigation API responds with a decision",
  investigation.status === 200 &&
    investigation.body &&
    ["ALLOW", "WARN", "BLOCK", "INCOMPLETE"].includes(investigation.body.decision),
  `HTTP ${investigation.status}; decision=${investigation.body?.decision || "none"}; error=${investigation.body?.error || "none"}`
);

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
