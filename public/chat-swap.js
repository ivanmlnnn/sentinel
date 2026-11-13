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
function encodeErc20Transfer(to, amount) {
  return "0xa9059cbb" + to.slice(2).toLowerCase().padStart(64, "0") + BigInt(amount).toString(16).padStart(64, "0");
}
async function connectEvm(refundInput, chain) {
  const provider = window.ethereum;
  if (!provider || typeof provider.request !== "function") throw new Error("No injected EVM wallet found. Connect MetaMask or another EIP-1193 wallet.");
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
  refundInput.value = account;
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
    if (txHash.length < 8 || txHash.length > 200 || /\s/.test(txHash)) {
      statusNode.textContent = "Enter a valid transaction hash from the selected origin chain.";
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

export async function renderChatSwap({ prompt, result, request, connector, connectedAccount, encodeBase58, guestMode }) {
  const parsed = parseChatSwapPrompt(prompt);
  const card = el("section", undefined, "developer-trade-draft");
  const heading = el("div", undefined, "developer-trade-draft-heading");
  heading.append(el("strong", "Swap request · Tidepool Testnet"), el("span", "TWO-AGENT GATE"));
  card.append(heading);
  if (!parsed) {
    card.append(el("p", "Use format: swap 0.1 ETH to NEAR. Decimal comma is accepted, e.g. swap 0,1 ETH to NEAR."));
    result.replaceChildren(card); result.classList.remove("hidden"); return;
  }
  card.append(el("p", "Agent 1 resolves the live Tidepool asset route and quote. Agent 2 independently validates the signed quote, exact amount, chain, recipient, refund address, deadline and slippage before wallet approval."));
  const tokensResponse = await request("/trading/tokens", { method: "GET" });
  const tokens = tokensResponse.tokens;
  if (!Array.isArray(tokens) || !tokens.length) throw new Error("Tidepool did not return a usable testnet token registry.");
  const matches = symbol => tokens.filter(token => token.symbol.toUpperCase() === symbol);
  const amountInput = document.createElement("input"); amountInput.value = parsed.amount; amountInput.inputMode = "decimal";
  const originSelect = document.createElement("select"), destSelect = document.createElement("select");
  const addOptions = (select, symbol) => {
    const found = matches(symbol);
    const first = el("option", found.length ? "Choose exact " + symbol + " network…" : "Asset not found: " + symbol);
    first.value = ""; select.append(first);
    for (const token of found) { const option = el("option", formatToken(token)); option.value = token.asset_id; select.append(option); }
    if (found.length === 1) select.value = found[0].asset_id;
  };
  addOptions(originSelect, parsed.from); addOptions(destSelect, parsed.to);
  const recipientInput = document.createElement("input"); recipientInput.autocomplete = "off"; recipientInput.placeholder = "Destination wallet address";
  const refundInput = document.createElement("input"); refundInput.autocomplete = "off"; refundInput.placeholder = "Refund address on origin chain";
  const slippage = document.createElement("select");
  for (const pair of [["50","0.5%"],["100","1%"],["200","2%"],["300","3%"]]) {
    const option = el("option", pair[1]); option.value = pair[0]; if (pair[0] === "100") option.selected = true; slippage.append(option);
  }
  const defaults = () => {
    const origin = tokens.find(token => token.asset_id === originSelect.value);
    const dest = tokens.find(token => token.asset_id === destSelect.value);
    if (connectedAccount && nearAccount(connectedAccount)) {
      if (dest?.blockchain === "near" && !recipientInput.value) recipientInput.value = connectedAccount;
      if (origin?.blockchain === "near" && !refundInput.value) refundInput.value = connectedAccount;
    }
  };
  defaults();
  const fields = el("div", undefined, "developer-trade-quote");
  addField(fields, "Amount · " + parsed.from, amountInput);
  addField(fields, "Origin asset / network", originSelect);
  addField(fields, "Destination asset / network", destSelect);
  addField(fields, "Destination recipient", recipientInput);
  addField(fields, "Origin refund address", refundInput);
  addField(fields, "Maximum slippage", slippage);
  const status = el("p", "Select exact networks and addresses, then request a quote.");
  const details = el("pre"); details.hidden = true;
  const quoteButton = el("button", "Get verified quote", "secondary-btn"); quoteButton.type = "button";
  const approveButton = el("button", "Review & approve swap", "primary-btn"); approveButton.type = "button"; approveButton.disabled = true;
  fields.append(quoteButton, status, approveButton, details); card.append(fields);
  let swap = null, dryQuote = null;
  const invalidate = () => { approveButton.disabled = true; dryQuote = null; swap = null; };
  originSelect.addEventListener("change", () => { defaults(); invalidate(); });
  destSelect.addEventListener("change", () => { defaults(); invalidate(); });
  for (const input of [amountInput, recipientInput, refundInput, slippage]) input.addEventListener("change", invalidate);
  quoteButton.addEventListener("click", async () => {
    quoteButton.disabled = true; approveButton.disabled = true;
    status.textContent = "Agent 1: resolving exact token IDs and requesting Tidepool dry quote…";
    try {
      const origin = tokens.find(token => token.asset_id === originSelect.value);
      const destination = tokens.find(token => token.asset_id === destSelect.value);
      if (!origin || !destination) throw new Error("Choose exact origin and destination assets from the live token registry.");
      let refundTo = refundInput.value.trim();
      if (CHAIN_IDS[origin.blockchain] && !guestMode) {
        const wallet = await connectEvm(refundInput, origin.blockchain); refundTo = wallet.account;
      }
      const requestBody = {
        originAsset: origin.asset_id, destinationAsset: destination.asset_id,
        amount: decimalToUnits(amountInput.value.trim(), Number(origin.decimals)),
        recipient: recipientInput.value.trim(), refundTo, slippageTolerance: Number(slippage.value)
      };
      if (origin.blockchain === "near" && (!connectedAccount || refundTo.toLowerCase() !== connectedAccount.toLowerCase())) {
        throw new Error("For Meteor/NEAR origin, connect your NEAR Testnet wallet and use that account as refund address.");
      }
      dryQuote = await request("/trading/quote", { method: "POST", body: JSON.stringify(requestBody) });
      if (dryQuote.mode !== "QUOTE_ONLY" || dryQuote.execution_enabled !== false ||
          dryQuote.origin_chain !== origin.blockchain || dryQuote.destination_chain !== destination.blockchain) {
        throw new Error("Dry quote did not match the selected route.");
      }
      swap = { ...requestBody, origin, destination };
      status.textContent = "Agent 1 route: " + origin.blockchain.toUpperCase() + " → " + destination.blockchain.toUpperCase() +
        " · " + (dryQuote.quote.amount_in_formatted || dryQuote.quote.amount_in) + " " + origin.symbol +
        " → " + (dryQuote.quote.amount_out_formatted || dryQuote.quote.amount_out) + " " + destination.symbol +
        ". Agent 2 risk gate runs on the fresh signed quote before approval.";
      details.textContent = JSON.stringify({ route: { origin: formatToken(origin), destination: formatToken(destination) }, dry_quote: dryQuote }, null, 2);
      details.hidden = false;
      if (guestMode) status.textContent += " Guest mode is quote-only; sign in to approve.";
      else approveButton.disabled = false;
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
        if (!connector || !connectedAccount || !nearAccount(connectedAccount)) throw new Error("Connect Meteor or another NEAR Testnet wallet first.");
        if (swap.refundTo.toLowerCase() !== connectedAccount.toLowerCase()) throw new Error("NEAR refund account must match connected wallet.");
      } else if (CHAIN_IDS[swap.origin.blockchain]) {
        const wallet = await connectEvm(refundInput, swap.origin.blockchain);
        if (wallet.account.toLowerCase() !== swap.refundTo.toLowerCase()) throw new Error("Connected EVM wallet differs from reviewed refund address. Request a fresh quote.");
      } else if (!swap.refundTo) {
        throw new Error("Enter the refund address on the selected origin chain.");
      }
      status.textContent = "Agent 2: requesting a fresh signed live quote and deterministic risk evaluation…";
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
        "\n\nContinue to your wallet approval?";
      if (!window.confirm(summary)) throw new Error("Cancelled before wallet approval. No transaction was submitted.");
      if (liveQuote.deposit_type === "INTENTS" && swap.origin.blockchain === "near") {
        await executeNearIntents({ request, connector, connectedAccount, liveQuote, swap, statusNode: status, detailsNode: details, encodeBase58, onSubmitted: () => { submitted = true; } });
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
      approveButton.textContent = submitted ? "Swap submitted · status tracked" : manualOnly ? "Manual deposit instructions ready" : "Review & approve swap";
    }
  });
  result.replaceChildren(card); result.classList.remove("hidden"); result.scrollTop = result.scrollHeight;
}
