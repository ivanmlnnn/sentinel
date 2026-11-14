const CHAIN_IDS = { eth: "0xaa36a7", base: "0x14a34", arb: "0x66eee", bsc: "0x61" };
const NATIVE_EVM_SYMBOLS = { eth: new Set(["ETH"]), base: new Set(["ETH"]), arb: new Set(["ETH"]), bsc: new Set(["BNB"]) };
const TERMINAL = new Set(["SUCCESS", "REFUNDED", "FAILED"]);
const PENDING_NEAR_APPROVAL_KEY = "sentinel:pending-near-approval:v1";

// EIP-6963 discovery supports browsers exposing more than one wallet provider.
// Meteor is preferred when it explicitly announces an EVM provider; otherwise
// retain the browser's active EIP-1193 provider without pretending NEAR is EVM.
const discoveredEvmProviders = new Map();
let selectedEvmProvider = null;
if (typeof window !== "undefined" && !window.__SENTINEL_EIP6963_LISTENER__) {
  window.__SENTINEL_EIP6963_LISTENER__ = true;
  window.addEventListener("eip6963:announceProvider", event => {
    const detail = event?.detail;
    if (detail?.provider && typeof detail.provider.request === "function") {
      const key = detail.info?.uuid || detail.info?.rdns || detail.info?.name || String(discoveredEvmProviders.size);
      discoveredEvmProviders.set(String(key), { provider: detail.provider, info: detail.info || {} });
    }
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function parseChatSwapPrompt(prompt) {
  const text = String(prompt || "").trim();
  const match = text.match(/\b(?:swap|tukar|exchange)\s+(\d+(?:[.,]\d+)?)\s+([a-z0-9]+)\s+(?:to|ke|jadi)\s+([a-z0-9]+)\b/i);
  if (!match) return null;
  const amount = match[1].replace(",", ".");
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount) || Number(amount) <= 0) return null;
  return { amount, from: match[2].toUpperCase(), to: match[3].toUpperCase() };
}
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function addField(parent, labelText, input) {
  const label = el("label", labelText);
  label.append(input);
  parent.append(label);
}
function decimalToUnits(value, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) throw new Error("Token decimals are invalid.");
  const parts = String(value).split(".");
  if ((parts[1] || "").length > decimals) throw new Error("Amount has more decimal places than this token supports.");
  const whole = BigInt(parts[0] || "0");
  const fraction = BigInt(((parts[1] || "") + "0".repeat(decimals)).slice(0, decimals) || "0");
  const units = whole * (10n ** BigInt(decimals)) + fraction;
  if (units <= 0n) throw new Error("Amount must be greater than zero.");
  return units.toString();
}
export function resolveInitialSwapToken(tokens, symbol) {
  const key = String(symbol || "").toUpperCase();
  if (key === "NEAR") {
    const nativeNear = tokens.find(token => token.native === true && token.asset_id === "native:near");
    if (nativeNear) return nativeNear;
  }
  const matches = tokens.filter(token => String(token.symbol).toUpperCase() === key);
  if (!matches.length) return null;
  // Sentinel's connected signer is Meteor's NEAR Testnet session. Prefer a
  // registry-backed NEAR representation (including bridged ETH) so balance
  // reads and deposits use that same signer instead of prompting for another
  // EVM wallet. Fall back to the original chain only when no NEAR asset exists.
  const nearMatch = matches.find(token => String(token.blockchain).toLowerCase() === "near");
  if (nearMatch) return nearMatch;
  const preferredChain = key === "ETH" ? "eth" : key === "BNB" ? "bsc" :
    key === "SOL" ? "sol" : key === "BTC" || key === "WBTC" ? "btc" :
    key === "XLM" ? "stellar" : key === "XRP" ? "xrp" :
    key === "SUI" ? "sui" : "near";
  return matches.find(token => String(token.blockchain).toLowerCase() === preferredChain) ||
    matches.find(token => CHAIN_IDS[String(token.blockchain).toLowerCase()]) || matches[0];
}
export function resolveTidepoolSwapAssets(origin, destination, tokens) {
  const isNativeNear = token => token?.native === true && token.asset_id === "native:near";
  const nativeNear = tokens.find(token => token.asset_id === "nep141:wnear.tidepool-sandbox.testnet");
  const wrapNativeNear = isNativeNear(origin);
  const unwrapNativeNear = isNativeNear(destination);
  const quoteOrigin = wrapNativeNear ? nativeNear : origin;
  const quoteDestination = unwrapNativeNear ? nativeNear : destination;
  if (!quoteOrigin || !quoteDestination) {
    throw new Error("Tidepool WNEAR is not present in the live Testnet registry; native NEAR cannot be wrapped or unwrapped on this route.");
  }
  if (quoteOrigin.asset_id === quoteDestination.asset_id) {
    throw new Error("The selected route resolves to the same WNEAR asset on both sides. Choose a different token.");
  }
  if ((wrapNativeNear || unwrapNativeNear) &&
      (quoteOrigin.blockchain !== "near" && quoteDestination.blockchain !== "near" ||
       nativeNear?.blockchain !== "near" ||
       nativeNear?.contract_address !== "wnear.tidepool-sandbox.testnet")) {
    throw new Error("Native NEAR conversion requires the verified Tidepool WNEAR Testnet contract.");
  }
  return { quoteOrigin, quoteDestination, wrapNativeNear, unwrapNativeNear };
}

