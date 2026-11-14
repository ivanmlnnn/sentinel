import { buildTradeSkillDraft } from './trade-skill-draft.js';
import { renderChatSwap } from './chat-swap.js?v=20261114-mobile-meteor-approval5';
const $ = id => document.getElementById(id);
const API = '/api';
const GUEST_MODE = Boolean(window.SENTINEL_GUEST);
if (window.__SENTINEL_APP_STARTED) throw new Error('Sentinel dashboard already started.');
window.__SENTINEL_APP_STARTED = true;
if (GUEST_MODE) {
  document.body.classList.add('sentinel-authenticated', 'sentinel-guest');
  const actions = document.querySelector('.top-actions');
}
let connector = null;
let connectedAccount = null;
let connectedWalletName = null;
let activeChatSwapController = null;
let connectorReady = false;

function toast(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 3200);
}
function short(value) {
  return value && value.length > 26 ? value.slice(0, 10) + '…' + value.slice(-8) : value;
}
const NEAR_BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encodeBase58(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let encoded = '';
  while (value > 0n) {
    const remainder = Number(value % 58n);
    encoded = NEAR_BASE58_ALPHABET[remainder] + encoded;
    value /= 58n;
  }
  return '1'.repeat(zeros) + encoded;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function request(path, options = {}) {
  const headers = {'content-type':'application/json', ...(options.headers || {})};
  const tradingRequest = path.startsWith('/trading/');
  const controller = tradingRequest && typeof AbortController !== 'undefined' ? new AbortController() : null;
  const externalSignal = options.signal;
  const timeoutMs = path === '/trading/agent' || path === '/trading/live-quote' ? 60000 : tradingRequest ? 30000 : 10000;
  let timedOut = false;
  let timeoutId = null;
  let abortListener = null;
  if (controller) {
    timeoutId = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else {
        abortListener = () => controller.abort();
        externalSignal.addEventListener('abort', abortListener, { once: true });
      }
    }
  }
  const abortPromise = controller ? new Promise((_, reject) => {
    if (controller.signal.aborted) reject(new DOMException('Request aborted', 'AbortError'));
    else controller.signal.addEventListener('abort', () => reject(new DOMException('Request aborted', 'AbortError')), { once: true });
  }) : null;
  try {
    if (typeof window.getSentinelAccessToken === 'function') {
      try {
        const tokenPromise = window.getSentinelAccessToken();
        const token = await (abortPromise ? Promise.race([tokenPromise, abortPromise]) : tokenPromise);
        if (token) headers.authorization = 'Bearer ' + token;
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        console.warn('Could not refresh Privy access token for API request:', error);
      }
    }
    const fetchOptions = { ...options, headers };
    delete fetchOptions.signal;
    if (controller) fetchOptions.signal = controller.signal;
    // Match the Main Worker route table in src/index.js exactly.
    // Keep the swap UI's logical names, but normalize legacy aliases explicitly.
    let apiPath = path;
    if (path === '/trading-balance') apiPath = '/trading/balance';
    else if (path === '/trading/deposit-submit') apiPath = '/trading/deposit/submit';
    const response = await (abortPromise
      ? Promise.race([fetch(API + apiPath, fetchOptions), abortPromise])
      : fetch(API + apiPath, fetchOptions));
    const contentType = response.headers.get('content-type') || 'unknown';
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch {}
    if (!response.ok) {
      const reason = typeof data?.error === 'string' ? data.error :
        typeof data?.reason === 'string' ? data.reason : 'API returned a non-JSON error response';
      const detail = typeof data?.detail === 'string' ? ': ' + data.detail :
        typeof data?.provider_message === 'string' ? ': ' + data.provider_message : '';
      const error = new Error('Sentinel API HTTP ' + response.status + ' (' + contentType + '): ' + reason + detail);
      error.data = data;
      throw error;
    }
    if (!data || typeof data !== 'object') {
      throw new Error('Sentinel API returned invalid JSON (HTTP ' + response.status + ', ' + contentType + '). Wallet was not opened.');
    }
    return data;
  } catch (cause) {
    if (cause?.name === 'AbortError') {
      if (externalSignal?.aborted) throw new DOMException('This request was superseded by your latest prompt.', 'AbortError');
      if (timedOut) throw new Error('Sentinel request timed out after 10 seconds. No wallet transaction was approved. Try again or check the API/Tidepool connection.');
    }
    const error = cause?.name === 'AbortError'
      ? new Error('Sentinel request was cancelled before wallet approval.')
      : cause instanceof Error ? cause : new Error('Sentinel API connection failed before wallet approval.');
    error.cause = cause;
    throw error;
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    if (externalSignal && abortListener) externalSignal.removeEventListener('abort', abortListener);
  }
}
function syncWalletUI(accountId, walletName) {
  connectedAccount = accountId || null;
  connectedWalletName = walletName || null;
  const button = $('walletBtn');
  button.disabled = false;
  button.classList.toggle('wallet-connected', Boolean(connectedAccount));
  const brand = document.querySelector('.brand');
  brand?.classList.toggle('wallet-linked', Boolean(connectedAccount));
  brand?.classList.toggle('wallet-logged-out', !connectedAccount && Boolean(brand.dataset.walletWasConnected));
  if (connectedAccount && brand) brand.dataset.walletWasConnected = '1';
  const accountSuffix = connectedAccount?.endsWith('.testnet') ? '.testnet' : '';
  const accountBase = accountSuffix ? connectedAccount.slice(0, -accountSuffix.length) : connectedAccount;
  button.innerHTML = connectedAccount
    ? '<span class="wallet-account-name" title="' + escapeHtml(connectedAccount) + '"><span class="wallet-account-base">' + escapeHtml(accountBase) + '</span>' + (accountSuffix ? '<span class="wallet-account-network">.testnet</span>' : '') + '</span><span class="wallet-action-divider" aria-hidden="true"></span><svg class="wallet-power" role="img" aria-label="Disconnect wallet" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6.2 5.8a9 9 0 1 0 11.6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    : 'Connect';
  const trackedWallet = $('receiver');
  if (connectedAccount) {
    if (!trackedWallet.value || trackedWallet.dataset.walletAutofill === '1') {
      trackedWallet.value = connectedAccount;
      trackedWallet.dataset.walletAutofill = '1';
    }
  } else if (trackedWallet.dataset.walletAutofill === '1') {
    trackedWallet.value = '';
    trackedWallet.dataset.walletAutofill = '0';
  }
  $('walletConnectionState').textContent = connectedAccount
    ? 'Connected to ' + (connectedWalletName || 'NEAR wallet') + ': ' + connectedAccount + ' — wallet account autofilled.'
    : 'Not connected — enter any public NEAR Testnet account to track it.';
  if (trackedWallet.value) queueWalletFacts(trackedWallet.value);
}

let walletFactsTimer = null;
let walletFactsRequest = 0;
function queueWalletFacts(account) {
  window.clearTimeout(walletFactsTimer);
  const value = String(account || '').trim().toLowerCase();
  const card = $('walletFactCard');
  if (!card) return;
  if (!/^[a-z0-9._-]{2,64}$/.test(value)) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  $('walletFactStatus').textContent = 'Reading NEAR Testnet…';
  $('walletFactBalance').textContent = '···';
  $('walletFactAccount').textContent = value;
  walletFactsTimer = window.setTimeout(async () => {
    const requestId = ++walletFactsRequest;
    try {
      const data = await request('/wallet?account_id=' + encodeURIComponent(value));
      if (requestId !== walletFactsRequest || $('receiver').value.trim().toLowerCase() !== value) return;
      $('walletFactBalance').textContent = data.account_exists
        ? Number(data.balance_near).toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' NEAR'
        : '—';
      $('walletFactStatus').textContent = data.account_exists ? 'ACCOUNT ACTIVE' : 'ACCOUNT NOT FOUND';
      $('walletFactNetwork').textContent = 'NEAR TESTNET';
      $('walletFactExplorer').href = data.explorer_url || 'https://testnet.nearblocks.io/';
      $('walletFactExplorer').hidden = !data.account_exists;
      $('walletFactSource').textContent = data.account_exists
        ? 'Live balance · block ' + Number(data.block_height).toLocaleString('en-US')
        : 'No account returned by NEAR RPC';
      card.dataset.exists = data.account_exists ? 'true' : 'false';
    } catch (error) {
      if (requestId !== walletFactsRequest) return;
      $('walletFactBalance').textContent = 'Unavailable';
      $('walletFactStatus').textContent = 'DATA UNAVAILABLE';
      $('walletFactSource').textContent = 'NEAR RPC could not verify this account. Retry in a moment.';
      $('walletFactExplorer').hidden = true;
    }
  }, 450);
}
function initWalletCardMotion() {
  const card = $('walletFactCard');
  const face = $('walletFactFace');
  const motionButton = $('walletMotionBtn');
  if (!card || !face) return;
  let gyroHandler = null;
  let gyroTimer = null;
  const reset = () => {
    face.style.setProperty('--tilt-x', '0deg');
    face.style.setProperty('--tilt-y', '0deg');
  };
  const tiltFromPoint = (clientX, clientY) => {
    const rect = face.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (clientX - rect.left) / rect.width - 0.5;
    const y = (clientY - rect.top) / rect.height - 0.5;
    face.style.setProperty('--tilt-x', (-y * 12).toFixed(2) + 'deg');
    face.style.setProperty('--tilt-y', (x * 15).toFixed(2) + 'deg');
    face.style.setProperty('--shine-x', (x * 35 + 50).toFixed(1) + '%');
    face.style.setProperty('--shine-y', (y * 35 + 50).toFixed(1) + '%');
  };
  // Pointer Events also cover touch screens; the old handler ignored touch input.
  card.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      tiltFromPoint(event.clientX, event.clientY);
      return;
    }
    tiltFromPoint(event.clientX, event.clientY);
  }, { passive: true });
  card.addEventListener('pointerdown', () => {
    face.classList.remove('is-pressed');
    void face.offsetWidth;
    face.classList.add('is-pressed');
  }, { passive: true });
  face.addEventListener('animationend', event => {
    if (event.animationName === 'wallet-card-tap') face.classList.remove('is-pressed');
  });
  card.addEventListener('pointerup', () => {
    face.classList.remove('is-pressed');
    if (window.matchMedia('(hover: none)').matches) reset();
  });
  card.addEventListener('pointercancel', reset);
  card.addEventListener('pointerleave', reset);
  motionButton?.addEventListener('click', async () => {
    try {
      if (!('DeviceOrientationEvent' in window)) throw new Error('Device orientation is not supported by this browser.');
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') throw new Error('Motion permission was not granted.');
      }
      if (gyroHandler) window.removeEventListener('deviceorientation', gyroHandler);
      let detected = false;
      gyroHandler = event => {
        if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
        detected = true;
        face.style.setProperty('--tilt-x', (Math.max(-12, Math.min(12, event.beta - 45))).toFixed(2) + 'deg');
        face.style.setProperty('--tilt-y', (Math.max(-15, Math.min(15, event.gamma))).toFixed(2) + 'deg');
        if (motionButton) {
          motionButton.textContent = 'Gyro active';
          motionButton.disabled = true;
          motionButton.setAttribute('aria-pressed', 'true');
        }
        window.clearTimeout(gyroTimer);
        gyroTimer = null;
      };
      window.addEventListener('deviceorientation', gyroHandler, { passive: true });
      motionButton.textContent = 'Detecting sensor…';
      gyroTimer = window.setTimeout(() => {
        if (detected) return;
        window.removeEventListener('deviceorientation', gyroHandler);
        gyroHandler = null;
        motionButton.textContent = 'Retry gyro';
        toast('No motion sensor data received. Check browser sensor permissions.');
      }, 1800);
    } catch (error) {
      motionButton.textContent = 'Retry gyro';
      toast(error.message || 'Gyroscope is unavailable. Touch tilt remains enabled.');
    }
  });
}
async function connectNearWalletFromGesture() {
  const button = $('walletBtn');
  if (!connectorReady || !connector) {
    toast('NEAR wallet options are still loading. Wait a moment, then tap Connect again.');
    return;
  }
  if (button) button.disabled = true;
  try {
    if (connectedAccount) {
      await connector.disconnect();
      syncWalletUI(null, null);
      toast('NEAR wallet disconnected.');
      return;
    }
    // Call connect() directly in the real click handler. Do not route through
    // element.click(), because mobile browsers can drop popup/user activation.
    await connector.connect();
    const current = await connector.getConnectedWallet();
    const account = current.accounts && current.accounts[0];
    if (!account?.accountId) {
      throw new Error('Wallet selection finished without an account. Choose Meteor or another compatible NEAR Testnet wallet and approve the connection.');
    }
    syncWalletUI(account.accountId, current.wallet?.manifest?.name || 'NEAR wallet');
    toast('NEAR wallet connected: ' + (current.wallet?.manifest?.name || 'NEAR wallet'));
    return account.accountId;
  } catch (error) {
    console.error('NEAR wallet connection error:', error);
    const message = error?.message || 'Wallet connection was cancelled or unavailable.';
    $('walletConnectionState').textContent = 'Connection not completed: ' + message;
    toast(message);
  } finally {
    if (button) button.disabled = false;
  }
}
async function initWallet() {
  const button = $('walletBtn');
  button.disabled = false;
  button.textContent = 'Connect NEAR Wallet';
  // Keep the action bound immediately, but execute the connector synchronously
  // from the user's click gesture once initialization has completed.
  button.addEventListener('click', connectNearWalletFromGesture);
  try {
    const module = await Promise.race([
      import('https://esm.sh/@hot-labs/near-connect@0.12.0'),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error('NEAR wallet module timed out. Check the connection and retry.')), 12000))
    ]);
    const { NearConnector } = module;
    connector = new NearConnector({
      network: 'testnet',
      features:{ testnet:true, signAndSendTransaction:true, signMessage:true },
      autoConnect: false
    });
    await connector.whenManifestLoaded;
    connector.on('wallet:signIn', event => {
      const account = event.accounts && event.accounts[0];
      syncWalletUI(account?.accountId, event.wallet?.manifest?.name || 'NEAR wallet');
    });
    connector.on('wallet:signOut', () => syncWalletUI(null, null));
    try {
      const current = await connector.getConnectedWallet();
      const account = current.accounts && current.accounts[0];
      syncWalletUI(account?.accountId, current.wallet?.manifest?.name || 'NEAR wallet');
    } catch {
      syncWalletUI(null, null);
    }
    connector.on('selector:walletsChanged', () => {
      const wallets = connector.availableWallets || [];
      const names = wallets.map(item => item.manifest?.name || item.name).filter(Boolean);
      if (!connectedAccount) {
        $('walletConnectionState').textContent = names.length
          ? 'Compatible Testnet wallets: ' + names.join(', ') + '. Tap Connect to choose one.'
          : 'No compatible Testnet wallet detected. Check the network and wallet compatibility.';
      }
    });
    connectorReady = true;
    button.disabled = false;
    button.textContent = connectedAccount ? 'Wallet connected' : 'Connect NEAR Wallet';
    const wallets = connector.availableWallets || [];
    const names = wallets.map(item => item.manifest?.name || item.name).filter(Boolean);
    $('walletConnectionState').textContent = connectedAccount
      ? 'Connected wallet: ' + connectedAccount
      : names.length
        ? 'Choose a wallet: ' + names.join(', ')
        : 'No compatible Testnet wallet detected. Meteor may be used through its web wallet or supported browser extension.';
    console.info('NEAR Connect ready. Network: testnet. Compatible wallets:', names);
  } catch (error) {
    console.error('NEAR Connect initialization failed:', error);
    connectorReady = false;
    button.disabled = false;
    button.textContent = 'Retry NEAR wallet';
    $('walletConnectionState').textContent = 'Wallet connector could not load: ' + (error?.message || 'unknown error') + ' Public address checks remain available.';
    toast('NEAR wallet connector failed to load. Tap Retry NEAR wallet after checking your connection.');
  }
}

