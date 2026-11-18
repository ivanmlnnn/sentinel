import test from "node:test";
import assert from "node:assert/strict";
import { buildTradeSkillDraft } from "../public/trade-skill-draft.js";

test("preserves exact decimal amount text for swap quote conversion", () => {
  const draft = buildTradeSkillDraft("swap 0.000123 USDC to wNEAR");
  assert.equal(draft.action, "SWAP");
  assert.equal(draft.from_asset, "USDC");
  assert.equal(draft.to_asset, "WNEAR");
  assert.equal(draft.amount_text, "0.000123");
  assert.equal(draft.amount_unit, "USDC");
});

test("does not invent an asset unit for dollar-denominated requests", () => {
  const draft = buildTradeSkillDraft("swap $10 USDC to wNEAR");
  assert.equal(draft.amount_text, "10");
  assert.equal(draft.amount_unit, "USD");
});
