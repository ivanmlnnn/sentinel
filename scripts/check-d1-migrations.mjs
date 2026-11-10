import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = fileURLToPath(new URL("../", import.meta.url));

function validateMigrationSet(directory, expectedTables, expectedIndexes = []) {
  const folder = join(root, directory);
  const files = readdirSync(folder).filter(name => /^\d+_.*\.sql$/.test(name)).sort();
  if (!files.length) throw new Error("No migrations found in " + directory);
  const db = new DatabaseSync(":memory:");
  try {
    for (const file of files) {
      db.exec(readFileSync(join(folder, file), "utf8"));
      process.stdout.write("PASS " + directory + "/" + file + "\n");
    }
    const objects = db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','index')").all();
    const tables = new Set(objects.filter(row => row.type === "table").map(row => row.name));
    const indexes = new Set(objects.filter(row => row.type === "index").map(row => row.name));
    for (const name of expectedTables) {
      if (!tables.has(name)) throw new Error("Missing table after " + directory + " migrations: " + name);
    }
    for (const name of expectedIndexes) {
      if (!indexes.has(name)) throw new Error("Missing index after " + directory + " migrations: " + name);
    }
    process.stdout.write("Validated " + files.length + " migrations in " + directory +
      ", " + tables.size + " tables, " + indexes.size + " indexes.\n");
  } finally {
    db.close();
  }
}

validateMigrationSet("migrations-d1", [
  "investigations", "threat_reports", "privy_webhook_events", "agent_audit",
  "agent_execution", "signer_nonces", "agent_pending_approvals",
  "signer_approval_claims", "investigation_owners"
]);

validateMigrationSet("migrations-signer", [
  "signer_nonces", "signer_approval_claims", "agent_execution"
], [
  "idx_signer_nonces_created", "idx_signer_claims_actor", "idx_signer_agent_execution_daily"
]);
