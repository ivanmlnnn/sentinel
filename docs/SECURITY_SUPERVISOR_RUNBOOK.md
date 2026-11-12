# Security Supervisor Runbook

Status date: 12 November 2026

## Purpose

The Sentinel Security Supervisor is an event-driven companion to the Runtime Agent. It correlates signed production telemetry into incident records and supports session containment for explicitly defined high-confidence signals. It is not the production firewall and is not a continuously running terminal process.

## Architecture and authority

1. The Cloudflare Main Worker validates requests, authenticates users, applies rate limits, evaluates Sentinel policy, and enforces the kill switch locally.
2. The Main Worker may forward sanitized security events asynchronously to the Hatchable supervisor endpoint.
3. Hatchable verifies HMAC, timestamp freshness, and one-time nonce; it stores allow-listed telemetry and correlates deterministic thresholds.
4. The supervisor may record an incident and freeze only the affected agent session for defined replay/compromise signals.
5. The isolated Signer Worker independently validates the exact wallet-signed transaction. Agents never receive wallet private keys.

Cloudflare must never wait for the supervisor or an AI provider before enforcing a sensitive action. If telemetry delivery fails, the security decision remains local and conservative.

## Current implementation status

| Capability | Status | Evidence / limitation |
|---|---|---|
| Hatchable control-plane API | Deployed | Separate Hatchable project; not bundled into the Cloudflare Worker |
| Security Supervisor endpoint | Deployed | `/api/security-supervisor`; unauthenticated request rejected with HTTP 401 |
| Telemetry and incident tables | Deployed | Hatchable migration `005_security_supervisor.sql` |
| Deterministic event thresholds | Implemented | Initial heuristic thresholds; require tuning and false-positive review |
| Production Worker telemetry forwarding | NOT CONNECTED | No end-to-end production event delivery has been demonstrated |
| 24/7 availability / uptime SLA | NOT VERIFIED | Deployment does not prove continuous uptime, retries, or recovery |
| AI-assisted incident analysis | NOT VERIFIED | AI provider setup is a separate prerequisite; deterministic ingestion does not require AI |
| Automatic Cloudflare IP blocking | NOT IMPLEMENTED | Worker remains the enforcement authority; no remote block command is exposed |

## Required configuration before production telemetry

- Configure a high-entropy secret in Hatchable Setup as `SENTINEL_CONTROL_HMAC`.
- Configure the same value as the Cloudflare Worker secret `HATCHABLE_CONTROL_HMAC` using Wrangler secret management.
- Configure a fixed HTTPS Hatchable supervisor URL in the Worker environment. Do not accept an arbitrary destination from a browser request.
- Never expose either secret in frontend JavaScript, committed files, build logs, or chat.
- Keep the Hatchable API protected by HMAC. Do not rely on obscurity or a public URL as authentication.
- If Hatchable's project visibility must be Public for server-to-server access, review that static dashboard content is intended to be publicly readable; API authorization remains independently required.

## Event envelope and privacy

The Worker should send only allow-listed event types, a UUID event ID, an optional affected session UUID, outcome, and sanitized metadata. Use a keyed pseudonymous source identifier; do not forward raw IP addresses, cookies, bearer tokens, authorization headers, HMAC signatures, full request bodies, wallet secrets, or unredacted provider errors.

Recommended event types include `AUTH_FAILURE`, `ACCESS_DENIED`, `INVALID_SIGNATURE`, `REPLAY_DETECTED`, `RATE_LIMITED`, `POLICY_BLOCK`, `SESSION_REVOKED`, `SESSION_EXPIRED`, `SESSION_COMPROMISE`, `ORIGIN_ERROR`, `CSP_VIOLATION`, `INPUT_REJECTED`, and `WALLET_CONSENT_FAILURE`.

## Rollout verification checklist

- [ ] A valid HMAC request is accepted.
- [ ] Missing or invalid HMAC is rejected.
- [ ] Stale timestamps are rejected.
- [ ] Reusing a nonce is rejected, including concurrent replay attempts.
- [ ] Duplicate event IDs do not create duplicate telemetry or incidents.
- [ ] Event type, UUID, source hash, outcome, and metadata are validated server-side.
- [ ] Raw IPs, cookies, tokens, signatures, and request bodies are absent from persisted telemetry.
- [ ] A controlled replay test creates an incident and freezes only the matching active session.
- [ ] A normal authentication failure below threshold does not freeze unrelated sessions.
- [ ] A simulated Hatchable outage does not bypass Cloudflare rate limits or policy checks.
- [ ] Event forwarding uses bounded timeouts and asynchronous delivery; it never delays a user-facing security decision.
- [ ] Failed delivery is observable and retry/dead-letter behavior is tested without unbounded queue growth.
- [ ] Heartbeat freshness is measured; stale/missing heartbeat is displayed as `UNKNOWN` or `DEGRADED`, never falsely `HEALTHY`.
- [ ] Incident alerts reach an operator through a configured notification channel.
- [ ] Production telemetry is enabled only after the above checks pass.

## Initial detection thresholds

The first implementation uses heuristic thresholds: 8 authentication failures per source in 5 minutes; 5 invalid signatures per source in 2 minutes; 3 replay detections per source in 5 minutes; 15 access denials per source in 2 minutes; 30 rate-limit events per source in 1 minute; 10 origin errors per source in 5 minutes; 10 CSP violations per source in 5 minutes; 20 rejected inputs per source in 2 minutes; and 5 wallet-consent failures per source in 5 minutes. A verified `SESSION_COMPROMISE` event is treated as critical immediately.

These are starting heuristics, not proof of malicious intent. Tune them with measured baseline traffic, per-route behavior, false-positive analysis, and an operator-reviewed response policy. Avoid permanent bans based only on a single threshold.

## Runtime and 24/7 operations

No interactive terminal needs to remain open for the event-driven API or platform scheduler. However, this is not proof of a 24/7 uptime guarantee. Before calling the system always-on, verify platform availability, scheduled runner configuration, retry limits, task lease expiry, heartbeat intervals, database recovery, AI provider behavior, and alert delivery. The dashboard must distinguish deployment existence from current runtime health.

## Incident response

1. Preserve the incident record and relevant request IDs.
2. Check whether the event is a genuine attack, a misconfigured client, or a false positive.
3. Use Cloudflare-native rate limiting/WAF or the existing local kill switch for immediate enforcement; do not wait for AI analysis.
4. Revoke or freeze only the affected agent session when evidence supports it.
5. Keep transaction execution disabled until wallet/session state and exact-intent checks are revalidated.
6. Record containment, recovery, and false-positive findings for threshold tuning.

## Release rule

Do not claim live attack monitoring, automatic edge blocking, 24/7 uptime, or autonomous recovery until production Worker telemetry forwarding and the rollout checklist have been independently exercised. Do not merge or deploy changes that weaken the isolated signer boundary or allow an agent to approve its own actions.
