const SIGNALS = new Set(["BUY", "SELL", "HOLD"]);
const RISK_LEVELS = new Set(["LOW", "MEDIUM", "HIGH"]);

export function parseAgentJson(raw) {
  if (typeof raw !== "string" || raw.length > 8000) return { ok: false, reason: "AGENT_OUTPUT_INVALID" };
  const cleaned = raw.trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/i, "").trim();
  try {
    const value = JSON.parse(cleaned);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "AGENT_OUTPUT_OBJECT_REQUIRED" };
    return { ok: true, value };
  } catch {
    return { ok: false, reason: "AGENT_OUTPUT_NOT_VALID_JSON" };
  }
}

export function validateAgentOneThesis(proposal, analysis) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) return { ok: false, reason: "AGENT_ONE_SCHEMA_INVALID" };
  const allowed = new Set(["signal", "thesis", "evidence_ids", "invalidation", "horizon_minutes"]);
  if (Object.keys(proposal).some(key => !allowed.has(key))) return { ok: false, reason: "AGENT_ONE_UNEXPECTED_FIELD" };
  if (!SIGNALS.has(proposal.signal)) return { ok: false, reason: "AGENT_ONE_SIGNAL_INVALID" };
  if (typeof proposal.thesis !== "string" || proposal.thesis.trim().length < 20 || proposal.thesis.length > 1200) return { ok: false, reason: "AGENT_ONE_THESIS_INVALID" };
  if (typeof proposal.invalidation !== "string" || proposal.invalidation.trim().length < 8 || proposal.invalidation.length > 500) return { ok: false, reason: "AGENT_ONE_INVALIDATION_INVALID" };
  if (!Number.isInteger(proposal.horizon_minutes) || proposal.horizon_minutes < 1 || proposal.horizon_minutes > 1440) return { ok: false, reason: "AGENT_ONE_HORIZON_INVALID" };
  if (!Array.isArray(proposal.evidence_ids) || proposal.evidence_ids.length > 3 || proposal.evidence_ids.some(id => typeof id !== "string")) return { ok: false, reason: "AGENT_ONE_EVIDENCE_INVALID" };
  const evidenceById = new Map((analysis.evidence || []).map(item => [item.id, item]));
  if (proposal.evidence_ids.some(id => !evidenceById.has(id)) || new Set(proposal.evidence_ids).size !== proposal.evidence_ids.length) return { ok: false, reason: "AGENT_ONE_UNSUPPORTED_EVIDENCE" };
  if (proposal.signal !== "HOLD" && proposal.signal !== analysis.signal) return { ok: false, reason: "AGENT_ONE_CONTRADICTS_DETERMINISTIC_SIGNAL" };
  if (proposal.signal === "BUY" && proposal.evidence_ids.filter(id => evidenceById.get(id)?.effect > 0).length < 2) return { ok: false, reason: "AGENT_ONE_BULLISH_EVIDENCE_INSUFFICIENT" };
  if (proposal.signal === "SELL" && proposal.evidence_ids.filter(id => evidenceById.get(id)?.effect < 0).length < 2) return { ok: false, reason: "AGENT_ONE_BEARISH_EVIDENCE_INSUFFICIENT" };
  return { ok: true, value: {
    signal: proposal.signal,
    thesis: proposal.thesis.trim(),
    evidence_ids: [...proposal.evidence_ids],
    invalidation: proposal.invalidation.trim(),
    horizon_minutes: proposal.horizon_minutes
  }};
}

export function evaluateAgentTwoReview(review, proposal, analysis) {
  if (!review || typeof review !== "object" || Array.isArray(review)) return { ok: false, reason: "AGENT_TWO_SCHEMA_INVALID" };
  const allowed = new Set(["verdict", "risk_level", "challenge", "reasons"]);
  if (Object.keys(review).some(key => !allowed.has(key))) return { ok: false, reason: "AGENT_TWO_UNEXPECTED_FIELD" };
  if (!["PASS", "VETO"].includes(review.verdict) || !RISK_LEVELS.has(review.risk_level)) return { ok: false, reason: "AGENT_TWO_VERDICT_INVALID" };
  if (typeof review.challenge !== "string" || review.challenge.trim().length < 10 || review.challenge.length > 1200) return { ok: false, reason: "AGENT_TWO_CHALLENGE_INVALID" };
  if (!Array.isArray(review.reasons) || review.reasons.length > 8 || review.reasons.some(reason => typeof reason !== "string" || reason.length > 240)) return { ok: false, reason: "AGENT_TWO_REASONS_INVALID" };

  const deterministicBlocks = [];
  if (analysis.signal === "HOLD") deterministicBlocks.push("DETERMINISTIC_SIGNAL_HOLD");
  if (analysis.risk_flags?.length) deterministicBlocks.push("DETERMINISTIC_RISK_FLAGS_PRESENT");
  if (proposal.signal !== analysis.signal) deterministicBlocks.push("PROPOSAL_SIGNAL_MISMATCH");
  if (analysis.execution_authorized !== false) deterministicBlocks.push("UNEXPECTED_EXECUTION_AUTHORIZATION_STATE");
  if (review.verdict !== "PASS") deterministicBlocks.push("AGENT_TWO_VETO");
  if (review.risk_level !== "LOW") deterministicBlocks.push("AGENT_TWO_RISK_NOT_LOW");

  const eligible = deterministicBlocks.length === 0;
  return {
    ok: true,
    value: {
      verdict: eligible ? "PASS" : "VETO",
      paper_trade_eligible: eligible,
      execution_authorized: false,
      deterministic_blocks: deterministicBlocks,
      risk_level: review.risk_level,
      challenge: review.challenge.trim(),
      reasons: review.reasons.map(reason => reason.trim())
    }
  };
}
