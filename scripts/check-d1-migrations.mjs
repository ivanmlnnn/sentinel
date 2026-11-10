import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = new URL("../migrations-d1/", import.meta.url);
const root = new URL("../", import.meta.url);
const folder = join(new URL(".", root).pathname, "migrations-d1");
const files = readdirSync(folder).filter(name => /^\d+_.*\.sql$/.test(name)).sort();
if (!files.length) throw new Error("No D1 migrations found.");
const db = new DatabaseSync(":memory:");
try {
  for (const file of files) {
    db.exec(readFileSync(join(folder, file), "utf8"));
    process.stdout.write("PASS " + file + "\n");
  }
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
  for (const name of ["investigations", "threat_reports", "privy_webhook_events", "agent_audit",
    "agent_execution", "signer_nonces", "agent_pending_approvals", "signer_approval_claims"]) {
    if (!tables.includes(name)) throw new Error("Missing D1 table after migrations: " + name);
  }
  process.stdout.write("Validated " + files.length + " SQLite D1 migrations and " + tables.length + " tables.\n");
} finally {
  db.close();
}
