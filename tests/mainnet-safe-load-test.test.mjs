import test from "node:test";
import assert from "node:assert/strict";
import { validateLoadTarget, percentile } from "../scripts/mainnet-readiness/load-test.mjs";

test("safe load harness only permits loopback by default", () => {
  assert.equal(validateLoadTarget("http://127.0.0.1:8787").hostname, "127.0.0.1");
  assert.throws(() => validateLoadTarget("https://example.com"), /TARGET_NOT_LOCAL/);
  assert.throws(() => validateLoadTarget("https://sentinel.ivmaladin.workers.dev"), /PRODUCTION_LOAD_TESTING_FORBIDDEN/);
});

test("staging requires exact host allowlisting", () => {
  const env = { SENTINEL_ALLOW_STAGING_LOAD: "1", SENTINEL_STAGING_HOST: "staging.example.workers.dev" };
  assert.equal(validateLoadTarget("https://staging.example.workers.dev", env).hostname, env.SENTINEL_STAGING_HOST);
  assert.throws(() => validateLoadTarget("https://other.example.workers.dev", env), /TARGET_NOT_LOCAL/);
});

test("latency percentile helper is deterministic", () => {
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2);
  assert.equal(percentile([1, 2, 3, 4], 0.95), 4);
  assert.equal(percentile([], 0.95), null);
});
