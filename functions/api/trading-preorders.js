import { json, readTextLimited, verifyPrivyAccessToken } from "./_shared.js";
import { validatePreOrder, shouldTriggerPreOrder } from "../../src/trading-preorders.mjs";
import { getTidepoolLiveQuote, getTidepoolTestnetTokens } from "../../src/trading-core.mjs";
import { runDualAgentSwapReview } from "../../src/trading-swap-agents.mjs";
import { callSentinelAI } from "./_ai.js";

export async function onRequestGet({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401);
  if (!env.DB) return json({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const rows = await env.DB.prepare(
      "SELECT id, wallet_address, wallet_chain, trigger_type, scheduled_at, trigger_asset_id, trigger_direction, target_price_usd, status, trigger_observed_price_usd, trigger_observed_at, review_status, session_authorization_status, execution_status, review_result_json, reviewed_quote_json, reviewed_at, review_error, created_at, updated_at, triggered_at, cancelled_at FROM trading_preorders WHERE actor = ? ORDER BY created_at DESC LIMIT 100"
    ).bind(identity.sub).all();
    return json({ orders: rows.results || [] });
  } catch (error) {
    console.error("preorder_database_read_failed", { name: error?.name || "Error", message: String(error?.message || "Database read failed").slice(0, 180) });
    return json({ error: "PREORDER_DATABASE_READ_FAILED", migration: "0010_trading_preorders.sql" }, 503);
  }
}

async function cancelOrder(env, actor, id) {
  try {
    const result = await env.DB.prepare(
      "UPDATE trading_preorders SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND actor = ? AND status = 'HELD'"
    ).bind(id, actor).run();
    return result.meta?.changes > 0;
  } catch (error) {
    console.error("preorder_database_cancel_failed", { name: error?.name || "Error", message: String(error?.message || "Database cancel failed").slice(0, 180) });
    throw new Error("PREORDER_DATABASE_CANCEL_FAILED");
  }
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
    try {
      if (!await cancelOrder(env, identity.sub, body.id)) return json({ error: "ORDER_NOT_CANCELLABLE" }, 409);
      return json({ id: body.id, status: "CANCELLED" });
    } catch {
      return json({ error: "PREORDER_DATABASE_CANCEL_FAILED", migration: "0010_trading_preorders.sql" }, 503);
    }
  }
  const validated = validatePreOrder(body);
  if (!validated.ok) return json({ error: validated.reason }, 400);
  const order = validated.value;
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare(
      "INSERT INTO trading_preorders (id, actor, wallet_address, wallet_chain, trigger_type, scheduled_at, trigger_asset_id, trigger_direction, target_price_usd, swap_intent, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'HELD')"
    ).bind(id, identity.sub, order.walletAddress, order.walletChain, order.triggerType,
      order.scheduledAt || null, order.triggerAssetId || null, order.triggerDirection || null,
      order.targetPriceUsd ?? null, JSON.stringify(order.swapIntent)).run();
  } catch (error) {
    console.error("preorder_database_insert_failed", { name: error?.name || "Error", message: String(error?.message || "Database insert failed").slice(0, 180) });
    return json({ error: "PREORDER_DATABASE_WRITE_FAILED", migration: "0010_trading_preorders.sql" }, 503);
  }
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
  try {
    if (!await cancelOrder(env, identity.sub, body.id)) return json({ error: "ORDER_NOT_CANCELLABLE" }, 409);
    return json({ id: body.id, status: "CANCELLED" });
  } catch {
    return json({ error: "PREORDER_DATABASE_CANCEL_FAILED", migration: "0010_trading_preorders.sql" }, 503);
  }
}

