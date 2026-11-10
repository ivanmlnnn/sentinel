import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/threats.js";

test("public threat feed returns only verified metadata without free-form evidence", async () => {
  let query = "";
  const env = {
    DB: {
      prepare(sql) {
        query = sql;
        return { async all() {
          return { results: [{ id: "verified-1", account_id: "wallet.testnet", category: "phishing", status: "verified" }] };
        } };
      }
    }
  };
  const response = await onRequestGet({
    request: new Request("https://sentinel.example/api/threats"),
    env
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(query, /WHERE status = 'verified'/);
  assert.doesNotMatch(query, /evidence/i);
  assert.equal(body.reports[0].status, "verified");
  assert.equal("evidence" in body.reports[0], false);
});

test("unverified threat reports require a configured admin identity", async () => {
  const response = await onRequestGet({
    request: new Request("https://sentinel.example/api/threats?status=unverified"),
    env: { SENTINEL_ADMIN_DIDS: "did:privy:admin", DB: { prepare() { throw new Error("DB must not be queried"); } } }
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "ADMIN_REQUIRED");
});
