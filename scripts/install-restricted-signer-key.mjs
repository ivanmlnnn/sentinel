import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";

const RPC = "https://rpc.testnet.fastnear.com";
const accountId = String(process.env.NEAR_AGENT_SIGNER_ACCOUNT_ID || "").toLowerCase();
const contractId = String(process.env.NEAR_PAYMENT_CONTRACT_ID || "").toLowerCase();
const admin = process.env.NEAR_AGENT_SIGNER_ADMIN_PRIVATE_KEY;
const restricted = process.env.NEAR_AGENT_SIGNER_RESTRICTED_PRIVATE_KEY;

if (!/^[a-z0-9._-]{2,64}\.testnet$/.test(accountId) ||
    !/^[a-z0-9._-]{2,64}\.testnet$/.test(contractId) ||
    !admin || !restricted) {
  throw new Error("MISSING_OR_INVALID_SIGNER_KEY_SETUP_CONFIGURATION");
}

const adminSigner = KeyPairSigner.fromSecretKey(admin);
const restrictedSigner = KeyPairSigner.fromSecretKey(restricted);
const adminPublicKeyObject = await adminSigner.getPublicKey();
const restrictedPublicKeyObject = await restrictedSigner.getPublicKey();
const adminPublicKey = adminPublicKeyObject.toString();
const restrictedPublicKey = restrictedPublicKeyObject.toString();

if (adminPublicKey === restrictedPublicKey) {
  throw new Error("ADMIN_AND_RESTRICTED_KEYS_MUST_BE_DISTINCT");
}

async function rpc(method, params, id) {
  const response = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
  if (!response.ok) throw new Error("NEAR_RPC_HTTP_ERROR");
  const data = await response.json();
  if (data.error || !data.result) throw new Error("NEAR_RPC_RESULT_UNAVAILABLE");
  return data.result;
}

const before = await rpc("query", {
  request_type: "view_access_key_list", finality: "final", account_id: accountId
}, "sentinel-access-key-list-before");
const keys = Array.isArray(before.keys) ? before.keys : [];
const adminKey = keys.find(key => key.public_key === adminPublicKey);
if (adminKey?.access_key?.permission !== "FullAccess") {
  throw new Error("OFFLINE_ADMIN_FULL_ACCESS_KEY_NOT_FOUND");
}
if (keys.some(key => key.public_key === restrictedPublicKey)) {
  throw new Error("RESTRICTED_KEY_ALREADY_EXISTS");
}

const provider = new JsonRpcProvider({ url: RPC });
const account = new Account(accountId, provider);
const tx = await account.createTransaction({
  receiverId: accountId,
  actions: [
    actions.addFunctionCallAccessKey(
      restrictedPublicKeyObject,
      contractId,
      ["pay"],
      250_000_000_000_000_000_000_000n
    ),
  ],
  publicKey: adminPublicKey
});
const signed = await adminSigner.signTransaction(tx);
const outcome = await provider.sendTransaction(signed.signedTransaction);
const status = outcome?.status;
if (!status || !(Object.hasOwn(status, "SuccessValue") || Object.hasOwn(status, "SuccessReceiptId"))) {
  throw new Error("RESTRICTED_KEY_INSTALL_TRANSACTION_NOT_SUCCESSFUL");
}

const after = await rpc("query", {
  request_type: "view_access_key_list", finality: "final", account_id: accountId
}, "sentinel-access-key-list-after");
const installed = (after.keys || []).find(key => key.public_key === restrictedPublicKey);
const permission = installed?.access_key?.permission?.FunctionCall;
if (!permission ||
    permission.receiver_id !== contractId ||
    !Array.isArray(permission.method_names) ||
    permission.method_names.length !== 1 || permission.method_names[0] !== "pay" ||
    BigInt(permission.allowance || "0") !== 250_000_000_000_000_000_000_000n) {
  throw new Error("RESTRICTED_KEY_POSTCHECK_FAILED");
}

console.log(JSON.stringify({
  status: "RESTRICTED_FUNCTION_CALL_KEY_INSTALLED",
  transaction_hash: outcome.transaction?.hash || outcome.transaction_outcome?.id || null,
  signer_account: accountId,
  restricted_public_key: restrictedPublicKey,
  allowed_contract: permission.receiver_id,
  allowed_methods: permission.method_names,
  gas_allowance_yocto: String(permission.allowance),
  admin_full_access_key_preserved: true
}, null, 2));
