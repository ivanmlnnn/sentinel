import { webhooks, config, db } from 'hatchable';

export const access = 'public';
export const methods = ['POST'];

export default async function (req, res) {
  const secretValue = await config.get('PRIVY_WEBHOOK_SECRET');
  if (!secretValue) {
    return res.status(503).json({ error: 'Webhook signing secret is not configured.' });
  }

  const id = req.headers['svix-id'] || req.headers['webhook-id'];
  const timestamp = req.headers['svix-timestamp'] || req.headers['webhook-timestamp'];
  const signatureHeader = req.headers['svix-signature'] || req.headers['webhook-signature'] || '';

  if (!id || !timestamp || !signatureHeader || !req.rawBody) {
    return res.status(400).json({ error: 'Missing webhook signature headers or raw body.' });
  }
  if (!secretValue.startsWith('whsec_')) {
    return res.status(503).json({ error: 'Invalid webhook signing secret format.' });
  }

  let signingKey;
  try {
    signingKey = atob(secretValue.slice(6));
  } catch {
    return res.status(503).json({ error: 'Webhook signing secret is malformed.' });
  }

  const v1 = signatureHeader.split(/\s+/)
    .find((part) => part.startsWith('v1,'));
  const signature = v1 ? v1.slice(3) : '';
  if (!signature) return res.status(400).json({ error: 'No supported v1 signature found.' });

  let valid = false;
  try {
    valid = await webhooks.verifyHmac({
      raw: id + '.' + timestamp + '.' + req.rawBody,
      signature,
      secret: signingKey,
      algorithm: 'sha256',
      encoding: 'base64',
      timestamp,
      tolerance: 300
    });
  } catch {
    valid = false;
  }
  if (!valid) return res.status(400).json({ error: 'Invalid webhook signature.' });

  const event = req.body || {};
  const eventType = typeof event.type === 'string' ? event.type : 'unknown';

  try {
    await db.query(
      'INSERT INTO privy_webhook_events (svix_id, event_type, payload) VALUES ($1, $2, $3::jsonb) ON CONFLICT (svix_id) DO NOTHING',
      [id, eventType, JSON.stringify(event)]
    );
  } catch (error) {
    console.error('Privy webhook persistence failed:', error?.message || error);
    return res.status(500).json({ error: 'Could not persist verified webhook.' });
  }

  return res.status(200).json({ received: true, event_type: eventType });
}