import { readFile } from "node:fs/promises";
import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";

const RPC = "https://rpc.testnet.fastnear.com";
const contractId = String(process.env.NEAR_PAYMENT_CONTRACT_ID || "").toLowerCase();
const signerAccountId = String(process.env.NEAR_AGENT_SIGNER_ACCOUNT_ID || "").toLowerCase();
const ownerId = String(process.env.NEAR_PAYMENT_CONTRACT_OWNER_ID || "").toLowerCase();
const privateKey = process.env.NEAR_PAYMENT_CONTRACT_DEPLOYER_PRIVATE_KEY;
const maxPaymentYocto = String(process.env.NEAR_PAYMENT_MAX_PAYMENT_YOCTO || "");
const maxDailyPaymentYocto = String(process.env.NEAR_PAYMENT_MAX_DAILY_PAYMENT_YOCTO || "");

if (!/^[a-z0-9._-]{2,64}\.testnet$/.test(contractId) ||
    !/^[a-z0-9._-]{2,64}\.testnet$/.test(signerAccountId) ||
    !/^[a-z0-9._-]{2,64}\.testnet$/.test(ownerId) ||
    !privateKey || !/^[1-9][0-9]*$/.test(maxPaymentYocto) ||
    !/^[1-9][0-9]*$/.test(maxDailyPaymentYocto) ||
    BigInt(maxDailyPaymentYocto) < BigInt(maxPaymentYocto)) {
  throw new Error("MISSING_OR_INVALID_PAYMENT_CONTRACT_DEPLOY_CONFIG");
}

const signer = KeyPairSigner.fromSecretKey(privateKey);
const provider = new JsonRpcProvider({ url: RPC });
const account = new Account(contractId, provider);
const wasm = new Uint8Array(await readFile(
  "payment-contract/target/wasm32-unknown-unknown/release/sentinel_payment_contract.wasm"
));
const initArgs = new TextEncoder().encode(JSON.stringify({
  owner_id: ownerId,
  signer_id: signerAccountId,
  max_payment_yocto: maxPaymentYocto,
  max_daily_payment_yocto: maxDailyPaymentYocto
}));
const tx = await account.createTransaction({
  receiverId: contractId,
  actions: [
    actions.deployContract(wasm),
    actions.functionCall("new", initArgs, 100_000_000_000_000n, 0n)
  ],
  publicKey: signer.getPublicKey()
});
const signed = await signer.signTransaction(tx);
const outcome = await provider.sendTransaction(signed.signedTransaction);
const status = outcome?.status;
if (!status || !(Object.hasOwn(status, "SuccessValue") || Object.hasOwn(status, "SuccessReceiptId"))) {
  throw new Error("PAYMENT_CONTRACT_DEPLOY_OR_INITIALIZATION_FAILED");
}
console.log(JSON.stringify({
  status: "PAYMENT_CONTRACT_DEPLOYED_AND_INITIALIZED",
  network: "testnet",
  contract_id: contractId,
  owner_id: ownerId,
  signer_id: signerAccountId,
  max_payment_yocto: maxPaymentYocto,
  max_daily_payment_yocto: maxDailyPaymentYocto,
  transaction_hash: outcome.transaction?.hash || outcome.transaction_outcome?.id || null,
  explorer_url: "https://testnet.nearblocks.io/txns/" + (outcome.transaction?.hash || outcome.transaction_outcome?.id || "")
}, null, 2));
