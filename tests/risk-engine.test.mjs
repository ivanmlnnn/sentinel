import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRisk, analyzeTransactionBehavior } from '../functions/api/_shared.js';

const account = { code_hash: '11111111111111111111111111111111' };

test('normal existing account with no verified threat is ALLOW', () => {
  const result = decideRisk(account, null, 0);
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.risk_score, 0);
});

test('missing account requires review, not automatic block', () => {
  const result = decideRisk(null, null, 0);
  assert.equal(result.decision, 'WARN');
  assert.equal(result.risk_score, 55);
});

test('large planned transfer requires review', () => {
  const result = decideRisk(account, null, 1001);
  assert.equal(result.decision, 'WARN');
  assert.equal(result.risk_score, 35);
});

test('verified threat match blocks', () => {
  const result = decideRisk(account, { id: 'verified-1' }, 0);
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.risk_score, 100);
});

test('ten successful signed transactions in five minutes trigger a frequency anomaly and WARN', () => {
  const base = Date.parse('2026-11-08T12:00:00.000Z');
  const rows = Array.from({ length: 10 }, (_, i) => ({
    is_success: true, is_real_signer: true,
    tx_block_timestamp: new Date(base - i * 20_000).toISOString()
  }));
  const behavior = analyzeTransactionBehavior(rows);
  assert.equal(behavior.transactions_5m, 10);
  assert.equal(behavior.anomaly, true);
  const result = decideRisk(account, null, 0, behavior);
  assert.equal(result.decision, 'WARN');
  assert.equal(result.risk_score, 35);
  assert.ok(result.risk_factors.some(f => f.code === 'HIGH_TRANSACTION_FREQUENCY'));
});

test('thirty successful signed transactions in five minutes trigger elevated review, never automatic block', () => {
  const base = Date.parse('2026-11-08T12:00:00.000Z');
  const rows = Array.from({ length: 30 }, (_, i) => ({
    is_success: true, is_real_signer: true,
    tx_block_timestamp: new Date(base - i * 8_000).toISOString()
  }));
  const behavior = analyzeTransactionBehavior(rows);
  assert.equal(behavior.transactions_5m, 30);
  const result = decideRisk(account, null, 0, behavior);
  assert.equal(result.decision, 'WARN');
  assert.equal(result.risk_score, 60);
});

test('failed transactions and non-signer activity are not counted as signed spam', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    is_success: false, is_real_signer: true,
    tx_block_timestamp: new Date(Date.parse('2026-11-08T12:00:00.000Z') - i * 1000).toISOString()
  }));
  const behavior = analyzeTransactionBehavior(rows);
  assert.equal(behavior.transactions_5m, 0);
  assert.equal(behavior.anomaly, false);
});
