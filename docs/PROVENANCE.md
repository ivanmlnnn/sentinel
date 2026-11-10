# Sentinel source and build provenance

This page is an evidence index for reviewers. It separates repository history, automated checks, deployment evidence, and cryptographic authorship claims.

## Repository history

- Canonical repository: https://github.com/ivanmlnnn/sentinel
- Main branch commit history: https://github.com/ivanmlnnn/sentinel/commits/main/
- The repository already contained earlier work before the November 2026 hackathon window. The project does not claim that every file or line was created during the event.
- Example commits recorded on 10 November 2026:
  - [2e5b411](https://github.com/ivanmlnnn/sentinel/commit/2e5b4110386bea68d42a11da0c06972da3261665) — fixed the 3D mascot mount crash.
  - [e19d4bd](https://github.com/ivanmlnnn/sentinel/commit/e19d4bddc101ac157f31fcb428c8e910db48a804) — added server-side API rate-limit enforcement.
  - [2ca0110](https://github.com/ivanmlnnn/sentinel/commit/2ca0110c508e77759953f89b0e3a633226385d14) — configured Cloudflare rate-limit bindings.
  - [6a19bd4](https://github.com/ivanmlnnn/sentinel/commit/6a19bd4863db10891cc322fc4a19ec2ee2472c18) — required Privy verification for the authenticated investigation route.
  - [3424edc](https://github.com/ivanmlnnn/sentinel/commit/3424edc17b817ed3430c1c758109e88e5cd3fc43) — separated authenticated and Guest investigation routes.
  - [c4337c3](https://github.com/ivanmlnnn/sentinel/commit/c4337c3ba70dc161744a668929f6111729cbd1af) — removed an obsolete unauthenticated Hatchable AI-review endpoint.

## Signature status

GitHub's commit API currently reports these commits as unsigned (verification.verified = false, reason = unsigned). The visible commit graph and timestamps are useful audit evidence, but they are not cryptographic proof of the author's identity or of when the work was first created. Do not describe these commits as GPG/SSH-signed or Verified commits.

For stronger author-identity evidence, the repository owner should configure their own GitHub-supported SSH or GPG signing key and sign future commits. Existing unsigned commits cannot be retroactively turned into signed commits without rewriting history, which would be inappropriate for an active hackathon audit trail.

## Automated checks and deployment

- CI checks: https://github.com/ivanmlnnn/sentinel/actions/workflows/sentinel-checks.yml
- Cloudflare deployment workflow: https://github.com/ivanmlnnn/sentinel/actions/workflows/deploy-cloudflare.yml
- On pushes to main, CI packages the exact commit with git archive, uploads the source snapshot, and creates a GitHub build-provenance attestation. After the workflow completes, download the artifact and verify it with `gh attestation verify sentinel-source.tar.gz --repo ivanmlnnn/sentinel`. This attestation proves the archive was produced by the named GitHub workflow from the stated source revision; it does not prove who authored each commit.
- A green test run proves the checked code passed the configured tests; it does not prove a real NEAR transaction or a browser-only flow works.
- A successful Worker deployment proves that Cloudflare accepted the deployment; it does not prove the UI was visually inspected or that a cryptographic signer boundary exists.

## License

The repository contains the MIT License in the root LICENSE file.