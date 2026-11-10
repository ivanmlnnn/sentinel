import { json, readJson, validAccountId, verifyPrivyAccessToken, isSentinelAdmin } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const requestedStatus = new URL(request.url).searchParams.get("status");
  const status = requestedStatus || "verified";
  if (!["verified", "unverified", "rejected"].includes(status)) {
    return json({ error: "INVALID_STATUS" }, 400);
  }
  if (status !== "verified") {
    const identity = await verifyPrivyAccessToken(request, env);
    if (!identity || !isSentinelAdmin(identity, env)) return json({ error: "ADMIN_REQUIRED" }, 403);
    const result = await env.DB.prepare(
      "SELECT id, account_id, category, evidence, status, created_at FROM threat_reports WHERE status = ? ORDER BY created_at DESC LIMIT 500"
    ).bind(status).all();
    return json({ registry_scope: "this_sentinel_deployment", verified_feed: false, reports: result.results || [] });
  }

  // Only reviewed, intentionally public fields are exposed. Free-form evidence
  // may contain private information and is kept out of the public feed.
  const result = await env.DB.prepare(
    "SELECT id, account_id, category, status, created_at FROM threat_reports WHERE status = 'verified' ORDER BY created_at DESC LIMIT 500"
  ).all();
  return json({ registry_scope: "this_sentinel_deployment", verified_feed: true, reports: result.results || [] });
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



export async function onRequestVerifyPost({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity || !isSentinelAdmin(identity, env)) return json({ error: "ADMIN_REQUIRED" }, 403);

  const body = await readJson(request, 4096);
  const id = String(body?.id || "");
  const status = String(body?.status || "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["verified", "rejected"].includes(status)) {
    return json({ error: "INVALID_MODERATION_REQUEST" }, 400);
  }
  const result = await env.DB.prepare(
    "UPDATE threat_reports SET status = ? WHERE id = ? AND status = 'unverified'"
  ).bind(status, id).run();
  if (!result.meta?.changes) return json({ error: "REPORT_NOT_FOUND_OR_ALREADY_REVIEWED" }, 404);
  return json({ id, status, note: "The report moderation state was updated." });
}
