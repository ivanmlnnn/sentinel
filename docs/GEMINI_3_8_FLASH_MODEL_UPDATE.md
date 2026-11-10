# Gemini 3.8 Flash model update

Updated: 11 November 2026

## Change

Sentinel's shared Gemini adapter now defaults to `gemini-3.8-flash` instead of `gemini-2.5-flash`. The optional `GEMINI_MODEL` Worker variable continues to override the default.

The existing Gemini `generateContent` endpoint is retained for this focused compatibility update. Google's current model documentation lists Gemini 3.8 Flash as supporting GenerateContent and Interactions APIs. This change does not alter tool-call normalization, route contracts, API-key handling, or Sentinel's authorization/payment security boundaries.

## Runtime configuration

- Keep the existing `GEMINI_API_KEY` secret on the Cloudflare Main Worker (`sentinel`).
- No new API key, Google project, or Signer Worker secret is required.
- If `GEMINI_MODEL` is configured on the Main Worker, set it to `gemini-3.8-flash` or remove it to use the code default.
- Do not expose or commit the API key.

## Verification scope

The regression suite includes a mocked request assertion that the default endpoint targets `models/gemini-3.8-flash:generateContent`. This verifies model selection in code; it does not prove the production API key, quota, or live model response. A live authenticated Agent, Guest Agent, and AI Review smoke test remains the release acceptance check.

## References

- [Gemini 3.8 Flash model documentation](https://ai.google.dev/gemini-api/docs/latest-model)
- [Gemini Interactions API overview](https://ai.google.dev/gemini-api/docs/interactions-overview)

## Capacity fallback

The shared adapter retries transient provider failures and, after persistent HTTP 503 capacity overload on the primary model, makes one bounded request using `GEMINI_FALLBACK_MODEL` or the default `gemini-3.5-flash-lite`. This fallback is deliberately not used for HTTP 429 because that commonly indicates project quota exhaustion; switching model names does not reliably repair exhausted project quota. Authentication and model-not-found errors are not retried as capacity failures.

The fallback path is covered by a mocked regression test. It verifies request routing and response recovery under a simulated 503; it does not establish that Google's live fallback capacity is always available. Live production verification must confirm a successful agent response with the deployed Worker and configured API key.
