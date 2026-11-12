use near_sdk::{env,json_types::{U128,U64},near,store::{LookupMap,LookupSet},AccountId,NearToken,PanicOnDefault,Promise};
const HARD_MAX_PAYMENT_YOCTO:u128=100_000_000_000_000_000_000_000;
const HARD_MAX_DAILY_PAYMENT_YOCTO:u128=200_000_000_000_000_000_000_000;
const MAX_PROOF_TTL_NS:u64=300_000_000_000;
const DOMAIN:&[u8]=b"SENTINEL-PROOF-CARRYING-PAYMENT-V1";
const INTENT_DOMAIN:&[u8]=b"SENTINEL-PAYMENT-INTENT-V1";

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SentinelPayment{
 owner_id:AccountId, signer_id:AccountId, signer_public_key:Option<Vec<u8>>, signer_key_version:u64,
 max_payment_yocto:u128,max_daily_payment_yocto:u128,paused:bool,
 used_approvals:LookupSet<String>,used_nonces:LookupSet<String>,daily_spend_by_day:LookupMap<u64,u128>,
}
#[near]
impl SentinelPayment{
 #[init]
 pub fn new(owner_id:AccountId,signer_id:AccountId,max_payment_yocto:U128,max_daily_payment_yocto:U128)->Self{
  assert!(!env::state_exists(),"ALREADY_INITIALIZED");
  assert!(max_payment_yocto.0>0&&max_payment_yocto.0<=HARD_MAX_PAYMENT_YOCTO,"INVALID_MAX_PAYMENT");
  assert!(max_daily_payment_yocto.0>=max_payment_yocto.0&&max_daily_payment_yocto.0<=HARD_MAX_DAILY_PAYMENT_YOCTO,"INVALID_DAILY_CAP");
  Self{owner_id,signer_id,signer_public_key:None,signer_key_version:0,max_payment_yocto:max_payment_yocto.0,max_daily_payment_yocto:max_daily_payment_yocto.0,paused:false,
   used_approvals:LookupSet::new(b"sentinel:used-approvals:v2".to_vec()),used_nonces:LookupSet::new(b"sentinel:used-nonces:v1".to_vec()),daily_spend_by_day:LookupMap::new(b"sentinel:daily-spend:v2".to_vec())}
 }
 pub fn set_proof_signer_key(&mut self,public_key_hex:String){
  assert_eq!(env::predecessor_account_id(),self.owner_id,"OWNER_ONLY");
  let key=decode_hex::<32>(&public_key_hex).expect("INVALID_PROOF_SIGNER_PUBLIC_KEY");
  assert!(key.iter().any(|b|*b!=0),"INVALID_PROOF_SIGNER_PUBLIC_KEY");
  self.signer_public_key=Some(key.to_vec());
  self.signer_key_version=self.signer_key_version.checked_add(1).expect("SIGNER_KEY_VERSION_OVERFLOW");
  env::log_str(&format!("SENTINEL_PROOF_SIGNER_KEY_ROTATED:{}",self.signer_key_version));
 }
 /// The old three-argument pay ABI is intentionally removed: every payment requires this proof envelope.
 pub fn pay(&mut self,receiver_id:AccountId,amount_yocto:U128,approval_id:String,nonce:String,memo:String,
  issued_at_ns:U64,expires_at_ns:U64,provenance_root:String,evidence_snapshot_hash:String,policy_version:String,signature:String)->Promise{
  assert!(!self.paused,"PAYMENTS_PAUSED");
  let caller=env::predecessor_account_id();
  assert_eq!(caller,self.signer_id,"UNAUTHORIZED_CALLER");
  assert_ne!(receiver_id,env::current_account_id(),"SELF_PAYMENT_FORBIDDEN");
  assert!(amount_yocto.0>0,"INVALID_AMOUNT");
  assert!(amount_yocto.0<=self.max_payment_yocto,"PAYMENT_LIMIT_EXCEEDED");
  validate_token(&approval_id,128,"INVALID_APPROVAL_ID");
  validate_token(&nonce,128,"INVALID_NONCE");
  assert!(!memo.is_empty()&&memo.len()<=512,"INVALID_MEMO");
  validate_token(&policy_version,64,"INVALID_POLICY_VERSION");
  assert!(!self.used_approvals.contains(&approval_id),"APPROVAL_ALREADY_USED");
  assert!(!self.used_nonces.contains(&nonce),"NONCE_ALREADY_USED");
  let now=env::block_timestamp();
  assert!(issued_at_ns.0<=now,"PROOF_ISSUED_IN_FUTURE");
  assert!(expires_at_ns.0>now&&expires_at_ns.0>issued_at_ns.0,"PROOF_EXPIRED_OR_INVALID");
  assert!(expires_at_ns.0-issued_at_ns.0<=MAX_PROOF_TTL_NS,"PROOF_TTL_TOO_LONG");
  let public_key:[u8;32]=self.signer_public_key.as_ref().expect("PROOF_SIGNER_KEY_NOT_CONFIGURED").as_slice().try_into().expect("INVALID_STORED_PROOF_KEY");
  let sig=decode_hex::<64>(&signature).expect("INVALID_PROOF_SIGNATURE_ENCODING");
  let root=decode_hex::<32>(&provenance_root).expect("INVALID_PROVENANCE_ROOT");
  let evidence=decode_hex::<32>(&evidence_snapshot_hash).expect("INVALID_EVIDENCE_SNAPSHOT_HASH");
  let intent=intent_hash(&receiver_id,amount_yocto.0,&memo);
  let message=proof_message(&env::chain_id(),&env::current_account_id(),&caller,&receiver_id,amount_yocto.0,&approval_id,&nonce,
   issued_at_ns.0,expires_at_ns.0,&intent,&root,&evidence,&policy_version,self.signer_key_version);
  assert!(env::ed25519_verify(&sig,&message,&public_key),"INVALID_PROOF_SIGNATURE");
  const NANOS_PER_DAY:u64=86_400_000_000_000;
  let day=now/NANOS_PER_DAY;
  let spent=self.daily_spend_by_day.get(&day).copied().unwrap_or(0);
  let next=spent.checked_add(amount_yocto.0).expect("DAILY_SPEND_OVERFLOW");
  assert!(next<=self.max_daily_payment_yocto,"DAILY_PAYMENT_LIMIT_EXCEEDED");
  self.daily_spend_by_day.insert(day,next);
  self.used_approvals.insert(approval_id.clone());
  self.used_nonces.insert(nonce.clone());
  let digest=env::sha256(&message);
  env::log_str(&format!("EVENT_JSON:{{\"standard\":\"sentinel_proof_payment\",\"version\":\"1.0.0\",\"event\":\"payment_authorized\",\"data\":[{{\"approval_id\":\"{}\",\"nonce\":\"{}\",\"intent_hash\":\"{}\",\"proof_digest\":\"{}\",\"policy_version\":\"{}\"}}]}}",
   approval_id,nonce,to_hex(&intent),to_hex(&digest),policy_version));
  Promise::new(receiver_id).transfer(NearToken::from_yoctonear(amount_yocto.0))
 }
 pub fn set_paused(&mut self,paused:bool){assert_eq!(env::predecessor_account_id(),self.owner_id,"OWNER_ONLY");self.paused=paused;}
 pub fn set_max_payment(&mut self,value:U128){assert_eq!(env::predecessor_account_id(),self.owner_id,"OWNER_ONLY");assert!(value.0>0&&value.0<=HARD_MAX_PAYMENT_YOCTO&&value.0<=self.max_daily_payment_yocto,"INVALID_MAX_PAYMENT");self.max_payment_yocto=value.0;}
 pub fn set_max_daily_payment(&mut self,value:U128){assert_eq!(env::predecessor_account_id(),self.owner_id,"OWNER_ONLY");assert!(value.0>=self.max_payment_yocto&&value.0<=HARD_MAX_DAILY_PAYMENT_YOCTO,"INVALID_DAILY_CAP");self.max_daily_payment_yocto=value.0;}
 pub fn get_config(&self)->(AccountId,AccountId,U128,U128,bool){(self.owner_id.clone(),self.signer_id.clone(),U128(self.max_payment_yocto),U128(self.max_daily_payment_yocto),self.paused)}
 pub fn get_proof_signer_config(&self)->(bool,U64){(self.signer_public_key.is_some(),U64(self.signer_key_version))}
}
fn validate_token(v:&str,max:usize,error:&str){assert!(!v.is_empty()&&v.len()<=max,"{}",error);assert!(v.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_'),"{}",error);}
fn append_bytes(o:&mut Vec<u8>,v:&[u8]){let n:u32=v.len().try_into().expect("PROOF_FIELD_TOO_LARGE");o.extend_from_slice(&n.to_be_bytes());o.extend_from_slice(v);}
fn append_string(o:&mut Vec<u8>,v:&str){append_bytes(o,v.as_bytes());}
fn intent_hash(receiver:&AccountId,amount:u128,memo:&str)->[u8;32]{let mut b=Vec::new();b.extend_from_slice(INTENT_DOMAIN);append_string(&mut b,receiver.as_str());b.extend_from_slice(&amount.to_be_bytes());append_string(&mut b,memo);env::sha256(&b).try_into().expect("SHA256_LENGTH")}
#[allow(clippy::too_many_arguments)]
fn proof_message(chain:&str,contract:&AccountId,signer:&AccountId,receiver:&AccountId,amount:u128,approval:&str,nonce:&str,issued:u64,expires:u64,
 intent:&[u8;32],root:&[u8;32],evidence:&[u8;32],policy:&str,key_version:u64)->Vec<u8>{
 let mut o=Vec::with_capacity(512);append_bytes(&mut o,DOMAIN);append_string(&mut o,chain);append_string(&mut o,contract.as_str());append_string(&mut o,signer.as_str());
 append_string(&mut o,receiver.as_str());o.extend_from_slice(&amount.to_be_bytes());append_string(&mut o,approval);append_string(&mut o,nonce);
 o.extend_from_slice(&issued.to_be_bytes());o.extend_from_slice(&expires.to_be_bytes());o.extend_from_slice(intent);o.extend_from_slice(root);o.extend_from_slice(evidence);
 append_string(&mut o,policy);append_string(&mut o,"ALLOW");o.extend_from_slice(&key_version.to_be_bytes());o
}
fn decode_hex<const N:usize>(v:&str)->Option<[u8;N]>{if v.len()!=N*2||!v.is_ascii(){return None;}let mut o=[0u8;N];for i in 0..N{o[i]=(nibble(v.as_bytes()[2*i])?<<4)|nibble(v.as_bytes()[2*i+1])?;}Some(o)}
fn nibble(b:u8)->Option<u8>{match b{b'0'..=b'9'=>Some(b-b'0'),b'a'..=b'f'=>Some(b-b'a'+10),b'A'..=b'F'=>Some(b-b'A'+10),_=>None}}
fn to_hex(b:&[u8])->String{const H:&[u8;16]=b"0123456789abcdef";let mut s=String::with_capacity(b.len()*2);for x in b{s.push(H[(x>>4)as usize]as char);s.push(H[(x&15)as usize]as char);}s}
#[cfg(test)]
mod tests{
 use super::*;use ed25519_dalek::{Signer,SigningKey};use std::str::FromStr;
 fn msg(receiver:&str,amount:u128)->Vec<u8>{let r=AccountId::from_str(receiver).unwrap();let c=AccountId::from_str("sentinel.testnet").unwrap();let s=AccountId::from_str("agent.testnet").unwrap();let i=intent_hash(&r,amount,"invoice-42");proof_message("testnet",&c,&s,&r,amount,"approval-42","nonce-42",1000,2000,&i,&[3;32],&[4;32],"policy-v1",1)}
 #[test]fn ed25519_accepts_exact_and_rejects_tampered(){let k=SigningKey::from_bytes(&[7;32]);let m=msg("receiver.testnet",123);let sig=k.sign(&m).to_bytes();let pk=k.verifying_key().to_bytes();assert!(env::ed25519_verify(&sig,&m,&pk));let mut bad=m.clone();bad.push(0);assert!(!env::ed25519_verify(&sig,&bad,&pk));assert!(!env::ed25519_verify(&[0;64],&m,&pk));}
 #[test]fn signature_binds_receiver_and_amount(){let k=SigningKey::from_bytes(&[8;32]);let m=msg("receiver.testnet",123);let sig=k.sign(&m).to_bytes();let pk=k.verifying_key().to_bytes();assert!(!env::ed25519_verify(&sig,&msg("attacker.testnet",123),&pk));assert!(!env::ed25519_verify(&sig,&msg("receiver.testnet",124),&pk));}

 #[test]fn rejects_every_single_bit_flip_in_signed_message(){
  let k=SigningKey::from_bytes(&[11;32]);let m=msg("receiver.testnet",777);let sig=k.sign(&m).to_bytes();let pk=k.verifying_key().to_bytes();
  let mut checked=0usize;
  for i in 0..m.len(){for bit in 0..8{let mut changed=m.clone();changed[i]^=1u8<<bit;assert!(!env::ed25519_verify(&sig,&changed,&pk),"message byte {i}, bit {bit}");checked+=1;}}
  assert!(checked>=2000,"expected hundreds of independent tamper vectors");
 }
 #[test]fn rejects_every_single_bit_flip_in_signature(){
  let k=SigningKey::from_bytes(&[12;32]);let m=msg("receiver.testnet",888);let sig=k.sign(&m).to_bytes();let pk=k.verifying_key().to_bytes();
  let mut checked=0usize;
  for i in 0..sig.len(){for bit in 0..8{let mut changed=sig;changed[i]^=1u8<<bit;assert!(!env::ed25519_verify(&changed,&m,&pk),"signature byte {i}, bit {bit}");checked+=1;}}
  assert_eq!(checked,512);
 }
 #[test]fn wrong_public_key_never_verifies(){
  let k=SigningKey::from_bytes(&[13;32]);let wrong=SigningKey::from_bytes(&[14;32]);let m=msg("receiver.testnet",999);let sig=k.sign(&m).to_bytes();
  assert!(!env::ed25519_verify(&sig,&m,&wrong.verifying_key().to_bytes()));
 }

 #[test]fn strict_hex_decoder(){assert_eq!(decode_hex::<2>("00aF"),Some([0,175]));assert_eq!(decode_hex::<2>("00af00"),None);assert_eq!(decode_hex::<2>("00xz"),None);assert_eq!(decode_hex::<2>("00é"),None);}
 #[test]fn intent_hash_binds_receiver_amount_and_memo(){let r=AccountId::from_str("receiver.testnet").unwrap();let o=AccountId::from_str("other.testnet").unwrap();let h=intent_hash(&r,123,"invoice-42");assert_ne!(h,intent_hash(&r,123,"invoice-43"));assert_ne!(h,intent_hash(&o,123,"invoice-42"));assert_ne!(h,intent_hash(&r,124,"invoice-42"));}
}
