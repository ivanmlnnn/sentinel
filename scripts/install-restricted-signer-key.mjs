import { Account, JsonRpcProvider, KeyPairSigner, PublicKey, actions } from "near-api-js";

const RPC = "https://rpc.testnet.fastnear.com";
const accountId = String(process.env.NEAR_AGENT_SIGNER_ACCOUNT_ID || "").toLowerCase();
const contractId = String(process.env.NEAR_PAYMENT_CONTRACT_ID || "").toLowerCase();
const admin = process.env.NEAR_AGENT_SIGNER_ADMIN_PRIVATE_KEY;
const restricted = process.env.NEAR_AGENT_SIGNER_RESTRICTED_PRIVATE_KEY;
const EXPECTED_ALLOWANCE = 250_000_000_000_000_000_000_000n;

const missingOrInvalid = [];
if (!/^[a-z0-9._-]{2,64}\.testnet$/.test(accountId)) missingOrInvalid.push("NEAR_AGENT_SIGNER_ACCOUNT_ID");
if (!/^[a-z0-9._-]{2,64}\.testnet$/.test(contractId)) missingOrInvalid.push("NEAR_PAYMENT_CONTRACT_ID");
if (!admin) missingOrInvalid.push("NEAR_AGENT_SIGNER_ADMIN_PRIVATE_KEY");
if (!restricted) missingOrInvalid.push("NEAR_AGENT_SIGNER_RESTRICTED_PRIVATE_KEY");
if (missingOrInvalid.length) {
  throw new Error("MISSING_OR_INVALID_SIGNER_CONFIG: " + missingOrInvalid.join(", "));
}

const adminSigner = KeyPairSigner.fromSecretKey(admin);
const restrictedSigner = KeyPairSigner.fromSecretKey(restricted);
const adminPublicKey = (await adminSigner.getPublicKey()).toString();
const restrictedPublicKeyObject = await restrictedSigner.getPublicKey();
const restrictedPublicKey = restrictedPublicKeyObject.toString();

if (adminPublicKey === restrictedPublicKey) {
  throw new Error("ADMIN_AND_RESTRICTED_KEYS_MUST_BE_DISTINCT");
}

async function rpc(method, params, id) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
  if (!response.ok) throw new Error("NEAR_RPC_HTTP_ERROR");
  const data = await response.json();
  if (data.error || !data.result) throw new Error("NEAR_RPC_RESULT_UNAVAILABLE");
  return data.result;
}

function getFunctionCallPermission(key) {
  const permission = key?.access_key?.permission;
  if (!permission || permission === "FullAccess") return null;
  return permission.FunctionCall || permission.function_call || null;
}

function matchesExpectedPermission(key) {
  const permission = getFunctionCallPermission(key);
  if (!permission) return false;
  let allowance;
  try {
    allowance = BigInt(permission.allowance ?? "0");
  } catch {
    return false;
  }
  const methods = Array.isArray(permission.method_names) ? permission.method_names : [];
  return String(permission.receiver_id || "").toLowerCase() === contractId &&
    methods.length === 1 &&
    methods[0] === "pay" &&
    allowance === EXPECTED_ALLOWANCE;
}

function safePermissionSummary(key) {
  const permission = getFunctionCallPermission(key);
  return {
    access: permission ? "FUNCTION_CALL" : key?.access_key?.permission === "FullAccess" ? "FULL_ACCESS" : "UNKNOWN",
    receiver_id: permission?.receiver_id || null,
    method_names: Array.isArray(permission?.method_names) ? permission.method_names : [],
    allowance: permission?.allowance == null ? null : String(permission.allowance)
  };
}

async function getAccessKeys(label) {
  const result = await rpc("query", {
    request_type: "view_access_key_list",
    finality: "final",
    account_id: accountId
  }, label);
  return Array.isArray(result.keys) ? result.keys : [];
}

const beforeKeys = await getAccessKeys("sentinel-access-key-list-before");
const adminKey = beforeKeys.find(key => key.public_key === adminPublicKey);
if (adminKey?.access_key?.permission !== "FullAccess") {
  throw new Error("OFFLINE_ADMIN_FULL_ACCESS_KEY_NOT_FOUND");
}

const existingRestrictedKey = beforeKeys.find(key => key.public_key === restrictedPublicKey);
if (existingRestrictedKey && !matchesExpectedPermission(existingRestrictedKey)) {
  throw new Error("RESTRICTED_KEY_EXISTS_WITH_UNEXPECTED_PERMISSION");
}

const fullAccessKeys = beforeKeys.filter(key => key?.access_key?.permission === "FullAccess");
const otherFullAccessKeys = fullAccessKeys.filter(key => key.public_key !== adminPublicKey);
if (otherFullAccessKeys.length > 1 || (!existingRestrictedKey && otherFullAccessKeys.length !== 1)) {
  throw new Error("AMBIGUOUS_FULL_ACCESS_KEY_SET: expected the offline admin key and exactly one old runtime key before first rotation");
}

const provider = new JsonRpcProvider({ url: RPC });
const account = new Account(accountId, provider);
let installTransactionHash = null;

