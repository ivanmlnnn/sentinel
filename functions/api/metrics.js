import { json } from "./_shared.js";

export async function onRequestGet({ env }) {
  const [totals, recent, threats] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN decision='ALLOW' THEN 1 ELSE 0 END) AS allowed, SUM(CASE WHEN decision='WARN' THEN 1 ELSE 0 END) AS warned, SUM(CASE WHEN decision='BLOCK' THEN 1 ELSE 0 END) AS blocked FROM investigations").first(),
    env.DB.prepare("SELECT id, receiver_account, amount_near, decision, risk_score, created_at FROM investigations ORDER BY created_at DESC LIMIT 8").all(),
    env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) AS verified FROM threat_reports").first()
  ]);
  return json({ totals: { total: totals.total || 0, allowed: totals.allowed || 0, warned: totals.warned || 0, blocked: totals.blocked || 0 }, recent: recent.results || [], threats: { total: threats.total || 0, verified: threats.verified || 0 } });
}