export function buildNearWalletUnwrapActions(amount) {
  if (typeof amount !== "string" || !/^[1-9][0-9]*$/.test(amount)) {
    throw new Error("Invalid WNEAR amount for native NEAR withdrawal.");
  }
  return [{
    type: "FunctionCall",
    params: {
      methodName: "near_withdraw",
      args: { amount },
      gas: "30000000000000",
      deposit: "1"
    }
  }];
}
function formatToken(token) {
  return token.native && token.asset_id === "native:near"
    ? "NEAR · NATIVE · TESTNET"
    : token.symbol + " · " + token.blockchain.toUpperCase() + " · TESTNET";
}
function tokenAddressValid(token) {
  return typeof token.contract_address === "string" && /^0x[a-f0-9]{40}$/i.test(token.contract_address);
}
function nearAccount(value) {
  return typeof value === "string" && /^(?:[a-f0-9]{64}|[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet)$/i.test(value);
}
function evmAddress(value) { return typeof value === "string" && /^0x[a-f0-9]{40}$/i.test(value); }
function validManualTxHash(chain, hash) {
  if (["stellar", "xrp", "btc"].includes(chain)) return /^[a-f0-9]{64}$/i.test(hash);
  if (chain === "sol") return /^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(hash);
  if (chain === "sui") return /^[1-9A-HJ-NP-Za-km-z]{30,60}$/.test(hash);
  return typeof hash === "string" && hash.length >= 8 && hash.length <= 200 && !/\s/.test(hash);
}
function encodeErc20Transfer(to, amount) {
  return "0xa9059cbb" + to.slice(2).toLowerCase().padStart(64, "0") + BigInt(amount).toString(16).padStart(64, "0");
}
function getInjectedEvmProvider() {
  if (selectedEvmProvider && typeof selectedEvmProvider.request === "function") return selectedEvmProvider;
  const announced = [...discoveredEvmProviders.values()];
  const meteor = announced.find(item => /meteor/i.test(String(item.info?.name || "") + " " + String(item.info?.rdns || "")));
  if (meteor) return meteor.provider;
  const providers = Array.isArray(window.ethereum?.providers) ? window.ethereum.providers : [window.ethereum];
  return providers.find(item => item && typeof item.request === "function" && !item.isBraveWallet) ||
    providers.find(item => item && typeof item.request === "function") || announced[0]?.provider || null;
}
function getEvmProviderLabel(provider) {
  const match = [...discoveredEvmProviders.values()].find(item => item.provider === provider);
  return match?.info?.name || provider?.walletName || provider?.name || "Connected EVM wallet";
}
async function connectEvm(refundInput, chain) {
  const provider = getInjectedEvmProvider();
  if (!provider) throw new Error("This route requires an EVM account on " + chain.toUpperCase() + ". The connected Meteor NEAR session is separate; select the NEAR-testnet ETH asset if that is the balance shown in Meteor. Sentinel will not request or substitute a second wallet.");
  selectedEvmProvider = provider;
  // Reuse only an account that the already-connected Meteor provider exposes.
  // Never call eth_requestAccounts here: that would create a second wallet
  // permission/connect flow, contrary to Sentinel's single-session design.
  const accounts = await provider.request({ method: "eth_accounts" });
  const account = Array.isArray(accounts) ? accounts.find(evmAddress) : null;
  if (!evmAddress(account)) throw new Error("Meteor is connected, but it has not exposed an EVM account to Sentinel. No additional wallet connection was requested.");
  const wantedChain = CHAIN_IDS[chain];
  if (!wantedChain) throw new Error("No audited EVM network mapping for " + chain + ".");
  const currentChain = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
  if (currentChain !== wantedChain) {
    throw new Error("Meteor's already-connected EVM provider is on a different network. Switch Meteor to the selected " + chain.toUpperCase() + " Testnet, then retry. Sentinel will not open a second wallet or switch networks behind your back.");
  }
  if (refundInput) refundInput.value = account;
  return { provider, account, chainId: wantedChain };
}
async function pollStatus(request, depositAddress, depositMemo, statusNode) {
  let latest = null;
  for (let i = 0; i < 30; i++) {
    const qs = "?depositAddress=" + encodeURIComponent(depositAddress) +
      (depositMemo ? "&depositMemo=" + encodeURIComponent(depositMemo) : "");
    latest = await request("/trading/status" + qs, { method: "GET" });
    const state = String(latest.status || "").toUpperCase();
    statusNode.textContent = "Tidepool status: " + (state || "UNKNOWN") +
      (latest.explorer_url ? " · " + latest.explorer_url : "");
    if (TERMINAL.has(state)) return latest;
    await new Promise(resolve => window.setTimeout(resolve, 2000));
  }
  return latest;
}
async function executeNearIntents(args) {
  const { request, connector, connectedAccount, liveQuote, swap, statusNode, detailsNode, encodeBase58, onSubmitted } = args;
  if (!connector || !connectedAccount || !nearAccount(connectedAccount)) throw new Error("Connect Meteor or another NEAR Testnet wallet first.");
  if (swap.refundTo.toLowerCase() !== connectedAccount.toLowerCase()) throw new Error("Refund address must equal the connected NEAR signing account.");
  const wallet = await connector.wallet();
  if (!wallet || typeof wallet.signMessage !== "function" || typeof wallet.signAndSendTransaction !== "function") {
    throw new Error("Connected NEAR wallet must support NEP-413 signing and Testnet transactions.");
  }
  const snapshot = await connector.getConnectedWallet();
  let account = snapshot?.accounts?.find(item => item.accountId?.toLowerCase() === connectedAccount.toLowerCase());
  if (!account && typeof wallet.getAccounts === "function") {
    account = (await wallet.getAccounts())?.find(item => item.accountId?.toLowerCase() === connectedAccount.toLowerCase());
  }
  const publicKey = account?.publicKey?.toString?.() || account?.publicKey || "";
  if (!publicKey.startsWith("ed25519:")) throw new Error("Could not verify the NEAR wallet public key.");
  let keyStatus = await request("/trading/key-status", { method: "POST", body: JSON.stringify({ accountId: connectedAccount, publicKey }) });
  if (!keyStatus.registered) {
    if (!window.confirm("One-time Tidepool verifier key registration is required. Your NEAR wallet will ask you to approve add_public_key; this uses Testnet gas and 1 yoctoNEAR. Continue?")) {
      throw new Error("Cancelled before verifier key registration. No swap was submitted.");
    }
    await wallet.signAndSendTransaction({
      receiverId: "verifier.tidepool-sandbox.testnet",
      actions: [{ type: "FunctionCall", params: { methodName: "add_public_key", args: { public_key: publicKey }, gas: "30000000000000", deposit: "1" } }]
    });
    let registered = false;
    for (let i = 0; i < 12; i++) {
      keyStatus = await request("/trading/key-status", { method: "POST", body: JSON.stringify({ accountId: connectedAccount, publicKey }) });
      if (keyStatus.registered === true) { registered = true; break; }
      await new Promise(resolve => window.setTimeout(resolve, 1500));
    }
    if (!registered) throw new Error("Verifier key registration was not confirmed. Swap signing stopped.");
  }
  const intent = await request("/trading/generate-intent", {
    method: "POST",
    body: JSON.stringify({
      providerQuote: liveQuote.signed_quote, signerId: connectedAccount,
      originAsset: swap.originAsset, destinationAsset: swap.destinationAsset,
      amount: swap.amount, recipient: swap.recipient, refundTo: swap.refundTo,
      slippageTolerance: swap.slippageTolerance
    })
  });
  if (intent.standard !== "nep413" || intent.signer_id !== connectedAccount ||
      intent.deposit_address !== liveQuote.deposit_address || intent.asset_id !== swap.originAsset ||
      intent.amount !== swap.amount || !intent.payload?.message || !intent.payload?.nonce || !intent.payload?.recipient) {
    throw new Error("Generated NEP-413 intent does not match the reviewed quote.");
  }
  const nonce = Uint8Array.from(atob(intent.payload.nonce), c => c.charCodeAt(0));
  if (nonce.length !== 32) throw new Error("Invalid NEP-413 nonce.");
  statusNode.textContent = "Review the exact swap intent in your NEAR wallet…";
  const signed = await wallet.signMessage({ message: intent.payload.message, recipient: intent.payload.recipient, nonce });
  if (signed?.accountId && signed.accountId.toLowerCase() !== connectedAccount.toLowerCase()) throw new Error("Wallet signed with a different account.");
  const signedPublicKey = signed?.publicKey?.toString?.() || signed?.public_key || "";
  if (signedPublicKey !== publicKey) throw new Error("NEAR wallet signature key differs from the connected account key.");
  const rawSignature = signed?.signature;
  const signature = typeof rawSignature === "string"
    ? (rawSignature.startsWith("ed25519:") ? rawSignature : "ed25519:" + rawSignature)
    : rawSignature instanceof Uint8Array ? "ed25519:" + encodeBase58(rawSignature) : "";
  if (!signedPublicKey.startsWith("ed25519:") || !signature.startsWith("ed25519:")) throw new Error("Wallet did not return a valid NEP-413 signature.");
  statusNode.textContent = "Submitting wallet-signed intent to Tidepool…";
  const submitted = await request("/trading/submit-intent", {
    method: "POST",
    body: JSON.stringify({
      signedData: { standard: "nep413", payload: intent.payload, public_key: signedPublicKey, signature },
      providerQuote: liveQuote.signed_quote, expectedSignerId: connectedAccount,
      expectedDepositAddress: liveQuote.deposit_address, expectedAsset: swap.originAsset,
      expectedDestinationAsset: swap.destinationAsset, expectedAmount: swap.amount,
      expectedRecipient: swap.recipient, expectedRefundTo: swap.refundTo,
      expectedSlippageTolerance: swap.slippageTolerance
    })
  });
  onSubmitted();
  statusNode.textContent = "Signed intent submitted. Waiting for Tidepool settlement…";
  const settled = await pollStatus(request, liveQuote.deposit_address, liveQuote.deposit_memo, statusNode);
  detailsNode.textContent = JSON.stringify({ submission: submitted, settlement: settled }, null, 2);
}
export function buildNearWalletDepositActions(amount, depositAddress, wrapNativeNear = false) {
  if (typeof amount !== "string" || !/^[1-9][0-9]*$/.test(amount) ||
      typeof depositAddress !== "string" || !/^[a-f0-9]{64}$/i.test(depositAddress)) {
    throw new Error("Invalid NEAR wallet deposit action parameters.");
  }
  return [
    ...(wrapNativeNear ? [{
      type: "FunctionCall",
      params: {
        methodName: "near_deposit",
        args: {},
        gas: "30000000000000",
        deposit: amount
      }
    }] : []),
    {
      type: "FunctionCall",
      params: {
        methodName: "ft_transfer_call",
        args: {
          receiver_id: "verifier.tidepool-sandbox.testnet",
          amount,
          msg: depositAddress
        },
        gas: "100000000000000",
        deposit: "1"
      }
    }
  ];
}
async function executeNearWalletDeposit(args) {
  const { connector, connectedAccount, liveQuote, swap, statusNode, detailsNode, request, onSubmitted } = args;
  if (!connector || !nearAccount(connectedAccount)) throw new Error("Connect Meteor or another NEAR Testnet wallet first.");
  if (swap.refundTo.toLowerCase() !== connectedAccount.toLowerCase()) {
    throw new Error("Refund address must equal the connected Meteor account.");
  }
  if (liveQuote.deposit_type !== "INTENTS" || !/^[a-f0-9]{64}$/i.test(liveQuote.deposit_address || "")) {
    throw new Error("Tidepool did not return a valid NEAR Intents deposit address.");
  }
  if (String(swap.origin.blockchain).toLowerCase() !== "near" ||
      typeof swap.origin.contract_address !== "string" ||
      !/^[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet$/i.test(swap.origin.contract_address)) {
    throw new Error("Selected NEAR asset has no verified NEP-141 Testnet contract.");
  }
  if (liveQuote.quote?.amount_in !== swap.amount ||
      liveQuote.quote_request?.amount !== swap.amount ||
      liveQuote.quote_request?.originAsset !== swap.originAsset) {
    throw new Error("Live quote amount or origin asset does not match the reviewed request.");
  }
  const nativeNearAsset = { blockchain: "near", symbol: "NEAR", decimals: 24, contract_address: null };
  const walletTokenBalance = await readSwapWalletBalance(
    swap.wrapNativeNear ? nativeNearAsset : swap.origin, connectedAccount, request
  );
  const requiredBalance = BigInt(swap.amount) + (swap.wrapNativeNear ? 10n ** 22n : 0n);
  if (!walletTokenBalance.raw || BigInt(walletTokenBalance.raw) < requiredBalance) {
    throw new Error(swap.wrapNativeNear
      ? "Native NEAR balance must cover the wrap amount plus at least 0.01 NEAR for transaction gas."
      : "Meteor wallet balance is insufficient for the exact quoted amount. Refresh balances and choose a smaller amount.");
  }
  const nativeGasBalance = swap.wrapNativeNear
    ? walletTokenBalance
    : await readSwapWalletBalance(nativeNearAsset, connectedAccount, request);
  if (!nativeGasBalance.raw || BigInt(nativeGasBalance.raw) <= 0n) {
    throw new Error("Meteor account has no native NEAR for Testnet transaction gas.");
  }
  const wallet = await connector.wallet();
  if (!wallet || typeof wallet.signAndSendTransaction !== "function") {
    throw new Error("Connected Meteor wallet does not support NEAR Testnet transactions.");
  }
  const snapshot = await connector.getConnectedWallet();
  const selectedAccount = snapshot?.accounts?.find(item =>
    item.accountId?.toLowerCase() === connectedAccount.toLowerCase()
  );
  if (!selectedAccount) throw new Error("Meteor connection changed. Reconnect and request a fresh quote.");
  return {
    wallet,
    transaction: {
      signerId: connectedAccount,
      receiverId: swap.origin.contract_address,
      actions: buildNearWalletDepositActions(swap.amount, liveQuote.deposit_address, swap.wrapNativeNear)
    },
    connectedAccount, liveQuote, swap
  };
}
async function finishNearWalletDeposit(walletApproval, prepared, args) {
  const { statusNode, detailsNode, request, onSubmitted } = args;
  const result = await walletApproval;
  const { connectedAccount, liveQuote, swap } = prepared;
  const txHash = result?.transaction?.hash || result?.transaction_outcome?.id ||
    result?.transactionHash || result?.hash || null;
  const validTxHash = typeof txHash === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(txHash);
  if (validTxHash) onSubmitted();
  statusNode.textContent = validTxHash
    ? "Meteor wallet transfer submitted. Waiting for Tidepool to credit and settle the swap…"
    : "Meteor returned without a verifiable transaction hash. Checking Tidepool status; approval is not yet confirmed.";
  detailsNode.textContent = JSON.stringify({
    origin: "NEAR TESTNET",
    token_contract: swap.origin.contract_address,
    amount: swap.amount,
    deposit_address: liveQuote.deposit_address,
    wallet_result: result
  }, null, 2);
  if (validTxHash) {
    try {
      await request("/trading/deposit-submit", {
        method: "POST",
        body: JSON.stringify({ txHash, depositAddress: liveQuote.deposit_address, nearSenderAccount: connectedAccount })
      });
    } catch (error) {
      statusNode.textContent = "Wallet transfer submitted; automatic Tidepool tracking is continuing. " + (error.message || "");
    }
  }
  const settled = await pollStatus(request, liveQuote.deposit_address, liveQuote.deposit_memo, statusNode);
  if (TERMINAL.has(String(settled?.status || "").toUpperCase())) {
    try { sessionStorage.removeItem(PENDING_NEAR_APPROVAL_KEY); } catch {}
  }
  detailsNode.textContent = JSON.stringify({ origin_tx_hash: txHash, settlement: settled }, null, 2);
  if (String(settled?.status || "").toUpperCase() !== "SUCCESS") {
    statusNode.textContent = "Tidepool status: " + String(settled?.status || "PENDING").toUpperCase() +
      ". Do not send again; wait for settlement or check the deposit status.";
  }
}

async function executeEvmDeposit(args) {
  const { request, token, liveQuote, swap, refundInput, statusNode, detailsNode, onSubmitted } = args;
  const { provider, account } = await connectEvm(refundInput, token.blockchain);
  if (account.toLowerCase() !== swap.refundTo.toLowerCase()) throw new Error("Connected EVM account differs from the reviewed refund address. Request a fresh quote.");
  if (!evmAddress(liveQuote.deposit_address)) throw new Error("Tidepool returned an invalid EVM deposit address.");
  if (liveQuote.deposit_memo) throw new Error("This EVM route unexpectedly requires a memo; automatic deposit is disabled.");
  const latestAccounts = await provider.request({ method: "eth_accounts" });
  const latestChain = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
  if (!Array.isArray(latestAccounts) || latestAccounts[0]?.toLowerCase() !== account.toLowerCase() ||
      latestChain !== CHAIN_IDS[token.blockchain]) {
    throw new Error("Wallet account or network changed after quote review. Request a fresh quote.");
  }
  if (liveQuote.quote?.amount_in !== swap.amount || liveQuote.quote_request?.amount !== swap.amount ||
      liveQuote.quote_request?.originAsset !== swap.originAsset) {
    throw new Error("Live quote amount or origin asset does not match the reviewed request.");
  }
  const tx = { from: account };
  if (token.contract_address !== null && token.contract_address !== undefined && token.contract_address !== "") {
    if (!tokenAddressValid(token)) throw new Error("Token contract address is invalid.");
    const contractCode = await provider.request({ method: "eth_getCode", params: [token.contract_address, "latest"] });
    if (typeof contractCode !== "string" || contractCode === "0x" || contractCode === "0x0") {
      throw new Error("Selected ERC-20 contract has no bytecode on the connected Testnet.");
    }
    tx.to = token.contract_address; tx.value = "0x0";
    tx.data = encodeErc20Transfer(liveQuote.deposit_address, swap.amount);
  } else {
    if (!NATIVE_EVM_SYMBOLS[token.blockchain]?.has(token.symbol.toUpperCase())) {
      throw new Error("Token has no verified contract address and is not the native asset for this EVM chain. Refusing to send native coin.");
    }
    tx.to = liveQuote.deposit_address; tx.value = "0x" + BigInt(swap.amount).toString(16);
  }
  const summary = "WALLET DEPOSIT REVIEW\n\nNetwork: " + token.blockchain.toUpperCase() +
    " TESTNET\nFrom: " + account + "\nTo: " + tx.to + "\nDeposit address: " + liveQuote.deposit_address +
    "\nAmount (base units): " + swap.amount + "\nToken: " + token.symbol +
    "\n\nYour wallet will show the exact transfer. Continue only if network, token, recipient and amount match.";
  if (!window.confirm(summary)) throw new Error("Cancelled before EVM wallet approval. No deposit was sent.");
  statusNode.textContent = "Approve the exact deposit transaction in your EVM wallet…";
  const txHash = await provider.request({ method: "eth_sendTransaction", params: [tx] });
  if (typeof txHash !== "string" || !/^0x[a-f0-9]{64}$/i.test(txHash)) throw new Error("Wallet did not return a valid EVM transaction hash.");
  onSubmitted();
  statusNode.textContent = "Origin-chain deposit submitted. Waiting for Tidepool settlement…";
  detailsNode.textContent = JSON.stringify({ origin_tx_hash: txHash, deposit_address: liveQuote.deposit_address }, null, 2);
  try {
    await request("/trading/deposit-submit", { method: "POST", body: JSON.stringify({ txHash, depositAddress: liveQuote.deposit_address }) });
  } catch (error) {
    statusNode.textContent = "Wallet transaction sent (" + txHash + "); Tidepool notification failed. Tracking status before any retry. " + error.message;
  }
  const settled = await pollStatus(request, liveQuote.deposit_address, liveQuote.deposit_memo, statusNode);
  detailsNode.textContent = JSON.stringify({ origin_tx_hash: txHash, settlement: settled }, null, 2);
}
function renderManualDeposit(panel, liveQuote, token, swap, request, statusNode, detailsNode, onSubmitted) {
  const instructions = el("pre");
  instructions.textContent = [
    "MANUAL ORIGIN-CHAIN DEPOSIT · SENTINEL WALLET ADAPTER NOT ENABLED",
    "Origin: " + token.blockchain.toUpperCase() + " TESTNET",
    "Asset: " + token.symbol,
    "Exact amount: " + (liveQuote.quote.amount_in_formatted || liveQuote.quote.amount_in) + " " + token.symbol,
    "Exact base-unit amount: " + liveQuote.quote.amount_in,
    "Deposit address: " + liveQuote.deposit_address,
    liveQuote.deposit_memo ? "REQUIRED MEMO / DESTINATION TAG: " + liveQuote.deposit_memo : "",
    "Recipient: " + swap.recipient,
    "Refund address: " + swap.refundTo,
    "Minimum output: " + liveQuote.quote.minimum_amount_out,
    "Deadline: " + liveQuote.deadline,
    "Send only the exact asset, amount and network above. Paste the origin-chain transaction hash below. A hash is not proof of settlement; wait for Tidepool SUCCESS."
  ].filter(Boolean).join("\n");
  panel.append(instructions);
  const hashInput = document.createElement("input");
  hashInput.autocomplete = "off"; hashInput.spellcheck = false;
  hashInput.placeholder = "Origin-chain transaction hash / signature";
  const submitHash = el("button", "Submit deposit hash & track", "secondary-btn");
  submitHash.type = "button";
  submitHash.addEventListener("click", async () => {
    const txHash = hashInput.value.trim();
    if (!validManualTxHash(token.blockchain, txHash)) {
      statusNode.textContent = "Transaction hash format does not match the selected " + token.blockchain.toUpperCase() + " network.";
      return;
    }
    submitHash.disabled = true;
    try {
      statusNode.textContent = "Submitting deposit transaction reference to Tidepool…";
      const body = { txHash, depositAddress: liveQuote.deposit_address };
      if (liveQuote.deposit_memo) body.memo = liveQuote.deposit_memo;
      const submitted = await request("/trading/deposit-submit", { method: "POST", body: JSON.stringify(body) });
      onSubmitted();
      detailsNode.textContent = JSON.stringify({ deposit_submission: submitted }, null, 2);
      statusNode.textContent = "Deposit reference accepted. Waiting for Tidepool settlement…";
      const settled = await pollStatus(request, liveQuote.deposit_address, liveQuote.deposit_memo, statusNode);
      detailsNode.textContent = JSON.stringify({ deposit_submission: submitted, settlement: settled }, null, 2);
    } catch (error) {
      statusNode.textContent = error.message || "Deposit reference failed. Verify the hash and retry without sending funds again.";
      submitHash.disabled = false;
    }
  });
  panel.append(hashInput, submitHash);
}



const CHAIN_LOGOS = {
  eth: "ethereum", ethereum: "ethereum", base: "base", arb: "arbitrum",
  arbitrum: "arbitrum", bsc: "binance", near: "nearprotocol",
  sol: "solana", solana: "solana", sui: "sui",
  stellar: "stellar", xrp: "ripple", btc: "bitcoin"
};
const TOKEN_LOGOS = {
  ETH: "ethereum", WETH: "ethereum", USDC: "usdcoin", USDT: "tether",
  WNEAR: "nearprotocol", NEAR: "nearprotocol", WBTC: "bitcoin", BTC: "bitcoin",
  SOL: "solana", SUI: "sui", BNB: "binance", XRP: "ripple", XLM: "stellar"
};
function chainLogo(chain) {
  const key = String(chain || "").toLowerCase();
  const slug = CHAIN_LOGOS[key];
  const wrap = el("span", undefined, "swap-chain-logo");
  if (!slug) { wrap.textContent = key.slice(0, 2).toUpperCase() || "◈"; return wrap; }
  const img = document.createElement("img");
  img.alt = key.toUpperCase() + " logo";
  img.loading = "lazy";
  img.decoding = "async";
  img.src = "https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/" + slug + ".svg";
  img.addEventListener("error", () => { wrap.replaceChildren(el("span", key.slice(0, 2).toUpperCase())); });
  wrap.append(img);
  return wrap;
}
function tokenLogo(token) {
  const symbol = String(token?.symbol || "ASSET").toUpperCase();
  const glyphs = { ETH: "♦", WETH: "♦", USDC: "$", USDT: "₮", WNEAR: "N", NEAR: "N", WBTC: "₿", BTC: "₿", XAUT: "Au", SOL: "◎", SUI: "S", BNB: "◆", XRP: "X", XLM: "✦" };
  const logo = el("span", glyphs[symbol] || symbol.slice(0, 2), "swap-token-logo token-logo-" + symbol.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  const slug = TOKEN_LOGOS[symbol];
  if (slug) {
    const img = document.createElement("img");
    img.alt = symbol + " logo";
    img.loading = "lazy";
    img.decoding = "async";
    img.src = "https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/" + slug + ".svg";
    img.addEventListener("error", () => { logo.replaceChildren(el("span", glyphs[symbol] || symbol.slice(0, 2))); });
    logo.replaceChildren(img);
  }
  logo.setAttribute("aria-label", symbol + " token");
  return logo;
}
function shortWalletAddress(value) {
  const text = String(value || "");
  return text.length > 18 ? text.slice(0, 8) + "…" + text.slice(-6) : text;
}

function formatUnitsForDisplay(raw, decimals) {
  const places = Number(decimals);
  if (!Number.isInteger(places) || places < 0 || places > 30) return "—";
  const value = BigInt(raw);
  const base = 10n ** BigInt(places);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(places, "0").slice(0, 6).replace(/0+$/, "");
  return fraction ? whole.toString() + "." + fraction : whole.toString();
}
export function formatUnitsForInput(raw, decimals) {
  const places = Number(decimals);
  if (!Number.isInteger(places) || places < 0 || places > 30) throw new Error("Token decimals are invalid.");
  const value = BigInt(raw);
  const base = 10n ** BigInt(places);
  const whole = value / base;
  const fraction = places ? (value % base).toString().padStart(places, "0").replace(/0+$/, "") : "";
  return fraction ? whole.toString() + "." + fraction : whole.toString();
}
async function readSwapWalletBalance(token, nearWalletAccount, request, evmAccountOverride = null) {
  const chain = String(token.blockchain || "").toLowerCase();
  if (CHAIN_IDS[chain]) {
    const provider = getInjectedEvmProvider();
    if (!provider || typeof provider.request !== "function") return { value: null, note: token.symbol === "ETH" ? "This is Ethereum Sepolia ETH, not Meteor NEAR-testnet ETH. For the ETH balance shown as a NEAR token in Meteor, select ETH · NEAR. Sepolia balance needs an exposed EVM address/provider." : "This asset is on " + chain.toUpperCase() + ", not NEAR Testnet. Meteor NEAR session alone cannot expose its EVM balance; an EVM address/provider is required." };
    const accounts = evmAccountOverride ? [evmAccountOverride] : await provider.request({ method: "eth_accounts" });
    const account = accounts?.[0];
    if (!evmAddress(account)) return { value: null, note: "Connect an EVM wallet to read this address" };
    const payload = token.asset_id
      ? { accountId: account, assetId: token.asset_id }
      : { accountId: account, native: true, blockchain: chain };
    const balance = await request("/trading-balance", { method: "POST", body: JSON.stringify(payload) });
    if (typeof balance.raw !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(balance.raw)) {
      throw new Error("EVM balance API returned an invalid value");
    }
    return { raw: balance.raw, value: formatUnitsForDisplay(balance.raw, balance.decimals ?? token.decimals), note: "Live " + chain.toUpperCase() + " Testnet RPC" };
  }
  if (chain === "near") {
    if (!nearAccount(nearWalletAccount)) return { value: null, note: "Connect a NEAR Testnet wallet" };
    if (typeof request !== "function") return { value: null, note: "Sentinel balance proxy unavailable" };
    const payload = await request("/trading-balance", {
      method: "POST",
      body: JSON.stringify(token.contract_address
        ? { accountId: nearWalletAccount, assetId: token.asset_id }
        : { accountId: nearWalletAccount, native: true })
    });
    if (typeof payload.raw !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(payload.raw)) {
      throw new Error("NEAR balance API returned an invalid value");
    }
    return { raw: payload.raw, value: formatUnitsForDisplay(payload.raw, payload.decimals ?? token.decimals), note: "Meteor wallet balance" };
  }
  return { value: null, note: "Wallet balance adapter not connected for " + chain.toUpperCase() };
}
function createSwapTokenPicker(select, tokenList, initialSymbol, nearWalletAccount, onSelected, request, evmWalletAccount = null, sharedBalances = null, onBalancesChanged = null, sharedRefreshState = null) {
  const root = el("div", undefined, "swap-token-picker");
  const trigger = el("button", undefined, "swap-token-trigger");
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  const panel = el("div", undefined, "swap-token-panel");
  panel.hidden = true;
  const backdrop = el("div", undefined, "swap-token-backdrop");
  backdrop.setAttribute("aria-hidden", "true");
  const panelHead = el("div", undefined, "swap-token-panel-head");
  panelHead.append(el("strong", "Select token"), el("span", "LIVE TESTNET REGISTRY"));
  const chainRow = el("div", undefined, "swap-chain-options");
  const list = el("div", undefined, "swap-token-list");
  const panelFoot = el("div", undefined, "swap-token-panel-foot");
  const balanceStamp = el("span", "Balances not checked");
  const refresh = el("button", "Refresh balances ↻", "swap-balance-refresh");
  refresh.type = "button";
  panelFoot.append(balanceStamp, refresh);
  panel.append(panelHead, chainRow, list, panelFoot);
  const chains = [...new Set(tokenList.map(token => String(token.blockchain || "").toLowerCase()))].filter(Boolean);
  let activeChain = tokenList.find(token => token.asset_id === select.value)?.blockchain || chains[0] || "";
  const balances = sharedBalances || new Map();
  let cachedEvmAccount = null;
  const balanceEvmProvider = getInjectedEvmProvider();
  if (balanceEvmProvider?.on) {
    balanceEvmProvider.on("accountsChanged", accounts => {
      cachedEvmAccount = evmAddress(accounts?.[0]) ? accounts[0] : null;
      for (const token of tokenList) if (CHAIN_IDS[String(token.blockchain || "").toLowerCase()]) balances.delete(token.asset_id);
      for (const key of [...balances.keys()]) if (key.startsWith("__evm_native__:")) balances.delete(key);
      renderTokens();
    });
    balanceEvmProvider.on("chainChanged", () => {
      for (const token of tokenList) if (CHAIN_IDS[String(token.blockchain || "").toLowerCase()]) balances.delete(token.asset_id);
      for (const key of [...balances.keys()]) if (key.startsWith("__evm_native__:")) balances.delete(key);
      renderTokens();
    });
  }
  const refreshState = sharedRefreshState || { loading: false };
  const selectedToken = () => tokenList.find(token => token.asset_id === select.value);
  const syncTrigger = () => {
    const token = selectedToken();
    trigger.replaceChildren();
    const name = el("strong", token ? token.symbol : (initialSymbol || "Select token"));
    const network = el("span", token ? String(token.blockchain).toUpperCase() : "Choose network");
    const chevron = el("span", "▾", "swap-token-chevron");
    trigger.replaceChildren(token ? tokenLogo(token) : el("span", "◈", "swap-token-placeholder"), name, network, chevron);
    trigger.classList.toggle("is-selected", Boolean(token));
  };
  const renderChains = () => {
    chainRow.replaceChildren();
    for (const chain of chains) {
      const supported = chain === "near" || Boolean(CHAIN_IDS[chain]);
      const button = el("button", undefined, "swap-chain-chip" + (chain === activeChain ? " is-active" : "") + (supported ? "" : " is-unavailable"));
      button.type = "button";
      button.disabled = !supported;
      button.title = supported ? "Select " + chain.toUpperCase() : chain.toUpperCase() + " wallet adapter is not integrated yet";
      button.append(chainLogo(chain), el("span", chain.toUpperCase()), ...(supported ? [] : [el("small", "SOON")]));
      if (supported) button.addEventListener("click", () => { activeChain = chain; renderChains(); renderTokens(); refreshBalances(); });
      chainRow.append(button);
    }
  };
  const renderTokens = () => {
    list.replaceChildren();
    const entries = tokenList.filter(token => String(token.blockchain || "").toLowerCase() === activeChain);
    if (activeChain === "near" || CHAIN_IDS[activeChain]) {
      const isNearGas = activeChain === "near";
      const gasBalance = balances.get(isNearGas ? "__near_native__" : "__evm_native__:" + activeChain);
      const gasSymbol = isNearGas ? "NEAR" : (NATIVE_EVM_SYMBOLS[activeChain]?.values().next().value || "ETH");
      const gasRow = el("div", undefined, "swap-token-option swap-token-gas-balance");
      if (isNearGas) gasRow.title = "Native NEAR balance is shown here and is also available as a separate asset row below.";
      const gasIdentity = el("span", undefined, "swap-token-identity");
      gasIdentity.append(chainLogo(activeChain), el("span", undefined, "swap-token-copy"));
      gasIdentity.lastChild.append(el("strong", gasSymbol), el("small", "Native " + gasSymbol + " · network gas balance"));
      const gasValue = el("span", undefined, "swap-token-value");
      gasValue.append(
        el("strong", gasBalance?.value ?? "—", "swap-token-balance"),
        el("small", gasBalance?.note || "Refresh to read wallet balance", "swap-token-balance-note")
      );
      gasRow.append(gasIdentity, gasValue);
      list.append(gasRow);
    }
    if (!entries.length && activeChain !== "near") { list.append(el("p", "No Tidepool assets on this network.", "swap-token-empty")); return; }
    for (const token of entries) {
      const item = el("button", undefined, "swap-token-option" + (token.asset_id === select.value ? " is-current" : ""));
      item.type = "button";
      const identity = el("span", undefined, "swap-token-identity");
      identity.append(tokenLogo(token), el("span", undefined, "swap-token-copy"));
      identity.lastChild.append(el("strong", token.symbol), el("small", String(token.name || token.symbol) + " · " + String(token.blockchain).toUpperCase()));
      const balance = token.native && token.asset_id === "native:near"
        ? (balances.get(token.asset_id) || balances.get("__near_native__"))
        : balances.get(token.asset_id);
      const amount = el("strong", balance?.value !== null && balance?.value !== undefined ? balance.value : "—", "swap-token-balance");
      const note = el("small", balance?.note || "Balance not checked", "swap-token-balance-note");
      const value = el("span", undefined, "swap-token-value");
      value.append(amount, note);
      item.append(identity, value);
      item.addEventListener("click", () => {
        select.value = token.asset_id;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        syncTrigger();
        closePanel();
        onSelected(token);
      });
      list.append(item);
    }
  };
  const positionPanel = () => {
    const rect = trigger.getBoundingClientRect();
    if (window.matchMedia("(max-width: 640px)").matches) {
      panel.classList.add("is-mobile-sheet");
      if (panel.parentNode !== document.body) document.body.append(backdrop, panel);
      Object.assign(panel.style, { position: "fixed", left: "0", right: "0", bottom: "0", top: "auto", width: "100vw", maxWidth: "100vw", maxHeight: "min(82svh, 680px)" });
      return;
    }
    panel.classList.remove("is-mobile-sheet");
    backdrop.remove();
    if (panel.parentNode !== root) root.append(panel);
    panel.style.bottom = "auto";
    const width = Math.min(390, Math.max(260, window.innerWidth - 24));
    panel.style.position = "fixed";
    panel.style.width = width + "px";
    panel.style.maxWidth = "calc(100vw - 24px)";
    panel.style.maxHeight = Math.min(Math.round(window.innerHeight * 0.68), 560) + "px";
    const measuredHeight = Math.min(panel.scrollHeight || 360, Math.round(window.innerHeight * 0.68));
    const below = window.innerHeight - rect.bottom - 12;
    const top = below >= Math.min(measuredHeight, 260) || below >= rect.top
      ? rect.bottom + 7
      : Math.max(12, rect.top - measuredHeight - 7);
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    panel.style.top = Math.max(12, Math.min(top, window.innerHeight - 80)) + "px";
    panel.style.left = left + "px";
  };
  const closePanel = () => {
    panel.hidden = true;
    backdrop.remove();
    if (panel.parentNode !== root) root.append(panel);
    panel.removeAttribute("style");
    trigger.setAttribute("aria-expanded", "false");
    window.removeEventListener("resize", positionPanel);
    window.removeEventListener("scroll", positionPanel, true);
    panel.classList.remove("is-mobile-sheet");
  };
  backdrop.addEventListener("click", closePanel);
  const refreshBalances = async (onlyAssetId = null) => {
    if (refreshState.loading) return;
    refreshState.loading = true;
    refresh.disabled = true;
    refresh.textContent = "Refreshing…";
    balanceStamp.textContent = "Reading connected wallet";
    const entries = onlyAssetId ? tokenList.filter(token => token.asset_id === onlyAssetId) : tokenList;
    const walletAccount = typeof nearWalletAccount === "function" ? nearWalletAccount() : nearWalletAccount;
    let evmAccount = null;
    const evmProvider = getInjectedEvmProvider();
    // Read-only account discovery from the existing wallet session. No
    // permission request, new wallet connection, or provider substitution.
    if (evmProvider?.request) {
      try {
        const accounts = await evmProvider.request({ method: "eth_accounts" });
        evmAccount = Array.isArray(accounts) && evmAddress(accounts[0]) ? accounts[0] : null;
      } catch { evmAccount = null; }
    }
    cachedEvmAccount = evmAccount;
    // Refresh the full Tidepool registry, not only the currently visible chain.
    // Bound concurrency to avoid flooding wallet/RPC providers on mobile.
    for (let index = 0; index < entries.length; index += 5) {
      await Promise.all(entries.slice(index, index + 5).map(async token => {
        try { balances.set(token.asset_id, await readSwapWalletBalance(token, walletAccount, request, evmAccount)); }
        catch (error) { balances.set(token.asset_id, { value: null, note: error?.message || "Balance unavailable" }); }
      }));
    }
    if (!onlyAssetId && nearAccount(walletAccount)) {
      try {
        balances.set("__near_native__", await readSwapWalletBalance(
          { blockchain: "near", symbol: "NEAR", decimals: 24, contract_address: null }, walletAccount, request
        ));
      } catch (error) {
        balances.set("__near_native__", { value: null, note: error?.message || "Native NEAR balance unavailable" });
      }
    } else if (!onlyAssetId) {
      balances.set("__near_native__", { value: null, note: "Connect a NEAR Testnet wallet" });
    }
    if (!onlyAssetId) {
      const evmChains = chains.filter(chain => Boolean(CHAIN_IDS[chain]));
      await Promise.all(evmChains.map(async chain => {
        try {
          balances.set("__evm_native__:" + chain, await readSwapWalletBalance(
            { blockchain: chain, symbol: NATIVE_EVM_SYMBOLS[chain]?.values().next().value || "ETH", decimals: 18 }, null, request, evmAccount
          ));
        } catch (error) {
          balances.set("__evm_native__:" + chain, { value: null, note: error?.message || "Native " + chain.toUpperCase() + " balance unavailable" });
        }
      }));
    }
    balanceStamp.textContent = "Updated " + new Date().toLocaleTimeString();
    refreshState.loading = false;
    refresh.disabled = false;
    refresh.textContent = "Refresh balances ↻";
    renderTokens();
    if (typeof onBalancesChanged === "function") onBalancesChanged();
  };
  const balanceProvider = getInjectedEvmProvider();
  if (balanceProvider?.on) {
    balanceProvider.on("accountsChanged", accounts => {
      cachedEvmAccount = evmAddress(accounts?.[0]) ? accounts[0] : null;
      balances.clear();
      refreshBalances();
    });
    balanceProvider.on("chainChanged", () => {
      balances.clear();
      refreshBalances();
    });
  }
  trigger.addEventListener("click", () => {
    if (!panel.hidden) { closePanel(); return; }
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    positionPanel();
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    refreshBalances();
  });
  // Balance refresh is read-only: never trigger eth_requestAccounts or a
  // second-wallet permission popup from the token picker.
  refresh.addEventListener("click", () => refreshBalances());
  syncTrigger(); renderChains(); renderTokens();
  root.append(trigger, select, panel);
  return {
    root, sync: syncTrigger, refresh: refreshBalances, close: closePanel, renderBalances: renderTokens,
    balanceFor: assetId => balances.get(assetId) || null
  };
}

export async function renderChatSwap({ prompt, result, request, connector: connectorSource, connectedAccount: accountSource, encodeBase58, guestMode, onWalletConnected, onConnectNearWallet, onDisconnectNearWallet }) {
  const getConnector = () => typeof connectorSource === "function" ? connectorSource() : connectorSource;
  const handleEvmAccountsChanged = accounts => {
    activeEvmAccount = evmAddress(accounts?.[0]) ? accounts[0] : null;
  };
  const getConnectedAccount = () => typeof accountSource === "function" ? accountSource() : accountSource;
  const parsed = parseChatSwapPrompt(prompt);
  const card = el("section", undefined, "developer-trade-draft sentinel-swap-message");
  const heading = el("div", undefined, "developer-trade-draft-heading sentinel-swap-heading");
  heading.append(el("strong", "Swap preview"), el("span", "TESTNET"));
  card.append(heading);
  if (!parsed) {
    card.append(el("p", "Use format: swap 0.1 ETH to NEAR. Decimal comma is accepted, e.g. swap 0,1 ETH to NEAR."));
    result.replaceChildren(card); result.classList.remove("hidden"); return;
  }
  card.append(el("p", "Sentinel reuses your connected Meteor NEAR Testnet session. No second wallet connection is requested; choose assets available on that session for signing.", "sentinel-swap-intro"));
  const securityDetails = el("details", undefined, "sentinel-swap-security");
  securityDetails.append(el("summary", "How the security check works"));
  securityDetails.append(el("p", "Agent 1 independently checks your prompt against the selected Testnet assets, exact amount, route and quote. Agent 2 independently challenges the signed quote, recipient, refund address, expiry, slippage and risk policy. Both must PASS before the wallet approval screen can open."));
  card.append(securityDetails);
  const tokensResponse = await request("/trading/tokens", { method: "GET" });
  const tokens = tokensResponse.tokens;
  if (!Array.isArray(tokens) || !tokens.length) throw new Error("Tidepool did not return a usable testnet token registry.");
  // Native NEAR is a wallet asset/gas coin, not WNEAR and not a Tidepool
  // registry token. Keep it selectable as its own UI asset without pretending
  // the current Tidepool quote API can route it.
  const nativeNearToken = {
    asset_id: "native:near",
    symbol: "NEAR",
    name: "Native NEAR",
    decimals: 24,
    blockchain: "near",
    network: "testnet",
    contract_address: null,
    native: true
  };
  if (!tokens.some(token => token.asset_id === nativeNearToken.asset_id)) tokens.unshift(nativeNearToken);
  const amountInput = document.createElement("input"); amountInput.value = parsed.amount; amountInput.inputMode = "decimal"; amountInput.autocomplete = "off";
  const originSelect = document.createElement("select"), destSelect = document.createElement("select");
  for (const token of tokens) {
    const originOption = el("option", formatToken(token)); originOption.value = String(token.asset_id ?? ""); originSelect.append(originOption);
    const destinationOption = el("option", formatToken(token)); destinationOption.value = String(token.asset_id ?? ""); destSelect.append(destinationOption);
  }
  // NEAR and WNEAR are separate assets. A NEAR prompt resolves to native
  // NEAR; WNEAR must be selected explicitly.
  const initialOrigin = resolveInitialSwapToken(tokens, parsed.from);
  const initialDestination = resolveInitialSwapToken(tokens, parsed.to);
  originSelect.value = initialOrigin ? String(initialOrigin.asset_id ?? "") : "";
  destSelect.value = initialDestination ? String(initialDestination.asset_id ?? "") : "";
  originSelect.className = "swap-native-select";
  destSelect.className = "swap-native-select";
  // Both token pickers share one balance cache and one scan. A failed NEAR
  // RPC lookup must not prevent EVM balances (or vice versa) from rendering.
  const sharedSwapBalances = new Map();
  const sharedBalanceRefreshState = { loading: false };
  let syncSwapBalanceViews = () => {};
  const onSwapBalancesChanged = () => syncSwapBalanceViews();
  const originPicker = createSwapTokenPicker(originSelect, tokens, parsed.from, () => activeNearAccount, () => { defaults(); invalidate(); }, request, () => activeEvmAccount, sharedSwapBalances, onSwapBalancesChanged, sharedBalanceRefreshState);
  const destinationPicker = createSwapTokenPicker(destSelect, tokens, parsed.to, () => activeNearAccount, () => { defaults(); invalidate(); }, request, () => activeEvmAccount, sharedSwapBalances, onSwapBalancesChanged, sharedBalanceRefreshState);
  syncSwapBalanceViews = () => { originPicker.renderBalances(); destinationPicker.renderBalances(); };
  const refundInput = null;
  const initialAccount = getConnectedAccount();
  let activeNearAccount = initialAccount && nearAccount(initialAccount) ? initialAccount : null;
  let activeEvmAccount = null;
  const walletAddressFor = chain => {
    const key = String(chain || "").toLowerCase();
    if (key === "near") return activeNearAccount;
    if (CHAIN_IDS[key]) return activeEvmAccount;
    return null;
  };
  const connectWalletForChain = async chain => {
    const key = String(chain || "").toLowerCase();
    if (CHAIN_IDS[key]) {
      throw new Error("This route needs an EVM signing session that the connected Meteor NEAR session does not expose. No second wallet will be requested. Select the NEAR Testnet representation of this asset when available.");
    }
    if (key === "near") {
      const sharedAccount = getConnectedAccount();
      if (nearAccount(sharedAccount)) activeNearAccount = sharedAccount;
      const connector = getConnector();
      if (!connector) throw new Error("NEAR wallet connector is still loading. Wait a moment and tap Connect again.");
      if (!activeNearAccount) {
        // Reuse the dashboard's exact click handler so Meteor opens through
        // the same NEAR Connect instance and the shared account session updates.
        if (typeof onConnectNearWallet === "function") {
          const accountId = await onConnectNearWallet();
          const sharedAfterConnect = getConnectedAccount();
          activeNearAccount = nearAccount(accountId) ? accountId :
            (nearAccount(sharedAfterConnect) ? sharedAfterConnect : null);
        } else {
          // Fallback for standalone callers: retain the same NEAR Connect flow.
          await connector.connect();
          const current = await connector.getConnectedWallet();
          const account = current.accounts?.[0];
          if (!nearAccount(account?.accountId)) throw new Error("NEAR wallet did not return a valid Testnet account.");
          activeNearAccount = account.accountId;
          onWalletConnected?.(account.accountId, current.wallet?.manifest?.name || "NEAR wallet");
        }
        if (!activeNearAccount) throw new Error("Meteor connection was not completed. Choose Meteor and approve the connection in your wallet.");
      }
      return activeNearAccount;
    }
    throw new Error("Wallet adapter is not integrated for " + key.toUpperCase() + ". Select a connected EVM or NEAR Testnet network.");
  };
  const slippage = document.createElement("select");
  for (const pair of [["50","0.5%"],["100","1%"],["200","2%"],["300","3%"]]) {
    const option = el("option", pair[1]); option.value = pair[0]; if (pair[0] === "100") option.selected = true; slippage.append(option);
  }
  const defaults = () => {
    const origin = tokens.find(token => String(token.asset_id ?? "") === originSelect.value);
    const dest = tokens.find(token => String(token.asset_id ?? "") === destSelect.value);
    return { origin, dest };
  };
  const fields = el("div", undefined, "developer-trade-quote swap-modern-card");
  const walletBar = el("div", undefined, "swap-wallet-bar");
  const walletState = el("div", undefined, "swap-wallet-state");
  const walletStateIcon = el("span", "◈", "swap-wallet-state-icon");
  const walletAccountAtRender = getConnectedAccount();
  const walletStateText = el("span", walletAccountAtRender ? shortWalletAddress(walletAccountAtRender) : "Wallet not connected");
  walletState.append(walletStateIcon, walletStateText);
  walletState.classList.toggle("is-connected", Boolean(walletAccountAtRender));
  const connectButton = el("button", walletAccountAtRender ? "Checking route wallets…" : "Connect required wallets", "swap-connect-button");
  connectButton.type = "button";
  const disconnectButton = el("button", "Disconnect", "swap-disconnect-button");
  disconnectButton.type = "button";
  disconnectButton.hidden = !nearAccount(walletAccountAtRender);
  walletBar.append(walletState, connectButton, disconnectButton);
  fields.append(walletBar);
  disconnectButton.addEventListener("click", async () => {
    if (!nearAccount(getConnectedAccount()) && !activeNearAccount) {
      status.textContent = "No connected NEAR wallet session to disconnect.";
      disconnectButton.hidden = true;
      return;
    }
    disconnectButton.disabled = true;
    disconnectButton.textContent = "Disconnecting…";
    try {
      if (typeof onDisconnectNearWallet !== "function") throw new Error("Dashboard disconnect handler is unavailable.");
      await onDisconnectNearWallet();
      activeNearAccount = null;
      dryQuote = null;
      swap = null;
      walletStateText.textContent = "Wallet not connected";
      walletState.classList.remove("is-connected");
      disconnectButton.hidden = true;
      connectButton.textContent = "Connect required wallets";
      approveButton.disabled = true;
      approveButton.hidden = true;
      status.textContent = "NEAR wallet disconnected from Sentinel. Connect again before requesting a new quote.";
      originPicker.refresh();
      destinationPicker.refresh();
    } catch (error) {
      status.textContent = error?.message || "Could not disconnect the NEAR wallet.";
    } finally {
      disconnectButton.disabled = false;
      disconnectButton.textContent = "Disconnect";
    }
  });
  connectButton.addEventListener("click", async () => {
    const { origin, dest } = defaults();
    if (!origin || !dest) {
      status.textContent = "Select a valid origin and destination asset from the Tidepool registry first.";
      return;
    }
    connectButton.disabled = true;
    try {
      // Read shared dashboard state before doing anything asynchronous.
      const dashboardNearAccount = getConnectedAccount();
      if (nearAccount(dashboardNearAccount)) activeNearAccount = dashboardNearAccount;
      const routeChains = [...new Set([origin.blockchain, dest.blockchain].map(value => String(value).toLowerCase()))];

      // IMPORTANT: invoke NEAR Connect directly in this trusted click handler.
      // Do not route the first Meteor connect through connectWalletForChain()
      // or another async wrapper: mobile browsers may drop popup user activation.
      if (routeChains.includes("near") && !walletAddressFor("near")) {
        connectButton.textContent = "Opening Meteor / NEAR wallet…";
        status.textContent = "Opening the NEAR Connect wallet picker. Choose Meteor and approve the connection there.";
        let nearConnectPromise;
        if (typeof onConnectNearWallet === "function") {
          nearConnectPromise = onConnectNearWallet();
        } else {
          const connector = getConnector();
          if (!connector) throw new Error("NEAR wallet connector is still loading. Reload and try again.");
          nearConnectPromise = connector.connect();
        }
        const accountId = await nearConnectPromise;
        const sharedAccount = getConnectedAccount();
        activeNearAccount = nearAccount(accountId) ? accountId :
          (nearAccount(sharedAccount) ? sharedAccount : null);
        if (!activeNearAccount) {
          const connector = getConnector();
          const current = await connector?.getConnectedWallet?.();
          const discovered = current?.accounts?.[0]?.accountId;
          if (nearAccount(discovered)) activeNearAccount = discovered;
        }
        if (!activeNearAccount) throw new Error("NEAR wallet picker closed without a connected account. Select Meteor and approve the connection.");
        const partialAddresses = [walletAddressFor(origin.blockchain), walletAddressFor(dest.blockchain)].filter(Boolean);
        walletStateText.textContent = partialAddresses.map(shortWalletAddress).join(" · ");
        walletState.classList.add("is-connected");
        disconnectButton.hidden = false;

        const nextChain = routeChains.find(chain => chain !== "near" && !walletAddressFor(chain));
        if (nextChain) {
          connectButton.textContent = "Connect " + nextChain.toUpperCase() + " wallet";
          status.textContent = "Meteor connected. This route also needs a " + nextChain.toUpperCase() + " wallet; tap again to connect it.";
          return;
        }
      }

      // Connect any remaining non-NEAR wallet only after the Meteor picker has
      // completed, on a separate explicit tap.
      const missingChain = routeChains.find(chain => !walletAddressFor(chain));
      if (missingChain) {
        await connectWalletForChain(missingChain);
      }

      const addresses = [walletAddressFor(origin.blockchain), walletAddressFor(dest.blockchain)].filter(Boolean);
      walletStateText.textContent = addresses.map(shortWalletAddress).join(" · ");
      walletState.classList.add("is-connected");
      disconnectButton.hidden = !nearAccount(activeNearAccount || getConnectedAccount());
      connectButton.textContent = "Get verified quote";
      status.textContent = "Wallet connected. Verifying route and quote…";
      originPicker.refresh(); destinationPicker.refresh();
      quoteButton.click();
    } catch (error) {
      connectButton.textContent = "Connect required wallets";
      status.textContent = error?.message || "Wallet connection failed.";
      console.error("[Sentinel swap] Wallet connect failed:", error);
    } finally {
      connectButton.disabled = false;
    }
  });
  // Read-only session discovery: reflect wallets already authorized in the browser without prompting.
  (async () => {
    try {
      const connector = getConnector();
      if (!activeNearAccount && connector?.getConnectedWallet) {
        const current = await connector.getConnectedWallet();
        const account = current?.accounts?.[0]?.accountId;
        if (nearAccount(account)) activeNearAccount = account;
      }
    } catch {}
    try {
      if (!activeEvmAccount) {
        const accounts = await getInjectedEvmProvider()?.request?.({ method: "eth_accounts" });
        handleEvmAccountsChanged(accounts);
      }
    } catch {}
    const detected = [activeNearAccount, activeEvmAccount].filter(Boolean);
    const routeChains = [...new Set([defaults().origin?.blockchain, defaults().dest?.blockchain].filter(Boolean).map(value => String(value).toLowerCase()))];
    const missingChains = routeChains.filter(chain => !walletAddressFor(chain));
    if (detected.length) {
      walletStateText.textContent = detected.map(shortWalletAddress).join(" · ");
      walletState.classList.add("is-connected");
      disconnectButton.hidden = !nearAccount(activeNearAccount || getConnectedAccount());
    }
    connectButton.textContent = missingChains.length
      ? (CHAIN_IDS[missingChains[0]] ? "Use NEAR asset route" : "Connect Meteor")
      : "Verify quote";
    connectButton.classList.toggle("is-verify", missingChains.length === 0);
  })();
  const amountGroup = el("div", undefined, "swap-amount-group");
  const amountShortcuts = el("div", undefined, "swap-amount-shortcuts");
  for (const percent of [25, 50, 75, 100]) {
    const shortcut = el("button", percent + "%", "swap-amount-shortcut");
    shortcut.type = "button";
    shortcut.addEventListener("click", async () => {
      const { origin } = defaults();
      if (!origin) { status.textContent = "Choose an origin token before selecting a balance percentage."; return; }
      shortcut.disabled = true;
      try {
        await originPicker.refresh(origin.asset_id);
        const balance = originPicker.balanceFor(origin.asset_id);
        if (!balance || typeof balance.raw !== "string") {
          throw new Error(balance?.note || "Wallet balance is not available for this token and network.");
        }
        let spendable = BigInt(balance.raw);
        // Preserve a small native NEAR gas reserve when spending native NEAR.
        if (String(origin.blockchain).toLowerCase() === "near" && !origin.contract_address) {
          const gasReserve = 10n ** 22n; // 0.01 NEAR reserved for Testnet gas
          spendable = spendable > gasReserve ? spendable - gasReserve : 0n;
        } else if (CHAIN_IDS[String(origin.blockchain).toLowerCase()] && !origin.contract_address) {
          const gasReserve = 5n * 10n ** 15n; // 0.005 native EVM coin reserved for Testnet gas
          spendable = spendable > gasReserve ? spendable - gasReserve : 0n;
        }
        const amountUnits = spendable * BigInt(percent) / 100n;
        if (amountUnits <= 0n) throw new Error("Available balance is too small after reserving network gas.");
        amountInput.value = formatUnitsForInput(amountUnits, Number(origin.decimals));
        invalidate();
        status.textContent = percent + "% of spendable " + origin.symbol + " balance selected.";
      } catch (error) {
        status.textContent = error?.message || "Could not read the connected wallet balance.";
      } finally { shortcut.disabled = false; }
    });
    amountShortcuts.append(shortcut);
  }
  amountGroup.append(amountInput, amountShortcuts);
  addField(fields, "Amount · available balance", amountGroup);
  addField(fields, "You pay · origin asset / network", originPicker.root);
  const flipButton = el("button", "⇅", "swap-flip-button");
  flipButton.type = "button";
  flipButton.title = "Switch origin and destination";
  flipButton.setAttribute("aria-label", "Switch origin and destination");
  flipButton.addEventListener("click", () => {
    const currentOrigin = originSelect.value, currentDestination = destSelect.value;
    originSelect.value = currentDestination;
    destSelect.value = currentOrigin;
    originSelect.dispatchEvent(new Event("change", { bubbles: true }));
    destSelect.dispatchEvent(new Event("change", { bubbles: true }));
    originPicker.sync(); destinationPicker.sync(); invalidate();
  });
  fields.append(flipButton);
  addField(fields, "You receive · destination asset / network", destinationPicker.root);
  addField(fields, "Maximum slippage", slippage);
  const status = el("p", "Using the connected Meteor session when available. Choose a compatible Testnet route to check its live price.", "sentinel-swap-status");
  // Meteor may return to this page after a full-page wallet handoff. Keep only
  // non-secret deposit metadata in sessionStorage so settlement tracking can resume.
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_NEAR_APPROVAL_KEY) || "null");
    if (pending && typeof pending.depositAddress === "string" &&
        /^[a-f0-9]{64}$/i.test(pending.depositAddress) &&
        Number.isFinite(Date.parse(pending.createdAt)) && Date.now() - Date.parse(pending.createdAt) < 24 * 60 * 60 * 1000) {
      status.textContent = "Resuming the previous Meteor approval session. Checking Tidepool settlement; do not submit the transfer again…";
      request("/trading/status?depositAddress=" + encodeURIComponent(pending.depositAddress) +
        (pending.depositMemo ? "&depositMemo=" + encodeURIComponent(pending.depositMemo) : ""), { method: "GET" })
        .then(async initial => {
          let latest = initial;
          let state = String(latest.status || "UNKNOWN").toUpperCase();
          if (!TERMINAL.has(state)) {
            status.textContent = "Recovered Meteor session · Tidepool status: " + state + ". Tracking settlement; do not send again…";
            latest = await pollStatus(request, pending.depositAddress, pending.depositMemo, status);
            state = String(latest?.status || "UNKNOWN").toUpperCase();
          }
          status.textContent = "Recovered Meteor session · Tidepool status: " + state +
            (latest?.explorer_url ? " · " + latest.explorer_url : "") +
            (TERMINAL.has(state) ? "" : " · Still pending; reload later to check again. Do not send again.");
          details.textContent = JSON.stringify({ recovered_session: pending, settlement: latest }, null, 2);
          details.hidden = false;
          if (TERMINAL.has(state)) sessionStorage.removeItem(PENDING_NEAR_APPROVAL_KEY);
        })
        .catch(error => { status.textContent = "Meteor session was recovered, but Tidepool status is temporarily unavailable: " + (error?.message || "retry later"); });
    } else if (pending) sessionStorage.removeItem(PENDING_NEAR_APPROVAL_KEY);
  } catch (error) { console.warn("[Sentinel swap] Could not recover pending Meteor session:", error); }
  const details = el("pre"); details.hidden = true;
  const quoteButton = el("button", "Get verified quote", "secondary-btn swap-quote-button"); quoteButton.type = "button"; quoteButton.hidden = true;
  const approveButton = el("button", "Approve swap", "primary-btn swap-approve-button"); approveButton.type = "button"; approveButton.disabled = true; approveButton.hidden = true;
  let pendingNearApproval = null;
  fields.append(status, approveButton, details); card.append(fields);
  let swap = null, dryQuote = null;
  const invalidate = () => { approveButton.disabled = true; dryQuote = null; swap = null; };
  const observedNearConnector = getConnector();
  observedNearConnector?.on?.("wallet:signIn", event => {
    const accountId = event?.accounts?.[0]?.accountId;
    activeNearAccount = nearAccount(accountId) ? accountId : null;
    pendingNearApproval = null;
    invalidate();
    walletStateText.textContent = activeNearAccount ? shortWalletAddress(activeNearAccount) : (activeEvmAccount ? shortWalletAddress(activeEvmAccount) : "Wallet not connected");
    walletState.classList.toggle("is-connected", Boolean(activeNearAccount || activeEvmAccount));
    originPicker.refresh();
    status.textContent = "NEAR wallet session updated. Balances are being refreshed; request a new quote before approval.";
    refreshConnectLabel();
  });
  observedNearConnector?.on?.("wallet:signOut", () => {
    activeNearAccount = null;
    pendingNearApproval = null;
    invalidate();
    walletStateText.textContent = activeEvmAccount ? shortWalletAddress(activeEvmAccount) : "Wallet not connected";
    walletState.classList.toggle("is-connected", Boolean(activeEvmAccount));
    originPicker.refresh();
    status.textContent = "NEAR wallet disconnected. Previous quote and approval were invalidated.";
    refreshConnectLabel();
  });
  const observedEvmProvider = getInjectedEvmProvider();
  if (observedEvmProvider) selectedEvmProvider = observedEvmProvider;
  if (observedEvmProvider?.on) {
    observedEvmProvider.on("accountsChanged", accounts => {
      handleEvmAccountsChanged(accounts);
      pendingNearApproval = null;
      invalidate();
      walletStateText.textContent = activeEvmAccount ? shortWalletAddress(activeEvmAccount) : (activeNearAccount ? shortWalletAddress(activeNearAccount) : "Wallet not connected");
      if (!activeEvmAccount && !activeNearAccount) walletState.classList.remove("is-connected");
      originPicker.refresh();
      destinationPicker.refresh();
      status.textContent = "EVM wallet account changed. Previous quote and approval were invalidated. Verify the new wallet before continuing.";
      refreshConnectLabel();
    });
    observedEvmProvider.on("chainChanged", () => {
      pendingNearApproval = null;
      invalidate();
      status.textContent = "EVM network changed. Previous quote and approval were invalidated. Reconnect the intended Testnet network.";
      refreshConnectLabel();
    });
  }
  const refreshConnectLabel = () => {
    const { origin, dest } = defaults();
    const chains = [...new Set([origin?.blockchain, dest?.blockchain].filter(Boolean).map(value => String(value).toLowerCase()))];
    const missing = chains.find(chain => !walletAddressFor(chain));
    connectButton.textContent = missing ? (CHAIN_IDS[missing] ? "Use NEAR asset route" : "Connect Meteor") : "Verify quote";
    connectButton.classList.toggle("is-verify", !missing);
  };
  originSelect.addEventListener("change", () => { defaults(); originPicker.sync(); invalidate(); refreshConnectLabel(); });
  destSelect.addEventListener("change", () => { defaults(); destinationPicker.sync(); invalidate(); refreshConnectLabel(); });
  for (const input of [amountInput, slippage]) input.addEventListener("change", invalidate);
  quoteButton.addEventListener("click", async () => {
    quoteButton.disabled = true; approveButton.disabled = true;
    status.textContent = "Checking the selected route and current Tidepool price…";
    try {
      const origin = tokens.find(token => String(token.asset_id ?? "") === originSelect.value);
      const destination = tokens.find(token => String(token.asset_id ?? "") === destSelect.value);
      if (!origin || !destination) throw new Error("Choose exact origin and destination assets from the live token registry.");
      if (origin.blockchain === "near" || destination.blockchain === "near") {
        const dashboardNearAccount = getConnectedAccount();
        const connector = getConnector();
        let connectorAccount = null;
        try {
          const current = await connector?.getConnectedWallet?.();
          const candidate = current?.accounts?.[0]?.accountId;
          if (nearAccount(candidate)) connectorAccount = candidate;
        } catch {}
        // Never erase a valid dashboard session because the connector's
        // optional session lookup is temporarily unavailable.
        activeNearAccount = connectorAccount || (nearAccount(dashboardNearAccount) ? dashboardNearAccount : activeNearAccount);
      }
      if (CHAIN_IDS[origin.blockchain] || CHAIN_IDS[destination.blockchain]) {
        const provider = getInjectedEvmProvider();
        const accounts = await provider?.request?.({ method: "eth_accounts" });
        activeEvmAccount = evmAddress(accounts?.[0]) ? accounts[0] : null;
      }
      const recipient = walletAddressFor(destination.blockchain);
      const refundTo = walletAddressFor(origin.blockchain);
      if (!recipient || !refundTo) throw new Error("Connect the wallet(s) for both selected networks before requesting a quote. Recipient and refund addresses are taken automatically from the connected wallet.");
      if (destination.blockchain === "near" && !nearAccount(recipient)) throw new Error("Connected destination wallet is not a valid NEAR Testnet account.");
      if (CHAIN_IDS[destination.blockchain] && !evmAddress(recipient)) throw new Error("Connected destination wallet is not a valid EVM address.");
      if (origin.blockchain === "near" && !nearAccount(refundTo)) throw new Error("Connected origin wallet is not a valid NEAR Testnet account.");
      if (CHAIN_IDS[origin.blockchain] && !evmAddress(refundTo)) throw new Error("Connected origin wallet is not a valid EVM address.");
      const routeAssets = resolveTidepoolSwapAssets(origin, destination, tokens);
      const { quoteOrigin, quoteDestination, wrapNativeNear, unwrapNativeNear } = routeAssets;
      if ((wrapNativeNear || unwrapNativeNear) &&
          quoteOrigin.contract_address !== "wnear.tidepool-sandbox.testnet" &&
          quoteDestination.contract_address !== "wnear.tidepool-sandbox.testnet") {
        throw new Error("Native NEAR conversion requires the verified Tidepool WNEAR Testnet contract.");
      }
      const requestBody = {
        originAsset: quoteOrigin.asset_id, destinationAsset: quoteDestination.asset_id,
        amount: decimalToUnits(amountInput.value.trim(), Number(origin.decimals)),
        recipient, refundTo, slippageTolerance: Number(slippage.value)
      };
      dryQuote = await request("/trading/quote", { method: "POST", body: JSON.stringify(requestBody) });
      if (dryQuote.mode !== "QUOTE_ONLY" || dryQuote.execution_enabled !== false ||
          dryQuote.origin_chain !== origin.blockchain || dryQuote.destination_chain !== destination.blockchain) {
        throw new Error("Dry quote did not match the selected route.");
      }
      swap = { ...requestBody, origin: quoteOrigin, displayOrigin: origin, wrapNativeNear,
        destination: quoteDestination, displayDestination: destination, unwrapNativeNear };
      status.textContent = "Route ready: " + origin.blockchain.toUpperCase() + (wrapNativeNear ? " (wrap native NEAR → WNEAR)" : "") + " → " + destination.blockchain.toUpperCase() +
        (unwrapNativeNear ? " (receive WNEAR, then unwrap to native NEAR)" : "") +
        " · " + (dryQuote.quote.amount_in_formatted || dryQuote.quote.amount_in) + " " + (wrapNativeNear ? "NEAR" : origin.symbol) +
        " → " + (dryQuote.quote.amount_out_formatted || dryQuote.quote.amount_out) + " " + (unwrapNativeNear ? "NEAR" : destination.symbol) +
        ". Security checks run again before wallet approval.";
      details.textContent = JSON.stringify({ route: { origin: formatToken(origin), destination: formatToken(destination) }, dry_quote: dryQuote }, null, 2);
      details.hidden = true;
      if (guestMode) status.textContent += " Guest mode is quote-only; sign in to approve.";
      else { approveButton.disabled = false; approveButton.hidden = false; }
    } catch (error) { status.textContent = error.message || "Quote request failed."; }
    finally { quoteButton.disabled = false; }
  });
  approveButton.addEventListener("click", async () => {
    if (pendingNearApproval) {
      const prepared = pendingNearApproval;
      if (Date.parse(prepared.liveQuote?.deadline) <= Date.now()) {
        pendingNearApproval = null;
        status.textContent = "The verified quote expired before Meteor opened. Request a fresh quote.";
        approveButton.disabled = true;
        approveButton.textContent = "Approve swap";
        return;
      }
      pendingNearApproval = null;
      approveButton.disabled = true;
      quoteButton.disabled = true;
      try {
        // Invoke Meteor's redirecting wallet method synchronously in this tap,
        // before any await, so mobile browsers retain user activation.
        // All account/quote checks were completed while preparing this pending
        // approval. Do not await connector state here: that would lose the
        // mobile browser's user-activation window before Meteor can open.
        try {
          sessionStorage.setItem(PENDING_NEAR_APPROVAL_KEY, JSON.stringify({
            depositAddress: prepared.liveQuote.deposit_address,
            depositMemo: prepared.liveQuote.deposit_memo || null,
            deadline: prepared.liveQuote.deadline,
            signer: prepared.connectedAccount,
            tokenContract: prepared.swap.origin.contract_address,
            tokenSymbol: prepared.swap.origin.symbol,
            amount: prepared.swap.amount,
            createdAt: new Date().toISOString()
          }));
        } catch (storageError) {
          console.warn("[Sentinel swap] Pending approval recovery metadata could not be saved:", storageError);
        }
        // Match the proven Sentinel dev-mode Meteor call shape exactly.
        // The selected NEAR Connect session supplies the signer; do not pass a
        // callback URL or a second signer identity into Meteor's executor.
        const walletApproval = prepared.wallet.signAndSendTransaction({
          receiverId: prepared.transaction.receiverId,
          actions: prepared.transaction.actions
        });
        status.textContent = "Opening Meteor. Review and approve the exact NEAR Testnet transfer…";
        await finishNearWalletDeposit(walletApproval, prepared, {
          request, statusNode: status, detailsNode: details,
          onSubmitted: () => { approveButton.textContent = "Swap submitted · status tracked"; }
        });
      } catch (error) {
        if (Date.parse(prepared.liveQuote?.deadline) > Date.now()) pendingNearApproval = prepared;
        status.textContent = error?.message || "Meteor approval was cancelled or failed. Check wallet activity before retrying.";
      } finally {
        quoteButton.disabled = false;
        approveButton.disabled = !pendingNearApproval;
        approveButton.textContent = pendingNearApproval ? "Open Meteor & approve" : "Approve swap";
      }
      return;
    }
    approveButton.disabled = true; quoteButton.disabled = true;
    let submitted = false;
    let manualOnly = false;
    try {
      if (!swap || !dryQuote) throw new Error("Request a fresh quote before approval.");
      if (guestMode) throw new Error("Guest mode cannot approve or sign transactions.");
      if (swap.origin.blockchain === "near") {
        const connector = getConnector();
        if (!connector || !activeNearAccount || !nearAccount(activeNearAccount)) throw new Error("Connect Meteor or another NEAR Testnet wallet first.");
        if (swap.refundTo.toLowerCase() !== activeNearAccount.toLowerCase()) throw new Error("NEAR refund account must match connected wallet.");
      } else if (CHAIN_IDS[swap.origin.blockchain]) {
        const wallet = await connectEvm(refundInput, swap.origin.blockchain);
        if (wallet.account.toLowerCase() !== swap.refundTo.toLowerCase()) throw new Error("Connected EVM wallet differs from reviewed refund address. Request a fresh quote.");
      } else if (!swap.refundTo) {
        throw new Error("Enter the refund address on the selected origin chain.");
      }
      status.textContent = "Checking the provider's signed quote and swap safety…";
      const liveQuote = await request("/trading/live-quote", {
        method: "POST",
        // Keep provider quote input strictly to the API schema. "swap" also
        // carries UI token objects (origin/destination), which the backend
        // correctly rejects as unsupported quote fields.
        body: JSON.stringify({
          originAsset: swap.originAsset,
          destinationAsset: swap.destinationAsset,
          amount: swap.amount,
          recipient: swap.recipient,
          refundTo: swap.refundTo,
          slippageTolerance: swap.slippageTolerance,
          userPrompt: prompt
        })
      });
      const dualReview = liveQuote.dual_agent_review;
      if (liveQuote.mode !== "LIVE_QUOTE_AWAITING_USER_SIGNATURE" || liveQuote.execution_enabled !== false ||
          liveQuote.provider_signature_verified !== true || liveQuote.risk_evaluation?.decision !== "ALLOW" ||
          !String(liveQuote.risk_evaluation?.policy_hash || "").startsWith("sha256:") ||
          !liveQuote.signed_quote || typeof liveQuote.signed_quote !== "object" ||
          !liveQuote.deposit_address || !Number.isFinite(Date.parse(liveQuote.deadline)) || Date.parse(liveQuote.deadline) <= Date.now() ||
          dualReview?.status !== "PASS" || dualReview?.execution_authorized !== false ||
          dualReview?.agent_one?.verdict !== "PASS" || dualReview?.agent_two?.verdict !== "PASS" ||
          dualReview?.agent_two?.risk_level !== "LOW" || (dualReview?.failed_checks || []).length) {
        throw new Error("Dual-agent gate rejected this swap. Both agents and every deterministic quote check must PASS before wallet approval.");
      }
      status.textContent = "Agent 1 PASS · Agent 2 PASS · signed quote and deterministic risk checks verified. Review the exact wallet transaction below.";
      details.textContent = JSON.stringify({
        dual_agent_review: dualReview,
        verified_quote: {
          origin_chain: liveQuote.origin_chain,
          destination_chain: liveQuote.destination_chain,
          quote: liveQuote.quote,
          recipient: liveQuote.recipient,
          refund_to: liveQuote.refund_to,
          deposit_address: liveQuote.deposit_address,
          deadline: liveQuote.deadline,
          risk_evaluation: liveQuote.risk_evaluation
        }
      }, null, 2);
      details.hidden = false;
      const summary = "SWAP APPROVAL REVIEW\n\n" + (swap.displayOrigin || swap.origin).symbol + (swap.wrapNativeNear ? " (native NEAR → wrap to WNEAR)" : " (" + swap.origin.blockchain + ")") + " → " + (swap.displayDestination || swap.destination).symbol + (swap.unwrapNativeNear ? " (WNEAR → native NEAR after settlement)" : " (" + swap.destination.blockchain + ")") + "\nInput: " +
        (liveQuote.quote.amount_in_formatted || liveQuote.quote.amount_in) + "\nExpected output: " +
        (liveQuote.quote.amount_out_formatted || liveQuote.quote.amount_out) + "\nMinimum output: " +
        liveQuote.quote.minimum_amount_out + "\nRecipient: " + swap.recipient + "\nRefund: " + swap.refundTo +
        "\nDeposit address: " + liveQuote.deposit_address + "\nDeadline: " + liveQuote.deadline +
        "\nRisk: " + liveQuote.risk_evaluation.decision + "\nPolicy: " + liveQuote.risk_evaluation.policy_hash +
        "\n\n" + (swap.origin.blockchain === "near" ? "Continue to Meteor wallet transfer approval?" :
          CHAIN_IDS[swap.origin.blockchain] ? "Continue to EVM wallet transfer approval?" :
          "Continue to show the exact manual deposit instructions? No wallet prompt will open in Sentinel.");
      if (!window.confirm(summary)) throw new Error("Cancelled before wallet approval. No transaction was submitted.");
      if (liveQuote.deposit_type === "INTENTS" && swap.origin.blockchain === "near") {
        pendingNearApproval = await executeNearWalletDeposit({
          connector: getConnector(), connectedAccount: activeNearAccount, liveQuote, swap,
          statusNode: status, detailsNode: details, request,
          onSubmitted: () => { submitted = true; }
        });
        const reviewDetails = JSON.parse(details.textContent || "{}");
        reviewDetails.meteor_wallet_transaction = {
          network: "NEAR TESTNET",
          signer: activeNearAccount,
          token_contract: swap.origin.contract_address,
          methods: swap.wrapNativeNear ? ["near_deposit", "ft_transfer_call"] : ["ft_transfer_call"],
          receiver: "verifier.tidepool-sandbox.testnet",
          amount_base_units: swap.amount,
          deposit_reference: liveQuote.deposit_address
        };
        details.textContent = JSON.stringify(reviewDetails, null, 2);
        details.hidden = false;
        quoteButton.disabled = false;
        approveButton.disabled = false;
        approveButton.textContent = "Open Meteor & approve";
        status.textContent = "Security checks passed. Tap “Open Meteor & approve” once more to launch Meteor and review the exact transfer.";
        return;
      } else if (liveQuote.deposit_type === "ORIGIN_CHAIN" && CHAIN_IDS[swap.origin.blockchain]) {
        await executeEvmDeposit({ request, token: swap.origin, liveQuote, swap, refundInput, statusNode: status, detailsNode: details, onSubmitted: () => { submitted = true; } });
      } else if (liveQuote.deposit_type === "ORIGIN_CHAIN") {
        manualOnly = true;
        status.textContent = "Quote and risk checks passed. Use the exact deposit instructions below with your chain wallet, then submit its transaction hash for tracking.";
        renderManualDeposit(fields, liveQuote, swap.origin, swap, request, status, details, () => {
          submitted = true;
          approveButton.disabled = true;
          approveButton.textContent = "Deposit submitted · status tracked";
        });
      } else {
        throw new Error("Provider deposit type does not match a supported deposit flow. No transaction was sent.");
      }
    } catch (error) {
      const riskEvaluation = error?.data?.risk_evaluation && typeof error.data.risk_evaluation === "object"
        ? error.data.risk_evaluation : null;
      const diagnostic = error?.data?.diagnostic && typeof error.data.diagnostic === "object"
        ? error.data.diagnostic : null;
      if (riskEvaluation) {
        const failedRiskChecks = Array.isArray(riskEvaluation.checks)
          ? riskEvaluation.checks.filter(check => check?.status !== "PASS").map(check => check.id)
          : [];
        status.textContent = (error.message || "Swap blocked by Sentinel risk policy.") +
          (failedRiskChecks.length ? " · Failed checks: " + failedRiskChecks.join(", ") : " · Risk decision: " + String(riskEvaluation.decision || "BLOCK"));
        details.textContent = JSON.stringify({ api_error: error.data, risk_evaluation: riskEvaluation }, null, 2);
        details.hidden = false;
      } else if (diagnostic) {
        // Surface the backend's safe, structured failure reason instead of
        // hiding it behind the generic SWAP_AGENT_ONE_UNAVAILABLE message.
        const fields = [
          diagnostic.code && "code=" + diagnostic.code,
          Number.isInteger(diagnostic.http_status) && "http=" + diagnostic.http_status,
          Number.isInteger(diagnostic.provider_status) && "provider_http=" + diagnostic.provider_status,
          diagnostic.provider_code && "provider_code=" + diagnostic.provider_code
        ].filter(Boolean);
        status.textContent = (error.message || "Swap flow stopped.") +
          (fields.length ? " · Diagnostic: " + fields.join(" · ") : "");
        details.textContent = JSON.stringify({ api_error: error.data }, null, 2);
        details.hidden = false;
      } else {
        status.textContent = error.message || "Swap flow stopped. Check wallet activity and Tidepool status before retrying.";
      }
    } finally {
      quoteButton.disabled = false;
      approveButton.disabled = pendingNearApproval ? false : submitted || manualOnly;
      approveButton.textContent = pendingNearApproval ? "Open Meteor & approve" :
        submitted ? "Swap submitted · status tracked" : manualOnly ? "Manual deposit instructions ready" : "Approve swap";
    }
  });
  // Start a read-only balance scan as soon as the swap card is rendered,
  // independently of quote/Agent-1 success. EVM permissions remain user-driven.
  void originPicker.refresh();
  result.replaceChildren(card); result.classList.remove("hidden"); result.scrollTop = result.scrollHeight;
}
