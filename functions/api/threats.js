import { json, readJson, validAccountId, verifyPrivyAccessToken } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const status = new URL(request.url).searchParams.get("status");
  if (status && !["verified", "unverified", "rejected"].includes(status)) {
    return json({ error: "status must be verified, unverified, or rejected." }, 400);
  }
  const result = status
    ? await env.DB.prepare("SELECT id, account_id, category, evidence, status, created_at FROM threat_reports WHERE status = ? ORDER BY created_at DESC LIMIT 500").bind(status).all()
    : await env.DB.prepare("SELECT id, account_id, category, evidence, status, created_at FROM threat_reports ORDER BY created_at DESC LIMIT 100").all();
  return json({
    registry_scope: "this_sentinel_deployment",
    verified_feed: status === "verified",
    reports: result.results || []
  });
}

export async function onRequestPost({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED", detail: "A valid Privy app access token is required to submit a threat report." }, 401);
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);
  const account = String(body.account_id || "").trim().toLowerCase();
  const category = String(body.category || "").trim().slice(0, 80);
  const evidence = String(body.evidence || "").trim().slice(0, 2000);
  if (!validAccountId(account) || !category || evidence.length < 12) return json({ error: "Valid account_id, category, and evidence (at least 12 characters) are required." }, 400);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare("INSERT INTO threat_reports (id, account_id, category, evidence, reporter, status, created_at) VALUES (?, ?, ?, ?, ?, 'unverified', ?)")
    .bind(id, account, category, evidence, String(identity.sub).slice(0, 100), createdAt).run();
  return json({ report: { id, account_id: account, category, status: "unverified", created_at: createdAt }, note: "Report is unverified and will not trigger an automatic block." }, 201);
}


function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

/** Admin-only moderation endpoint. Configure THREAT_REVIEW_TOKEN as a Worker secret. */
export async function onRequestVerifyPost({ request, env }) {
  const expected = env.THREAT_REVIEW_TOKEN;
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected) return json({ error: "THREAT_REVIEW_NOT_CONFIGURED" }, 503);
  if (!constantTimeEqual(supplied, expected)) return json({ error: "UNAUTHORIZED" }, 401);

  const body = await readJson(request);
  const id = String(body?.id || "");
  const status = String(body?.status || "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["verified", "rejected"].includes(status)) {
    return json({ error: "A valid report id and status (verified or rejected) are required." }, 400);
  }
  const result = await env.DB.prepare(
    "UPDATE threat_reports SET status = ? WHERE id = ? AND status = 'unverified'"
  ).bind(status, id).run();
  if (!result.meta?.changes) return json({ error: "REPORT_NOT_FOUND_OR_ALREADY_REVIEWED" }, 404);
  return json({ id, status, note: "The report is now reflected in the deployment's verified threat feed." });
}
