# Sentinel AI Runtime

Updated: 13 November 2026

## Runtime architecture

Sentinel owns the agent runtime, system instructions, skill registry, tool schemas, conversation normalization, tool execution loop, result interpretation, quotas, audit events, and security policy boundaries.

Inference is provided through the native Cloudflare Workers AI binding (env.AI). The default model is @cf/zai-org/glm-4.7-flash, pinned as the current repository default in `functions/api/_ai.js` and `wrangler.jsonc`. The model is an inference dependency; it is not Sentinel's policy engine and it is not trained or hosted as a new foundation model by this repository.

No Gemini or Anthropic API key is required by the Sentinel Agent or Guest Agent routes. The adapter normalizes model text and function calls into Sentinel's internal tool protocol.

## Capabilities and skill guide

### Guest Agent (read-only)
- NEAR wallet investigation — live account, transaction, receipt, token-transfer, contract-code, and evidence-completeness checks.
- Verified threat lookup — exact match against Sentinel's reviewed threat registry.
- Transaction anomaly analysis — interprets deterministic findings and observed activity.
- Security triage — prioritizes evidence, confidence, and recommended next actions.

Example prompts:
- Investigate alice.near
- Check verified threat reports for alice.near
- Explain the anomalies and prioritize the evidence from this scan
- What can you do, and how do I use wallet investigation?

Guest mode cannot propose, approve, sign, broadcast, or transfer funds.

### Authenticated Agent
- NEAR wallet investigation — read-only investigation backed by Sentinel's trusted backend.
- Security triage — interprets structured investigation evidence and explains limitations.
- Payment proposal — available only after an explicit request; deterministic preflight and policy checks run before a short-lived human approval is created.

Example prompts:
- Investigate alice.near
- Explain the risk findings for this account
- Show me how Sentinel payment approval works
- Create a payment proposal to alice.near for 0.1 NEAR

The authenticated Agent currently does not expose the Guest verified-threat lookup tool. A payment proposal is not authorization or execution. The user must review and approve the exact receiver and amount through the separate wallet approval flow. The isolated signer, NEP-413 verification, spend limits, allowlist, kill switch, and payment contract remain authoritative.

## How to use skills

Users can ask: What can you do?; How do I use wallet investigation?; Run an investigation for alice.near; Explain this result.

For how-to questions, Sentinel explains prerequisites, example prompts, the execution flow, result interpretation, and boundaries without running a tool unless the user also asks for the check.

## Security protocol

- Model output is an untrusted request, never an authorization.
- Only allowlisted server-side tools are executable.
- Guest tool execution is read-only.
- Payment proposals pass deterministic validation and fresh preflight; they never sign or broadcast.
- Human wallet approval and the isolated signer remain separate mandatory boundaries.
- Incomplete evidence must never be described as safe.
- Tool-call count and round limits remain enforced by the route.

## Deployment configuration

The Main Worker binds Workers AI in wrangler.jsonc with an AI binding named AI. Optional model override: SENTINEL_AI_MODEL. It must be a valid Workers AI model identifier. The default is pinned in functions/api/_ai.js.

Cloudflare Workers AI usage is subject to the account's plan, model availability, and usage/pricing limits. The current binding-based runtime does not require a Gemini or Anthropic API key; it does not promise unlimited or universally free inference.

## Verification status

The adapter has automated tests for response normalization, tool-call parsing, message conversion, missing bindings, and runtime failures. Repository CI and the production deployment workflow must pass before this runtime is considered released. A successful CI run does not by itself prove a live model invocation; production smoke verification must separately confirm the AI binding and model access.
