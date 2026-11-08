import { json, readJson, validAccountId } from "./_shared.js";

export async function onRequestGet({ env }) {
  const result = await env.DB.prepare("SELECT id, account_id, category, evidence, status, created_at FROM threat_reports ORDER BY created_at DESC LIMIT 100").all();
  return json({ reports: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);
  const account = String(body.account_id || "").trim().toLowerCase();
  const category = String(body.category || "").trim().slice(0, 80);
  const evidence = String(body.evidence || "").trim().slice(0, 2000);
  if (!validAccountId(account) || !category || evidence.length < 12) return json({ error: "Valid account_id, category, and evidence (at least 12 characters) are required." }, 400);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare("INSERT INTO threat_reports (id, account_id, category, evidence, reporter, status, created_at) VALUES (?, ?, ?, ?, ?, 'unverified', ?)")
    .bind(id, account, category, evidence, String(body.reporter || "anonymous").slice(0, 100), createdAt).run();
  return json({ report: { id, account_id: account, category, status: "unverified", created_at: createdAt }, note: "Report is unverified and will not trigger an automatic block." }, 201);
}
