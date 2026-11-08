import { json } from "./_shared.js";

function decodeBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

export async function onRequestPost({ request, env }) {
  const secretValue = env.PRIVY_WEBHOOK_SECRET;
  if (!secretValue || !secretValue.startsWith("whsec_")) return json({ error: "Webhook signing secret is not configured." }, 503);
  const id = request.headers.get("svix-id") || request.headers.get("webhook-id");
  const timestamp = request.headers.get("svix-timestamp") || request.headers.get("webhook-timestamp");
  const signatureHeader = request.headers.get("svix-signature") || request.headers.get("webhook-signature") || "";
  if (!id || !timestamp || !signatureHeader) return json({ error: "Missing webhook signature headers." }, 400);
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return json({ error: "Webhook timestamp outside tolerance." }, 400);

  let keyBytes;
  try { keyBytes = decodeBase64(secretValue.slice(6)); } catch { return json({ error: "Webhook signing secret is malformed." }, 503); }
  const rawBody = await request.text();
  const signedContent = new TextEncoder().encode(id + "." + timestamp + "." + rawBody);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const candidates = signatureHeader.split(/\s+/).filter(part => part.startsWith("v1,")).map(part => part.slice(3));
  let valid = false;
  for (const candidate of candidates) {
    try { if (await crypto.subtle.verify("HMAC", key, decodeBase64(candidate), signedContent)) { valid = true; break; } } catch {}
  }
  if (!valid) return json({ error: "Invalid webhook signature." }, 400);

  let event;
  try { event = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON payload." }, 400); }
  const eventType = typeof event.type === "string" ? event.type : "unknown";
  await env.DB.prepare("INSERT OR IGNORE INTO privy_webhook_events (id, svix_id, event_type, payload, received_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), id, eventType, JSON.stringify(event), new Date().toISOString()).run();
  return json({ received: true, event_type: eventType });
}
