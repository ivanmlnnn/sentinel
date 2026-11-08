import { db } from 'hatchable';
export const access = 'public';
export const methods = ['GET'];
export default async function (req, res) {
  const result = await db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE decision='ALLOW')::int AS allowed, COUNT(*) FILTER (WHERE decision='WARN')::int AS warned, COUNT(*) FILTER (WHERE decision='BLOCK')::int AS blocked FROM investigations");
  const recent = await db.query('SELECT id, receiver_account, amount_near, decision, risk_score, created_at FROM investigations ORDER BY created_at DESC LIMIT 8');
  const threats = await db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='verified')::int AS verified FROM threat_reports");
  return res.json({ totals: result.rows[0], recent: recent.rows, threats: threats.rows[0] });
}