function renderResult(data) {
  const el = $('result');
  el.classList.remove('hidden', 'result-enter');
  void el.offsetWidth;
  el.classList.add('result-enter');

  const sourceVerdict = ['ALLOW','WARN','BLOCK','INCOMPLETE'].includes(data.decision) ? data.decision : 'WARN';
  const isIncomplete = sourceVerdict === 'INCOMPLETE';
  const verdict = sourceVerdict;
  const riskLabel = verdict === 'ALLOW' ? 'LOW RISK' : verdict === 'INCOMPLETE' ? 'UNCONFIRMED' : verdict;
  const factors = Array.isArray(data.risk_factors) ? data.risk_factors : [];
  const codes = factors.map(item => String(item.code || ''));
  const hasThreatMatch = codes.some(code => ['VERIFIED_THREAT_MATCH','VERIFIED_THREAT_REPORT'].includes(code));
  const signalCodes = ['SPAM_ACTIVITY','EXTREME_TRANSACTION_FREQUENCY','HIGH_TRANSACTION_FREQUENCY','ELEVATED_TRANSACTION_FREQUENCY','PARTIAL_TRANSACTION_TIMESTAMP_DATA','TRANSACTION_TIMESTAMP_UNVERIFIABLE'];
  const hasSignals = codes.some(code => signalCodes.includes(code));

  const copy = {
    ALLOW: {
      title: 'No verified threat found',
      summary: 'The checks completed without finding a match in the verified threat list.',
      action: 'No known threat was found in this scan. Still verify the address before sending funds.',
      status: 'CHECKS COMPLETED'
    },
    WARN: {
      title: 'Check this wallet before using it',
      summary: isIncomplete ? 'The transaction history could not be fully verified. This wallet needs another check before use.' : 'The scan found activity that may need a closer look.',
      action: isIncomplete ? 'Do not treat this wallet as low risk. Retry the scan when complete transaction history is available.' : 'Review the findings below. Avoid sending funds until you understand the activity.',
      status: isIncomplete ? 'HISTORY CHECK INCOMPLETE · REVIEW REQUIRED' : 'REVIEW RECOMMENDED'
    },
    BLOCK: {
      title: 'This wallet matches a verified threat',
      summary: 'A verified threat record matches this account.',
      action: 'Do not send funds or connect to services associated with this wallet.',
      status: 'DO NOT PROCEED'
    },
    INCOMPLETE: {
      title: hasThreatMatch ? 'A verified threat match was found' : hasSignals ? 'Suspicious outgoing activity needs review' : 'No outgoing spam pattern detected',
      summary: 'No outgoing spam pattern was found in the verifiable records. Some history fields are still incomplete.',
      action: 'The recipient is not flagged for incoming spam. Retry the history check to verify the remaining records.',
      status: 'HISTORY PARTIALLY VERIFIED'
    }
  }[verdict];

  const activity = data.evidence?.wallet_activity;
  const activityMarkup = !data.simulation && activity ? (() => {
    const native = activity.native_transactions || {};
    const records = Array.isArray(native.records) ? native.records : [];
    const incoming = records.filter(row => row.direction === 'INCOMING').length;
    const outgoing = records.filter(row => row.direction === 'OUTGOING_SIGNED').length;
    const senders = Array.isArray(native.incoming_spam_sources) ? native.incoming_spam_sources : [];
    const sources = [
      ['NEAR transactions', native],
      ['Receipts', activity.receipts || {}],
      ['Token transfers', activity.fungible_token_transfers || {}]
    ];
    const senderSection = senders.length
      ? '<div class="incoming-spam-sources"><h4>SPAM SENDER CANDIDATES</h4><p>These accounts sent repeated transactions to the wallet being checked. The recipient is not flagged for receiving them.</p>' + senders.map(source => '<div class="plain-evidence-row"><span>' + escapeHtml(source.sender_account) + '</span><b>' + Number(source.successful_incoming_transactions_5m) + '</b><small>successful transactions sent in 5 minutes · sender review</small></div>').join('') + '</div>'
      : '<div class="incoming-spam-sources"><h4>INCOMING SENDER CHECK</h4><p>' + (native.complete
          ? 'No sender exceeded 10 successful incoming transactions within a five-minute window in the checked records.'
          : 'Sender attribution is not fully verified because some transaction records are incomplete. The receiving wallet is not marked as spam for receiving transactions.') + '</p></div>';
    return '<section class="plain-evidence"><h4>Wallet activity</h4><p>The account entered above is the wallet being checked. Incoming transactions are activity sent by other accounts; outgoing transactions are signed by this wallet.</p><div class="plain-evidence-rows">' +
      '<div class="plain-evidence-row"><span>Incoming · sent TO this wallet</span><b>' + incoming.toLocaleString() + '</b><small>Sender is the other account</small></div>' +
      '<div class="plain-evidence-row"><span>Outgoing · sent BY this wallet</span><b>' + outgoing.toLocaleString() + '</b><small>Checked for this wallet’s own spam activity</small></div>' +
      sources.map(([label, source]) => {
        const count = Number(source.count ?? 0).toLocaleString();
        const note = source.complete ? 'History checked' : 'Some records not verified';
        return '<div class="plain-evidence-row"><span>' + label + '</span><b>' + count + '</b><small>' + note + '</small></div>';
      }).join('') +
      '</div>' + senderSection +
      (activity.explorer_url ? '<a class="explorer-link" href="' + escapeHtml(activity.explorer_url) + '" target="_blank" rel="noopener noreferrer">Open wallet activity in NEAR Explorer ↗</a>' : '') +
      '</section>';
  })() : '';

  const firstSeen = data.evidence?.first_seen_activity;
  const codeHistory = data.evidence?.contract_code_history;
  const agentHistory = data.evidence?.agent_receiver_interaction;
  const nativeHistory = data.evidence?.wallet_activity?.native_transactions;
  const firstSeenDate = firstSeen?.available && firstSeen.earliest_observed_transaction_at
    ? new Date(firstSeen.earliest_observed_transaction_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : null;
  const signalCards = [
    {
      title: 'Earliest indexed activity',
      state: firstSeen?.available ? (firstSeen.complete ? 'VERIFIED TIMESTAMP COVERAGE' : 'PARTIAL TIMESTAMP COVERAGE') : Number(firstSeen?.transactions_checked || nativeHistory?.count || 0) > 0 ? 'TIMESTAMPS MISSING' : firstSeen?.history_complete ? 'NO INDEXED ACTIVITY' : 'NOT YET VERIFIABLE',
      stateClass: firstSeen?.available ? (firstSeen.complete ? 'ok' : 'review') : Number(firstSeen?.transactions_checked || nativeHistory?.count || 0) > 0 ? 'review' : 'muted',
      value: firstSeenDate
        ? firstSeenDate + ' · about ' + Number(firstSeen.estimated_days_since_first_observed_activity || 0).toLocaleString('en-US') + ' days since the earliest timestamped activity found'
        : Number(firstSeen?.transactions_checked || nativeHistory?.count || 0) > 0
          ? Number(firstSeen?.transactions_checked || nativeHistory?.count || 0).toLocaleString('en-US') + ' transactions were indexed, but none had a timestamp Sentinel could validate.'
          : firstSeen?.history_complete
            ? 'The Explorer query completed and returned zero indexed transactions in the checked history.'
            : 'The earliest activity time cannot be determined because the transaction history is unavailable or incomplete.',
      note: 'Source: NearBlocks Explorer. This is the oldest valid timestamp in indexed history, not the account creation date. ' + Number(firstSeen?.timestamped_transactions || 0).toLocaleString('en-US') + ' timestamped; ' + Number(firstSeen?.untimestamped_transactions || 0).toLocaleString('en-US') + ' without a valid timestamp.'
    },
    {
      title: 'Contract code history',
      state: !codeHistory?.available ? 'NO CONTRACT CODE' : codeHistory.history_error ? 'HISTORY READ FAILED' : codeHistory.changed_since_previous_scan ? 'HASH CHANGED' : codeHistory.explorer_deployments?.available && Number(codeHistory.explorer_deployments.count || 0) > 0 ? 'EXPLORER DEPLOYMENT HISTORY FOUND' : Number(codeHistory.prior_observations || 0) > 0 ? 'HASH MATCHES SENTINEL SNAPSHOT' : 'NO PRIOR HASH BASELINE',
      stateClass: !codeHistory?.available ? 'muted' : codeHistory.history_error || codeHistory.changed_since_previous_scan || !Number(codeHistory.prior_observations || 0) ? 'review' : 'ok',
      value: !codeHistory?.available
        ? 'No active contract code is deployed on this account. This is common for a standard wallet.'
        : codeHistory.history_error
          ? 'The current code hash is available, but the previous comparison snapshot could not be read.'
          : codeHistory.changed_since_previous_scan
            ? 'The current code hash differs from Sentinel’s previous snapshot.'
            : codeHistory.explorer_deployments?.available
              ? Number(codeHistory.explorer_deployments.count || 0).toLocaleString('en-US') + ' contract deployment record(s) were returned by NearBlocks. ' + (codeHistory.explorer_deployments.earliest_deployment_at ? 'Earliest indexed deployment: ' + new Date(codeHistory.explorer_deployments.earliest_deployment_at).toLocaleString('en-US') + '.' : 'No valid deployment timestamp was exposed.')
              : Number(codeHistory.prior_observations || 0) > 0
                ? 'The current hash matches ' + Number(codeHistory.prior_observations).toLocaleString('en-US') + ' previous Sentinel snapshot(s).'
                : 'No earlier code-hash baseline is available from Sentinel or a readable Explorer deployment record.',
      note: !codeHistory?.available
        ? 'The absence of contract code is not a threat indicator and does not incur a penalty.'
        : codeHistory.history_error
          ? 'A change cannot be confirmed. Sentinel does not treat unreadable history as evidence of safety.'
          : codeHistory.changed_since_previous_scan
            ? 'A hash change may result from a legitimate upgrade or another change. Review the code and upgrade transactions before interacting.'
            : Number(codeHistory.prior_observations || 0) > 0
              ? 'This comparison covers only Sentinel snapshots saved since monitoring began; changes before the oldest snapshot are unknown.'
              : 'This is only the monitoring starting point, not proof that the code never changed before.'
    },
    {
      title: 'Agent → recipient interactions',
      state: !agentHistory ? (data.evidence?.counterparty_candidates?.candidates?.length ? 'COUNTERPARTIES DISCOVERED' : 'AGENT NOT IDENTIFIED') : !agentHistory.available ? 'HISTORY UNAVAILABLE' : agentHistory.complete ? 'VERIFIED HISTORY' : 'INCOMPLETE HISTORY',
      stateClass: !agentHistory ? 'review' : !agentHistory.available || !agentHistory.complete ? 'review' : 'ok',
      value: !agentHistory
        ? (data.evidence?.counterparty_candidates?.candidates?.length
          ? data.evidence.counterparty_candidates.candidates.slice(0, 5).map(item => item.account_id + ' (' + Number(item.observed_transactions || 0) + ' tx)').join(' · ')
          : 'No attributable counterparty was identified in the indexed transaction rows.')
        : !agentHistory.available
          ? 'The supplied agent account transaction history could not be retrieved.'
          : agentHistory.complete
            ? Number(agentHistory.successful_outgoing_interactions || 0).toLocaleString('en-US') + ' successful outgoing transactions from the supplied agent to the recipient were verified in the checked data.'
            : Number(agentHistory.successful_outgoing_interactions || 0).toLocaleString('en-US') + ' matching transactions were found, but history coverage is incomplete; the final count cannot yet be confirmed.',
      note: !agentHistory
        ? 'Source: NearBlocks indexed transactions for this wallet. These are observed counterparties only, not verified agents. Supply an agent account to test a specific agent → recipient relationship.'
        : !agentHistory.available
          ? 'Failure to retrieve history is not proof that no interaction occurred.'
          : agentHistory.complete
            ? 'Source: NearBlocks transaction history for the supplied agent account. Zero means no interaction was found in the indexed history checked, not definitive proof that no interaction ever occurred.'
            : 'Preliminary result only. Missing data or Explorer pagination limits may hide additional transactions.'
    }
  ];
  const extraEvidenceMarkup = '<section class="plain-evidence signal-section">' +
    '<div class="signal-section-heading"><div><h4>Additional evidence</h4><p>Supporting signals based on retrieved data. Missing or incomplete evidence is never treated as safe.</p></div><span class="signal-section-tag">EVIDENCE</span></div>' +
    '<div class="signal-grid">' + signalCards.map(card =>
      '<article class="signal-card">' +
        '<div class="signal-card-top"><h5>' + escapeHtml(card.title) + '</h5><span class="signal-state signal-state-' + card.stateClass + '">' + escapeHtml(card.state) + '</span></div>' +
        '<p class="signal-value">' + escapeHtml(card.value) + '</p>' +
        '<p class="signal-note">' + escapeHtml(card.note) + '</p>' +
      '</article>'
    ).join('') + '</div></section>';

  const findings = {
    VERIFIED_THREAT_MATCH: ['Verified threat record', 'This account matches an entry that has been verified by Sentinel.'],
    VERIFIED_THREAT_REPORT: ['Verified threat record', 'This account matches an entry that has been verified by Sentinel.'],
    SPAM_ACTIVITY: ['Repeated activity', 'The wallet shows repeated activity that should be reviewed.'],
    EXTREME_TRANSACTION_FREQUENCY: ['Very frequent transactions', 'A large number of successful transactions occurred in a short period. This can indicate automation, but does not prove fraud.'],
    HIGH_TRANSACTION_FREQUENCY: ['Frequent transactions', 'Many successful transactions occurred in a short period. Check whether this activity is expected.'],
    ELEVATED_TRANSACTION_FREQUENCY: ['Above-normal activity', 'Transaction volume crossed Sentinel’s review threshold.'],
    PARTIAL_TRANSACTION_TIMESTAMP_DATA: ['Some transaction times are missing', 'Not every transaction could be placed reliably on the timeline.'],
    TRANSACTION_TIMESTAMP_UNVERIFIABLE: ['Transaction times could not be checked', 'The source returned transactions without timestamps Sentinel could validate.'],
    TRANSACTION_HISTORY_INCOMPLETE: ['Part of the history could not be checked', 'Some transaction records were missing details needed for verification.'],
    TRANSACTION_HISTORY_UNAVAILABLE: ['Transaction history unavailable', 'The history provider did not return enough information to assess activity.'],
    AGENT_RECEIVER_INTERACTION_HISTORY: ['Agent-to-recipient history', 'The supplied agent account has prior successful outgoing interactions with this receiver. This is context, not a trust guarantee.'],
    AGENT_RECEIVER_HISTORY_INCOMPLETE: ['Agent history incomplete', 'The supplied agent account history could not be fully verified. Do not infer that no prior interaction exists.'],
    CONTRACT_CODE_HASH_CHANGED: ['Contract code changed since prior scan', 'The current contract code hash differs from Sentinel’s previous observation. This may be a legitimate upgrade; review the change before interacting.'],
    ACCOUNT_NOT_FOUND: ['Account not found', 'The account could not be confirmed on NEAR Testnet.']
  };
  const visible = factors.filter(item => findings[String(item.code || '')]);
  const findingsMarkup = visible.length
    ? visible.map(item => {
        const [title, description] = findings[String(item.code)];
        return '<li><b>' + escapeHtml(title) + '</b><span>' + escapeHtml(description) + '</span></li>';
      }).join('')
    : '<li><b>No additional warning signs</b><span>The checks completed did not report other known warning signs.</span></li>';

  const score = Number.isFinite(Number(data.risk_score)) ? Number(data.risk_score) : 0;
  const scoreLabel = 'Risk score';
  const scoreValue = isIncomplete ? 'Not scored' : score + '/100';
  const simulation = data.simulation
    ? '<p class="plain-simulation">TEST RESULT — This uses local sample data, not a live wallet scan.</p>'
    : '';

  el.innerHTML =
    '<section class="plain-result-head result-' + verdict.toLowerCase() + '">' +
      '<div class="plain-status-row"><span class="plain-verdict plain-verdict-' + verdict.toLowerCase() + '">' + riskLabel + '</span><span class="plain-status">' + (verdict === 'ALLOW' ? 'ALLOW · ' : '') + escapeHtml(copy.status) + '</span></div>' +
      '<h3>' + escapeHtml(copy.title) + '</h3>' +
      '<p class="plain-summary">' + escapeHtml(copy.summary) + '</p>' +
      '<div class="plain-score"><span>' + scoreLabel + '</span><b>' + scoreValue + '</b></div>' +
      '<p class="plain-next-step"><strong>What to do:</strong> ' + escapeHtml(copy.action) + '</p>' +
      simulation +
    '</section>' +
    activityMarkup +
    extraEvidenceMarkup +
    '<section class="plain-findings"><h4>Why this result?</h4><ul>' + findingsMarkup + '</ul></section>' +
    '<details class="technical-details"><summary>Technical data</summary><pre class="ai-text technical-json">Open to load the evidence.</pre></details>';

  const technicalDetails = el.querySelector('.technical-details');
  const technicalJson = el.querySelector('.technical-json');
  let technicalDataLoaded = false;
  if (technicalDetails && technicalJson) {
    technicalDetails.addEventListener('toggle', () => {
      if (!technicalDetails.open || technicalDataLoaded) return;
      technicalDataLoaded = true;
      try {
        const serialized = JSON.stringify(data.evidence ?? {}, null, 2);
        const limit = 80000;
        technicalJson.textContent = serialized.length > limit
          ? serialized.slice(0, limit) + '\\n\\n[Display limited to 80,000 characters. The full evidence remains in the scan response.]'
          : serialized;
      } catch (error) {
        technicalJson.textContent = 'Technical data could not be displayed.';
      }
    });
  }
}

function setTrackWalletTurnstileStatus(message, state = 'loading') {
  const status = $('turnstileTrackWalletStatus');
  const retry = $('turnstileTrackWalletRetry');
  const scanButton = $('scanBtn');
  if (status) {
    status.textContent = message;
    status.dataset.state = state;
  }
  if (retry) retry.hidden = state !== 'error';
  if (scanButton) scanButton.disabled = state !== 'verified';
}
function waitForTurnstileApi(retry = false) {
  if (window.turnstile && typeof window.turnstile.render === 'function') return Promise.resolve();
  if (retry) {
    const previous = document.querySelector('script[src*="challenges.cloudflare.com/turnstile/v0/api.js"]');
    previous?.remove();
    window.__sentinelTurnstileApiPromise = null;
  }
  if (window.__sentinelTurnstileApiPromise) return window.__sentinelTurnstileApiPromise;
  const promise = new Promise((resolve, reject) => {
    let script = document.querySelector('script[src*="challenges.cloudflare.com/turnstile/v0/api.js"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      script.removeEventListener('load', check);
      script.removeEventListener('error', failed);
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      if (window.turnstile && typeof window.turnstile.render === 'function') finish();
    };
    const failed = () => finish(new Error('Cloudflare Turnstile script could not be downloaded. Retry or check network filtering.'));
    const poll = window.setInterval(check, 100);
    const timeout = window.setTimeout(
      () => finish(new Error('Cloudflare Turnstile did not load within 30 seconds. Check network filtering or browser content blockers.')),
      30000
    );
    script.addEventListener('load', check, { once: true });
    script.addEventListener('error', failed, { once: true });
    check();
  });
  window.__sentinelTurnstileApiPromise = promise.catch(error => {
    window.__sentinelTurnstileApiPromise = null;
    throw error;
  });
  return window.__sentinelTurnstileApiPromise;
}
function getTrackWalletTurnstileToken() {
  if (!window.turnstile || window.__sentinelTurnstileWidgetId === undefined || window.__sentinelTurnstileWidgetId === null) {
    throw new Error('Cloudflare verification is not ready. Reload the page or retry the verification.');
  }
  const token = window.__sentinelTurnstileToken || window.turnstile.getResponse(window.__sentinelTurnstileWidgetId);
  if (!token) throw new Error('Complete the Cloudflare verification before tracking this wallet.');
  return token;
}
function resetTrackWalletTurnstile() {
  window.__sentinelTurnstileToken = null;
  if (window.turnstile && window.__sentinelTurnstileWidgetId !== undefined && window.__sentinelTurnstileWidgetId !== null) {
    try { window.turnstile.reset(window.__sentinelTurnstileWidgetId); } catch (error) {
      console.warn('Could not reset Turnstile widget:', error);
    }
  }
  setTrackWalletTurnstileStatus('Complete Cloudflare verification before each wallet scan.', 'ready');
}
async function initTrackWalletTurnstile(retry = false) {
  const mount = $('turnstileTrackWallet');
  if (!mount) return;
  const sitekey = String(mount.dataset.sitekey || '').trim();
  if (!sitekey) {
    setTrackWalletTurnstileStatus('Cloudflare site key is missing from this page configuration.', 'error');
    return;
  }
  if (window.__sentinelTurnstileWidgetId !== undefined && window.__sentinelTurnstileWidgetId !== null) return;
  setTrackWalletTurnstileStatus('Loading Cloudflare verification…', 'loading');
  try {
    await waitForTurnstileApi(retry);
    if (window.__sentinelTurnstileWidgetId !== undefined && window.__sentinelTurnstileWidgetId !== null) return;
    const widgetId = window.turnstile.render(mount, {
      sitekey,
      action: 'track_wallet',
      theme: 'auto',
      size: 'normal',
      appearance: 'always',
      execution: 'render',
      'refresh-expired': 'auto',
      callback: token => {
        const validToken = typeof token === 'string' && token.trim().length >= 10 && token.length <= 2048;
        window.__sentinelTurnstileToken = validToken ? token : null;
        setTrackWalletTurnstileStatus(
          validToken ? 'Cloudflare verification complete. You can track this wallet.' : 'Cloudflare returned an invalid verification token. Retry verification.',
          validToken ? 'verified' : 'error'
        );
      },
      'error-callback': errorCode => {
        window.__sentinelTurnstileToken = null;
        setTrackWalletTurnstileStatus('Cloudflare verification failed (' + String(errorCode || 'unknown') + '). Check the site key, allowed hostname, and browser network access.', 'error');
        toast('Cloudflare verification failed. Please retry.');
      },
      'expired-callback': () => {
        setTrackWalletTurnstileStatus('Verification expired. Complete Cloudflare verification again.', 'ready');
        toast('Verification expired. Please verify again.');
      },
      'timeout-callback': () => setTrackWalletTurnstileStatus('Verification timed out. Please try again.', 'error')
    });
    if (widgetId === undefined || widgetId === null) throw new Error('Cloudflare did not return a widget ID.');
    window.__sentinelTurnstileWidgetId = widgetId;
    setTrackWalletTurnstileStatus('Complete Cloudflare verification before each wallet scan.', 'ready');
  } catch (error) {
    console.error('Turnstile initialization failed:', error);
    setTrackWalletTurnstileStatus(error?.message || 'Cloudflare verification could not be initialized.', 'error');
  }
}
$('turnstileTrackWalletRetry')?.addEventListener('click', async () => {
  const mount = $('turnstileTrackWallet');
  if (window.turnstile && window.__sentinelTurnstileWidgetId !== undefined && window.__sentinelTurnstileWidgetId !== null) {
    try { window.turnstile.remove(window.__sentinelTurnstileWidgetId); } catch {}
  }
  window.__sentinelTurnstileWidgetId = null;
  window.__sentinelTurnstileToken = null;
  if (mount) mount.replaceChildren();
  setTrackWalletTurnstileStatus('Reloading Cloudflare verification…', 'loading');
  await initTrackWalletTurnstile(true);
});

async function loadMetrics() {
  try {
    const data = await request('/metrics'), totals = data.totals || {}, threats = data.threats || {};
    const apiStatus = $('apiStatus'); if (apiStatus) apiStatus.textContent = 'ONLINE';
    $('mTotal').textContent = totals.total ?? 0; $('mAllowed').textContent = totals.allowed ?? 0;
    $('mWarned').textContent = totals.warned ?? 0; $('mBlocked').textContent = totals.blocked ?? 0;
    $('threatTotal').textContent = threats.total ?? 0; $('threatVerified').textContent = threats.verified ?? 0;
    const recent = Array.isArray(data.recent) ? data.recent : [];
    $('recentList').innerHTML = recent.length ? recent.map(x =>
      '<div class="recent-item"><div><div class="recent-address">'+escapeHtml(x.receiver_account)+'</div><div class="recent-meta">'+new Date(x.created_at).toLocaleString()+' · '+Number(x.amount_near||0).toLocaleString()+' NEAR</div></div><span class="pill '+escapeHtml(x.decision)+'">'+escapeHtml(x.decision)+'</span><span class="recent-score">'+(Number(x.risk_score)||0)+'/100</span></div>'
    ).join('') : '<div class="empty-state">Individual wallet scan activity is private. Aggregate security metrics are shown above.</div>';
  } catch (error) { const apiStatus = $('apiStatus'); if (apiStatus) apiStatus.textContent = 'OFFLINE'; $('recentList').innerHTML = '<div class="empty-state">Activity is temporarily unavailable.</div>'; }
}
async function loadThreats() {
  try {
    const data = await request('/threats'), reports = Array.isArray(data.reports) ? data.reports : [];
    $('threatList').innerHTML = reports.slice(0,5).map(x =>
      '<div class="threat-item"><div><b>'+escapeHtml(x.account_id)+'</b><small>'+escapeHtml(x.category)+'</small></div><span class="threat-status">'+escapeHtml(String(x.status||'pending').toUpperCase())+'</span></div>'
    ).join('') || '<div class="empty-state">No community reports yet.</div>';
  } catch (error) { $('threatList').innerHTML = '<div class="empty-state">Reports are temporarily unavailable.</div>'; }
}

$('investigateForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('scanBtn');
  if ($('turnstileTrackWalletStatus')?.dataset.state !== 'verified') {
    toast('Complete Cloudflare verification before tracking this wallet.');
    return;
  }
  button.disabled = true; button.textContent = 'Tracking wallet activity…';
  $('result').classList.add('hidden');
  try {
    const investigationPath = GUEST_MODE ? '/guest/investigate' : '/investigate';
    const turnstileToken = getTrackWalletTurnstileToken();
    const data = await request(investigationPath,{method:'POST',body:JSON.stringify({
      receiver_account:$('receiver').value.trim(),
      sender_account:$('sender').value.trim() || null,
      amount_near:0,
      turnstile_token: turnstileToken
    })});
    renderResult(data); await loadMetrics(); toast('Wallet tracking complete: '+data.decision);
  } catch (error) { toast(error.message); }
  finally { resetTrackWalletTurnstile(); button.innerHTML = 'Track wallet <b>↗</b>'; }
});
$('receiver').addEventListener('input', event => queueWalletFacts(event.target.value));
$('pasteReceiver').addEventListener('click', async () => {
  try { $('receiver').value = await navigator.clipboard.readText(); queueWalletFacts($('receiver').value); }
  catch { toast('Clipboard unavailable. Paste the account ID manually.'); }
});
$('refreshBtn').addEventListener('click',() => {loadMetrics();loadThreats();toast('Activity refreshed.');});
$('reportBtn').addEventListener('click',() => $('reportForm').classList.toggle('hidden'));
$('sendReport').addEventListener('click',async () => {
  const button = $('sendReport'); button.disabled = true;
  try {
    await request('/threats',{method:'POST',body:JSON.stringify({
      account_id:$('reportAccount').value.trim(),category:$('reportCategory').value.trim(),
      evidence:$('reportEvidence').value.trim(),reporter:connectedAccount||'anonymous'
    })});
    toast('Report submitted for review. It is not automatically trusted.');
    $('reportForm').classList.add('hidden'); $('reportAccount').value='';
    $('reportCategory').value=''; $('reportEvidence').value='';
    await loadMetrics(); await loadThreats();
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
});

const agentForm = $('agentForm');
const developerModeToggle = $('developerModeToggle');
const developerModeBanner = $('developerModeBanner');
let developerModeEnabled = false;
developerModeToggle?.addEventListener('change', () => {
  developerModeEnabled = developerModeToggle.checked;
  document.body.classList.toggle('sentinel-developer-mode', developerModeEnabled);
  if (developerModeBanner) developerModeBanner.classList.toggle('hidden', !developerModeEnabled);
  const status = document.querySelector('.developer-mode-status');
  if (status) status.textContent = developerModeEnabled ? 'ON · SKILL DRAFTING' : 'OFF · SAFE CHAT';
  toast(developerModeEnabled ? 'Developer Mode enabled. Trading requests create drafts only.' : 'Developer Mode disabled.');
});
async function renderTradeSkillDraft(prompt) {
  const result = $('agentResult');
  const draft = buildTradeSkillDraft(prompt);
  const complete = Boolean(draft.action && draft.amount && draft.amount_unit && (draft.action === 'SWAP' ? draft.from_asset && draft.to_asset : draft.asset));
  const canonical = JSON.stringify(draft);
  let fingerprint = 'unavailable';
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    fingerprint = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  } catch {}
  const card = document.createElement('section');
  card.className = 'developer-trade-draft';
  const heading = document.createElement('div');
  heading.className = 'developer-trade-draft-heading';
  const title = document.createElement('strong');
  title.textContent = complete ? 'Trading skill draft generated' : 'Trading request needs clarification';
  const status = document.createElement('span');
  status.textContent = 'DRAFT ONLY';
  heading.append(title, status);
  const summary = document.createElement('p');
  summary.textContent = complete
    ? draft.action + ' ' + draft.amount + ' ' + draft.amount_unit + ' · ' + (draft.action === 'SWAP' ? draft.from_asset + ' → ' + draft.to_asset : draft.asset) + ' · ' + draft.schedule
    : 'Sentinel could not safely determine the asset pair and amount. Refine the prompt before creating a reviewable skill.';
  const details = document.createElement('pre');
  details.textContent = JSON.stringify(draft, null, 2);
  const note = document.createElement('p');
  note.className = 'developer-trade-draft-note';
  note.textContent = draft.action === 'SWAP'
    ? 'No wallet signature, deposit, or swap is created. The quote preview below is read-only and cannot execute a trade.'
    : 'Not approved. No wallet signature, trade, or scheduled job was created. BUY / SELL execution is not connected yet.';
  const hash = document.createElement('small');
  hash.textContent = 'DRAFT SHA-256 · ' + fingerprint;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'secondary-btn';
  copy.textContent = 'Copy skill JSON';
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(draft, null, 2)); toast('Skill draft copied.'); }
    catch { toast('Clipboard unavailable.'); }
  });
  let quotePanel = null;
  if (draft.action === 'SWAP' && complete) {
    quotePanel = document.createElement('section');
    quotePanel.className = 'developer-trade-quote';
    const quoteTitle = document.createElement('strong');
    quoteTitle.textContent = 'NEAR TESTNET · LIVE DRY QUOTE';
    const quoteHelp = document.createElement('p');
    quoteHelp.textContent = 'Sentinel requests a real provider quote in dry mode. No deposit address is created and no funds move.';
    const faucetLink = document.createElement('a');
    faucetLink.href = 'https://app.usetidepool.tech/faucet';
    faucetLink.target = '_blank';
    faucetLink.rel = 'noopener noreferrer';
    faucetLink.textContent = 'Get Testnet tokens · choose NEAR Intents balance';
    const recipientLabel = document.createElement('label');
    recipientLabel.textContent = 'NEAR TESTNET RECIPIENT / REFUND ACCOUNT';
    const recipientInput = document.createElement('input');
    recipientInput.type = 'text';
    recipientInput.maxLength = 64;
    recipientInput.autocomplete = 'off';
    recipientInput.placeholder = 'your-account.testnet';
    recipientInput.value = typeof connectedAccount === 'string' && connectedAccount.endsWith('.testnet') ? connectedAccount : '';
    recipientInput.required = true;
    const quoteButton = document.createElement('button');
    quoteButton.type = 'button';
    quoteButton.className = 'secondary-btn';
    quoteButton.textContent = 'Get Testnet dry quote';
    const liveButton = document.createElement('button');
    liveButton.type = 'button';
    liveButton.className = 'secondary-btn';
    liveButton.textContent = 'Review & sign Testnet swap';
    liveButton.hidden = true;
    liveButton.disabled = true;
    const liveStatus = document.createElement('p');
    liveStatus.className = 'developer-trade-draft-note';
    liveStatus.setAttribute('aria-live', 'polite');
    let lastSwapRequest = null;
    let lastSwapPrompt = null;
    const quoteStatus = document.createElement('p');
    quoteStatus.className = 'developer-trade-draft-note';
    quoteStatus.setAttribute('aria-live', 'polite');
    const quoteDetails = document.createElement('pre');
    quoteDetails.hidden = true;
    const quoteForm = document.createElement('div');
    quoteButton.type = 'button';
    quoteButton.addEventListener('click', async () => {
      quoteButton.disabled = true;
      quoteStatus.textContent = 'Loading the live Testnet asset list and requesting a dry quote…';
      quoteDetails.hidden = true;
      try {
        if (draft.amount_unit !== draft.from_asset || !draft.amount_text) {
          throw new Error('The amount unit must exactly match the input asset. Example: swap 0.1 USDC to wNEAR.');
        }
        const tokenData = await request('/trading/tokens');
        const origin = tokenData.tokens?.find(token => token.symbol.toUpperCase() === draft.from_asset.toUpperCase());
        const destination = tokenData.tokens?.find(token => token.symbol.toUpperCase() === draft.to_asset.toUpperCase());
        if (!origin || !destination) throw new Error('One of the requested assets is not available on the NEAR Testnet sandbox.');
        const decimals = Number(origin.decimals);
        const rawAmount = draft.amount_text;
        if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30 || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(rawAmount)) {
          throw new Error('Invalid decimal amount for the selected asset.');
        }
        const [whole, fraction = ''] = rawAmount.split('.');
        if (fraction.length > decimals) throw new Error('Amount has more decimal places than the input token supports.');
        const baseAmount = (BigInt(whole) * (10n ** BigInt(decimals)) +
          BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0')).toString();
        if (baseAmount === '0') throw new Error('Amount must be greater than zero.');
        lastSwapPrompt = 'swap ' + rawAmount + ' ' + draft.from_asset + ' to ' + draft.to_asset;
        lastSwapRequest = {
          originAsset: origin.asset_id,
          destinationAsset: destination.asset_id,
          amount: baseAmount,
          recipient: recipientInput.value.trim(),
          slippageTolerance: 100
        };
        const quote = await request('/trading/quote', {
          method: 'POST',
          body: JSON.stringify(lastSwapRequest)
        });
        if (quote.mode !== 'QUOTE_ONLY' || quote.execution_enabled !== false) {
          throw new Error('Sentinel rejected a response that was not explicitly quote-only.');
        }
        quoteStatus.textContent = (quote.quote.amount_in_formatted || quote.quote.amount_in) + ' ' + origin.symbol +
          ' → ' + (quote.quote.amount_out_formatted || quote.quote.amount_out) + ' ' + destination.symbol +
          ' · minimum received ' + quote.quote.minimum_amount_out +
          ' · estimated ' + (quote.quote.estimated_seconds ?? '—') + ' sec';
        quoteDetails.textContent = JSON.stringify(quote, null, 2);
        quoteDetails.hidden = false;
        liveButton.hidden = false;
        liveButton.disabled = false;
        liveStatus.textContent = 'Dry quote verified. No funds moved. Connect the same Testnet wallet to continue.';
      } catch (error) {
        quoteStatus.textContent = error.message || 'Quote request failed.';
      } finally {
        quoteButton.disabled = false;
      }
    });
    liveButton.addEventListener('click', async () => {
      liveButton.disabled = true;
      liveStatus.textContent = 'Creating a short-lived live quote. No transfer happens until your wallet signs the exact intent.';
      let intentSubmitted = false;
      let terminalSettlement = false;
      try {
        if (!lastSwapRequest) throw new Error('Request a fresh dry quote first.');
        if (!connectorReady || !connector || !connectedAccount || !connectedAccount.endsWith('.testnet')) {
          throw new Error('Connect a NEAR Testnet wallet first.');
        }
        if (connectedAccount.toLowerCase() !== recipientInput.value.trim().toLowerCase() ||
            connectedAccount.toLowerCase() !== lastSwapRequest.recipient.toLowerCase()) {
          throw new Error('Recipient/refund account must match the connected signing wallet. Refresh the quote after connecting.');
        }
        const liveQuote = await request('/trading/live-quote', {
          method: 'POST',
          body: JSON.stringify({ ...lastSwapRequest, userPrompt: lastSwapPrompt })
        });
        if (liveQuote.mode !== 'LIVE_QUOTE_AWAITING_USER_SIGNATURE' ||
            liveQuote.execution_enabled !== false ||
            liveQuote.provider_signature_verified !== true ||
            liveQuote.risk_evaluation?.decision !== 'ALLOW' ||
            !String(liveQuote.risk_evaluation?.policy_hash || '').startsWith('sha256:') ||
            !liveQuote.signed_quote || typeof liveQuote.signed_quote !== 'object' ||
            !/^[a-f0-9]{64}$/i.test(liveQuote.deposit_address || '')) {
          throw new Error('Sentinel rejected an invalid or unexpected live quote.');
        }
        const summary = 'NEAR TESTNET SWAP REVIEW\n\n' +
          'Input: ' + (liveQuote.quote.amount_in_formatted || liveQuote.quote.amount_in) + ' ' + draft.from_asset + '\n' +
          'Expected output: ' + (liveQuote.quote.amount_out_formatted || liveQuote.quote.amount_out) + ' ' + draft.to_asset + '\n' +
          'Minimum output: ' + liveQuote.quote.minimum_amount_out + '\n' +
          'Wallet: ' + connectedAccount + '\n' +
          'Provider: Tidepool community Testnet\n' +
          'Sentinel risk: ' + liveQuote.risk_evaluation.decision + '\n' +
          'Policy proof: ' + liveQuote.risk_evaluation.policy_hash + '\n\n' +
          'Continue to request the exact NEP-413 transfer intent? Your wallet will show the signing request next.';
        if (!window.confirm(summary)) {
          liveStatus.textContent = 'Cancelled before wallet signing. No transfer was submitted.';
          return;
        }
        const wallet = await connector.wallet();
        if (!wallet || typeof wallet.signMessage !== 'function' ||
            typeof wallet.signAndSendTransaction !== 'function') {
          throw new Error('This wallet must support both NEP-413 message signing and Testnet transactions. No fallback signing is available.');
        }
        const walletSnapshot = await connector.getConnectedWallet();
        let walletAccount = walletSnapshot?.accounts?.find(account => account.accountId?.toLowerCase() === connectedAccount.toLowerCase());
        if (!walletAccount && typeof wallet.getAccounts === 'function') {
          const walletAccounts = await wallet.getAccounts();
          walletAccount = walletAccounts?.find(account => account.accountId?.toLowerCase() === connectedAccount.toLowerCase());
        }
        const walletPublicKey = walletAccount?.publicKey?.toString?.() || walletAccount?.publicKey || '';
        if (!walletPublicKey.startsWith('ed25519:')) {
          throw new Error('Could not read the connected wallet public key. Reconnect the Testnet wallet and try again.');
        }
        let keyStatus = await request('/trading/key-status', {
          method: 'POST',
          body: JSON.stringify({ accountId: connectedAccount, publicKey: walletPublicKey })
        });
        if (!keyStatus.registered) {
          const register = window.confirm(
            'ONE-TIME VERIFIER KEY REGISTRATION\n\n' +
            'This NEAR Testnet account key is not registered on the Tidepool verifier. ' +
            'Sentinel must register the public key before NEP-413 signing. ' +
            'Your wallet will ask you to approve add_public_key on verifier.tidepool-sandbox.testnet. ' +
            'This requires a small amount of NEAR Testnet gas and 1 yoctoNEAR. Continue?'
          );
          if (!register) {
            liveStatus.textContent = 'Cancelled before key registration. No swap was submitted.';
            return;
          }
          liveStatus.textContent = 'Requesting one-time verifier public-key registration in your wallet…';
          await wallet.signAndSendTransaction({
            receiverId: 'verifier.tidepool-sandbox.testnet',
            actions: [{
              type: 'FunctionCall',
              params: {
                methodName: 'add_public_key',
                args: { public_key: walletPublicKey },
                gas: '30000000000000',
                deposit: '1'
              }
            }]
          });
          let registered = false;
          for (let attempt = 0; attempt < 10; attempt++) {
            keyStatus = await request('/trading/key-status', {
              method: 'POST',
              body: JSON.stringify({ accountId: connectedAccount, publicKey: walletPublicKey })
            });
            if (keyStatus.registered === true) { registered = true; break; }
            await new Promise(resolve => window.setTimeout(resolve, 1500));
          }
          if (!registered) throw new Error('Verifier key registration was not confirmed. No NEP-413 swap intent was signed or submitted.');
        }
        const intent = await request('/trading/generate-intent', {
          method: 'POST',
          body: JSON.stringify({
            providerQuote: liveQuote.signed_quote,
            signerId: connectedAccount,
            originAsset: lastSwapRequest.originAsset,
            destinationAsset: lastSwapRequest.destinationAsset,
            amount: lastSwapRequest.amount,
            slippageTolerance: lastSwapRequest.slippageTolerance
          })
        });
        if (intent.standard !== 'nep413' || intent.signer_id !== connectedAccount ||
            intent.deposit_address !== liveQuote.deposit_address ||
            intent.asset_id !== lastSwapRequest.originAsset ||
            intent.amount !== lastSwapRequest.amount ||
            !intent.payload?.message || !intent.payload?.nonce || !intent.payload?.recipient) {
          throw new Error('Generated intent does not match the reviewed quote. Signing stopped.');
        }
        const nonce = Uint8Array.from(atob(intent.payload.nonce), char => char.charCodeAt(0));
        if (nonce.length !== 32) throw new Error('The provider returned an invalid NEP-413 nonce.');
        liveStatus.textContent = 'Review the NEP-413 signing request in your wallet…';
        const signed = await wallet.signMessage({
          message: intent.payload.message,
          recipient: intent.payload.recipient,
          nonce
        });
        const publicKey = signed?.publicKey?.toString?.() || signed?.public_key || '';
        const signatureBytes = signed?.signature;
        const signature = typeof signatureBytes === 'string'
          ? (signatureBytes.startsWith('ed25519:') ? signatureBytes : 'ed25519:' + signatureBytes)
          : signatureBytes instanceof Uint8Array
            ? 'ed25519:' + encodeBase58(signatureBytes)
            : '';
        if (signed?.accountId && signed.accountId.toLowerCase() !== connectedAccount.toLowerCase()) {
          throw new Error('Wallet returned a signature for a different account. Submission stopped.');
        }
        if (!publicKey.startsWith('ed25519:') || !signature.startsWith('ed25519:')) {
          throw new Error('Wallet did not return a complete NEP-413 public key and signature. No submission was made.');
        }
        liveStatus.textContent = 'Submitting the wallet-signed intent to the NEAR Testnet verifier…';
        const submitted = await request('/trading/submit-intent', {
          method: 'POST',
          body: JSON.stringify({
            signedData: {
              standard: 'nep413',
              payload: intent.payload,
              public_key: publicKey,
              signature
            },
            providerQuote: liveQuote.signed_quote,
            expectedSignerId: connectedAccount,
            expectedDepositAddress: liveQuote.deposit_address,
            expectedAsset: lastSwapRequest.originAsset,
            expectedDestinationAsset: lastSwapRequest.destinationAsset,
            expectedAmount: lastSwapRequest.amount,
            expectedSlippageTolerance: lastSwapRequest.slippageTolerance
          })
        });
        intentSubmitted = true;
        liveStatus.textContent = 'Intent submitted. Checking Tidepool settlement status…';
        let latest = null;
        for (let attempt = 0; attempt < 15; attempt++) {
          latest = await request('/trading/status?depositAddress=' + encodeURIComponent(liveQuote.deposit_address), { method: 'GET' });
          if (['SUCCESS', 'REFUNDED', 'FAILED', 'NOT_FOUND'].includes(String(latest.status).toUpperCase())) break;
          await new Promise(resolve => window.setTimeout(resolve, 2000));
        }
        const finalStatus = String(latest?.status || submitted.status || 'SUBMITTED').toUpperCase();
        terminalSettlement = ['SUCCESS', 'REFUNDED', 'FAILED'].includes(finalStatus);
        liveStatus.textContent = 'Testnet swap status: ' + finalStatus +
          (submitted.transaction_hash ? ' · verifier tx ' + submitted.transaction_hash : '') +
          (latest?.explorer_url ? ' · ' + latest.explorer_url : '') +
          (finalStatus === 'SUCCESS' ? ' · settlement confirmed by Tidepool status' :
            ' · not marked successful yet; do not retry blindly');
        quoteDetails.textContent = JSON.stringify({ live_quote: liveQuote, signed_intent: submitted, settlement: latest }, null, 2);
        quoteDetails.hidden = false;
      } catch (error) {
        liveStatus.textContent = error.message || 'Swap flow stopped. Check wallet activity and provider status before retrying.';
      } finally {
        // Once a signed intent has been submitted, never let a second click
        // create another deposit while the first provider settlement is pending.
        liveButton.disabled = intentSubmitted && !terminalSettlement;
        liveButton.textContent = intentSubmitted && !terminalSettlement
          ? 'Swap submitted · status pending'
          : 'Review & sign Testnet swap';
      }
    });
    quoteForm.append(recipientLabel, recipientInput, quoteButton, quoteStatus, liveButton, liveStatus, quoteDetails);
    quotePanel.append(quoteTitle, quoteHelp, faucetLink, quoteForm);
  }
  card.append(heading, summary, details, note, hash, copy);
  if (quotePanel) card.append(quotePanel);
  result.replaceChildren(card);
  result.classList.remove('hidden');
  result.scrollTop = result.scrollHeight;
}
const GUEST_CHAT_KEY = 'sentinel.guestAgent.messages.v1';
let guestConversation = [];
let authenticatedPrompt = '';
if (GUEST_MODE) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(GUEST_CHAT_KEY) || '[]');
    if (Array.isArray(saved)) guestConversation = saved
      .filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string' && !(item.role === 'assistant' && /^Alo!\\s*👋[\\s\\S]*(?:Here's what I can help with:|What would you like to do\\?)/i.test(item.content.trim())))
      .slice(-14);
  } catch { guestConversation = []; }
}
function renderGuestConversation(pending = false) {
  const result = $('agentResult');
  if (!result) return;
  const transcript = document.createElement('div');
  transcript.className = 'guest-chat-transcript telegram-chat-transcript';
  transcript.setAttribute('aria-label', 'Sentinel AI conversation');

  for (const item of guestConversation) {
    const article = document.createElement('article');
    article.className = 'guest-chat-message guest-chat-' + (item.role === 'user' ? 'user' : 'assistant');
    const label = document.createElement('span');
    label.textContent = item.role === 'user' ? 'YOU' : 'SENTINEL AI';
    const message = document.createElement('p');
    message.textContent = item.content;
    article.append(label, message);
    transcript.append(article);
  }

  if (pending) {
    const article = document.createElement('article');
    article.className = 'guest-chat-message guest-chat-assistant guest-chat-pending';
    const label = document.createElement('span');
    label.textContent = 'SENTINEL AI';
    const message = document.createElement('p');
    message.textContent = 'Thinking through your request…';
    article.append(label, message);
    transcript.append(article);
  }

  const meta = document.createElement('div');
  meta.className = 'guest-chat-meta';
  meta.textContent = 'GUEST READ-ONLY · ' + guestConversation.length + ' MESSAGES IN CONTEXT';
  result.replaceChildren(transcript, meta);
  result.classList.remove('hidden');
  result.scrollTop = result.scrollHeight;
}
function saveGuestConversation() {
  try { sessionStorage.setItem(GUEST_CHAT_KEY, JSON.stringify(guestConversation.slice(-14))); } catch {}
}
function renderAuthenticatedPending(prompt) {
 const result = $('agentResult');
 if (!result) return;
 result.innerHTML = '<div class="guest-chat-transcript telegram-chat-transcript"><article class="guest-chat-message guest-chat-user"><span>YOU</span><p>' + escapeHtml(prompt) + '</p></article><article class="guest-chat-message guest-chat-assistant guest-chat-pending telegram-agent-bubble"><span>SENTINEL AI</span><p>Thinking through your request…</p><div class="telegram-typing" aria-label="Sentinel is typing"><i></i><i></i><i></i></div></article></div>';
 result.classList.remove('hidden');
 result.scrollTop = result.scrollHeight;
}
function renderAgentResult(data) {
  const result = $('agentResult');
  const status = String(data.status || 'UNKNOWN');
  const verdict = data.sentinel?.decision || 'NOT_AVAILABLE';
  const risk = Number.isFinite(Number(data.sentinel?.risk_score)) ? Number(data.sentinel.risk_score) + '/100' : 'Not scored';
  const proposal = data.proposal || {};
  const txHash = typeof data.transaction_hash === 'string' ? data.transaction_hash : '';
  const explorerUrl = typeof data.explorer_url === 'string' &&
    /^https:\/\/testnet\.nearblocks\.io\/txns\/[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(data.explorer_url)
    ? data.explorer_url : (txHash
      ? 'https://testnet.nearblocks.io/txns/' + encodeURIComponent(txHash) : '');
  const txLink = txHash && explorerUrl
    ? '<a class="agent-tx-link" href="' + escapeHtml(explorerUrl) + '" target="_blank" rel="noopener noreferrer">' +
      (data.execution_enabled === true ? 'View RPC-verified Testnet transaction ↗' : 'Check submitted transaction in Testnet Explorer ↗') + '</a>'
    : '';
  const approvalId = status === 'AWAITING_HUMAN_APPROVAL' ? String(data.approval_id || '') : '';
  const policyReason = String(data.reason || '');
  const policyReasonText = ({
    TESTNET_ONLY: 'Network policy: payments are restricted to NEAR Testnet. Check the Worker network configuration.',
    KILL_SWITCH_ACTIVE: 'The signer is locked. Your approval was received, but no transfer was sent.',
    AMOUNT_LIMIT_OR_POLICY_UNCONFIGURED: 'The amount exceeds the configured limit, or the payment limit is not configured.',
    RECEIVER_NOT_ALLOWLISTED: 'This recipient is not on the configured receiver allowlist.',
    TESTNET_RECEIVER_REQUIRED: 'The recipient must be a NEAR Testnet account ending in .testnet.',
    INVALID_RECEIVER: 'The recipient account ID is invalid.',
    INVALID_AMOUNT: 'The payment amount is invalid.',
    ASSESSMENT_INCOMPLETE: 'Sentinel could not complete the required security assessment.',
    ASSESSMENT_INTENT_MISMATCH: 'The security assessment does not match this exact recipient and amount.',
    SENTINEL_BLOCK: 'Sentinel security checks blocked this payment.',
    HUMAN_REVIEW_REQUIRED: 'Sentinel requires additional human review before this payment can proceed.',
    INVALID_OR_NON_ALLOW_ASSESSMENT: 'Sentinel did not return a valid ALLOW assessment.',
    PREFLIGHT_UNAVAILABLE: 'The required security preflight could not be completed.',
    APPROVAL_CLOSED_NO_TRANSFER: 'This approval is closed. No verified transfer was found.',
    EXECUTION_OUTCOME_UNKNOWN: 'The transaction outcome is not verified. Do not sign or retry again yet.',
    APPROVAL_NOT_PENDING: 'This approval has already been used or closed. Check its status before creating another proposal.',
    ISOLATED_SIGNER_NOT_CONFIGURED: 'The isolated payment signer is not configured. No transfer was sent.',
    ISOLATED_SIGNER_BINDING_MISSING: 'The main Worker is missing its connection to the isolated signer. Configure the SIGNER_SERVICE service binding and redeploy.',
    AGENT_SIGNER_HMAC_SECRET_MISSING: 'The shared signer authentication secret is missing or shorter than 32 bytes. Set AGENT_SIGNER_HMAC_SECRET on both Sentinel and Sentinel Signer Workers using the same random value (32+ bytes), then redeploy.',
    SIGNER_ACCOUNT_MUST_BE_TESTNET: 'The configured signer account is not a NEAR Testnet account.',
    PREFLIGHT_ATTESTATION_NOT_CONFIGURED: 'The signer is missing its security preflight URL, shared HMAC secret, verdict public key, or Testnet signer account configuration.',
    PAYMENT_CONTRACT_NOT_CONFIGURED: 'The Testnet payment contract is not configured on the isolated signer.',
    SIGNER_REQUIRES_CONTRACT_SCOPED_FUNCTION_CALL_KEY: 'The signer account key is not restricted to the approved payment contract and pay method.',
    ISOLATED_SIGNER_REQUEST_FAILED: 'Your wallet returned a transaction hash, but Sentinel could not read the signer verification result. Check the transaction in NEAR Explorer. Do not submit or approve it again until its status is clear.',
    ISOLATED_SIGNER_UNAVAILABLE: 'Your wallet returned a transaction hash, but the isolated signer could not be reached to verify it. Check the transaction in NEAR Explorer. Do not submit or approve it again until its status is clear.',
    SIGNER_NOT_CONFIGURED: 'The Testnet signer account or signing key is not configured.',
    SIGNER_RESTRICTED_KEY_OR_CONTRACT_INVALID: 'The signer key or payment contract configuration failed its security check.',
    SIGNER_PRIVATE_KEY_INVALID: 'The configured signer private key is malformed or cannot be decoded. No transfer was sent.',
    SIGNER_KEY_NOT_FOUND_ON_ACCOUNT: 'The signer public key is not registered on the configured NEAR Testnet account. No transfer was sent.',
    NEAR_RPC_UNAVAILABLE: 'NEAR Testnet RPC could not verify the signer access key. No transfer was sent; check RPC availability before proceeding.',
    HARD_PAYMENT_LIMIT_EXCEEDED: 'The payment exceeds Sentinel’s hard per-transaction limit of 0.1 NEAR.',
    DAILY_CAP_UNCONFIGURED_OR_TOO_HIGH: 'The daily Testnet spending cap is missing or exceeds the hard safety limit.',
    DAILY_SPEND_LIMIT_REACHED: 'The signer has reached its configured daily Testnet spending limit.',
    SIGNER_PREFLIGHT_UNAVAILABLE: 'The signer could not complete its independent security preflight.',
    SIGNER_PREFLIGHT_FAILED: 'The signer’s independent security preflight failed.',
    SIGNED_VERDICT_INVALID_OR_EXPIRED: 'The signed security verdict was invalid or expired.',
    WALLET_SIGNATURE_INVALID: 'The NEAR wallet signature could not be verified.',
    WALLET_SIGNATURE_REPLAYED: 'This wallet signature was already used and cannot be reused.',
    HUMAN_APPROVAL_NOT_VERIFIED: 'The wallet approval did not match this exact payment proposal.',
    APPROVAL_ALREADY_CLAIMED: 'This approval has already been claimed. Do not sign it again.'
  })[policyReason] || (policyReason
    ? 'The signer stopped this payment before broadcast (' + policyReason.replaceAll('_', ' ').toLowerCase() + ').'
    : '');
  const signerSetupIssue = [
    'ISOLATED_SIGNER_NOT_CONFIGURED', 'ISOLATED_SIGNER_BINDING_MISSING',
    'AGENT_SIGNER_HMAC_SECRET_MISSING', 'SIGNER_NOT_CONFIGURED',
    'SIGNER_ACCOUNT_MUST_BE_TESTNET', 'PREFLIGHT_ATTESTATION_NOT_CONFIGURED',
    'PAYMENT_CONTRACT_NOT_CONFIGURED', 'SIGNER_REQUIRES_CONTRACT_SCOPED_FUNCTION_CALL_KEY',
    'SIGNER_RESTRICTED_KEY_OR_CONTRACT_INVALID'
  ].includes(policyReason);
  const rawResponseText = String(data.agent_message || data.message || '').trim();
  const isInternalResponse = /^[A-Z][A-Z0-9_]{8,}$/.test(rawResponseText);
  const responseText = rawResponseText && !isInternalResponse
    ? rawResponseText
    : status === 'AWAITING_HUMAN_APPROVAL'
      ? 'Review the amount and recipient before approving.'
      : status === 'DENIED'
        ? 'I could not send this payment. The reason and next step are shown in the payment card below.'
        : status === 'EXECUTED'
          ? 'Payment sent and verified on NEAR Testnet.'
          : status === 'UNKNOWN'
            ? 'The transaction outcome is not yet verified. Do not retry this payment.'
            : 'Sentinel completed the request.';
  const hasPaymentContext = Boolean(proposal.receiver_account || proposal.amount_near != null || approvalId || txHash);
  const showStatusCard = status !== 'NO_PAYMENT_PROPOSED' && (hasPaymentContext || data.sentinel || data.investigation || status === 'DENIED');
  const walletCanApprove = Boolean(connectedAccount && connectedAccount.endsWith('.testnet'));
  const recipientCard = proposal.receiver_account
    ? '<section class="agent-recipient-track-card compact" id="agentRecipientTrackCard" data-account="' + escapeHtml(proposal.receiver_account) + '">' +
      '<div class="agent-recipient-track-head"><b>RECIPIENT</b><span class="agent-recipient-live-state" id="agentRecipientTrackState">Checking…</span></div>' +
      '<div class="agent-recipient-account" id="agentRecipientTrackAccount">' + escapeHtml(proposal.receiver_account) + '</div>' +
      '<div class="agent-recipient-compact-balance"><span>TESTNET BALANCE</span><b id="agentRecipientTrackBalance">Loading…</b></div></section>'
    : '';
  const agentCard = showStatusCard
    ? '<section class="telegram-agent-status agent-payment-card">' +
      '<div class="agent-proposal-top"><div class="agent-proposal-brand"><span class="agent-proposal-icon">◈</span><span>' + (hasPaymentContext ? 'Payment' : 'Security check') + '</span></div>' +
      '<span class="agent-state-pill ' + (data.execution_enabled === true ? 'is-success' : '') + '">' + escapeHtml(({ AWAITING_HUMAN_APPROVAL: 'REVIEW PAYMENT', DENIED: signerSetupIssue ? 'SETUP REQUIRED' : 'NOT SENT', EXECUTED: 'SENT · VERIFIED', UNKNOWN: 'CHECK STATUS', FAILED: 'FAILED', EXPIRED: 'EXPIRED', APPROVING: 'PROCESSING' })[status] || status.replaceAll('_', ' ')) + '</span></div>' +
      ((hasPaymentContext || data.sentinel) ? '<div class="agent-proposal-values">' +
        (proposal.amount_near != null ? '<div class="agent-proposal-field amount"><span>AMOUNT</span><b>' + escapeHtml(String(proposal.amount_near)) + ' <small>NEAR</small></b></div>' : '') +
      '</div>' : '') + recipientCard +
      ((status === 'DENIED' || status === 'UNKNOWN') && policyReason ? '<div class="agent-policy-reason"><span>' + (status === 'UNKNOWN' && txHash ? 'Verification pending' : 'Payment not sent') + '</span><p>' + escapeHtml(policyReasonText || ('Reason code: ' + policyReason)) + '</p></div>' : '') +
      ((data.sentinel?.decision || data.sentinel?.risk_score != null) ? '<div class="agent-result-grid compact"><span>Security check</span><b>' + escapeHtml(data.sentinel?.decision ? verdict : 'Completed') + (data.sentinel?.risk_score != null && Number.isFinite(Number(data.sentinel.risk_score)) ? ' · Risk ' + escapeHtml(risk) : '') + '</b></div>' : '') +
      (approvalId && status === 'AWAITING_HUMAN_APPROVAL' ? '<div class="agent-proposal-meta compact"><span>NEAR TESTNET · Expires in 5 minutes</span></div>' : '') +
      (txHash ? '<p class="agent-result-hash">TRANSACTION HASH · ' + escapeHtml(txHash) + '</p>' : '') + txLink +
      (approvalId && status === 'AWAITING_HUMAN_APPROVAL' ? '<div class="agent-approval"><p>Review the exact amount and recipient in your NEAR wallet.</p><div class="agent-approval-actions">' +
        (walletCanApprove
          ? '<button type="button" class="primary-btn" id="approveAgentPayment">Approve payment <b>↗</b></button>'
          : '<button type="button" class="primary-btn" id="connectAgentWallet">Open NEAR wallet <b>↗</b></button>') +
        '</div></div>' : '') +
      '</section>' : '';
  result.innerHTML = '<div class="guest-chat-transcript telegram-chat-transcript" aria-label="Sentinel AI conversation">' +
    (authenticatedPrompt ? '<article class="guest-chat-message guest-chat-user"><span>YOU</span><p>' + escapeHtml(authenticatedPrompt) + '</p></article>' : '') +
    '<article class="guest-chat-message guest-chat-assistant telegram-agent-bubble"><span>SENTINEL AI</span><p class="telegram-agent-response">' + escapeHtml(responseText) + '</p>' + agentCard + '</article></div>';
  result.classList.remove('agent-result-enter');
  void result.offsetWidth;
  result.classList.add('agent-result-enter');
  const recipientTrackCard = $('agentRecipientTrackCard');
  if (recipientTrackCard) {
    const trackedAccount = recipientTrackCard.dataset.account || '';
    request('/wallet?account_id=' + encodeURIComponent(trackedAccount)).then(walletData => {
      if (!recipientTrackCard.isConnected || recipientTrackCard.dataset.account !== trackedAccount) return;
      const balance = $('agentRecipientTrackBalance');
      const state = $('agentRecipientTrackState');
      const block = $('agentRecipientTrackBlock');
      const explorer = $('agentRecipientTrackExplorer');
      if (walletData.account_exists) {
        balance.textContent = Number(walletData.balance_near).toLocaleString('en-US', { maximumFractionDigits: 6 }) + ' NEAR';
        state.textContent = 'ACCOUNT ACTIVE';
        block && (block.textContent = 'Finalized block ' + Number(walletData.block_height).toLocaleString('en-US'));
        explorer && (explorer.href = walletData.explorer_url || 'https://testnet.nearblocks.io/address/' + encodeURIComponent(trackedAccount));
      } else {
        balance.textContent = 'Account not found';
        state.textContent = 'NOT FOUND';
        block && (block.textContent = 'Not present on NEAR Testnet RPC');
        if (explorer) explorer.hidden = true;
      }
    }).catch(() => {
      if (!recipientTrackCard.isConnected || recipientTrackCard.dataset.account !== trackedAccount) return;
      $('agentRecipientTrackBalance').textContent = 'Unavailable';
      $('agentRecipientTrackState').textContent = 'RPC UNAVAILABLE';
      const block = $('agentRecipientTrackBlock');
      if (block) block.textContent = 'Could not verify live account data';
    });
  }
  if (approvalId && !walletCanApprove) {
    const connectButton = $('connectAgentWallet');
    connectButton?.addEventListener('click', async () => {
      connectButton.disabled = true;
      connectButton.textContent = 'Opening NEAR wallet…';
      try {
        if (!connectorReady || !connector) throw new Error('NEAR wallet connector is still loading. Try again in a moment.');
        if (connectedAccount) await connector.disconnect();
        await connector.connect();
        const current = await connector.getConnectedWallet();
        const account = current.accounts && current.accounts[0];
        syncWalletUI(account?.accountId, current.wallet?.manifest?.name || 'NEAR wallet');
        if (!account?.accountId || !account.accountId.endsWith('.testnet')) {
          throw new Error('Connect a NEAR Testnet account to approve this proposal.');
        }
        toast('NEAR Testnet wallet connected. Review the proposal before signing.');
        renderAgentResult(data);
      } catch (error) {
        connectButton.disabled = false;
        connectButton.textContent = 'Open NEAR wallet ↗';
        toast(error.message || 'Wallet connection cancelled or unavailable.');
      }
    });
  }
  if (approvalId && walletCanApprove) {
    $('approveAgentPayment').addEventListener('click', async () => {
      const receiver = String(proposal.receiver_account || '').trim().toLowerCase();
      const amount = String(proposal.amount_near || '');
      const approveButton = $('approveAgentPayment');
      approveButton.disabled = true;
      approveButton.textContent = 'Checking Sentinel policy…';
      let walletSubmissionStarted = false;
      try {
        if (!connectorReady || !connector || !connectedAccount || !connectedAccount.endsWith('.testnet')) {
          throw new Error('Connect a NEAR Testnet wallet before approving.');
        }
        if (connectedAccount.toLowerCase() !== String(connectedAccount).toLowerCase()) {
          throw new Error('Wallet account changed. Reconnect and review the proposal.');
        }
        if (!data.expires_at) throw new Error('Approval expiry is missing. Create a new proposal.');
        const amountMicro = Math.round(Number(amount) * 1000000);
        if (!Number.isSafeInteger(amountMicro) || amountMicro <= 0 || amountMicro > 100000) {
          throw new Error('Invalid payment amount. The Testnet limit is 0.1 NEAR.');
        }

        const prepared = await request('/agent/approve', {
          method: 'POST',
          body: JSON.stringify({ stage: 'prepare', approval_id: approvalId, wallet_account: connectedAccount })
        });
        if (prepared.status !== 'READY_TO_SIGN' || prepared.sentinel?.decision !== 'ALLOW' || !prepared.preflight_token) {
          renderAgentResult(prepared);
          throw new Error(prepared.reason || 'Sentinel did not authorize this transfer. No wallet transaction was requested.');
        }

        const wallet = await connector.wallet();
        if (!wallet || typeof wallet.signAndSendTransaction !== 'function') {
          throw new Error('The connected wallet does not support native NEAR transfers through signAndSendTransaction.');
        }
        const amountYocto = (BigInt(amountMicro) * 1000000000000000000n).toString();
        approveButton.textContent = 'Confirm exact transfer in your wallet…';
        walletSubmissionStarted = true;
        const walletResult = await wallet.signAndSendTransaction({
          receiverId: receiver,
          actions: [{ type: 'Transfer', params: { deposit: amountYocto } }]
        });
        const transactionHash = walletResult?.transaction?.hash ||
          walletResult?.transaction_outcome?.id ||
          walletResult?.transactionHash ||
          walletResult?.hash ||
          null;
        if (typeof transactionHash !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(transactionHash)) {
          throw new Error('The wallet did not return a verifiable transaction hash. Do not send again; check the wallet activity first.');
        }

        approveButton.textContent = 'Verifying wallet transfer on NEAR…';
        const approved = await request('/agent/approve', {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({
            stage: 'verify',
            approval_id: approvalId,
            wallet_account: connectedAccount,
            transaction_hash: transactionHash,
            preflight_token: prepared.preflight_token
          })
        });
        renderAgentResult(approved);
        toast(approved.execution_enabled
          ? 'Native NEAR transfer verified on Testnet.'
          : 'Transfer verification: ' + String(approved.status || 'UNKNOWN'));
      } catch (error) {
        if (!walletSubmissionStarted) {
          approveButton.disabled = false;
          approveButton.textContent = 'Approve payment';
          toast(error.message || 'Approval stopped. No wallet transfer was requested.');
          return;
        }
        approveButton.disabled = true;
        approveButton.textContent = 'Transfer submitted · verification required';
        const note = document.createElement('p');
        note.className = 'agent-approval-status-note';
        note.textContent = error.message || 'The wallet may have submitted the transfer, but Sentinel could not verify it. Do not retry until the wallet and Explorer are checked.';
        approveButton.closest('.agent-approval')?.append(note);
        toast('Do not send again. Check the wallet activity and transaction status.');
      }
    });
  }
}
function renderTradingAgentResult(data) {
  const result = $('agentResult');
  const analysis = data.market_analysis || {};
  const indicators = analysis.indicators || {};
  const evidence = Array.isArray(analysis.evidence) ? analysis.evidence : [];
  const agentOne = data.agent_one || {};
  const agentTwo = data.agent_two || {};
  const status = String(data.status || 'UNKNOWN');
  const statusClass = status === 'PAPER_TRADE_CANDIDATE' ? 'candidate' : status === 'HOLD' ? 'hold' : 'veto';
  const price = Number(analysis.market_snapshot?.latest_close);
  const fmt = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: 6 }) : '—';
  const evidenceMarkup = evidence.map(item => '<li><b>' + escapeHtml(item.id) + '</b><span>effect ' + escapeHtml(item.effect) + '</span></li>').join('');
  const reasonsMarkup = (Array.isArray(agentTwo.reasons) ? agentTwo.reasons : []).map(reason => '<li>' + escapeHtml(reason) + '</li>').join('');
  result.innerHTML =
    '<section class="trading-agent-result">' +
      '<div class="trading-agent-result-head"><span class="trading-agent-kicker">SENTINEL · TWO-AGENT RESEARCH</span><span class="trading-agent-status ' + statusClass + '">' + escapeHtml(status.replaceAll('_', ' ')) + '</span></div>' +
      '<div class="trading-agent-market"><div><small>' + escapeHtml(data.pair || analysis.symbol || 'MARKET') + ' · ' + escapeHtml(data.interval_minutes || '—') + ' MIN</small><strong>' + escapeHtml(analysis.signal || '—') + '</strong></div><div><small>LAST CLOSED CANDLE</small><b>' + escapeHtml(fmt(price)) + '</b></div></div>' +
      '<div class="trading-agent-indicators"><div><small>RSI 14</small><b>' + escapeHtml(fmt(indicators.rsi_14)) + '</b></div><div><small>ATR %</small><b>' + escapeHtml(fmt(indicators.atr_percent)) + '%</b></div><div><small>VOLUME Z</small><b>' + escapeHtml(fmt(indicators.volume_z_score)) + '</b></div></div>' +
      '<section class="trading-agent-card"><div class="trading-agent-card-title"><b>01 · MARKET RESEARCH</b><span>' + escapeHtml(agentOne.signal || '—') + '</span></div><p>' + escapeHtml(agentOne.thesis || 'No thesis returned.') + '</p><small>Invalidation: ' + escapeHtml(agentOne.invalidation || '—') + '</small><small>Evidence IDs: ' + escapeHtml((agentOne.evidence_ids || []).join(', ') || 'None') + '</small></section>' +
      '<section class="trading-agent-card risk-review"><div class="trading-agent-card-title"><b>02 · INDEPENDENT RISK REVIEW</b><span>' + escapeHtml(agentTwo.verdict || '—') + ' · ' + escapeHtml(agentTwo.risk_level || '—') + '</span></div><p>' + escapeHtml(agentTwo.challenge || 'No independent review returned.') + '</p>' + (reasonsMarkup ? '<ul>' + reasonsMarkup + '</ul>' : '') + ((agentTwo.deterministic_blocks || []).length ? '<small>Deterministic blocks: ' + escapeHtml(agentTwo.deterministic_blocks.join(', ')) + '</small>' : '<small>No deterministic veto condition detected.</small>') + '</section>' +
      '<section class="trading-agent-evidence"><b>DETERMINISTIC EVIDENCE</b><ul>' + (evidenceMarkup || '<li>No evidence returned</li>') + '</ul></section>' +
      '<div class="trading-agent-provenance"><small>Source: ' + escapeHtml(data.data_provenance?.provider || '—') + '</small><small>Latest closed candle: ' + escapeHtml(data.data_provenance?.latest_closed_candle_at || '—') + '</small></div>' +
      '<p class="trading-agent-safety">RESEARCH / PAPER-TRADING ONLY. No order, wallet signature, deposit, swap, or live execution was authorized.</p>' +
      '<div class="trading-backtest-actions"><button type="button" class="secondary-btn" id="runTradingBacktest">Run 500-candle backtest</button><div id="tradingBacktestResult" class="trading-backtest-result" aria-live="polite"></div></div>' +
    '</section>';
  const backtestButton = result.querySelector('#runTradingBacktest');
  const backtestOutput = result.querySelector('#tradingBacktestResult');
  backtestButton?.addEventListener('click', async () => {
    backtestButton.disabled = true;
    backtestButton.textContent = 'Running cost-aware backtest…';
    backtestOutput.textContent = 'Fetching up to 500 completed candles. Signals are evaluated on prior candles and filled on the next candle open.';
    try {
      const backtest = await request('/trading/backtest', {
        method: 'POST',
        body: JSON.stringify({
          pair: data.pair,
          interval: data.interval_minutes,
          fee_bps: 10,
          slippage_bps: 5,
          initial_capital: 10000,
          position_fraction: 0.25
        })
      });
      const metrics = backtest.metrics || {};
      const format = value => value === null || value === undefined || !Number.isFinite(Number(value))
        ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 });
      backtestOutput.innerHTML =
        '<div class="trading-backtest-summary"><b>HISTORICAL SIMULATION · ' + escapeHtml(backtest.sample?.candles || 0) + ' CANDLES</b>' +
        '<div class="trading-backtest-metrics">' +
          '<div><small>NET RETURN</small><strong>' + escapeHtml(format(metrics.net_return_pct)) + '%</strong></div>' +
          '<div><small>BUY & HOLD</small><strong>' + escapeHtml(format(metrics.buy_and_hold_return_pct)) + '%</strong></div>' +
          '<div><small>MAX DRAWDOWN</small><strong>' + escapeHtml(format(metrics.max_drawdown_pct)) + '%</strong></div>' +
          '<div><small>TRADES / WIN RATE</small><strong>' + escapeHtml(format(metrics.trade_count)) + ' / ' + escapeHtml(format(metrics.win_rate_pct)) + '%</strong></div>' +
          '<div><small>PROFIT FACTOR</small><strong>' + escapeHtml(format(metrics.profit_factor)) + '</strong></div>' +
          '<div><small>FEES / SLIPPAGE</small><strong>' + escapeHtml(format(metrics.total_fees_quote)) + ' / ' + escapeHtml(format(metrics.estimated_slippage_quote)) + '</strong></div>' +
        '</div><small>Sample: ' + escapeHtml(backtest.sample?.start_at || '—') + ' → ' + escapeHtml(backtest.sample?.end_at || '—') + '</small>' +
        '<p>Long-only spot simulation. Kraken candle prices are not Tidepool/Meteor execution quotes. Historical returns do not predict future performance.</p></div>';
    } catch (error) {
      backtestOutput.textContent = error.message || 'Backtest failed. No trade was executed.';
    } finally {
      backtestButton.disabled = false;
      backtestButton.textContent = 'Run 500-candle backtest';
    }
  });
  result.classList.remove('hidden');
  result.scrollTop = result.scrollHeight;
}