if (!existingRestrictedKey) {
  const installTx = await account.createTransaction({
    receiverId: accountId,
    actions: [
      actions.addFunctionCallAccessKey(
        restrictedPublicKeyObject,
        contractId,
        ["pay"],
        EXPECTED_ALLOWANCE
      ),
    ],
    publicKey: adminPublicKey
  });
  const signedInstall = await adminSigner.signTransaction(installTx);
  const installOutcome = await provider.sendTransaction(signedInstall.signedTransaction);
  const installStatus = installOutcome?.status;
  if (!installStatus || !(Object.hasOwn(installStatus, "SuccessValue") || Object.hasOwn(installStatus, "SuccessReceiptId"))) {
    throw new Error("RESTRICTED_KEY_INSTALL_TRANSACTION_NOT_SUCCESSFUL");
  }
  installTransactionHash = installOutcome.transaction?.hash || installOutcome.transaction_outcome?.id || null;
}

// Confirm the restricted permission is final before revoking any old key.
let installed = null;
let latestKeys = [];
for (let attempt = 0; attempt < 6; attempt++) {
  latestKeys = await getAccessKeys("sentinel-access-key-list-after-install-" + attempt);
  installed = latestKeys.find(key => key.public_key === restrictedPublicKey) || null;
  if (installed && matchesExpectedPermission(installed)) break;
  if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 2000));
}
if (!installed || !matchesExpectedPermission(installed)) {
  throw new Error("RESTRICTED_KEY_POSTCHECK_FAILED");
}

const latestAdminKey = latestKeys.find(key => key.public_key === adminPublicKey);
if (latestAdminKey?.access_key?.permission !== "FullAccess") {
  throw new Error("OFFLINE_ADMIN_KEY_MISSING_BEFORE_RUNTIME_KEY_REVOCATION");
}
const latestFullAccessKeys = latestKeys.filter(key => key?.access_key?.permission === "FullAccess");
const latestOtherFullAccessKeys = latestFullAccessKeys.filter(key => key.public_key !== adminPublicKey);
if (latestOtherFullAccessKeys.length > 1) {
  throw new Error("AMBIGUOUS_RUNTIME_FULL_ACCESS_KEYS_AFTER_INSTALL");
}

let revokeTransactionHash = null;
if (latestOtherFullAccessKeys.length === 1) {
  const oldRuntimeKey = latestOtherFullAccessKeys[0];
  const revokeTx = await account.createTransaction({
    receiverId: accountId,
    actions: [actions.deleteKey(PublicKey.from(oldRuntimeKey.public_key))],
    publicKey: adminPublicKey
  });
  const signedRevoke = await adminSigner.signTransaction(revokeTx);
  const revokeOutcome = await provider.sendTransaction(signedRevoke.signedTransaction);
  const revokeStatus = revokeOutcome?.status;
  if (!revokeStatus || !(Object.hasOwn(revokeStatus, "SuccessValue") || Object.hasOwn(revokeStatus, "SuccessReceiptId"))) {
    throw new Error("OLD_RUNTIME_KEY_REVOCATION_NOT_SUCCESSFUL");
  }
  revokeTransactionHash = revokeOutcome.transaction?.hash || revokeOutcome.transaction_outcome?.id || null;
}

// Fail closed unless the offline admin FullAccess key is the only remaining FullAccess key.
let finalKeys = [];
let oldRuntimeKeyAbsent = false;
for (let attempt = 0; attempt < 6; attempt++) {
  finalKeys = await getAccessKeys("sentinel-access-key-list-final-" + attempt);
  const finalAdmin = finalKeys.find(key => key.public_key === adminPublicKey);
  const finalRestricted = finalKeys.find(key => key.public_key === restrictedPublicKey);
  oldRuntimeKeyAbsent = latestOtherFullAccessKeys.length === 0 ||
    !finalKeys.some(key => key.public_key === latestOtherFullAccessKeys[0].public_key);
  const finalFullAccessKeys = finalKeys.filter(key => key?.access_key?.permission === "FullAccess");
  if (
    finalAdmin?.access_key?.permission === "FullAccess" &&
    finalRestricted && matchesExpectedPermission(finalRestricted) &&
    oldRuntimeKeyAbsent &&
    finalFullAccessKeys.length === 1
  ) break;
  if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 2000));
}

const finalAdmin = finalKeys.find(key => key.public_key === adminPublicKey);
const finalRestricted = finalKeys.find(key => key.public_key === restrictedPublicKey);
const finalFullAccessKeys = finalKeys.filter(key => key?.access_key?.permission === "FullAccess");
if (
  finalAdmin?.access_key?.permission !== "FullAccess" ||
  !finalRestricted || !matchesExpectedPermission(finalRestricted) ||
  !oldRuntimeKeyAbsent ||
  finalFullAccessKeys.length !== 1
) {
  throw new Error("RESTRICTED_SIGNER_ROTATION_FINAL_STATE_FAILED");
}

console.log(JSON.stringify({
  status: "RESTRICTED_SIGNER_ROTATION_VERIFIED",
  install_transaction_hash: installTransactionHash,
  revoke_transaction_hash: revokeTransactionHash,
  admin_full_access_key_preserved: true,
  restricted_function_call_permission: "VERIFIED",
  old_runtime_full_access_key: oldRuntimeKeyAbsent ? "REVOKED_OR_ABSENT" : "PRESENT",
  remaining_full_access_key_count: finalFullAccessKeys.length
}, null, 2));
