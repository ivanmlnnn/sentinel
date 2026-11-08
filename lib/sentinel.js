export function validAccountId(value) {
  return typeof value === 'string' && value.length >= 2 && value.length <= 64 &&
    /^[a-z0-9._-]+$/.test(value) && !value.startsWith('.') && !value.endsWith('.');
}
export function decideRisk(account, verifiedThreat, amount) {
  const factors = [];
  let score = 0;
  if (!account) {
    score += 55;
    factors.push({ code: 'ACCOUNT_NOT_FOUND', severity: 'high', detail: 'The receiver account could not be verified on the selected NEAR network.' });
  } else {
    const emptyHash = '11111111111111111111111111111111';
    const hasContract = account.code_hash && account.code_hash !== emptyHash;
    factors.push({ code: 'ACCOUNT_EXISTS', severity: 'info', detail: 'Receiver account exists on-chain.' });
    factors.push({ code: hasContract ? 'CONTRACT_PRESENT' : 'NO_CONTRACT_CODE', severity: 'info', detail: hasContract ? 'Receiver has deployed contract code.' : 'Receiver has no deployed contract code.' });
    if (hasContract) factors.push({ code: 'CODE_HASH_OBSERVED', severity: 'info', detail: 'A contract code hash was observed; this is a point-in-time observation, not a historical change check.' });
  }
  if (verifiedThreat) {
    score = 100;
    factors.push({ code: 'VERIFIED_THREAT_REPORT', severity: 'critical', detail: 'A verified threat registry entry matches this receiver.' });
  }
  if (Number(amount) > 1000) {
    score = Math.max(score, 35);
    factors.push({ code: 'LARGE_TRANSFER_REVIEW', severity: 'medium', detail: 'Large transfer amount exceeds the demo review threshold of 1,000 NEAR.' });
  }
  const decision = score >= 80 ? 'BLOCK' : score >= 30 ? 'WARN' : 'ALLOW';
  return { decision, risk_score: Math.min(100, score), risk_factors: factors };
}