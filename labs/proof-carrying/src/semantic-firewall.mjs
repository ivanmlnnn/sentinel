import { digest } from "./provenance.mjs";

const FIELDS = ["receiver", "amount", "memo"];
const CONFUSABLES = new Map([["0","o"],["1","l"],["3","e"],["5","s"],["а","a"],["е","e"],["о","o"],["р","p"],["с","c"],["х","x"]]);
export function normalizeIdentifier(value) {
  return String(value).normalize("NFKC").toLowerCase().replace(/[0135аеорсх]/g, ch => CONFUSABLES.get(ch) || ch).replace(/[\u200B-\u200D\uFEFF]/g, "");
}
export function comparePaymentIntents({original, proposed, approved}) {
  const mutations = [];
  for (const field of FIELDS) {
    if (String(original?.[field] ?? "") !== String(proposed?.[field] ?? "")) {
      mutations.push({field, type: field === "receiver" ? "RECEIVER_MUTATION" : field === "amount" ? "AMOUNT_MUTATION" : "MEMO_MUTATION"});
    }
  }
  if (approved && digest(approved) !== digest(proposed)) mutations.push({field:"approval",type:"APPROVAL_BINDING_MISMATCH"});
  if (original?.receiver && proposed?.receiver && normalizeIdentifier(original.receiver) === normalizeIdentifier(proposed.receiver) && original.receiver !== proposed.receiver) {
    mutations.push({field:"receiver",type:"IDENTIFIER_CONFUSABLE"});
  }
  return {decision: mutations.length ? "BLOCK" : "ALLOW", mutations, original_hash:digest(original), proposed_hash:digest(proposed), drift_count:mutations.length};
}
export function detectSplitPayments(payments, {windowMs=60000, threshold=1}={}) {
  if (!Array.isArray(payments) || !Number.isSafeInteger(windowMs) || windowMs<=0 || !Number.isSafeInteger(threshold) || threshold<1) return [{reason:"INVALID_SPLIT_PAYMENT_INPUT"}];
  const groups = new Map();
  for (const p of payments) {
    if (!p || typeof p.payer!=="string" || typeof p.receiver!=="string" || !Number.isFinite(p.timestamp) || !Number.isFinite(Number(p.amount)) || Number(p.amount)<=0) return [{reason:"MALFORMED_PAYMENT_RECORD"}];
    const key=JSON.stringify([p.payer,p.receiver]);
    const list=groups.get(key)||[]; list.push(p); groups.set(key,list);
  }
  const findings=[];
  for (const [key,list] of groups) {
    const sorted=[...list].sort((a,b)=>a.timestamp-b.timestamp);
    for (let i=0;i<sorted.length;i++) {
      const window=sorted.filter(x=>x.timestamp>=sorted[i].timestamp && x.timestamp<sorted[i].timestamp+windowMs);
      if (window.length>threshold) {
        findings.push({key,count:window.length,total:window.reduce((n,x)=>n+Number(x.amount),0),transaction_ids:window.map(x=>x.id ?? null)});
        break;
      }
    }
  }
  return findings;
}
