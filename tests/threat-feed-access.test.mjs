import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/threats.js";

test("public threat feed returns verified reports only by default", async () => {
  let query = "";
  let boundStatus = null;
  const env = {
    DB: {
      prepare(sql) {
        query = sql;
        return {
          bind(status) {
            boundStatus = status;
            return { async all() { return { results: [{ id: "verified-1", status: "verified" }] }; } };
          }
        };
      }
    }
  };
  const response = await onRequestGet({
    request: new Request("https://sentinel.example/api/threats"),
    env
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(query, /WHERE status = \?/);
  assert.equal(boundStatus, "verified");
  assert.equal(body.reports[0].status, "verified");
});

test("unverified threat reports require a valid Privy token", async () => {
  const response = await onRequestGet({
    request: new Request("https://sentinel.example/api/threats?status=unverified"),
    env: { DB: { prepare() { throw new Error("DB must not be queried"); } } }
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "UNAUTHORIZED");
});
