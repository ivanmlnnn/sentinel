import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTradeSkillDraft } from '../public/trade-skill-draft.js';

test('parses a scheduled USD-denominated BTC buy', () => {
  const draft = buildTradeSkillDraft('Buy $50 of BTC every Monday');
  assert.equal(draft.action, 'BUY');
  assert.equal(draft.asset, 'BTC');
  assert.equal(draft.amount, 50);
  assert.equal(draft.amount_unit, 'USD');
  assert.equal(draft.schedule, 'WEEKLY');
  assert.equal(draft.execution_mode, 'DRAFT_ONLY');
});

test('preserves an explicit no-leverage constraint', () => {
  const draft = buildTradeSkillDraft("Buy 0.01 ETH every day; don't use leverage");
  assert.equal(draft.leverage_requested, false);
  assert.equal(draft.amount, 0.01);
  assert.equal(draft.schedule, 'DAILY');
});

test('parses both sides of a swap pair', () => {
  const draft = buildTradeSkillDraft('Swap 2 USDC to ETH');
  assert.equal(draft.action, 'SWAP');
  assert.equal(draft.from_asset, 'USDC');
  assert.equal(draft.to_asset, 'ETH');
  assert.equal(draft.amount, 2);
  assert.equal(draft.amount_unit, 'USDC');
});

test('parses a scheduled sell', () => {
  const draft = buildTradeSkillDraft('Sell 0.02 NEAR monthly');
  assert.equal(draft.action, 'SELL');
  assert.equal(draft.asset, 'NEAR');
  assert.equal(draft.schedule, 'MONTHLY');
});

test('does not turn a negated instruction into a buy', () => {
  const draft = buildTradeSkillDraft("Don't buy ETH");
  assert.equal(draft.action, null);
});

test('does not infer a buy from an unspecified trade request', () => {
  const draft = buildTradeSkillDraft('Trade ETH');
  assert.equal(draft.action, null);
});

test('never marks a draft approved or executable', () => {
  const draft = buildTradeSkillDraft('Buy $25 BTC weekly');
  assert.equal(draft.approval_status, 'NOT_APPROVED');
  assert.equal(draft.execution_status, 'DISABLED_NO_TRADING_ADAPTER');
});


test('does not infer a swap destination when only one token is named', () => {
  const draft = buildTradeSkillDraft('Swap 2 USDC');
  assert.equal(draft.from_asset, 'USDC');
  assert.equal(draft.to_asset, null);
});

test('does not infer a trade action from a market question', () => {
  const draft = buildTradeSkillDraft('What is the ETH price today?');
  assert.equal(draft.action, null);
});

test('marks a request incomplete when amount or asset is missing', () => {
  const noAmount = buildTradeSkillDraft('Buy ETH');
  const noAsset = buildTradeSkillDraft('Buy $25');
  assert.equal(noAmount.amount, null);
  assert.equal(noAsset.asset, null);
});

test('caps prompt length and never creates an approved or executable draft', () => {
  const draft = buildTradeSkillDraft('Buy $20 BTC without leverage');
  assert.equal(draft.leverage_requested, false);
  assert.equal(draft.approval_status, 'NOT_APPROVED');
  assert.equal(draft.execution_status, 'DISABLED_NO_TRADING_ADAPTER');
  assert.equal(buildTradeSkillDraft('x'.repeat(5000)).source_prompt.length, 4000);
});
