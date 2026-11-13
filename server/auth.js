import { createHmac, timingSafeEqual } from 'node:crypto';
import { query } from './db.js';

export async function readBody(req, limit = 16000) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (typeof req.rawBody === 'string') return Buffer.from(req.rawBody);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('BODY_TOO_LARGE'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function authenticate(req, rawBody) {
  const timestamp = String(req.headers['x-sentinel-timestamp'] || '');
  const nonce = String(req.headers['x-sentinel-nonce'] || '');
  const signature = String(req.headers['x-sentinel-signature'] || '').replace(/^sha256=/i, '');
  const secret = process.env.SENTINEL_CONTROL_HMAC;
  if (!secret || Buffer.byteLength(secret) < 32 || !/^\d{10}$/.test(timestamp) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce) ||
      !/^[0-9a-f]{64}$/i.test(signature) || rawBody.length > 16000) return false;
  if (Math.abs(Math.floor(Date.now()/1000) - Number(timestamp)) > 60) return false;
  const expected = createHmac('sha256', secret).update(timestamp + '.' + nonce + '.' + rawBody.toString('utf8')).digest();
  const supplied = Buffer.from(signature, 'hex');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
  await query("DELETE FROM agent_nonces WHERE created_at < now() - interval '1 day'");
  const claimed = await query('INSERT INTO agent_nonces(nonce) VALUES($1) ON CONFLICT DO NOTHING RETURNING nonce',[nonce]);
  return claimed.length === 1;
}
export function json(req, res, status, body) {
  return res.status(status).json(body);
}
export function parseBody(raw) {
  try { const value = JSON.parse(raw.toString('utf8')); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
  catch { return null; }
}
