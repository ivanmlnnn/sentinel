import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, auth, moduleSource, css] = await Promise.all([
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/auth.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/agent-foundry.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/agent-foundry.css', import.meta.url), 'utf8')
]);

test('Agent Foundry is discoverable from the dashboard navigation', () => {
  assert.match(html, /href="#agentFoundry">Agent Foundry/);
  assert.match(auth, /import\('\.\/agent-foundry\.js\?v=20261112-foundry1'\)/);
});

test('Agent Foundry creates a custom blueprint instead of claiming a deployed agent', () => {
  assert.match(moduleSource, /BLUEPRINT_ONLY_NOT_DEPLOYED/);
  assert.match(moduleSource, /Forge agent blueprint/);
  assert.match(moduleSource, /sentinel\.agent-blueprint\.v1/);
  assert.match(moduleSource, /intent_graph: true/);
  assert.match(moduleSource, /proof_carrying_actions: true/);
  assert.match(moduleSource, /adversarial_self_review: true/);
  assert.match(moduleSource, /anomaly_circuit_breaker: true/);
});

test('Agent Foundry includes specialist archetypes and a custom creation path', () => {
  for (const archetype of ['treasury', 'defi', 'guardian', 'dao', 'scout', 'custom']) {
    assert.match(moduleSource, new RegExp(archetype));
  }
  assert.match(moduleSource, /Invent your own/);
  assert.match(moduleSource, /MISSION & CREATIVE BRIEF/);
});

test('Agent Foundry is responsive and exposes no wallet or transaction signing action', () => {
  assert.match(css, /@media\(max-width:850px\)/);
  assert.match(css, /@media\(max-width:520px\)/);
  assert.doesNotMatch(moduleSource, /signAndSendTransaction|addFunctionCallKey|wallet\.signMessage/);
});
