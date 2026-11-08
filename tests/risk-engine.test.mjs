import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRisk } from '../functions/api/_shared.js';

test('normal existing account with no verified threat is ALLOW', () => {
  const result = decideRisk({ code_hash: '11111111111111111111111111111111' }, null, 0);
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.risk_score, 0);
});

test('missing account requires review, not automatic block', () => {
  const result = decideRisk(null, null, 0);
  assert.equal(result.decision, 'WARN');
  assert.equal(result.risk_score, 55);
});

test('large planned transfer requires review', () => {
  const result = decideRisk({ code_hash: '11111111111111111111111111111111' }, null, 1001);
  assert.equal(result.decision, 'WARN');
  assert.equal(result.risk_score, 35);
});

test('verified threat match blocks', () => {
  const result = decideRisk({ code_hash: '11111111111111111111111111111111' }, { id: 'verified-1' }, 0);
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.risk_score, 100);
});
