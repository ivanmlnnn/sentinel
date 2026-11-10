# Sentinel Payment Contract

This contract is the native-NEAR payment boundary required by the restricted function-call signer design.

- The contract account holds the NEAR used for payouts.
- Only the configured Sentinel signer account may call `pay`.
- The signer access key is scoped on-chain to this contract and the `pay` method.
- Each approval ID is one-time.
- Per-payment and UTC-day amounts are capped on-chain.
- The owner can pause payments and change the per-payment cap.

The contract must be deployed and initialized on NEAR Testnet before enabling the Signer Worker. Fund the contract account with a small, controlled Testnet balance. Keep the contract owner/deployer key separate from the restricted runtime signer key.

Build:

```bash
rustup target add wasm32-unknown-unknown
cargo build --manifest-path payment-contract/Cargo.toml --target wasm32-unknown-unknown --release
```

The resulting Wasm is `payment-contract/target/wasm32-unknown-unknown/release/sentinel_payment_contract.wasm`.

Initialization requires both `max_payment_yocto` and `max_daily_payment_yocto`. Keep them at or below Sentinel's 0.1 NEAR per-payment and 0.2 NEAR per-day hard limits.

**Important:** this source does not itself prove that a contract is deployed. Record the deployed contract account, code hash, initialization result, and Testnet Explorer links before enabling payments.
