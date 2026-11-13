import { db } from 'hatchable';

export const access = 'scheduler';
export const methods = ['POST'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/;
const AMOUNT = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/;
const ASSET = /^[A-Z0-9._-]{2,32}$/;

function safeJson(value, max = 12000) {
  try { return JSON.stringify(value).slice(0, max); }
  catch { return '{}'; }
}
function validTestnetAccount(value) {
  return typeof value === 'string' && value.length >= 2 && value.length <= 64 &&
    ACCOUNT.test(value) && (value.endsWith('.testnet') || /^[0-9a-f]{64}$/.test(value));
}
async function event(sessionId, taskId, type, severity, payload) {
  await db.query(
    'INSERT INTO agent_events (session_id, task_id, event_type, severity, payload) VALUES ($1,$2,$3,$4,$5::jsonb)',
    [sessionId, taskId, type, severity, safeJson(payload)]
  );
}
function classify(prompt) {
  const p = String(prompt || '').trim();
  let m;
  if (/^(help|menu|commands|bantuan)$/i.test(p)) return { kind: 'help' };
  if (/^(status|security status|status keamanan)$/i.test(p)) return { kind: 'status' };

  // Explicit command grammar only: no ambiguous natural-language transaction proposals.
  m = p.match(/^swap\s+([A-Z0-9._-]{2,32})\s+to\s+([A-Z0-9._-]{2,32})$/i);
  if (m) return { kind: 'swap', asset_in: m[1].toUpperCase(), asset_out: m[2].toUpperCase() };

  m = p.match(/^payment\s+to\s+([a-z0-9][a-z0-9._-]{1,63})\s+amount\s+((?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?)$/i);
  if (m) return { kind: 'payment', receiver_account: m[1].toLowerCase(), amount: m[2] };

  m = p.match(/^trade\s+draft\s+(.{8,500})$/is);
  if (m) return { kind: 'trade', rationale: m[1].trim() };
  return { kind: 'unknown' };
}
function helpText() {
  return [
    'Sentinel Manual Agent is active. No AI provider is required.',
    'Available deterministic commands:',
    '• help — show commands',
    '• status — show the task/session security boundary',
    '• swap TOKEN_A to TOKEN_B — create a non-executable swap quote request',
    '• payment to account.testnet amount 1.25 — create a payment proposal',
    '• trade draft describe your strategy here — create a review-only trade draft',
    'All proposals require independent Sentinel review. This runtime never signs or broadcasts transactions.'
  ].join('\n');
}
async function createProposal(task, type, payload) {
  const inserted = await db.query(
    'INSERT INTO agent_action_proposals (task_id, session_id, account_id, action_type, payload) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id',
    [task.id, task.session_id, task.account_id, type, safeJson(payload)]
  );
  const proposalId = inserted.rows[0]?.id;
  await event(task.session_id, task.id, 'ACTION_PROPOSED', 'INFO', {
    proposal_id: proposalId, action_type: type, execution_enabled: false
  });
  return proposalId;
}

export default async function (req, res) {
  const taskId = String(req.body?.task_id || '');
  if (!UUID.test(taskId)) return res.status(400).json({ error: 'INVALID_TASK_ID' });

  const found = await db.query(
    'SELECT t.id, t.session_id, t.account_id, t.prompt, t.status, s.status AS session_status, s.permissions, s.expires_at ' +
    'FROM agent_tasks t JOIN agent_sessions s ON s.session_id = t.session_id WHERE t.id = $1',
    [taskId]
  );
  if (!found.rows.length) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
  const task = found.rows[0];
  if (task.status !== 'QUEUED') return res.json({ task_id: taskId, status: task.status, idempotent: true });

  const expires = new Date(task.expires_at).getTime();
  if (task.session_status !== 'ACTIVE' || !Number.isFinite(expires) || expires <= Date.now()) {
    await db.query(
      "UPDATE agent_sessions SET status = CASE WHEN status = 'ACTIVE' THEN 'EXPIRED' ELSE status END, updated_at = now() WHERE session_id = $1",
      [task.session_id]
    );
    await db.query(
      "UPDATE agent_tasks SET status = 'BLOCKED', error_code = 'SESSION_NOT_ACTIVE', updated_at = now() WHERE id = $1 AND status = 'QUEUED'",
      [taskId]
    );
    await event(task.session_id, taskId, 'TASK_BLOCKED', 'BLOCK', { reason: 'SESSION_NOT_ACTIVE' });
    return res.json({ task_id: taskId, status: 'BLOCKED', reason: 'SESSION_NOT_ACTIVE' });
  }

  const claimed = await db.query(
    "UPDATE agent_tasks SET status = 'RUNNING', updated_at = now() WHERE id = $1 AND status = 'QUEUED' RETURNING id",
    [taskId]
  );
  if (!claimed.rows.length) return res.json({ task_id: taskId, status: 'ALREADY_CLAIMED' });

  try {
    const permissions = Array.isArray(task.permissions) ? task.permissions : [];
    const command = classify(task.prompt);
    let message = '';
    let proposalIds = [];

    if (command.kind === 'help') {
      message = helpText();
    } else if (command.kind === 'status') {
      message = 'Session status was validated as ACTIVE at task execution. Network: testnet. Transaction signing and broadcasting are disabled in this agent runtime.';
    } else if (command.kind === 'swap') {
      if (!permissions.includes('swap.quote')) {
        message = 'Blocked: this session does not have the swap.quote permission.';
      } else if (command.asset_in === command.asset_out) {
        message = 'Rejected: input and output assets must be different.';
      } else {
        const id = await createProposal(task, 'swap.quote', {
          asset_in: command.asset_in, asset_out: command.asset_out,
          quote_status: 'NOT_FETCHED', rationale: 'Explicit manual swap command',
          execution_enabled: false
        });
        proposalIds.push(id);
        message = 'Swap request recorded as a review-only proposal. No live price, route, slippage, or liquidity has been fetched; do not treat this as an executable quote.';
      }
    } else if (command.kind === 'payment') {
      if (!permissions.includes('payment.propose')) {
        message = 'Blocked: this session does not have the payment.propose permission.';
      } else if (!validTestnetAccount(command.receiver_account) || !AMOUNT.test(command.amount) || Number(command.amount) <= 0) {
        message = 'Rejected: invalid testnet recipient or amount.';
      } else {
        const id = await createProposal(task, 'payment.propose', {
          receiver_account: command.receiver_account, amount: command.amount,
          network: 'testnet', rationale: 'Explicit manual payment command',
          execution_enabled: false
        });
        proposalIds.push(id);
        message = 'Payment proposal created for independent Sentinel review. No wallet signature or transfer was performed.';
      }
    } else if (command.kind === 'trade') {
      if (!permissions.includes('trade.draft')) {
        message = 'Blocked: this session does not have the trade.draft permission.';
      } else {
        const id = await createProposal(task, 'trade.draft', {
          rationale: command.rationale, mode: 'MANUAL_DRAFT',
          execution_enabled: false
        });
        proposalIds.push(id);
        message = 'Trade draft created for independent Sentinel review. No order was placed and no market execution occurred.';
      }
    } else {
      message = 'I am Sentinel Manual Agent. I do not call an AI API. I can run only the documented deterministic commands. Type “help” to see them. For safety, ambiguous natural-language requests are not interpreted as payment, swap, or trade instructions.';
    }

    const response = {
      message: String(message).slice(0, 4000),
      proposal_ids: proposalIds,
      engine: 'SENTINEL_DETERMINISTIC_RULE_ENGINE',
      ai_provider_required: false,
      execution_enabled: false
    };
    await db.query(
      "UPDATE agent_tasks SET status = 'COMPLETED', result = $1::jsonb, updated_at = now() WHERE id = $2",
      [safeJson(response), taskId]
    );
    await event(task.session_id, taskId, 'TASK_COMPLETED', 'INFO', {
      engine: 'SENTINEL_DETERMINISTIC_RULE_ENGINE', proposal_count: proposalIds.length
    });
    return res.json({ task_id: taskId, status: 'COMPLETED', ...response });
  } catch (error) {
    console.error('Sentinel manual task failed', { task_id: taskId, error_type: typeof error });
    await db.query(
      "UPDATE agent_tasks SET status = 'FAILED', error_code = 'MANUAL_AGENT_RUNTIME_ERROR', updated_at = now() WHERE id = $1",
      [taskId]
    );
    await event(task.session_id, taskId, 'TASK_FAILED', 'WARN', { code: 'MANUAL_AGENT_RUNTIME_ERROR' });
    return res.status(503).json({ task_id: taskId, status: 'FAILED', error: 'MANUAL_AGENT_RUNTIME_ERROR' });
  }
}