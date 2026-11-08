import { db } from 'hatchable';
import { validAccountId } from 'lib/sentinel.js';
export const access = 'public';
export const methods = ['GET','POST'];
export default async function (req, res) {
  if (req.method === 'GET') {
    const result = await db.query("SELECT id, account_id, category, evidence, status, created_at FROM threat_reports ORDER BY created_at DESC LIMIT 100");
    return res.json({ reports: result.rows });
  }
  const account = String(req.body?.account_id || '').trim().toLowerCase();
  const category = String(req.body?.category || '').trim().slice(0,80);
  const evidence = String(req.body?.evidence || '').trim().slice(0,2000);
  if (!validAccountId(account) || !category || evidence.length < 12) return res.status(400).json({ error: 'Valid account_id, category, and evidence (at least 12 characters) are required.' });
  const result = await db.query("INSERT INTO threat_reports (account_id, category, evidence, reporter, status) VALUES ($1,$2,$3,$4,'unverified') RETURNING id, account_id, category, status, created_at", [account, category, evidence, String(req.body?.reporter || 'anonymous').slice(0,100)]);
  return res.status(201).json({ report: result.rows[0], note: 'Report is unverified and will not trigger an automatic block.' });
}