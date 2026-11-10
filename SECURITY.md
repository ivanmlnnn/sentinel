# Security Policy

## Supported deployment

The public repository contains browser code and deployment configuration. It must never contain API keys, bearer tokens, webhook secrets, wallet private keys, seed phrases, local environment files, or production data exports.

## Reporting a vulnerability

Please do not publish exploit details, credentials, personal data, or a working attack against the live deployment in a public issue. Use GitHub's private vulnerability reporting / Security Advisory flow for this repository when available. Include the affected commit, impact, safe reproduction steps, and a suggested mitigation. Do not include real wallet secrets or user data.

## Response expectations

Reports are triaged by severity and reproducibility. A fix is not considered verified until a regression test is added and the exact patched commit passes CI. No bounty or response-time SLA is promised.

## Authorized testing only

Burp Suite, scanners, fuzzers, and manual penetration tests must be limited to a deployment and accounts controlled by the tester or explicitly authorized by the owner. Do not test production payment execution with real funds.
