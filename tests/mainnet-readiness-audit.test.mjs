import test from "node:test";
import assert from "node:assert/strict";
import { auditMainnetReadiness } from "../scripts/mainnet-readiness-audit.mjs";

test("Mainnet readiness audit never authorizes deployment from static inspection", async () => {
  const report = await auditMainnetReadiness(process.cwd());
  assert.equal(report.mainnet_deployment_authorized, false);
  assert.equal(report.result, "NO_GO");
  assert.ok(report.checks.length >= 8);
});

test("current Testnet-pinned implementation is explicitly blocked", async () => {
  const report = await auditMainnetReadiness(process.cwd());
  const blocked = new Set(report.checks.filter(x => x.status === "BLOCKED").map(x => x.id));
  for (const id of ["NET-001", "NET-002", "NET-003", "ENV-001", "ENV-002", "ASSET-001"]) {
    assert.ok(blocked.has(id), `expected blocker ${id}`);
  }
});