const skillCards = Array.from(document.querySelectorAll('.sentinel-skill-card'));
document.querySelectorAll('[data-side-action]').forEach(action => action.addEventListener('click', () => {
  const target = action.dataset.sideAction;
  if (target === 'wallet') {
    // Preserve the original user gesture so wallet popups/redirects are not blocked.
    connectNearWalletFromGesture();
    return;
  }
  if (target === 'scan') {
    $('receiver')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('receiver')?.focus({ preventScroll: true });
    toast('Enter a public NEAR account, then run Track wallet.');
    return;
  }
  if (target === 'threats') {
    $('threats')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('reportBtn')?.focus({ preventScroll: true });
    return;
  }
  if (target === 'trading') {
    if (GUEST_MODE) { toast('Dual-agent market research requires an authenticated session.'); return; }
    const card = document.querySelector('[data-skill="trading"]');
    if (card) selectSentinelSkill(card);
    $('agentPrompt')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('agentPrompt')?.focus({ preventScroll: true });
    toast('Research prompt ready. Review it and press Send to run both agents.');
  }
}));
if (GUEST_MODE) document.querySelector('[data-skill="trading"]')?.classList.add('hidden');
function selectSentinelSkill(card) {
  if (!card) return;
  skillCards.forEach(item => item.classList.toggle('is-selected', item === card));
  const prompt = $('agentPrompt');
  if (prompt) {
    prompt.value = card.dataset.prompt || '';
    prompt.focus();
    prompt.setSelectionRange(prompt.value.length, prompt.value.length);
  }
}
skillCards.forEach(card => card.addEventListener('click', () => selectSentinelSkill(card)));

