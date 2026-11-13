const CHAIN_IDS = { eth: "0xaa36a7", base: "0x14a34", arb: "0x66eee", bsc: "0x61" };
const NATIVE_EVM_SYMBOLS = { eth: new Set(["ETH"]), base: new Set(["ETH"]), arb: new Set(["ETH"]), bsc: new Set(["BNB"]) };
const TERMINAL = new Set(["SUCCESS", "REFUNDED", "FAILED"]);

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
function formatToken(token) { return token.symbol + " · " + token.blockchain.toUpperCase() + " · TESTNET"; }
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
  const providers = Array.isArray(window.ethereum?.providers) ? window.ethereum.providers : [window.ethereum];
  return providers.find(item => item && typeof item.request === "function" && !item.isBraveWallet) ||
    providers.find(item => item && typeof item.request === "function") || null;
}
async function connectEvm(refundInput, chain) {
  const provider = getInjectedEvmProvider();
  if (!provider) throw new Error("No injected EVM wallet found. Install or unlock an EIP-1193 wallet, then retry.");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const account = accounts?.[0];
  if (!evmAddress(account)) throw new Error("EVM wallet did not return a valid address.");
  const wantedChain = CHAIN_IDS[chain];
  if (!wantedChain) throw new Error("No audited EVM network mapping for " + chain + ".");
  let currentChain = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
  if (currentChain !== wantedChain) {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: wantedChain }] });
    currentChain = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
  }
  if (currentChain !== wantedChain) throw new Error("Wallet network does not match the selected origin chain.");
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
  sol: "solana", solana: "solana", sui: "sui"
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
  img.src = "https://cdn.simpleicons.org/" + slug;
  img.addEventListener("error", () => { wrap.replaceChildren(el("span", key.slice(0, 2).toUpperCase())); });
  wrap.append(img);
  return wrap;
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
async function readSwapWalletBalance(token, nearWalletAccount) {
  const chain = String(token.blockchain || "").toLowerCase();
  if (CHAIN_IDS[chain]) {
    const provider = getInjectedEvmProvider();
    if (!provider || typeof provider.request !== "function") return { value: null, note: "Open an EVM wallet browser or install a compatible wallet" };
    const accounts = await provider.request({ method: "eth_accounts" });
    const account = accounts?.[0];
    if (!evmAddress(account)) return { value: null, note: "Connect an EVM wallet" };
    const currentChain = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
    if (currentChain !== CHAIN_IDS[chain]) return { value: null, note: "Switch wallet to " + chain.toUpperCase() };
    let raw;
    if (token.contract_address) {
      if (!tokenAddressValid(token)) return { value: null, note: "Invalid token contract" };
      const data = "0x70a08231" + account.slice(2).toLowerCase().padStart(64, "0");
      raw = await provider.request({ method: "eth_call", params: [{ to: token.contract_address, data }, "latest"] });
    } else {
      raw = await provider.request({ method: "eth_getBalance", params: [account, "latest"] });
    }
    if (typeof raw !== "string" || !/^0x[0-9a-f]+$/i.test(raw)) return { value: null, note: "Balance unavailable" };
    return { value: formatUnitsForDisplay(BigInt(raw).toString(), token.decimals), note: "Wallet balance" };
  }
  if (chain === "near") {
    if (!nearAccount(nearWalletAccount)) return { value: null, note: "Connect a NEAR Testnet wallet" };
    const params = token.contract_address
      ? { request_type: "call_function", finality: "final", account_id: token.contract_address, method_name: "ft_balance_of", args_base64: btoa(JSON.stringify({ account_id: nearWalletAccount })) }
      : { request_type: "view_account", finality: "final", account_id: nearWalletAccount };
    const response = await fetch("https://rpc.testnet.near.org", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "sentinel-swap-balance", method: "query", params })
    });
    if (!response.ok) throw new Error("NEAR RPC HTTP " + response.status);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message || "NEAR RPC balance error");
    if (token.contract_address) {
      const bytes = payload.result?.result;
      if (!Array.isArray(bytes)) throw new Error("NEAR FT balance response is invalid");
      const raw = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
      return { value: formatUnitsForDisplay(raw, token.decimals), note: "Wallet balance" };
    }
    return { value: formatUnitsForDisplay(payload.result?.amount || "0", token.decimals), note: "Wallet balance" };
  }
  return { value: null, note: "Wallet balance adapter not connected for " + chain.toUpperCase() };
}
function createSwapTokenPicker(select, tokenList, initialSymbol, nearWalletAccount, onSelected) {
  const root = el("div", undefined, "swap-token-picker");
  const trigger = el("button", undefined, "swap-token-trigger");
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  const panel = el("div", undefined, "swap-token-panel");
  panel.hidden = true;
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
  const balances = new Map();
  let loading = false;
  const selectedToken = () => tokenList.find(token => token.asset_id === select.value);
  const syncTrigger = () => {
    const token = selectedToken();
    trigger.replaceChildren();
    const name = el("strong", token ? token.symbol : (initialSymbol || "Select token"));
    const network = el("span", token ? String(token.blockchain).toUpperCase() : "Choose network");
    const chevron = el("span", "▾", "swap-token-chevron");
    trigger.replaceChildren(token ? chainLogo(token.blockchain) : el("span", "◈", "swap-token-placeholder"), name, network, chevron);
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
    if (!entries.length) { list.append(el("p", "No Tidepool assets on this network.", "swap-token-empty")); return; }
    for (const token of entries) {
      const item = el("button", undefined, "swap-token-option" + (token.asset_id === select.value ? " is-current" : ""));
      item.type = "button";
      const identity = el("span", undefined, "swap-token-identity");
      identity.append(chainLogo(token.blockchain), el("span", undefined, "swap-token-copy"));
      identity.lastChild.append(el("strong", token.symbol), el("small", String(token.name || token.symbol) + " · " + String(token.blockchain).toUpperCase()));
      const balance = balances.get(token.asset_id);
      const amount = el("strong", balance?.value !== null && balance?.value !== undefined ? balance.value : "—", "swap-token-balance");
      const note = el("small", balance?.note || "Balance not checked", "swap-token-balance-note");
      const value = el("span", undefined, "swap-token-value");
      value.append(amount, note);
      item.append(identity, value);
      item.addEventListener("click", () => {
        select.value = token.asset_id;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        syncTrigger();
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        onSelected(token);
      });
      list.append(item);
    }
  };
  const refreshBalances = async () => {
    if (loading) return;
    loading = true;
    refresh.disabled = true;
    refresh.textContent = "Refreshing…";
    balanceStamp.textContent = "Reading connected wallet";
    const entries = tokenList.filter(token => String(token.blockchain || "").toLowerCase() === activeChain);
    const walletAccount = typeof nearWalletAccount === "function" ? nearWalletAccount() : nearWalletAccount;
    await Promise.all(entries.map(async token => {
      try { balances.set(token.asset_id, await readSwapWalletBalance(token, walletAccount)); }
      catch (error) { balances.set(token.asset_id, { value: null, note: error?.message || "Balance unavailable" }); }
    }));
    balanceStamp.textContent = "Updated " + new Date().toLocaleTimeString();
    loading = false;
    refresh.disabled = false;
    refresh.textContent = "Refresh balances ↻";
    renderTokens();
  };
  trigger.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    trigger.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) refreshBalances();
  });
  refresh.addEventListener("click", refreshBalances);
  syncTrigger(); renderChains(); renderTokens();
  root.append(trigger, select, panel);
  return { root, sync: syncTrigger, refresh: refreshBalances, close: () => { panel.hidden = true; trigger.setAttribute("aria-expanded", "false"); } };
}

