import { ai, db, config } from 'hatchable';
export const access = 'public';
export const methods = ['POST'];
export default async function (req, res) {
  const id = String(req.body?.investigation_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Valid investigation_id is required.' });
  const found = await db.query('SELECT id, receiver_account, amount_near, decision, risk_score, risk_factors, evidence, ai_explanation FROM investigations WHERE id = $1', [id]);
  if (!found.rows.length) return res.status(404).json({ error: 'Investigation not found.' });
  const item = found.rows[0];
  if (item.ai_explanation) return res.json({ investigation_id: id, decision: item.decision, explanation: item.ai_explanation, cached: true });
  let result;
  try {
    const model = (await config.get('ai_model')) || 'haiku';
    result = await ai.generateText({
      model,
      purpose: 'sentinel-security-explanation',
      system: 'You are IVTECH Sentinel, a cautious blockchain security analyst. Explain only the supplied structured evidence. Never invent transaction history, account age, ownership, exploit details, or malicious intent. Distinguish observed facts from limitations. Do not change the deterministic ALLOW/WARN/BLOCK decision. Give a concise explanation and safe next step.',
      prompt: JSON.stringify({ decision: item.decision, risk_score: item.risk_score, receiver: item.receiver_account, amount_near: item.amount_near, risk_factors: item.risk_factors, evidence: item.evidence }),
      maxTokens: 450
    });
  } catch (error) {
    const message = String(error.message || 'AI provider is not configured.');
    return res.status(503).json({ error: message, setup_required: true });
  }
  if (result.finishReason === 'length') return res.status(502).json({ error: 'AI explanation was truncated. Retry with a smaller investigation.' });
  await db.query('UPDATE investigations SET ai_explanation = $1 WHERE id = $2', [result.text, id]);
  return res.json({ investigation_id: id, decision: item.decision, explanation: result.text, usage: result.usage });
}