const paymentDraftButton = $('usePaymentDraft');
paymentDraftButton?.addEventListener('click', () => {
  const receiver = String($('draftReceiver')?.value || '').trim().toLowerCase();
  const amountText = String($('draftAmount')?.value || '').trim();
  const amount = Number(amountText);
  const reason = String($('draftReason')?.value || '').trim();
  const accountPattern = /^(?:[a-z0-9]+(?:[-_.][a-z0-9]+)*\.)*(?:testnet|near)$/;
  if (!accountPattern.test(receiver) || receiver.length < 2 || receiver.length > 64) {
    toast('Enter a valid NEAR recipient account, such as alice.testnet.');
    $('draftReceiver')?.focus();
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 0.1 || !/^\d+(?:\.\d{1,6})?$/.test(amountText)) {
    toast('Enter an amount from 0.000001 to 0.1 NEAR (up to 6 decimals).');
    $('draftAmount')?.focus();
    return;
  }
  const prompt = 'Create a payment proposal to ' + receiver + ' for ' + amountText + ' NEAR.' +
    (reason ? ' Reason: ' + reason + '.' : '') +
    ' Run Sentinel policy checks and show the exact proposal for my human approval. Do not execute until I explicitly approve with my connected NEAR Testnet wallet.';
  const input = $('agentPrompt');
  input.value = prompt;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  skillCards.forEach(card => card.classList.toggle('is-selected', card.dataset.skill === 'payment'));
  toast('Payment draft ready. Review the prompt, then send it to Sentinel.');
});