export async function renderChatSwap({ prompt, result, request, connector: connectorSource, connectedAccount: accountSource, encodeBase58, guestMode, onWalletConnected }) {
  const getConnector = () => typeof connectorSource === "function" ? connectorSource() : connectorSource;
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
  card.append(el("p", "Review the amount and networks, then connect the wallets needed for this route.", "sentinel-swap-intro"));
  const securityDetails = el("details", undefined, "sentinel-swap-security");
  securityDetails.append(el("summary", "How the security check works"));
  securityDetails.append(el("p", "One service resolves the live Tidepool route. A second independent check validates the signed quote, amount, networks, recipient, refund address, deadline and slippage before any wallet approval."));
  card.append(securityDetails);
  const tokensResponse = await request("/trading/tokens", { method: "GET" });
  const tokens = tokensResponse.tokens;
  if (!Array.isArray(tokens) || !tokens.length) throw new Error("Tidepool did not return a usable testnet token registry.");
  const amountInput = document.createElement("input"); amountInput.value = parsed.amount; amountInput.inputMode = "decimal";
  const originSelect = document.createElement("select"), destSelect = document.createElement("select");
  for (const token of tokens) {
    const originOption = el("option", formatToken(token)); originOption.value = String(token.asset_id ?? ""); originSelect.append(originOption);
    const destinationOption = el("option", formatToken(token)); destinationOption.value = String(token.asset_id ?? ""); destSelect.append(destinationOption);
  }
  // Symbols such as ETH and USDC exist on several testnets. Resolve a deterministic
  // supported default instead of leaving the native selects empty when matches are ambiguous.
  const preferredChain = symbol => {
    const key = String(symbol || "").toUpperCase();
    if (key === "NEAR" || key === "WNEAR") return "near";
    if (key === "BNB") return "bsc";
    if (key === "SOL") return "sol";
    if (key === "BTC" || key === "WBTC") return "btc";
    if (key === "XLM") return "stellar";
    if (key === "XRP") return "xrp";
    if (key === "SUI") return "sui";
    if (key === "ETH") return "eth";
    return "near";
  };
  const chooseInitialToken = symbol => {
    const matches = tokens.filter(token => String(token.symbol).toUpperCase() === String(symbol).toUpperCase());
    if (!matches.length) return null;
    const preferred = preferredChain(symbol);
    return matches.find(token => String(token.blockchain).toLowerCase() === preferred) ||
      matches.find(token => String(token.blockchain).toLowerCase() === "near") ||
      matches.find(token => CHAIN_IDS[String(token.blockchain).toLowerCase()]) ||
      matches[0];
  };
  const initialOrigin = chooseInitialToken(parsed.from);
  const initialDestination = chooseInitialToken(parsed.to);
  originSelect.value = initialOrigin ? String(initialOrigin.asset_id ?? "") : "";
  destSelect.value = initialDestination ? String(initialDestination.asset_id ?? "") : "";
  originSelect.className = "swap-native-select";
  destSelect.className = "swap-native-select";
  const originPicker = createSwapTokenPicker(originSelect, tokens, parsed.from, () => activeNearAccount, () => { defaults(); invalidate(); });
  const destinationPicker = createSwapTokenPicker(destSelect, tokens, parsed.to, () => activeNearAccount, () => { defaults(); invalidate(); });
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
      const wallet = await connectEvm(null, key);
      activeEvmAccount = wallet.account;
      return wallet.account;
    }
    if (key === "near") {
      const sharedAccount = getConnectedAccount();
      if (nearAccount(sharedAccount)) activeNearAccount = sharedAccount;
      const connector = getConnector();
      if (!connector) throw new Error("NEAR wallet connector is still loading. Wait a moment and tap Connect again.");
      if (!activeNearAccount) {
        // Keep connector.connect() as the first awaited wallet action in this click.
        await connector.connect();
        const current = await connector.getConnectedWallet();
        const account = current.accounts?.[0];
        if (!nearAccount(account?.accountId)) throw new Error("NEAR wallet did not return a valid Testnet account.");
        activeNearAccount = account.accountId;
        onWalletConnected?.(account.accountId, current.wallet?.manifest?.name || "NEAR wallet");
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
  walletBar.append(walletState, connectButton);
  fields.append(walletBar);
  connectButton.addEventListener("click", async () => {
    const { origin, dest } = defaults();
    if (!origin || !dest) {
      status.textContent = "Select a valid origin and destination asset from the Tidepool registry first.";
      return;
    }
    connectButton.disabled = true;
    connectButton.textContent = "Connecting…";
    try {
      // Dashboard wallet state is the source of truth. Read it synchronously
      // before deciding whether a wallet prompt is needed.
      const dashboardNearAccount = getConnectedAccount();
      if (nearAccount(dashboardNearAccount)) activeNearAccount = dashboardNearAccount;
      const routeChains = [...new Set([origin.blockchain, dest.blockchain].map(value => String(value).toLowerCase()))];
      // Ask for NEAR first so Meteor can open even when the browser has no EVM extension.
      routeChains.sort((a, b) => (a === "near" ? -1 : 0) - (b === "near" ? -1 : 0));
      for (let index = 0; index < routeChains.length; index++) {
        const chain = routeChains[index];
        const wasConnected = Boolean(walletAddressFor(chain));
        if (!wasConnected) {
          await connectWalletForChain(chain);
          const partialAddresses = [walletAddressFor(origin.blockchain), walletAddressFor(dest.blockchain)].filter(Boolean);
          if (partialAddresses.length) {
            walletStateText.textContent = partialAddresses.map(shortWalletAddress).join(" · ");
            walletState.classList.add("is-connected");
          }
          const nextChain = routeChains.slice(index + 1).find(next => !walletAddressFor(next));
          if (nextChain) {
            connectButton.textContent = "Connect " + nextChain.toUpperCase() + " wallet";
            status.textContent = chain.toUpperCase() + " wallet connected. Tap again to connect the " + nextChain.toUpperCase() + " wallet.";
            return;
          }
        }
      }
      const addresses = [walletAddressFor(origin.blockchain), walletAddressFor(dest.blockchain)].filter(Boolean);
      walletStateText.textContent = addresses.map(shortWalletAddress).join(" · ");
      walletState.classList.add("is-connected");
      connectButton.textContent = "Get verified quote";
      status.textContent = "Wallet connected. Verifying route and quote…";
      originPicker.refresh(); destinationPicker.refresh();
      quoteButton.click();
    } catch (error) {
      connectButton.textContent = "Connect required wallets";
      status.textContent = error.message || "Wallet connection failed.";
    } finally { connectButton.disabled = false; }
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
        if (evmAddress(accounts?.[0])) activeEvmAccount = accounts[0];
      }
    } catch {}
    const detected = [activeNearAccount, activeEvmAccount].filter(Boolean);
    const routeChains = [...new Set([defaults().origin?.blockchain, defaults().dest?.blockchain].filter(Boolean).map(value => String(value).toLowerCase()))];
    const missingChains = routeChains.filter(chain => !walletAddressFor(chain));
    if (detected.length) {
      walletStateText.textContent = detected.map(shortWalletAddress).join(" · ");
      walletState.classList.add("is-connected");
    }
    connectButton.textContent = missingChains.length
      ? "Connect " + missingChains[0].toUpperCase() + " wallet"
      : "Get verified quote";
  })();
  addField(fields, "Amount", amountInput);
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
  const status = el("p", "Connect the wallets for both networks to check the route and price.", "sentinel-swap-status");
  const details = el("pre"); details.hidden = true;
  const quoteButton = el("button", "Get verified quote", "secondary-btn"); quoteButton.type = "button"; quoteButton.hidden = true;
  const approveButton = el("button", "Approve swap", "primary-btn"); approveButton.type = "button"; approveButton.disabled = true; approveButton.hidden = true;
  fields.append(status, approveButton, details); card.append(fields);
  let swap = null, dryQuote = null;
  const invalidate = () => { approveButton.disabled = true; dryQuote = null; swap = null; };
  const refreshConnectLabel = () => {
    const { origin, dest } = defaults();
    const chains = [...new Set([origin?.blockchain, dest?.blockchain].filter(Boolean).map(value => String(value).toLowerCase()))];
    const missing = chains.find(chain => !walletAddressFor(chain));
    connectButton.textContent = missing ? "Connect " + missing.toUpperCase() + " wallet" : "Get verified quote";
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
      const requestBody = {
        originAsset: origin.asset_id, destinationAsset: destination.asset_id,
        amount: decimalToUnits(amountInput.value.trim(), Number(origin.decimals)),
        recipient, refundTo, slippageTolerance: Number(slippage.value)
      };
      dryQuote = await request("/trading/quote", { method: "POST", body: JSON.stringify(requestBody) });
      if (dryQuote.mode !== "QUOTE_ONLY" || dryQuote.execution_enabled !== false ||
          dryQuote.origin_chain !== origin.blockchain || dryQuote.destination_chain !== destination.blockchain) {
        throw new Error("Dry quote did not match the selected route.");
      }
      swap = { ...requestBody, origin, destination };
      status.textContent = "Route ready: " + origin.blockchain.toUpperCase() + " → " + destination.blockchain.toUpperCase() +
        " · " + (dryQuote.quote.amount_in_formatted || dryQuote.quote.amount_in) + " " + origin.symbol +
        " → " + (dryQuote.quote.amount_out_formatted || dryQuote.quote.amount_out) + " " + destination.symbol +
        ". Security checks run again before wallet approval.";
      details.textContent = JSON.stringify({ route: { origin: formatToken(origin), destination: formatToken(destination) }, dry_quote: dryQuote }, null, 2);
      details.hidden = true;
      if (guestMode) status.textContent += " Guest mode is quote-only; sign in to approve.";
      else { approveButton.disabled = false; approveButton.hidden = false; }
    } catch (error) { status.textContent = error.message || "Quote request failed."; }
    finally { quoteButton.disabled = false; }
  });
  approveButton.addEventListener("click", async () => {
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
      const liveQuote = await request("/trading/live-quote", { method: "POST", body: JSON.stringify(swap) });
      if (liveQuote.mode !== "LIVE_QUOTE_AWAITING_USER_SIGNATURE" || liveQuote.execution_enabled !== false ||
          liveQuote.provider_signature_verified !== true || liveQuote.risk_evaluation?.decision !== "ALLOW" ||
          !String(liveQuote.risk_evaluation?.policy_hash || "").startsWith("sha256:") ||
          !liveQuote.signed_quote || typeof liveQuote.signed_quote !== "object" ||
          !liveQuote.deposit_address || !Number.isFinite(Date.parse(liveQuote.deadline)) || Date.parse(liveQuote.deadline) <= Date.now()) {
        throw new Error("Agent 2 rejected an invalid, expired, unsigned or risky live quote.");
      }
      const summary = "SWAP APPROVAL REVIEW\n\n" + swap.origin.symbol + " (" + swap.origin.blockchain + ") → " +
        swap.destination.symbol + " (" + swap.destination.blockchain + ")\nInput: " +
        (liveQuote.quote.amount_in_formatted || liveQuote.quote.amount_in) + "\nExpected output: " +
        (liveQuote.quote.amount_out_formatted || liveQuote.quote.amount_out) + "\nMinimum output: " +
        liveQuote.quote.minimum_amount_out + "\nRecipient: " + swap.recipient + "\nRefund: " + swap.refundTo +
        "\nDeposit address: " + liveQuote.deposit_address + "\nDeadline: " + liveQuote.deadline +
        "\nRisk: " + liveQuote.risk_evaluation.decision + "\nPolicy: " + liveQuote.risk_evaluation.policy_hash +
        "\n\n" + (swap.origin.blockchain === "near" ? "Continue to NEAR wallet signing?" :
          CHAIN_IDS[swap.origin.blockchain] ? "Continue to EVM wallet transfer approval?" :
          "Continue to show the exact manual deposit instructions? No wallet prompt will open in Sentinel.");
      if (!window.confirm(summary)) throw new Error("Cancelled before wallet approval. No transaction was submitted.");
      if (liveQuote.deposit_type === "INTENTS" && swap.origin.blockchain === "near") {
        await executeNearIntents({ request, connector: getConnector(), connectedAccount: activeNearAccount, liveQuote, swap, statusNode: status, detailsNode: details, encodeBase58, onSubmitted: () => { submitted = true; } });
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
      status.textContent = error.message || "Swap flow stopped. Check wallet activity and Tidepool status before retrying.";
    } finally {
      quoteButton.disabled = false;
      approveButton.disabled = submitted || manualOnly;
      approveButton.textContent = submitted ? "Swap submitted · status tracked" : manualOnly ? "Manual deposit instructions ready" : "Approve swap";
    }
  });
  result.replaceChildren(card); result.classList.remove("hidden"); result.scrollTop = result.scrollHeight;
}
