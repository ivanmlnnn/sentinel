import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";

const RPC = "https://rpc.testnet.fastnear.com";
const accountId = String(process.env.NEAR_AGENT_SIGNER_ACCOUNT_ID || "").toLowerCase();
const contractId = String(process.env.NEAR_PAYMENT_CONTRACT_ID || "").toLowerCase();
const admin = process.env.NEAR_AGENT_SIGNER_ADMIN_PRIVATE_KEY;
const oldRuntime = process.env.NEAR_AGENT_SIGNER_OLD_PRIVATE_KEY;
const restricted = process.env.NEAR_AGENT_SIGNER_RESTRICTED_PRIVATE_KEY;

if (!/^[a-z0-9._-]{2,64}\.testnet$/.test(accountId) ||
    !/^[a-z0-9._-]{2,64}\.testnet$/.test(contractId) ||
    !admin || !oldRuntime || !restricted) {
  throw new Error("MISSING_OR_INVALID_SIGNER_KEY_SETUP_CONFIGURATION");
}

const adminSigner = KeyPairSigner.fromSecretKey(admin);
const oldSigner = KeyPairSigner.fromSecretKey(oldRuntime);
const restrictedSigner = KeyPairSigner.fromSecretKey(restricted);
const adminPublicKey = adminSigner.getPublicKey().toString();
const oldPublicKey = oldSigner.getPublicKey().toString();
const restrictedPublicKey = restrictedSigner.getPublicKey().toString();

if (adminPublicKey === oldPublicKey || adminPublicKey === restrictedPublicKey ||
    oldPublicKey === restrictedPublicKey) {
  throw new Error("ADMIN_OLD_AND_RESTRICTED_KEYS_MUST_BE_DISTINCT");
}

const provider = new JsonRpcProvider({ url: RPC });
const account = new Account(accountId, provider);
const tx = await account.createTransaction({
  receiverId: accountId,
  actions: [
    actions.addFunctionCallAccessKey(
      restrictedSigner.getPublicKey(),
      contractId,
      ["pay"],
      250_000_000_000_000_000_000_000n
    ),
    actions.deleteKey(oldSigner.getPublicKey())
  ],
  publicKey: adminSigner.getPublicKey()
});
const signed = await adminSigner.signTransaction(tx);
const outcome = await provider.sendTransaction(signed.signedTransaction);
const status = outcome?.status;
if (!status || !(Object.hasOwn(status, "SuccessValue") || Object.hasOwn(status, "SuccessReceiptId"))) {
  throw new Error("RESTRICTED_KEY_INSTALL_TRANSACTION_NOT_SUCCESSFUL");
}

const check = await fetch(RPC, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0", id: "sentinel-restricted-key-postcheck", method: "query",
    params: { request_type: "view_access_key", finality: "final", account_id: accountId, public_key: restrictedPublicKey }
  })
});
if (!check.ok) throw new Error("RESTRICTED_KEY_POSTCHECK_RPC_FAILED");
const data = await check.json();
const permission = data.result?.permission?.FunctionCall;
if (data.error || permission?.receiver_id !== contractId ||
    !Array.isArray(permission.method_names) ||
    permission.method_names.length !== 1 || permission.method_names[0] !== "pay") {
  throw new Error("RESTRICTED_KEY_POSTCHECK_FAILED");
}

console.log(JSON.stringify({
  status: "RESTRICTED_FUNCTION_CALL_KEY_INSTALLED",
  transaction_hash: outcome.transaction?.hash || outcome.transaction_outcome?.id || null,
  signer_account: accountId,
  restricted_public_key: restrictedPublicKey,
  allowed_contract: permission.receiver_id,
  allowed_methods: permission.method_names,
  removed_old_runtime_key: oldPublicKey
}, null, 2));
