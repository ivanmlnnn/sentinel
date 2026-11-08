import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRisk, analyzeTransactionBehavior } from '../functions/api/_shared.js';

const account = { code_hash: '11111111111111111111111111111111' };
const NOW = Date.parse('2026-11-08T12:00:00.000Z');

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

test('ten recent successful signed transactions trigger WARN', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    is_success: true, is_real_signer: true,
    tx_block_timestamp: new Date(NOW - i * 20000).toISOString()
  }));
  const behavior = analyzeTransactionBehavior(rows, NOW);
  assert.equal(behavior.transactions_5m, 10);
  assert.equal(behavior.anomaly, true);
  assert.equal(decideRisk(account, null, 0, behavior).decision, 'WARN');
});

test('thirty recent successful signed transactions trigger elevated WARN, never BLOCK', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({
    is_success: true, is_real_signer: true,
    tx_block_timestamp: new Date(NOW - i * 8000).toISOString()
  }));
  const behavior = analyzeTransactionBehavior(rows, NOW);
  assert.equal(behavior.transactions_5m, 30);
  const result = decideRisk(account, null, 0, behavior);
  assert.equal(result.decision, 'WARN');
  assert.equal(result.risk_score, 60);
});

test('numeric Unix seconds timestamps are parsed correctly', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    is_success: true, is_real_signer: true,
    tx_block_timestamp: Math.floor((NOW - i * 20000) / 1000)
  }));
  const behavior = analyzeTransactionBehavior(rows, NOW);
  assert.equal(behavior.transactions_5m, 10);
  assert.equal(behavior.timestamped_transactions, 10);
});

test('old transactions do not become recent just because they are newest in the index', () => {
  const rows = Array.from({ length: 19 }, (_, i) => ({
    is_success: true, is_real_signer: true,
    tx_block_timestamp: new Date(NOW - 10800000 - i * 1000).toISOString()
  }));
  const behavior = analyzeTransactionBehavior(rows, NOW);
  assert.equal(behavior.transactions_5m, 0);
  assert.equal(behavior.transactions_1h, 0);
  assert.equal(behavior.newest_transaction_age_seconds, 10800);
});

test('unparseable timestamps produce an explicit review signal', () => {
  const behavior = analyzeTransactionBehavior([{ is_success: true, is_real_signer: true, tx_block_timestamp: 'not-a-date' }], NOW);
  assert.equal(behavior.invalid_timestamp_count, 1);
  assert.ok(behavior.factors.some(f => f.code === 'TRANSACTION_TIMESTAMP_UNVERIFIABLE'));
  assert.equal(decideRisk(account, null, 0, behavior).decision, 'WARN');
});

test('failed transactions are not counted as signed spam', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    is_success: false, is_real_signer: true,
    tx_block_timestamp: new Date(NOW - i * 1000).toISOString()
  }));
  const behavior = analyzeTransactionBehavior(rows, NOW);
  assert.equal(behavior.transactions_5m, 0);
  assert.equal(behavior.anomaly, false);
});