async function reviewTriggeredPreOrder(env, order, now = Date.now()) {
  const failClosed = async (code, { terminal = true, review = null, quote = null } = {}) => {
    await env.DB.prepare(
      "UPDATE trading_preorders SET status = ?, review_status = ?, execution_status = 'NOT_AUTHORIZED', review_result_json = ?, reviewed_quote_json = ?, reviewed_at = ?, review_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'TRIGGERED_AWAITING_REVIEW'"
    ).bind(
      terminal ? "REJECTED" : "TRIGGERED_AWAITING_REVIEW",
      terminal ? "VETO" : "PENDING",
      review ? JSON.stringify(review) : null,
      quote ? JSON.stringify(quote) : null,
      terminal ? new Date(now).toISOString() : null,
      String(code).slice(0, 120),
      order.id
    ).run();
  };

  let intent;
  try { intent = JSON.parse(order.swap_intent); }
  catch { await failClosed("INVALID_STORED_SWAP_INTENT"); return { id: order.id, review: "VETO" }; }
  if (!intent || typeof intent !== "object" || order.wallet_chain !== "near" ||
      intent.refundTo?.toLowerCase() !== order.wallet_address?.toLowerCase()) {
    await failClosed("PREORDER_WALLET_OR_REFUND_MISMATCH");
    return { id: order.id, review: "VETO" };
  }

  try {
    // A scheduled order never reuses the quote captured when it was created.
    // Re-discover the Testnet registry and request a fresh provider quote at trigger time.
    const tokens = await getTidepoolTestnetTokens();
    const quoteInput = {
      originAsset: intent.originAsset,
      destinationAsset: intent.destinationAsset,
      amount: intent.amount,
      recipient: intent.recipient,
      refundTo: intent.refundTo,
      slippageTolerance: intent.slippageTolerance
    };
    const fresh = await getTidepoolLiveQuote(quoteInput, fetch, now, undefined, tokens);
    if (!fresh?.ok) {
      await failClosed(fresh?.reason || "FRESH_PREORDER_QUOTE_REJECTED");
      return { id: order.id, review: "VETO", reason: fresh?.reason || "FRESH_PREORDER_QUOTE_REJECTED" };
    }

    const review = await runDualAgentSwapReview({
      prompt: intent.userPrompt,
      quoteInput,
      liveQuote: fresh.value,
      tokens,
      now,
      aiCall: options => callSentinelAI(env, options)
    });
    if (!review.ok) {
      const retryable = ["SWAP_AGENT_ONE_UNAVAILABLE", "SWAP_AGENT_TWO_UNAVAILABLE",
        "SWAP_AGENT_ONE_INVALID_OUTPUT", "SWAP_AGENT_TWO_INVALID_OUTPUT"].includes(review.reason);
      await failClosed(review.reason || "DUAL_AGENT_REVIEW_FAILED", {
        terminal: !retryable,
        review: review.value || { status: retryable ? "PENDING" : "VETO", reason: review.reason },
        quote: fresh.value
      });
      return { id: order.id, review: retryable ? "PENDING" : "VETO", reason: review.reason };
    }

    // PASS means the two agents approved this fresh quote for display only.
    // The quote is time-bound and the bounded Meteor session authorization is
    // not implemented here; therefore execution_status must remain NOT_AUTHORIZED.
    await env.DB.prepare(
      "UPDATE trading_preorders SET review_status = 'PASS', review_result_json = ?, reviewed_quote_json = ?, reviewed_at = ?, review_error = NULL, execution_status = 'NOT_AUTHORIZED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'TRIGGERED_AWAITING_REVIEW'"
    ).bind(JSON.stringify(review.value), JSON.stringify(fresh.value),
      new Date(now).toISOString(), order.id).run();
    return { id: order.id, review: "PASS", execution_authorized: false };
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code :
      error instanceof Error ? error.message : "PREORDER_DUAL_AGENT_REVIEW_UNAVAILABLE";
    await failClosed(code, { terminal: false });
    return { id: order.id, review: "PENDING", reason: code };
  }
}

export async function runPreOrderScheduler(env, now = Date.now()) {
  if (!env.DB) throw new Error("PREORDER_DATABASE_NOT_CONFIGURED");
  const dueTimes = await env.DB.prepare(
    "SELECT * FROM trading_preorders WHERE status = 'HELD' AND trigger_type = 'TIME' AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT 50"
  ).bind(new Date(now).toISOString()).all();
  const prices = await env.DB.prepare(
    "SELECT * FROM trading_preorders WHERE status = 'HELD' AND trigger_type = 'PRICE' ORDER BY created_at ASC LIMIT 100"
  ).all();

  // Price triggers remain disabled until a cryptographically verified oracle
  // adapter exists. Token registry metadata is not an oracle.
  const triggeredOrders = [];
  for (const order of dueTimes.results || []) {
    const decision = shouldTriggerPreOrder(order, { now, priceVerified: false });
    if (!decision.trigger) continue;
    const update = await env.DB.prepare(
      "UPDATE trading_preorders SET status = 'TRIGGERED_AWAITING_REVIEW', trigger_observed_price_usd = ?, trigger_observed_at = ?, triggered_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'HELD'"
    ).bind(null, null, new Date(now).toISOString(), order.id).run();
    if (update.meta?.changes) triggeredOrders.push(order);
  }

  const reviews = [];
  for (const order of triggeredOrders) {
    reviews.push(await reviewTriggeredPreOrder(env, order, now));
  }
  return {
    scanned: (dueTimes.results || []).length + (prices.results || []).length,
    triggered: triggeredOrders.length,
    reviewed: reviews.length,
    reviews,
    price_orders_held: (prices.results || []).length,
    price_trigger_status: "SIGNED_ORACLE_NOT_CONFIGURED",
    execution_authorized: false
  };
}
