import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const read = async (root, path) => {
  try { return await readFile(resolve(root, path), "utf8"); }
  catch { return ""; }
};

export async function auditMainnetReadiness(root = process.cwd()) {
  const [signer, contractDeploy, signerConfig, mainConfig, contractSource, deployWorkflow] = await Promise.all([
    read(root, "signer-worker/src/index.mjs"),
    read(root, "scripts/deploy-payment-contract.mjs"),
    read(root, "signer-worker/wrangler.jsonc"),
    read(root, "wrangler.jsonc"),
    read(root, "payment-contract/src/lib.rs"),
    read(root, ".github/workflows/deploy-testnet.yml")
  ]);

  const checks = [];
  const add = (id, status, detail) => checks.push({ id, status, detail });

  add("NET-001", signer.includes("https://rpc.testnet.fastnear.com") ? "BLOCKED" : "REVIEW",
    signer.includes("https://rpc.testnet.fastnear.com")
      ? "Signer RPC is hard-coded to NEAR Testnet; no Mainnet network selector is implemented."
      : "No known hard-coded FastNear Testnet RPC literal found; perform a full network-routing review.");
  add("NET-002", /\\\\\.testnet/.test(signer) || signer.includes(".testnet$") ? "BLOCKED" : "REVIEW",
    "Inspect signer account-ID validation and every network-specific address assumption before Mainnet.");
  add("NET-003", contractDeploy.includes("rpc.testnet.fastnear.com") || contractDeploy.includes("\\.testnet")
      ? "BLOCKED" : "REVIEW",
    "Payment-contract deployment script must be independently network-parameterized and Mainnet-guarded.");
  add("ENV-001", !mainConfig.includes("env.mainnet") || !signerConfig.includes("env.mainnet") ? "BLOCKED" : "REVIEW",
    "Separate Mainnet Worker configurations and bindings are not both defined.");
  add("ENV-002", mainConfig.includes('"database_name": "sentinel-db"') && signerConfig.includes('"database_name": "sentinel-db"')
      ? "BLOCKED" : "REVIEW",
    "Verify isolated Mainnet D1 databases, migrations, backups, retention and least-privilege access.");
  add("ASSET-001", contractSource.includes("Promise::new(receiver_id).transfer") && !contractSource.includes("ft_transfer")
      ? "BLOCKED" : "REVIEW",
    "Payment contract currently exposes native NEAR transfer; NEP-141 and non-standard token behavior are not implemented/verified.");
  add("DEPLOY-001", deployWorkflow.includes("DEPLOY_SENTINEL_TESTNET") ? "REVIEW" : "REVIEW",
    "Existing deployment workflow is explicitly Testnet. No Mainnet deployment workflow is authorized by this audit.");
  add("OPS-001", "REVIEW", "Confirm Mainnet key custody, restricted access-key scope, owner recovery, multisig policy, monitoring and incident contacts.");
  add("SEC-001", "REVIEW", "Obtain independent review of contract state, spend accounting, replay/idempotency, RPC trust, upgrade/admin controls and threat model.");

  const blockers = checks.filter(x => x.status === "BLOCKED");
  const review = checks.filter(x => x.status === "REVIEW");
  return {
    schema_version: 1,
    audit: "NEAR Sentinel Mainnet Deployment Readiness",
    mode: "static-source-audit",
    result: blockers.length ? "NO_GO" : "REVIEW_REQUIRED",
    mainnet_deployment_authorized: false,
    summary: { checks: checks.length, blockers: blockers.length, review_required: review.length },
    checks
  };
}

const report = await auditMainnetReadiness();
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--strict") && report.result !== "READY") {
  console.error("\nMAINNET READINESS STRICT GATE: BLOCKED — resolve every blocker and review item before deployment.");
  process.exitCode = 1;
}
