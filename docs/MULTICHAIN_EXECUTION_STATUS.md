# Sentinel — Multi-chain Swap Architecture

> **Project:** Sentinel  
> **Branch:** `feature/sentinel-trading-core-lab`  
> **Status:** Active Testnet development  
>
> This document presents the architecture and current implementation scope of Sentinel's user-approved swap workflow.

## Overview

Sentinel is a security-first, AI-assisted swap interface designed to help users review cross-chain routes before authorizing a transaction in their own wallet.

The workflow combines provider-backed Testnet quotes, deterministic validation, two independent AI reviewers, explicit wallet confirmation, and settlement tracking. The user remains in control of every wallet signature and transaction.

## Swap lifecycle

1. **Discover assets** — retrieve the Tidepool Testnet asset registry and resolve the selected origin and destination assets.
2. **Preview route** — request a dry quote to display the proposed route without signing or transferring funds.
3. **Review live quote** — when the user chooses Approve, obtain a fresh provider-signed quote and validate its amount, direction, assets, recipient, refund address, expiry, and risk policy.
4. **Independent review** — Agent 1 evaluates user intent and route consistency. Agent 2 independently challenges the quote, signature evidence, recipient, refund address, expiry, slippage, and deterministic risk checks.
5. **Wallet authorization** — present the transaction or signing request to the user's connected wallet only when both agents approve, Agent 2 reports LOW risk, and all deterministic checks pass.
6. **Track settlement** — submit the user-authorized operation to the provider workflow and monitor its status until a terminal result is reported.

A review approval is permission to present the wallet confirmation step; it is not permission for Sentinel to sign or trade automatically. A swap is reported as completed only when the provider reports `SUCCESS`.

## Security architecture

- **Two-agent review:** independent intent/route and quote/risk assessments.
- **Deterministic validation:** exact asset identity, swap direction, amount, recipient, refund address, quote signature, expiry, and risk-policy checks.
- **Fail-closed behavior:** a veto, missing evidence, malformed review, unavailable reviewer, or failed deterministic check prevents wallet authorization.
- **Explicit user consent:** wallet signatures and transactions require the user's direct confirmation.
- **Settlement-aware status:** pending operations remain pending until the provider reports a terminal state.
- **No autonomous execution:** the review boundary keeps `execution_authorized: false`.

## Asset identity

Native **NEAR** and **WNEAR** are distinct assets. Sentinel preserves their separate identities in asset selection, route construction, quote validation, and wallet review.

A native NEAR request must not be silently substituted with WNEAR. A route involving WNEAR is valid only when WNEAR is explicitly selected or when a separately described and verified wrap/unwrap operation is part of the user's confirmed route. Origin and destination direction must match the user's request exactly.

## Current implementation scope

| Component | Implementation |
|---|---|
| Tidepool Testnet asset discovery | Implemented on the feature branch |
| Dry route quote | Implemented on the feature branch |
| Fresh signed live quote | Implemented on the feature branch |
| Dual-agent review | Implemented on the feature branch |
| Deterministic approval gate | Implemented on the feature branch |
| NEAR wallet integration | NEAR Connect / Meteor Testnet code path |
| EVM wallet integration | EIP-1193 Testnet code path |
| Provider submission and status tracking | Implemented code path |
| Mainnet and autonomous trading | Not enabled |

The NEAR and EVM wallet paths are being validated against real wallet sessions and provider settlement. The feature-branch implementation should not be interpreted as a production-release certification.

## Supported development workflow

### NEAR Testnet

The NEAR integration uses the connected wallet for account verification, signing, and transaction confirmation. The selected asset, wallet account, quote, deposit details, and transaction parameters are checked before submission.

Native NEAR and WNEAR remain separate selections. Any conversion between them must be explicit and represented in the route.

### EVM Testnets

The EVM integration uses the wallet's EIP-1193 provider. It verifies the connected account and chain, checks token contract code where applicable, and asks the wallet to confirm the exact deposit transaction.

### Additional networks

The architecture is designed to accommodate additional chain-specific wallet adapters. Each adapter requires its own transaction construction, signing, address and memo/tag handling where relevant, verification logic, and automated tests before it can be presented as supported.

## Quality and acceptance process

Sentinel's release validation is based on reproducible evidence tied to a specific commit:

- Automated repository tests and CI results.
- Exact user prompt, asset symbols, provider asset IDs, and route direction.
- Live quote signature, expiry, and amount/recipient binding.
- Agent 1 and Agent 2 decisions plus deterministic check results.
- Wallet account, network, user confirmation, and transaction reference.
- Provider settlement result and destination-side transaction evidence.

The project distinguishes implementation, wallet acceptance, and completed settlement as separate milestones. This keeps demonstrations and project reporting precise and verifiable.

## Project boundary

Sentinel is a Testnet research and development project. This document does not claim production readiness, mainnet availability, autonomous trading, or guaranteed financial outcomes.
