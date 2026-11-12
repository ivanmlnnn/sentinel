import { evaluateProofIntent, digest } from "./provenance.mjs";

/**
 * Isolated reference policy. This is not a deployed signer; nonceState must
 * come from an atomic, trusted persistence layer in production.
 */
export function independentSignerCheck(input={}) {
  const {workerVerdict,intent,evidence,signerTrustStore,now,approval,nonceState,limits}=input || {};
  if (!intent || typeof intent!=="object" || Array.isArray(intent) ||
      !["receiver","amount","memo"].every(k=>typeof intent[k]==="string" && intent[k].length>0)) {
    return {decision:"BLOCK",reasons:["INVALID_PAYMENT_INTENT"],signer_policy_decision:"BLOCK",proof:null};
  }
  const reasons=[];
  const intentHash=digest(intent);
  if (!approval || approval.intent_hash !== intentHash) reasons.push("APPROVAL_INTENT_MISMATCH");
  if (!Number.isSafeInteger(approval?.expires_at) || !Number.isSafeInteger(now) || approval.expires_at <= now) reasons.push("APPROVAL_EXPIRED_OR_MALFORMED");
  if (!nonceState || nonceState.used !== false) reasons.push("NONCE_ALREADY_USED_OR_UNKNOWN");
  if (nonceState?.intent_hash !== intentHash) reasons.push("NONCE_INTENT_BINDING_MISMATCH");
  const amountText=String(intent?.amount ?? "");
  if (!/^(0|[1-9][0-9]*)$/.test(amountText) || !Number.isSafeInteger(Number(amountText)) || Number(amountText)<=0) reasons.push("INVALID_AMOUNT");
  if (!limits || !Number.isSafeInteger(limits.maxPayment) || limits.maxPayment<=0) reasons.push("INVALID_OR_MISSING_PAYMENT_LIMIT");
  else if (/^(0|[1-9][0-9]*)$/.test(amountText) && Number.isSafeInteger(Number(amountText)) && Number(amountText)>limits.maxPayment) reasons.push("PAYMENT_LIMIT_EXCEEDED");
  const recalculated=evaluateProofIntent({intent,evidence,trustStore:signerTrustStore || {},now,approvedIntent:intent});
  if (recalculated.decision !== "ALLOW") reasons.push("SIGNER_POLICY_"+recalculated.decision);
  // Worker output is only a consistency signal, never authorization.
  if (!workerVerdict || workerVerdict.decision !== "ALLOW") reasons.push("WORKER_VERDICT_NOT_ALLOW");
  if (workerVerdict?.intent_hash !== intentHash) reasons.push("WORKER_INTENT_BINDING_MISMATCH");
  return {decision:reasons.length ? "BLOCK" : "ALLOW",reasons,signer_policy_decision:recalculated.decision,proof:recalculated.proof};
}
