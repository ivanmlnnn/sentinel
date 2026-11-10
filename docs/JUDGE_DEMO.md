# NEAR HACKATHON — Sentinel Judge Demo

## One-line pitch

**NEAR Sentinel is a pre-sign security checkpoint for AI agents: it checks a NEAR payment destination with on-chain evidence, requires human approval of the exact intent, and isolates the Testnet signing key from the application Worker.**

## Track positioning

Primary track: **AI Security & Defense**. The official track explicitly calls for spending limits, policy engines, sandboxed wallets, reputation, and scam detection. Sentinel's core contribution is a pre-sign policy checkpoint that treats AI output as untrusted, evaluates on-chain evidence, requires exact-intent human approval, and isolates a Testnet signer. Do not position Open Innovation as the primary track, and do not claim a complete autonomous business or NEAR Intents integration.

## 2:45 demo sequence

Record the real browser and working application. The public URL is the scanner entry point. The maintainer reports manually deploying both Main and Signer Workers; before recording the Agent Lab as live, confirm the active Cloudflare Worker versions, service binding, secrets, remote D1 migration state, and a successful smoke test. A source branch or Wrangler dry-run alone is not deployment proof. Keep the recording concise; do not use slides as a substitute for the working product.

| Time | What the judge sees | What to say |
|---|---|---|
| 0:00–0:20 | Dashboard landing page | “AI agents can propose payments faster than people can inspect destinations. Sentinel adds an evidence-based checkpoint before value moves.” |
| 0:20–0:55 | Complete the visible Cloudflare Turnstile challenge, enter a public NEAR Testnet account, and run Wallet Tracker | “This is read-only. Cloudflare verifies this browser challenge server-side before Sentinel queries NEAR account state and indexed transaction, receipt, and token-transfer evidence.” |
| 0:55–1:20 | Expand verdict and evidence | “ALLOW is not a guarantee. WARN, BLOCK, and INCOMPLETE have distinct meanings; missing evidence is never described as safe.” |
| 1:20–1:50 | Sign in and use Agent Lab with a small proposal | “Anthropic can propose one payment. Its output is untrusted and cannot authorize a transfer.” |
| 1:50–2:15 | Show exact receiver/amount approval prompt | “The user must approve this exact destination and amount. The proposal expires after five minutes and cannot be reused.” |
| 2:15–2:35 | Show signer architecture and the latest CI evidence | “The main Worker does not hold the NEAR key. A separate private Worker verifies NEP-413 approval, repeats policy checks, enforces caps, replay protection, and a kill switch.” |
| 2:35–2:45 | Show verified explorer transaction only if available | “This hash is shown only after the Testnet transaction is independently confirmed.” |

### If the live signer flow or transfer cannot be independently verified

Stop the demo at the approval screen and show the fail-closed response. Say clearly: **“The source and automated tests validate the signer controls, but I am not presenting an unverified deployment or transaction as live.”** Never display a mock hash or imply a simulated transaction is real.

## Judge test cases

Prepare these short cases after the corresponding branch deployment and show the observed result, not an expected result you have not run:

1. Valid receiver with complete evidence and no verified threat: policy may return `ALLOW`; user approval is still required.
2. Verified threat match: `BLOCK`; no signer invocation.
3. Suspicious behavior: `WARN`; no signer invocation.
4. Missing evidence or provider outage: `INCOMPLETE`; no signer invocation.
5. Receiver changed after proposal: reject exact-intent mismatch.
6. Reuse an approval ID: reject because approval is one-time.
7. Stale or replayed internal signer request: reject.
8. Kill switch enabled: signer denies.

## Latest reproducible CI evidence

The exact PR head [67f1e53](https://github.com/ivanmlnnn/sentinel/commit/67f1e53c67fa8706d79694a317311516289b56d6) passed [116/116 automated tests](https://github.com/ivanmlnnn/sentinel/actions/runs/42778335809), Gitleaks scans, both Wrangler dry-runs, D1 migration validation, and the offline prompt-injection regression. [CodeQL analysis](https://github.com/ivanmlnnn/sentinel/actions/runs/42778335865) also completed successfully. This does not prove the live deployment, live CAPTCHA browser interaction, or a completed signer transaction.

## Judge questions and concise answers

**Does the LLM decide whether a wallet is safe?**  
No. Anthropic proposes a structured intent. Sentinel applies deterministic rules to verified evidence. The signer repeats the investigation and policy checks.

**Can prompt injection make the agent transfer funds?**  
A prompt can influence the proposal, but cannot bypass the allowlist, evidence checks, actor-bound one-time approval, signer limits, or kill switch.

**Where is the private key?**  
Only in the separate signer Worker secret store. The main app Worker has no signing key and no in-process signing fallback.

**Does ALLOW mean safe?**  
No. It means the configured checks completed without a verified blocking signal. It is a risk screen, not a guarantee.

**Is the live transaction proven?**  
Answer only from the explorer and D1 evidence. If no real hash is verified, say the signer remains gated.

**What existed before the hackathon?**  
The repository has pre-existing history and assets. The README and provenance document identify this honestly; the submission does not claim the whole project was created during the event.

## Submission checklist

The current official NEAR Hackathon page says the final submission must include a public repository and a public X demo post. The post must say the project was built at NEAR HACKATHON, tag `@NEARProtocol`, use `#NEARHackathon`, and attach a demo video or screenshots. Submit both the repository URL and demo-post URL before **14 November 2026, 23:59 UTC**.

- [ ] Public repository: https://github.com/ivanmlnnn/sentinel
- [ ] Public live dashboard: https://sentinel.ivmaladin.workers.dev
- [ ] Public X post includes “Built at NEAR HACKATHON”, `@NEARProtocol`, and `#NEARHackathon`
- [ ] Attach a clear product demo video or screenshots
- [ ] README explains how to run, architecture, limits, and known gaps
- [ ] CI and CodeQL are green on the exact submitted commit
- [ ] Record both Cloudflare Worker versions, D1 remote migration status, and production smoke-test output
- [ ] Capture a live Turnstile challenge and a controlled NEAR wallet approval/transaction if enabled
- [ ] No secrets, private keys, tokens, or personal wallet recovery data in Git history
- [ ] Submission form contains both repository and X post links
- [ ] Keep the PR and provenance disclosure transparent

## Suggested X post

> Built at **NEAR HACKATHON**: **NEAR Sentinel** — a pre-sign security checkpoint for AI agents on NEAR.
>
> AI proposes. Sentinel checks on-chain evidence. A human approves the exact payment intent. A separate Testnet signer enforces the final limits.
>
> Live demo + open source: https://sentinel.ivmaladin.workers.dev  
> Repo: https://github.com/ivanmlnnn/sentinel
>
> @NEARProtocol #NEARHackathon

Publish only after attaching a real screen recording or screenshots. Do not claim a live signer transfer unless its hash has been independently verified.
