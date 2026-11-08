import { db, config } from 'hatchable';
import { validAccountId, decideRisk } from 'lib/sentinel.js';
export const access = 'public';
export const methods = ['POST'];
export default async function (req, res) {
  const body = req.body || {};
  const receiver = String(body.receiver_account || '').trim().toLowerCase();
  const sender = body.sender_account ? String(body.sender_account).trim().toLowerCase() : null;
  const amount = Number(body.amount_near || 0);
  if (!validAccountId(receiver)) return res.status(400).json({ error: 'Valid receiver_account is required.' });
  if (sender && !validAccountId(sender)) return res.status(400).json({ error: 'Invalid sender_account.' });
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000000000) return res.status(400).json({ error: 'amount_near must be a valid non-negative number.' });
  const network = (await config.get('near_network')) || 'testnet';
  const rpc = network === 'mainnet' ? 'https://rpc.mainnet.fastnear.com' : 'https://rpc.testnet.fastnear.com';
  let account = null;
  let rpcError = null;
  try {
    const response = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'sentinel', method: 'query', params: { request_type: 'view_account', finality: 'final', account_id: receiver } }), signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    if (data.result) account = data.result;
    else rpcError = data.error?.message || 'Account not found or RPC error';
  } catch (error) { rpcError = error.message || 'NEAR RPC unavailable'; }
  const threat = await db.query("SELECT id, category, evidence, status FROM threat_reports WHERE account_id = $1 AND status = 'verified' ORDER BY created_at DESC LIMIT 1", [receiver]);
  const verdict = decideRisk(account, threat.rows[0] || null, amount);
  if (!account && !threat.rows[0]) verdict.decision = 'WARN';
  const evidence = {
    network, source: rpc, checked_at: new Date().toISOString(),
    account: account ? { account_exists: true, balance_yocto: account.amount, locked_yocto: account.locked, code_hash: account.code_hash, storage_usage: account.storage_usage, contract_present: account.code_hash !== '11111111111111111111111111111111' } : { account_exists: false, rpc_error: rpcError },
    verified_threat: threat.rows[0] || null,
    limitations: ['Account age is not inferred from the current account-state RPC response.', 'Contract code hash is a current snapshot; historical code changes are not claimed.', 'This is a risk screening result, not a guarantee that a transaction is safe.']
  };
  const saved = await db.query('INSERT INTO investigations (sender_account, receiver_account, amount_near, network, decision, risk_score, risk_factors, evidence) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) RETURNING id, created_at', [sender, receiver, amount, network, verdict.decision, verdict.risk_score, JSON.stringify(verdict.risk_factors), JSON.stringify(evidence)]);
  return res.json({ id: saved.rows[0].id, created_at: saved.rows[0].created_at, receiver_account: receiver, amount_near: amount, ...verdict, evidence });
}