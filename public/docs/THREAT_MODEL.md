# Threat Model

## Assets

- User wallet identity and transaction intent.
- Integrity of risk decisions and threat registry.
- Availability and integrity of investigation history.
- AI provider credentials and project configuration.

## Threats and mitigations

| Threat | Current mitigation | Remaining gap |
|---|---|---|
| Malformed receiver input | Strict account ID validation | Expand protocol-specific validation tests |
| Fake malicious report | Public reports are stored as unverified | Build authenticated reviewer workflow |
| Prompt injection in evidence | AI receives structured evidence; static system instruction; verdict is deterministic | Add adversarial prompt test suite |
| AI hallucination | Explicitly prohibit unsupported claims; evidence is serialized from DB | Human review still required |
| RPC outage | WARN/fail-uncertain behavior and error evidence | Add multi-provider fallback |
| Contract code changes | Store current code hash snapshot | Historical snapshot service not implemented |
| Unauthorized signing | No signing functionality exists in this MVP | Pre-sign wrapper and contract policy not yet implemented |
| Key compromise | No private keys stored or handled by backend | Wallet signing architecture requires separate audit |

## Security invariants

- AI cannot override ALLOW/WARN/BLOCK.
- Unverified reports cannot trigger BLOCK.
- No transaction is signed or broadcast by this release.
- No full-access private key is stored by the application.
- Missing or ambiguous evidence must not be described as proof of safety.