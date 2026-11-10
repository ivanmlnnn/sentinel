import { performance } from "node:perf_hooks";

const PROD_HOSTS = new Set(["sentinel.ivmaladin.workers.dev"]);
const integer = (name, fallback, min, max) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\\d+$/.test(raw)) throw new Error(`INVALID_${name}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`OUT_OF_RANGE_${name}`);
  return value;
};

export function validateLoadTarget(rawUrl, env = process.env) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("LOAD_TARGET_MUST_BE_HTTP_WITHOUT_EMBEDDED_CREDENTIALS");
  }
  if (PROD_HOSTS.has(url.hostname)) throw new Error("PRODUCTION_LOAD_TESTING_FORBIDDEN");
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const approvedStaging = env.SENTINEL_ALLOW_STAGING_LOAD === "1" &&
    env.SENTINEL_STAGING_HOST === url.hostname;
  if (!loopback && !approvedStaging) throw new Error("TARGET_NOT_LOCAL_OR_EXPLICITLY_ALLOWLISTED_STAGING");
  return url;
}

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)].toFixed(2));
}

async function run() {
  const rawTarget = process.env.SENTINEL_LOAD_TEST_URL || "http://127.0.0.1:8787/";
  const target = validateLoadTarget(rawTarget);
  const total = integer("SENTINEL_LOAD_REQUESTS", 100, 1, 10000);
  const concurrency = integer("SENTINEL_LOAD_CONCURRENCY", 5, 1, 25);
  const durationSeconds = integer("SENTINEL_LOAD_DURATION_SECONDS", 30, 1, 60);
  const deadline = performance.now() + durationSeconds * 1000;
  const latencies = [];
  const statuses = {};
  let next = 0;
  let completed = 0;
  let failed = 0;

  const worker = async () => {
    while (next < total && performance.now() < deadline) {
      next += 1;
      const started = performance.now();
      try {
        const response = await fetch(target, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(10000),
          headers: { "user-agent": "NEAR-Sentinel-Safe-Load-Test/1.0" }
        });
        const elapsed = performance.now() - started;
        latencies.push(elapsed);
        statuses[response.status] = (statuses[response.status] || 0) + 1;
        if (response.status >= 200 && response.status < 400) completed += 1;
        else failed += 1;
        await response.body?.cancel();
      } catch {
        latencies.push(performance.now() - started);
        failed += 1;
        statuses["network_error"] = (statuses["network_error"] || 0) + 1;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsedSeconds = (durationSeconds * 1000 - Math.max(0, deadline - performance.now())) / 1000;
  const report = {
    mode: "read-only-http-get",
    target: target.origin + target.pathname,
    requests_planned: total,
    requests_started: next,
    completed,
    failed,
    concurrency,
    duration_limit_seconds: durationSeconds,
    elapsed_seconds: Number(elapsedSeconds.toFixed(2)),
    requests_per_second: Number((next / Math.max(elapsedSeconds, 0.001)).toFixed(2)),
    latency_ms: { p50: percentile(latencies, 0.50), p95: percentile(latencies, 0.95), p99: percentile(latencies, 0.99), max: percentile(latencies, 1) },
    statuses,
    interpretation: "HTTP-only synthetic measurement; not NEAR transaction throughput or Mainnet capacity."
  };
  console.log(JSON.stringify(report, null, 2));
  if (failed > 0 || next < total) process.exitCode = 1;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  try { await run(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
