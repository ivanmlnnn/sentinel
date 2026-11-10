import { readFile } from "node:fs/promises";
import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";

const RPC = "https://rpc.testnet.fastnear.com";
const contractId = String(process.env.NEAR_PAYMENT_CONTRACT_ID || "").toLowerCase();
const signerAccountId = String(process.env.NEAR_AGENT_SIGNER_ACCOUNT_ID || "freshnook5462.testnet").toLowerCase();
const ownerId = String(process.env.NEAR_PAYMENT_CONTRACT_OWNER_ID || contractId).toLowerCase();
const privateKey = process.env.NEAR_PAYMENT_CONTRACT_DEPLOYER_PRIVATE_KEY;
const maxPaymentYocto = String(process.env.NEAR_PAYMENT_MAX_PAYMENT_YOCTO || "100000000000000000000000");
const maxDailyPaymentYocto = String(process.env.NEAR_PAYMENT_MAX_DAILY_PAYMENT_YOCTO || "200000000000000000000000");

const invalidConfig = [];
if (!/^[a-z0-9._-]{2,64}\.testnet$/.test(contractId)) invalidConfig.push("NEAR_PAYMENT_CONTRACT_ID");
if (!/^[a-z0-9._-]{2,64}\.testnet$/.test(signerAccountId)) invalidConfig.push("NEAR_AGENT_SIGNER_ACCOUNT_ID");
if (!/^[a-z0-9._-]{2,64}\.testnet$/.test(ownerId)) invalidConfig.push("NEAR_PAYMENT_CONTRACT_OWNER_ID");
if (!privateKey) invalidConfig.push("NEAR_PAYMENT_CONTRACT_DEPLOYER_PRIVATE_KEY");
if (!/^[1-9][0-9]*$/.test(maxPaymentYocto) ||
    ( /^[1-9][0-9]*$/.test(maxPaymentYocto) && BigInt(maxPaymentYocto) > 100_000_000_000_000_000_000_000n)) {
  invalidConfig.push("NEAR_PAYMENT_MAX_PAYMENT_YOCTO");
}
if (!/^[1-9][0-9]*$/.test(maxDailyPaymentYocto) ||
    ( /^[1-9][0-9]*$/.test(maxDailyPaymentYocto) &&
      BigInt(maxDailyPaymentYocto) > 200_000_000_000_000_000_000_000n) ||
    (/^[1-9][0-9]*$/.test(maxDailyPaymentYocto) &&
      /^[1-9][0-9]*$/.test(maxPaymentYocto) &&
      BigInt(maxDailyPaymentYocto) < BigInt(maxPaymentYocto))) {
  invalidConfig.push("NEAR_PAYMENT_MAX_DAILY_PAYMENT_YOCTO");
}
if (invalidConfig.length) {
  throw new Error("MISSING_OR_INVALID_PAYMENT_CONTRACT_DEPLOY_CONFIG: " + invalidConfig.join(", "));
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
  publicKey: (await signer.getPublicKey()).toString()
});
const signed = await signer.signTransaction(tx);
const outcome = await provider.sendTransaction(signed.signedTransaction);
const status = outcome?.status;
if (!status || !(Object.hasOwn(status, "SuccessValue") || Object.hasOwn(status, "SuccessReceiptId"))) {
  throw new Error("PAYMENT_CONTRACT_DEPLOY_OR_INITIALIZATION_FAILED");
}
const transactionHash = outcome.transaction?.hash || outcome.transaction_outcome?.id || null;
console.log(JSON.stringify({
  status: "PAYMENT_CONTRACT_DEPLOYED_AND_INITIALIZED",
  network: "testnet",
  transaction_hash: transactionHash,
  explorer_url: transactionHash ? "https://testnet.nearblocks.io/txns/" + transactionHash : null
}, null, 2));