if (agentForm) {
  agentForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('agentRunBtn');
    const prompt = $('agentPrompt').value.trim();
    if (!prompt) return;
    // A new user prompt supersedes any in-flight chat swap request.
    if (activeChatSwapController) {
      activeChatSwapController.abort();
      activeChatSwapController = null;
    }
    const compoundSwapPayment = !developerModeEnabled
      ? prompt.match(/\b(?:kirim|send|transfer)\s+(\d+(?:[.,]\d{1,6})?)\s*(?:near|Ⓝ)\s+(?:ke|to)\s+([a-z0-9]+(?:[-_.][a-z0-9]+)*)\b/i)
      : null;
    const paymentProposalPrompt = compoundSwapPayment
      ? 'send ' + compoundSwapPayment[1].replace(',', '.') + ' NEAR to ' + compoundSwapPayment[2]
      : prompt;
    if (!developerModeEnabled && !compoundSwapPayment && /\b(swap|tukar|exchange)\s+\d/i.test(prompt)) {
      authenticatedPrompt = prompt;
      if (activeChatSwapController) activeChatSwapController.abort();
      const swapController = new AbortController();
      activeChatSwapController = swapController;
      button.disabled = false;
      button.classList.add('agent-running');
      button.innerHTML = 'Send new prompt <b>↗</b>';
      if (!GUEST_MODE) renderAuthenticatedPending(prompt);
      const swapRequest = (path, options = {}) => request(path, { ...options, signal: swapController.signal });
      try {
        await renderChatSwap({ prompt, result: $('agentResult'), request: swapRequest, connector: () => connector, connectedAccount: () => connectedAccount, connectedWalletName, encodeBase58, guestMode: GUEST_MODE, onWalletConnected: syncWalletUI, onConnectNearWallet: connectNearWalletFromGesture, onDisconnectNearWallet: async () => {
          if (!connectorReady || !connector || !connectedAccount) throw new Error('No active NEAR wallet session is available to disconnect.');
          await connector.disconnect();
          syncWalletUI(null, null);
          toast('NEAR wallet disconnected from Sentinel.');
        } });
        if (activeChatSwapController === swapController) $('agentPrompt').value = '';
      } catch (error) {
        if (swapController.signal.aborted || activeChatSwapController !== swapController) return;
        const result = $('agentResult');
        result.innerHTML = '<div class="guest-chat-transcript telegram-chat-transcript"><article class="guest-chat-message guest-chat-user"><span>YOU</span><p>' + escapeHtml(prompt) + '</p></article><article class="guest-chat-message guest-chat-assistant telegram-agent-bubble"><span>SENTINEL AI · SWAP ERROR</span><p class="guest-chat-error">' + escapeHtml(error?.message || 'Swap request failed before wallet approval.') + '</p><p>No wallet transaction was approved. Send a new prompt to retry.</p></article></div>';
        result.classList.remove('hidden');
        toast(error?.message || 'Swap request failed before wallet approval.');
      } finally {
        if (activeChatSwapController === swapController) {
          activeChatSwapController = null;
          button.disabled = false;
          button.classList.remove('agent-running');
          button.innerHTML = 'Send message <b>↗</b>';
        }
      }
      return;
    }
    if (developerModeEnabled && /\b(buy|sell|swap|trade|beli|jual|tukar|dca)\b/i.test(prompt) && /\b(BTC|ETH|NEAR|USDC|USDT|SOL|WNEAR)\b/i.test(prompt)) { await renderTradeSkillDraft(prompt); toast('Skill draft generated. Trading execution is not connected.'); return; }
    button.disabled = true;
    button.classList.add('agent-running');
    button.innerHTML = '<span class="agent-button-pulse" aria-hidden="true"></span> Agent running <b>…</b>';
    const result = $('agentResult');
    result.classList.remove('hidden');
    result.textContent = 'Calling the AI provider and evaluating the proposed action…';
    try {
      const pairMatch = prompt.match(/\b(XBTUSD|BTCUSD|ETHUSD|SOLUSD|ADAUSD|DOTUSD|LINKUSD|XRPUSD|AVAXUSD)\b/i);
      const requestsTradingResearch = /\b(two-agent trading research|market analysis|analyze|analyse)\b/i.test(prompt);
      if (pairMatch && requestsTradingResearch) {
        if (GUEST_MODE) throw new Error('Dual-agent trading research requires an authenticated Sentinel session.');
        const pairAlias = pairMatch[1].toUpperCase();
        const pair = pairAlias === 'BTCUSD' ? 'XBTUSD' : pairAlias;
        const intervalMatch = prompt.match(/\b(1|5|15|30|60|240|1440)\s*(m|min|minute|minutes|h|hr|hour|hours|d|day|days)\b/i);
        const unit = intervalMatch?.[2]?.toLowerCase();
        const multiplier = ['h', 'hr', 'hour', 'hours'].includes(unit) ? 60 : ['d', 'day', 'days'].includes(unit) ? 1440 : 1;
        const interval = intervalMatch ? Number(intervalMatch[1]) * multiplier : 5;
        result.textContent = 'Fetching verified market data. Agent 1 is building a thesis; Agent 2 will independently challenge it…';
        const data = await request('/trading/agent', { method: 'POST', body: JSON.stringify({ pair, interval }) });
        renderTradingAgentResult(data);
        $('agentPrompt').value = '';
        toast(data.status === 'PAPER_TRADE_CANDIDATE' ? 'Both agents completed. Paper-trading candidate only.' : 'Both agents completed. No live trade was executed.');
        return;
      }
      if (GUEST_MODE) {
        guestConversation.push({ role: 'user', content: prompt });
        guestConversation = guestConversation.slice(-14);
        saveGuestConversation();
        renderGuestConversation(true);
        const data = await request('/guest/agent', {
          method: 'POST',
          body: JSON.stringify({ messages: guestConversation })
        });
        if (typeof data.message === 'string' && data.message.trim()) {
          guestConversation.push({ role: 'assistant', content: data.message.trim() });
          guestConversation = guestConversation.slice(-14);
          saveGuestConversation();
        }
        renderGuestConversation(false);
        $('agentPrompt').value = '';
        toast('Completed ' + String(data.skills_used ?? 0) + ' security skill(s) · ' + String(data.prompts_remaining ?? '—') + ' prompts left today');
      } else {
        authenticatedPrompt = prompt;
        renderAuthenticatedPending(prompt);
        const data = await request('/agent/run', {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ prompt: paymentProposalPrompt })
        });
        renderAgentResult(data);
        if (compoundSwapPayment) {
          const swapResult = document.createElement('div');
          const swapPrompt = (prompt.match(/\b(?:swap|tukar|exchange)\s+\d+(?:[.,]\d{1,6})?\s+[a-z0-9]+\s+(?:to|ke)\s+[a-z0-9]+/i) || [])[0];
          if (swapPrompt) {
            const swapController = new AbortController();
            const swapRequest = (path, options = {}) => request(path, { ...options, signal: swapController.signal });
            try {
              await renderChatSwap({ prompt: swapPrompt, result: swapResult, request: swapRequest, connector: () => connector, connectedAccount: () => connectedAccount, connectedWalletName, encodeBase58, guestMode: GUEST_MODE, onWalletConnected: syncWalletUI, onConnectNearWallet: connectNearWalletFromGesture, onDisconnectNearWallet: async () => {
                if (!connectorReady || !connector || !connectedAccount) throw new Error('No active NEAR wallet session is available to disconnect.');
                await connector.disconnect();
                syncWalletUI(null, null);
                toast('NEAR wallet disconnected from Sentinel.');
              } });
              result.append(...swapResult.childNodes);
            } catch (swapError) {
              const note = document.createElement('p');
              note.className = 'guest-chat-error';
              note.textContent = 'Swap preview unavailable: ' + (swapError?.message || 'route lookup failed') + '. The separate payment proposal remains unchanged.';
              result.append(note);
            }
          }
        }
        $('agentPrompt').value = '';
        if (data.status === 'AWAITING_HUMAN_APPROVAL') toast('Review the exact receiver and amount before approving.');
        else toast('Sentinel replied.');
      }
    } catch (error) {
      if (GUEST_MODE) {
        renderGuestConversation(false);
        const errorMessage = document.createElement('p');
        errorMessage.className = 'guest-chat-error';
        errorMessage.textContent = error?.message || 'Agent request failed.';
        result.append(errorMessage);
      } else {
        result.innerHTML = '<div class="guest-chat-transcript telegram-chat-transcript"><article class="guest-chat-message guest-chat-user"><span>YOU</span><p>' + escapeHtml(authenticatedPrompt) + '</p></article><article class="guest-chat-message guest-chat-assistant telegram-agent-bubble"><span>SENTINEL AI</span><p class="guest-chat-error">' + escapeHtml(error.message || 'Agent request failed. No transaction was confirmed.') + '</p></article></div>';
        result.classList.remove('hidden');
      }
      toast(error.message || 'Agent request failed.');
    } finally {
      button.disabled = false;
      button.classList.remove('agent-running');
      button.innerHTML = 'Send message <b>↗</b>';
    }
  });
}
const agentSendButton = $('agentRunBtn');
if (agentSendButton) {
  agentSendButton.disabled = false;
  agentSendButton.removeAttribute('aria-disabled');
  agentSendButton.innerHTML = 'Send message <b>↗</b>';
}
if (GUEST_MODE) {
  const intro = document.querySelector('.agent-lab-intro');
  if (intro) intro.textContent = 'Guest AI access · up to 10 prompts per day. Ask questions and get security guidance. Wallet investigation is read-only; payment proposals, signing, and transfers are disabled.';
  const prompt = $('agentPrompt');
  if (prompt) prompt.placeholder = 'Ask Sentinel about wallet security, anomalies, or how to use the dashboard…';
  const warning = document.querySelector('.agent-lab-warning');
  if (warning) warning.innerHTML = '<b>GUEST READ-ONLY MODE</b><span>10 AI prompts per day · no payment proposals · no signing · no transfers.</span>';
  const submitLabel = $('agentRunBtn');
  if (submitLabel) submitLabel.innerHTML = 'Send message <b>↗</b>';
  if (guestConversation.length) renderGuestConversation(false);
}

// Wallet connection is independent from Privy login; Guest users may connect a NEAR wallet too.
initTrackWalletTurnstile();
initWalletCardMotion();
initWallet();
loadMetrics();
loadThreats();
