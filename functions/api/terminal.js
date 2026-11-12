import { json, verifyPrivyAccessToken, readTextLimited } from "./_shared.js";
import { onRequestPost as runProductionAgent } from "./agent.js";

const MAX_PROMPT_LENGTH = 4000;

/**
 * Production Agent Terminal gateway.
 *
 * The terminal is a task console for Sentinel's typed, server-side agent tools.
 * It is intentionally NOT a general-purpose shell and never executes model text
 * as an operating-system command.
 *
 * User mode delegates to the existing authenticated production Agent runtime.
 * Developer mode stays fail-closed until a real one-time NEAR delegated-key
 * authorization and revocation lifecycle is configured and implemented.
 */
export async function onRequestGet({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401);

  return json({
    service: "sentinel-production-agent-terminal",
    status: "online",
    network: env.NEAR_NETWORK || "unconfigured",
    modes: {
      user: { enabled: true, runtime: "production-agent-api", capabilities: ["wallet-investigation", "security-triage", "payment-proposal"] },
      developer: {
        enabled: false,
        status: "DELEGATED_WALLET_AUTH_REQUIRED",
        reason: "One-time wallet delegation, scoped access-key registration, and revocation are not yet implemented on this deployment."
      }
    },
    execution: {
      shell: false,
      modelTextAsCommand: false,
      transactions: "Testnet policy and existing signer flow only",
      audit: "agent_audit"
    }
  });
}

export async function onRequestPost({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401);

  const bounded = await readTextLimited(request, 12000);
  if (!bounded.ok) return json({ error: bounded.reason === "BODY_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INVALID_BODY" }, bounded.reason === "BODY_TOO_LARGE" ? 413 : 400);

  let body;
  try { body = JSON.parse(bounded.text); } catch { return json({ error: "INVALID_JSON" }, 400); }
  const mode = body?.mode;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

  if (!["user", "developer"].includes(mode)) return json({ error: "INVALID_TERMINAL_MODE" }, 400);
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) return json({ error: "PROMPT_REQUIRED" }, 400);

  if (mode === "developer") {
    return json({
      status: "LOCKED",
      error: "DEVELOPER_DELEGATION_NOT_CONFIGURED",
      message: "Developer Mode requires a one-time NEAR wallet delegation flow with scoped access-key permissions and revocation. This deployment does not yet have that mechanism; no transaction was attempted.",
      execution_enabled: false
    }, 409);
  }

  // Preserve the original bearer token and idempotency key. The production
  // agent validates both again and remains the authority for tools and policy.
  const forwarded = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ prompt })
  });
  return runProductionAgent({ request: forwarded, env });
}
