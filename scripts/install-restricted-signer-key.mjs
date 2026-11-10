import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";

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
if (existingRestrictedKey) {
  if (!matchesExpectedPermission(existingRestrictedKey)) {
    throw new Error("RESTRICTED_KEY_EXISTS_WITH_UNEXPECTED_PERMISSION: " +
      JSON.stringify(safePermissionSummary(existingRestrictedKey)));
  }
  console.log(JSON.stringify({
    status: "RESTRICTED_FUNCTION_CALL_KEY_ALREADY_INSTALLED",
    signer_account: accountId,
    restricted_public_key: restrictedPublicKey,
    ...safePermissionSummary(existingRestrictedKey),
    admin_full_access_key_preserved: true,
    transaction_submitted: false
  }, null, 2));
  process.exit(0);
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
      EXPECTED_ALLOWANCE
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

// RPC indexers can briefly lag a successful ADD_KEY receipt. Re-read final state
// several times before declaring the postcheck failed.
let installed = null;
for (let attempt = 0; attempt < 6; attempt++) {
  const afterKeys = await getAccessKeys("sentinel-access-key-list-after-" + attempt);
  installed = afterKeys.find(key => key.public_key === restrictedPublicKey) || null;
  if (installed && matchesExpectedPermission(installed)) break;
  if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 2000));
}

if (!installed || !matchesExpectedPermission(installed)) {
  throw new Error("RESTRICTED_KEY_POSTCHECK_FAILED: " +
    JSON.stringify(installed ? safePermissionSummary(installed) : { key_visible: false }));
}

console.log(JSON.stringify({
  status: "RESTRICTED_FUNCTION_CALL_KEY_INSTALLED",
  transaction_hash: outcome.transaction?.hash || outcome.transaction_outcome?.id || null,
  signer_account: accountId,
  restricted_public_key: restrictedPublicKey,
  ...safePermissionSummary(installed),
  admin_full_access_key_preserved: true
}, null, 2));
