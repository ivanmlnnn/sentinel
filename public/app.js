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
let connectorReady = false;

function toast(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 3200);
}
function short(value) {
  return value && value.length > 26 ? value.slice(0, 10) + '…' + value.slice(-8) : value;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function request(path, options = {}) {
  const headers = {'content-type':'application/json', ...(options.headers || {})};
  if (typeof window.getSentinelAccessToken === 'function') {
    try {
      const token = await window.getSentinelAccessToken();
      if (token) headers.authorization = 'Bearer ' + token;
    } catch (error) {
      console.warn('Could not refresh Privy access token for API request:', error);
    }
  }
  const response = await fetch(API + path, { ...options, headers });
  const data = await response.json().catch(() => ({error:'Invalid server response.'}));
  if (!response.ok) {
    const detail = typeof data.provider_message === 'string' ? ': ' + data.provider_message : '';
    const error = new Error((data.error || 'Request failed. Please retry.') + detail);
    error.data = data;
    throw error;
  }
  return data;
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
}
async function initWallet() {
  const button = $('walletBtn');
  button.disabled = true;
  button.textContent = 'Loading NEAR wallet options…';
  try {
    // NEAR Connect is the current recommended connector in the NEAR Wallet Selector transition.
    const { NearConnector } = await import('https://esm.sh/@hot-labs/near-connect@0.12.0');
    connector = new NearConnector({ network:'testnet', features:{ testnet:true, signMessage:true }, autoConnect:false });
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
      const count = connector.availableWallets.length;
      if (!connectedAccount) {
        $('walletConnectionState').textContent = count
          ? 'Not connected — ' + count + ' compatible Testnet wallet(s) found.'
          : 'No compatible Testnet wallet is currently available. You can still check any public account.';
      }
    });
    connectorReady = true;
    button.disabled = false;
    const walletCount = connector.availableWallets.length;
    $('walletConnectionState').textContent = walletCount
      ? 'Not connected — ' + walletCount + ' compatible Testnet wallet(s) found. Connect to autofill your account.'
      : 'No compatible Testnet wallet is currently available. You can still check any public account.';
    console.info('NEAR Connect ready. Network: testnet. Testnet-compatible wallets:', walletCount);
  } catch (error) {
    console.error('NEAR Connect initialization failed:', error);
    button.disabled = false;
    button.textContent = 'Wallet connection unavailable';
    $('walletConnectionState').textContent = 'Wallet options could not load. Refresh the page or continue with a public address check.';
    toast('NEAR wallet service could not load. Please refresh and retry.');
  }
  button.addEventListener('click', async () => {
    if (!connectorReady) {
      toast('Wallet connector is not ready. Refresh the page and try again.');
      return;
    }
    if (!connectedAccount && connector.availableWallets.length === 0) {
      toast('No wallet supporting NEAR Testnet is available in this browser. Try another NEAR wallet.');
      return;
    }
    button.disabled = true;
    try {
      if (connectedAccount) {
        await connector.disconnect();
        syncWalletUI(null, null);
        toast('NEAR wallet disconnected.');
      } else {
        await connector.connect();
        const current = await connector.getConnectedWallet();
        const account = current.accounts && current.accounts[0];
        syncWalletUI(account?.accountId, current.wallet?.manifest?.name || 'NEAR wallet');
        toast('NEAR wallet connected.');
      }
    } catch (error) {
      console.error('NEAR wallet connection error:', error);
      toast('Connection cancelled or unavailable. Choose a wallet that supports NEAR Testnet.');
    } finally {
      button.disabled = false;
    }
  });
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
        window.__sentinelTurnstileToken = typeof token === 'string' ? token : null;
        setTrackWalletTurnstileStatus('Cloudflare verification complete. You can track this wallet.', 'verified');
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
$('pasteReceiver').addEventListener('click', async () => {
  try { $('receiver').value = await navigator.clipboard.readText(); }
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
const GUEST_CHAT_KEY = 'sentinel.guestAgent.messages.v1';
let guestConversation = [];
let authenticatedPrompt = '';
if (GUEST_MODE) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(GUEST_CHAT_KEY) || '[]');
    if (Array.isArray(saved)) guestConversation = saved
      .filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
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
    ? data.explorer_url : (data.execution_enabled === true && txHash
      ? 'https://testnet.nearblocks.io/txns/' + encodeURIComponent(txHash) : '');
  const txLink = data.execution_enabled === true && txHash && explorerUrl
    ? '<a class="agent-tx-link" href="' + escapeHtml(explorerUrl) + '" target="_blank" rel="noopener noreferrer">View RPC-verified Testnet transaction ↗</a>'
    : '';
  const approvalId = status === 'AWAITING_HUMAN_APPROVAL' ? String(data.approval_id || '') : '';
  const agentCard =
    '<div class="agent-result-head agent-result-' + escapeHtml(status.toLowerCase()) + '">' +
      '<span>AGENT STATUS</span><b>' + escapeHtml(status.replaceAll('_', ' ')) + '</b></div>' +
    '<div class="agent-result-grid">' +
      '<div><span>PROPOSED RECEIVER</span><b>' + escapeHtml(proposal.receiver_account || '—') + '</b></div>' +
      '<div><span>AMOUNT</span><b>' + escapeHtml(proposal.amount_near == null ? '—' : String(proposal.amount_near) + ' NEAR') + '</b></div>' +
      '<div><span>SENTINEL VERDICT</span><b>' + escapeHtml(verdict) + '</b></div>' +
      '<div><span>RISK SCORE</span><b>' + escapeHtml(risk) + '</b></div></div>' +
    '<p class="agent-result-reason">' + escapeHtml(data.reason || data.message || 'No execution reason returned.') + '</p>' +
    ((data.agent_message || data.message) ? '<p class="agent-result-message">' + escapeHtml(data.agent_message || data.message) + '</p>' : '') +
    (txHash ? '<p class="agent-result-hash">TX HASH · ' + escapeHtml(txHash) + '</p>' : '') +
    txLink +
    (approvalId ? '<div class="agent-approval"><p>Connect a NEAR Testnet wallet with message-signing support. Your wallet will sign the exact receiver, amount, and expiry (NEP-413); this signature does not itself transfer funds. The proposal expires in five minutes.</p><button type="button" class="primary-btn" id="approveAgentPayment">Sign with NEAR wallet & approve</button></div>' : '');
  result.innerHTML = '<div class="guest-chat-transcript telegram-chat-transcript" aria-label="Sentinel AI conversation">' +
    (authenticatedPrompt ? '<article class="guest-chat-message guest-chat-user"><span>YOU</span><p>' + escapeHtml(authenticatedPrompt) + '</p></article>' : '') +
    '<article class="guest-chat-message guest-chat-assistant telegram-agent-bubble"><span>SENTINEL AI</span><div class="telegram-agent-card">' + agentCard + '</div></article></div>';
  result.classList.remove('agent-result-enter');
  void result.offsetWidth;
  result.classList.add('agent-result-enter');
  if (approvalId) {
    $('approveAgentPayment').addEventListener('click', async () => {
      const receiver = String(proposal.receiver_account || '');
      const amount = String(proposal.amount_near || '');
      if (!window.confirm('Approve this NEAR Testnet payment?\n\nTo: ' + receiver + '\nAmount: ' + amount + ' NEAR\n\nOnly this exact proposal will be approved.')) return;
      const approveButton = $('approveAgentPayment');
      approveButton.disabled = true;
      approveButton.textContent = 'Requesting NEAR wallet signature…';
      try {
        if (!connectorReady || !connector || !connectedAccount || !connectedAccount.endsWith('.testnet')) {
          throw new Error('Connect a NEAR Testnet wallet that supports message signing before approving.');
        }
        if (!data.expires_at) throw new Error('Approval expiry is missing. Create a new proposal.');
        const wallet = await connector.wallet();
        if (!wallet || typeof wallet.signMessage !== 'function') {
          throw new Error('The connected wallet does not support NEP-413 message signing.');
        }
        const amountMicro = Math.round(Number(amount) * 1000000);
        if (!Number.isSafeInteger(amountMicro) || amountMicro <= 0) throw new Error('Invalid exact payment amount.');
        const message = JSON.stringify({
          domain: 'near-sentinel',
          version: 1,
          approval_id: approvalId,
          wallet_account: connectedAccount.toLowerCase(),
          receiver_account: receiver.toLowerCase(),
          amount_micro: amountMicro,
          network: 'testnet',
          expires_at: data.expires_at
        });
        const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
        const nonceBase64 = btoa(String.fromCharCode(...nonceBytes));
        const signed = await wallet.signMessage({
          message,
          recipient: 'sentinel.ivmaladin.workers.dev',
          nonce: nonceBytes
        });
        if (!signed || !signed.signature || !signed.publicKey || !signed.accountId) {
          throw new Error('Wallet did not return a verifiable NEP-413 signature. No payment was sent.');
        }
        const signatureBase64 = typeof signed.signature === 'string'
          ? signed.signature
          : btoa(String.fromCharCode(...new Uint8Array(signed.signature)));
        approveButton.textContent = 'Verifying wallet signature · awaiting signer…';
        const approved = await request('/agent/approve', {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({
            approval_id: approvalId,
            wallet_approval: {
              account_id: signed.accountId,
              public_key: signed.publicKey,
              signature: signatureBase64,
              nonce: nonceBase64
            }
          })
        });
        renderAgentResult(approved);
        toast(approved.execution_enabled ? 'NEAR Testnet transaction confirmed.' : 'Approval result: ' + String(approved.status || 'UNKNOWN'));
      } catch (error) {
        approveButton.disabled = false;
        approveButton.textContent = 'Sign again & retry';
        toast(error.message || 'Approval failed. No transfer was confirmed.');
      }
    });
  }
}
if (agentForm) {
  agentForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('agentRunBtn');
    const prompt = $('agentPrompt').value.trim();
    if (!prompt) return;
    button.disabled = true;
    button.classList.add('agent-running');
    button.innerHTML = '<span class="agent-button-pulse" aria-hidden="true"></span> Agent running <b>…</b>';
    const result = $('agentResult');
    result.classList.remove('hidden');
    result.textContent = 'Calling the AI provider and evaluating the proposed action…';
    try {
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
          body: JSON.stringify({ prompt })
        });
        renderAgentResult(data);
        $('agentPrompt').value = '';
        if (data.status === 'AWAITING_HUMAN_APPROVAL') toast('Review the exact receiver and amount before approving.');
        else toast('Agent finished: ' + String(data.status || 'UNKNOWN').replaceAll('_', ' '));
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
      button.innerHTML = 'Run secure agent <b>↗</b>';
    }
  });
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
initWallet();
loadMetrics();
loadThreats();
