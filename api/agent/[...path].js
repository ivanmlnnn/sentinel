import control from '../_lib/agent-control.js';
import supervisor from '../_lib/agent-supervisor.js';
import taskRunner from '../_lib/agent-task-runner.js';
import developerSession from '../_lib/agent-developer-session.js';
import developerTask from '../_lib/agent-developer-task.js';

export const config = { api: { bodyParser: false } };

async function parseJsonBody(req, maxBytes = 16000) {
  if (req.body && typeof req.body === 'object') return true;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) return false;
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    req.body = parsed;
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  const pathname = String(req.url || '').split('?')[0];
  const route = pathname.replace(/^\/api\/agent\/?/, '').replace(/\/$/, '');
  try {
    if (route === 'control') return await control(req, res);
    if (route === 'supervisor') return await supervisor(req, res);
    if (route === 'task-runner') {
      if (!await parseJsonBody(req, 4000)) return res.status(400).json({ error: 'INVALID_JSON_BODY' });
      return await taskRunner(req, res);
    }
    if (route === 'developer-session') {
      if (!await parseJsonBody(req, 8000)) return res.status(400).json({ error: 'INVALID_JSON_BODY' });
      return await developerSession(req, res);
    }
    if (route === 'developer-task') {
      if (!await parseJsonBody(req, 8000)) return res.status(400).json({ error: 'INVALID_JSON_BODY' });
      return await developerTask(req, res);
    }
    return res.status(404).json({ error: 'AGENT_ROUTE_NOT_FOUND' });
  } catch (error) {
    console.error('sentinel agent router failed', error?.code || 'internal');
    return res.status(503).json({ error: 'AGENT_ROUTER_UNAVAILABLE' });
  }
}
