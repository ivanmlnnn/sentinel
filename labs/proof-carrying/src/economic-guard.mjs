/**
 * Deterministic in-process reference model only.
 * NOT a substitute for transactional D1/SQL conditional writes or on-chain state.
 */
export class EconomicGuard {
  #nonces = new Map();
  #idempotency = new Map();
  #spent = new Map();
  constructor({caps={}}={}) { this.caps=caps; }
  claimNonce(nonce, intentHash) {
    if (typeof nonce !== "string" || !nonce || typeof intentHash !== "string" || !intentHash) return {ok:false,reason:"INVALID_NONCE"};
    if (this.#nonces.has(nonce)) return {ok:false,reason:"NONCE_ALREADY_CLAIMED"};
    this.#nonces.set(nonce,intentHash);
    return {ok:true};
  }
  reserve({idempotencyKey,account,amount}) {
    if (!idempotencyKey || !account || !Number.isSafeInteger(amount) || amount <= 0) return {ok:false,reason:"INVALID_RESERVATION"};
    if (this.#idempotency.has(idempotencyKey)) return {ok:false,reason:"DUPLICATE_IDEMPOTENCY_KEY"};
    const next=(this.#spent.get(account)||0)+amount;
    const cap=this.caps[account];
    if (!Number.isSafeInteger(cap) || cap<=0) return {ok:false,reason:"MISSING_OR_INVALID_SPENDING_CAP"};
    if (next>cap) return {ok:false,reason:"SPENDING_CAP_EXCEEDED"};
    this.#idempotency.set(idempotencyKey,{account,amount});
    this.#spent.set(account,next);
    return {ok:true,spent:next};
  }
  spent(account) { return this.#spent.get(account)||0; }
  nonceCount() { return this.#nonces.size; }
}
