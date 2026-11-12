import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTradeSkillDraft } from './trade-skill-draft.js';

test('builds a BTC buy draft from a USD budget', () => {
  const draft = buildTradeSkillDraft('Buy $50 of BTC every Monday');
  assert.equal(draft.action, 'BUY');
  assert.equal(draft.asset, 'BTC');
  assert.equal(draft.amount, 50);
  assert.equal(draft.amount_unit, 'USD');
  assert.equal(draft.schedule, 'WEEKLY');
  assert.equal(draft.execution_mode, 'DRAFT_ONLY');
  assert.equal(draft.approval_status, 'NOT_APPROVED');
  assert.equal(draft.execution_status, 'DISABLED_NO_TRADING_ADAPTER');
});

test('builds a scheduled ETH quantity buy draft', () => {
  const draft = buildTradeSkillDraft('Beli 0.01 ETH setiap hari');
  assert.equal(draft.action, 'BUY');
  assert.equal(draft.asset, 'ETH');
  assert.equal(draft.amount, 0.01);
  assert.equal(draft.amount_unit, 'ETH');
  assert.equal(draft.schedule, 'DAILY');
});

test('builds a sell draft without enabling execution', () => {
  const draft = buildTradeSkillDraft('Sell 0.02 ETH for $60');
  assert.equal(draft.action, 'SELL');
  assert.equal(draft.asset, 'ETH');
  assert.equal(draft.execution_mode, 'DRAFT_ONLY');
  assert.equal(draft.approval_status, 'NOT_APPROVED');
});

test('parses swap pair in the order specified by the prompt', () => {
  const draft = buildTradeSkillDraft('Swap 2 USDC to ETH');
  assert.equal(draft.action, 'SWAP');
  assert.equal(draft.from_asset, 'USDC');
  assert.equal(draft.to_asset, 'ETH');
  assert.equal(draft.amount, 2);
  assert.equal(draft.amount_unit, 'USDC');
});

test('does not infer a swap pair when only one asset is named', () => {
  const draft = buildTradeSkillDraft('Swap 2 USDC');
  assert.equal(draft.action, 'SWAP');
  assert.equal(draft.from_asset, 'USDC');
  assert.equal(draft.to_asset, null);
});

test('does not turn a negated request into an executable action', () => {
  const draft = buildTradeSkillDraft("Don't buy ETH");
  assert.equal(draft.action, null);
  assert.equal(draft.asset, 'ETH');
  assert.equal(draft.execution_mode, 'DRAFT_ONLY');
});

test('does not infer a trade action from a market question', () => {
  const draft = buildTradeSkillDraft('What is the ETH price today?');
  assert.equal(draft.action, null);
});

test('marks incomplete requests when amount or asset is missing', () => {
  const noAmount = buildTradeSkillDraft('Buy ETH');
  const noAsset = buildTradeSkillDraft('Buy $25');
  assert.equal(noAmount.amount, null);
  assert.equal(noAsset.asset, null);
});

test('ignores unsupported leverage negation and caps prompt length', () => {
  const safe = buildTradeSkillDraft('Buy $20 BTC without leverage');
  assert.equal(safe.leverage_requested, false);
  const long = buildTradeSkillDraft('x'.repeat(5000));
  assert.equal(long.source_prompt.length, 4000);
});
