# Architecture

~~~text
Browser dashboard
  ├─ NEAR Wallet Selector (HOT Wallet / Testnet)
  │    └─ exposes connected account identity only
  ├─ POST /api/investigate
  │    ├─ validates account ID and amount
  │    ├─ reads NEAR account state from FastNear RPC
  │    ├─ checks verified threat registry entries in PostgreSQL
  │    ├─ runs deterministic policy engine
  │    └─ persists verdict and evidence
  ├─ POST /api/ai-review
  │    ├─ loads persisted investigation
  │    ├─ sends structured evidence to configured AI provider
  │    └─ stores explanation; cannot change verdict
  └─ GET /api/metrics and /api/threats

Managed PostgreSQL
  ├─ investigations
  └─ threat_reports
~~~

## Trust boundaries

1. Browser input is untrusted and validated server-side.
2. NEAR RPC data is external evidence; errors are recorded rather than treated as proof of maliciousness.
3. Community reports are untrusted until independently reviewed.
4. Only verified threat records trigger automatic BLOCK.
5. AI output is explanatory text, never policy authority.
6. The current product does not hold keys or submit transactions.

## Future transaction firewall

A future signing release must add an agent-side pre-sign wrapper and on-chain policy enforcement. A restricted NEAR function-call key can only call permitted contract methods and cannot directly transfer NEAR. Native payments therefore need a deliberately designed escrow/payment contract. An agent must never receive a human administrator's full-access key.