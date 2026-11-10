use near_sdk::{
    env,
    json_types::U128,
    near,
    store::{LookupMap, LookupSet},
    AccountId,
    NearToken,
    PanicOnDefault,
    Promise,
};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SentinelPayment {
    owner_id: AccountId,
    signer_id: AccountId,
    max_payment_yocto: u128,
    max_daily_payment_yocto: u128,
    paused: bool,
    used_approvals: LookupSet<String>,
    daily_spend_by_day: LookupMap<u64, u128>,
}

#[near]
impl SentinelPayment {
    #[init]
    pub fn new(
        owner_id: AccountId,
        signer_id: AccountId,
        max_payment_yocto: U128,
        max_daily_payment_yocto: U128,
    ) -> Self {
        assert!(!env::state_exists(), "ALREADY_INITIALIZED");
        assert!(max_payment_yocto.0 > 0, "INVALID_MAX_PAYMENT");
        assert!(max_daily_payment_yocto.0 >= max_payment_yocto.0, "INVALID_DAILY_CAP");
        Self {
            owner_id,
            signer_id,
            max_payment_yocto: max_payment_yocto.0,
            max_daily_payment_yocto: max_daily_payment_yocto.0,
            paused: false,
            used_approvals: LookupSet::new(b"sentinel:used-approvals".to_vec()),
            daily_spend_by_day: LookupMap::new(b"sentinel:daily-spend".to_vec()),
        }
    }

    /// Called only by the Sentinel account's FunctionCall key scoped to this contract.
    /// The contract, not the agent key, holds and transfers the native NEAR balance.
    pub fn pay(&mut self, receiver_id: AccountId, amount_yocto: U128, approval_id: String) -> Promise {
        assert!(!self.paused, "PAYMENTS_PAUSED");
        assert_eq!(env::predecessor_account_id(), self.signer_id, "UNAUTHORIZED_CALLER");
        assert_ne!(receiver_id, env::current_account_id(), "SELF_PAYMENT_FORBIDDEN");
        assert!(amount_yocto.0 > 0, "INVALID_AMOUNT");
        assert!(amount_yocto.0 <= self.max_payment_yocto, "PAYMENT_LIMIT_EXCEEDED");
        assert!(!approval_id.is_empty() && approval_id.len() <= 128, "INVALID_APPROVAL_ID");
        assert!(!self.used_approvals.contains(&approval_id), "APPROVAL_ALREADY_USED");

        // The contract independently enforces a UTC-day cap, even if the Worker is compromised.
        const NANOS_PER_DAY: u64 = 86_400_000_000_000;
        let day = env::block_timestamp() / NANOS_PER_DAY;
        let spent = self.daily_spend_by_day.get(&day).copied().unwrap_or(0);
        let next_spent = spent.checked_add(amount_yocto.0).expect("DAILY_SPEND_OVERFLOW");
        assert!(next_spent <= self.max_daily_payment_yocto, "DAILY_PAYMENT_LIMIT_EXCEEDED");

        // Reserve before scheduling the promise. A failed transfer remains conservatively counted.
        self.daily_spend_by_day.insert(day, next_spent);
        self.used_approvals.insert(approval_id);

        Promise::new(receiver_id).transfer(NearToken::from_yoctonear(amount_yocto.0))
    }

    pub fn set_paused(&mut self, paused: bool) {
        assert_eq!(env::predecessor_account_id(), self.owner_id, "OWNER_ONLY");
        self.paused = paused;
    }

    pub fn set_max_payment(&mut self, max_payment_yocto: U128) {
        assert_eq!(env::predecessor_account_id(), self.owner_id, "OWNER_ONLY");
        assert!(max_payment_yocto.0 > 0 && max_payment_yocto.0 <= self.max_daily_payment_yocto, "INVALID_MAX_PAYMENT");
        self.max_payment_yocto = max_payment_yocto.0;
    }

    pub fn set_max_daily_payment(&mut self, max_daily_payment_yocto: U128) {
        assert_eq!(env::predecessor_account_id(), self.owner_id, "OWNER_ONLY");
        assert!(max_daily_payment_yocto.0 >= self.max_payment_yocto, "INVALID_DAILY_CAP");
        self.max_daily_payment_yocto = max_daily_payment_yocto.0;
    }

    pub fn get_config(&self) -> (AccountId, AccountId, U128, U128, bool) {
        (self.owner_id.clone(), self.signer_id.clone(), U128(self.max_payment_yocto),
         U128(self.max_daily_payment_yocto), self.paused)
    }
}
