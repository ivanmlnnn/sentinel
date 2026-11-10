import { json } from "./_shared.js";

export async function onRequestGet({ env }) {
  // Public dashboard metrics are aggregate-only. Individual wallet scans and
  // receiver addresses must never be exposed through the public activity feed.
  const [totals, threats] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN decision='ALLOW' THEN 1 ELSE 0 END) AS allowed, SUM(CASE WHEN decision='WARN' THEN 1 ELSE 0 END) AS warned, SUM(CASE WHEN decision='BLOCK' THEN 1 ELSE 0 END) AS blocked FROM investigations").first(),
    env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) AS verified FROM threat_reports").first()
  ]);
  return json({
    totals: { total: totals.total || 0, allowed: totals.allowed || 0, warned: totals.warned || 0, blocked: totals.blocked || 0 },
    recent: [],
    threats: { total: threats.total || 0, verified: threats.verified || 0 }
  });
}
