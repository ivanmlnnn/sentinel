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
