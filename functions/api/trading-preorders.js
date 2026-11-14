import { json, readTextLimited, verifyPrivyAccessToken } from "./_shared.js";
import { validatePreOrder, shouldTriggerPreOrder } from "../../src/trading-preorders.mjs";
import { getTidepoolTestnetTokens } from "../../src/trading-core.mjs";

export async function onRequestGet({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401);
  if (!env.DB) return json({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const rows = await env.DB.prepare(
    "SELECT id, wallet_address, wallet_chain, trigger_type, scheduled_at, trigger_asset_id, trigger_direction, target_price_usd, status, trigger_observed_price_usd, trigger_observed_at, review_status, session_authorization_status, execution_status, created_at, updated_at, triggered_at, cancelled_at FROM trading_preorders WHERE actor = ? ORDER BY created_at DESC LIMIT 100"
  ).bind(identity.sub).all();
  return json({ orders: rows.results || [] });
}

async function cancelOrder(env, actor, id) {
  const result = await env.DB.prepare(
    "UPDATE trading_preorders SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND actor = ? AND status = 'HELD'"
  ).bind(id, actor).run();
  return result.meta?.changes > 0;
}

export async function onRequestPost({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401);
  if (!env.DB) return json({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const bodyResult = await readTextLimited(request, 12000);
  if (!bodyResult.ok) return json({ error: bodyResult.reason === "BODY_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INVALID_BODY" }, bodyResult.reason === "BODY_TOO_LARGE" ? 413 : 400);
  let body;
  try { body = JSON.parse(bodyResult.text); } catch { return json({ error: "INVALID_JSON" }, 400); }
  if (body?.action === "cancel") {
    if (Object.keys(body).some(key => !["action","id"].includes(key)) || typeof body.id !== "string") return json({ error: "INVALID_CANCEL_REQUEST" }, 400);
    if (!await cancelOrder(env, identity.sub, body.id)) return json({ error: "ORDER_NOT_CANCELLABLE" }, 409);
    return json({ id: body.id, status: "CANCELLED" });
  }
  const validated = validatePreOrder(body);
  if (!validated.ok) return json({ error: validated.reason }, 400);
  const order = validated.value;
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO trading_preorders (id, actor, wallet_address, wallet_chain, trigger_type, scheduled_at, trigger_asset_id, trigger_direction, target_price_usd, swap_intent, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'HELD')"
  ).bind(id, identity.sub, order.walletAddress, order.walletChain, order.triggerType,
    order.scheduledAt || null, order.triggerAssetId || null, order.triggerDirection || null,
    order.targetPriceUsd ?? null, JSON.stringify(order.swapIntent)).run();
  return json({
    id, status: "HELD", review_status: "PENDING",
    session_authorization_status: "NOT_CONFIGURED",
    execution_status: "NOT_AUTHORIZED",
    execution_authorized: false,
    message: "Order stored safely. It remains held until a fresh quote passes Dual-Agent review and a verifiable bounded wallet session is configured."
  }, 201);
}

export async function onRequestDelete({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401);
  if (!env.DB) return json({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const bodyResult = await readTextLimited(request, 2048);
  if (!bodyResult.ok) return json({ error: "INVALID_BODY" }, 400);
  let body;
  try { body = JSON.parse(bodyResult.text); } catch { return json({ error: "INVALID_JSON" }, 400); }
  if (typeof body?.id !== "string" || Object.keys(body).some(key => key !== "id")) return json({ error: "INVALID_CANCEL_REQUEST" }, 400);
  if (!await cancelOrder(env, identity.sub, body.id)) return json({ error: "ORDER_NOT_CANCELLABLE" }, 409);
  return json({ id: body.id, status: "CANCELLED" });
}

export async function runPreOrderScheduler(env, now = Date.now(), fetchImpl = fetch) {
  if (!env.DB) throw new Error("PREORDER_DATABASE_NOT_CONFIGURED");
  const dueTimes = await env.DB.prepare(
    "SELECT * FROM trading_preorders WHERE status = 'HELD' AND trigger_type = 'TIME' AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT 50"
  ).bind(new Date(now).toISOString()).all();
  const prices = await env.DB.prepare(
    "SELECT * FROM trading_preorders WHERE status = 'HELD' AND trigger_type = 'PRICE' ORDER BY created_at ASC LIMIT 100"
  ).all();
  let tokenById = new Map();
  if ((prices.results || []).length) {
    try {
      const tokens = await getTidepoolTestnetTokens(fetchImpl);
      tokenById = new Map(tokens.map(token => [token.asset_id, token]));
    } catch (error) {
      console.warn("Pre-Order price scan unavailable; time triggers will still be processed:", error?.message || "PRICE_SOURCE_UNAVAILABLE");
    }
  }
  const candidates = [...(dueTimes.results || []), ...(prices.results || [])];
  let triggered = 0;
  for (const order of candidates) {
    const token = tokenById.get(order.trigger_asset_id);
    const decision = shouldTriggerPreOrder(order, {
      now, price: token?.price_usd ?? null, priceUpdatedAt: token?.price_updated_at ?? null
    });
    if (!decision.trigger) continue;
    const update = await env.DB.prepare(
      "UPDATE trading_preorders SET status = 'TRIGGERED_AWAITING_REVIEW', trigger_observed_price_usd = ?, trigger_observed_at = ?, triggered_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'HELD'"
    ).bind(decision.observedPrice, decision.observedPrice === null ? null : new Date(now).toISOString(),
      new Date(now).toISOString(), order.id).run();
    if (update.meta?.changes) triggered++;
  }
  return { scanned: candidates.length, triggered };
}
