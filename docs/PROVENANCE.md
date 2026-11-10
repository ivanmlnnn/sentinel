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
  - [1cbc598](https://github.com/ivanmlnnn/sentinel/commit/1cbc598f44c6a71c9b2d4bf1bab7619e4d983f00) — restricted the public threat feed to verified reports.

## Signature status

GitHub's commit API currently reports these commits as unsigned (verification.verified = false, reason = unsigned). The visible commit graph and timestamps are useful audit evidence, but they are not cryptographic proof of the author's identity or of when the work was first created. Do not describe these commits as GPG/SSH-signed or Verified commits.

For stronger author-identity evidence, the repository owner should configure their own GitHub-supported SSH or GPG signing key and sign future commits. Existing unsigned commits cannot be retroactively turned into signed commits without rewriting history, which would be inappropriate for an active hackathon audit trail.

## Automated checks and deployment

- Current feature branch: `feat/isolated-signer-worker`.
- Current reviewed source revision: [`31a71a4`](https://github.com/ivanmlnnn/sentinel/commit/31a71a44964bffdb990bc7072ad86168b6072002).
- [Sentinel Security CI run 42857959405](https://github.com/ivanmlnnn/sentinel/actions/runs/42857959405) completed successfully on that exact commit. Its steps include Gitleaks, JavaScript syntax checks, regression tests, and D1 migration validation.
- [CodeQL run 42857959683](https://github.com/ivanmlnnn/sentinel/actions/runs/42857959683) completed successfully on the same commit. Workflow success does not mean there are no code-scanning alerts; inspect the Security tab for findings.
- These are source-verification results only. They do not deploy Cloudflare Workers, apply remote D1 migrations, or prove a live NEAR transaction.
- Release deployment is manual through [Actions → Deploy Sentinel Testnet](https://github.com/ivanmlnnn/sentinel/actions/workflows/deploy-testnet.yml). Select `feat/isolated-signer-worker`, choose the intended target, and enter exactly `DEPLOY_SENTINEL_TESTNET`. The deploy job is gated on the verify job and the GitHub `production` environment.
- For a full deployment, select `both`; the workflow applies the Main and Signer D1 migrations, deploys the private Signer Worker before the Main Worker, then runs production smoke checks. Payment-contract deployment and restricted-key installation are separate, explicit targets/steps.
- A successful CI run or Wrangler dry-run is not deployment evidence. Always inspect the deployment job and production smoke-test result for the exact SHA before calling a revision live.
- The branch's latest browser-navigation cleanup removes query strings from ordinary HTML page navigations, but excludes API and authentication/callback paths. It does not rewrite arbitrary query strings used by application protocols.
- The older CI runs listed in the previous version of this document remain historical evidence for their respective commits only.

## License

The repository contains the MIT License in the root LICENSE file.