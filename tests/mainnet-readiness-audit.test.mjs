import test from "node:test";
import assert from "node:assert/strict";
import { auditMainnetReadiness } from "../scripts/mainnet-readiness-audit.mjs";

test("Mainnet readiness audit never authorizes deployment from static inspection", async () => {
  const report = await auditMainnetReadiness(process.cwd());
  assert.equal(report.mainnet_deployment_authorized, false);
  assert.ok(["NO_GO", "REVIEW_REQUIRED"].includes(report.result));
  assert.ok(report.checks.length >= 8);
});

test("current Testnet-pinned implementation is explicitly blocked", async () => {
  const report = await auditMainnetReadiness(process.cwd());
  const blocked = new Set(report.checks.filter(x => x.status === "BLOCKED").map(x => x.id));
  assert.ok(blocked.has("NET-001"));
  assert.ok(blocked.has("ASSET-001"));
  assert.ok(blocked.has("ENV-001"));
});
