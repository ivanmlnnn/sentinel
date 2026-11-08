const $ = id => document.getElementById(id);
const API = '/api';
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
  const response = await fetch(API + path, {
    ...options, headers: {'content-type':'application/json', ...(options.headers || {})}
  });
  const data = await response.json().catch(() => ({error:'Invalid server response.'}));
  if (!response.ok) throw new Error(data.error || 'Request failed. Please retry.');
  return data;
}
function syncWalletUI(accountId, walletName) {
  connectedAccount = accountId || null;
  connectedWalletName = walletName || null;
  const button = $('walletBtn');
  button.disabled = false;
  button.classList.toggle('wallet-connected', Boolean(connectedAccount));
  button.innerHTML = connectedAccount
    ? '<span class="wallet-dot"></span>' + escapeHtml(short(connectedAccount)) + ' <span>Disconnect</span>'
    : 'Connect NEAR Wallet <span>↗</span>';
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
    connector = new NearConnector({ network:'testnet', features:{ testnet:true }, autoConnect:false });
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

  const verdict = ['ALLOW','WARN','BLOCK','INCOMPLETE'].includes(data.decision) ? data.decision : 'WARN';
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
      summary: 'The scan found activity that may need a closer look.',
      action: 'Review the findings below. Avoid sending funds until you understand the activity.',
      status: 'REVIEW RECOMMENDED'
    },
    BLOCK: {
      title: 'This wallet matches a verified threat',
      summary: 'A verified threat record matches this account.',
      action: 'Do not send funds or connect to services associated with this wallet.',
      status: 'DO NOT PROCEED'
    },
    INCOMPLETE: {
      title: hasThreatMatch ? 'A verified threat match was found' : hasSignals ? 'Suspicious activity may be present' : 'No threat found in the data checked',
      summary: 'Some transaction records could not be fully checked, so this is not a final safety assessment.',
      action: 'Treat this result as unconfirmed. Run the check again when the transaction history source is available.',
      status: 'PARTIAL CHECK'
    }
  }[verdict];

  const activity = data.evidence?.wallet_activity;
  const activityMarkup = !data.simulation && activity ? (() => {
    const sources = [
      ['NEAR transactions', activity.native_transactions || {}],
      ['Receipts', activity.receipts || {}],
      ['Token transfers', activity.fungible_token_transfers || {}]
    ];
    return '<section class="plain-evidence"><h4>Activity found</h4><div class="plain-evidence-rows">' +
      sources.map(([label, source]) => {
        const count = Number(source.count ?? 0).toLocaleString();
        const note = source.complete ? 'History checked' : 'Some records not verified';
        return '<div class="plain-evidence-row"><span>' + label + '</span><b>' + count + '</b><small>' + note + '</small></div>';
      }).join('') +
      '</div>' +
      (activity.explorer_url ? '<a class="explorer-link" href="' + escapeHtml(activity.explorer_url) + '" target="_blank" rel="noopener noreferrer">Open wallet activity in NEAR Explorer ↗</a>' : '') +
      '</section>';
  })() : '';

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
  const scoreLabel = verdict === 'INCOMPLETE' ? 'Signals in checked data' : 'Risk score';
  const scoreValue = verdict === 'INCOMPLETE'
    ? (score > 0 ? score + '/100' : '0 found')
    : score + '/100';
  const simulation = data.simulation
    ? '<p class="plain-simulation">TEST RESULT — This uses local sample data, not a live wallet scan.</p>'
    : '';

  el.innerHTML =
    '<section class="plain-result-head result-' + verdict.toLowerCase() + '">' +
      '<div class="plain-status">' + escapeHtml(copy.status) + '</div>' +
      '<h3>' + escapeHtml(copy.title) + '</h3>' +
      '<p class="plain-summary">' + escapeHtml(copy.summary) + '</p>' +
      '<div class="plain-score"><span>' + scoreLabel + '</span><b>' + scoreValue + '</b></div>' +
      '<p class="plain-next-step"><strong>What to do:</strong> ' + escapeHtml(copy.action) + '</p>' +
      simulation +
    '</section>' +
    activityMarkup +
    '<section class="plain-findings"><h4>Why this result?</h4><ul>' + findingsMarkup + '</ul></section>' +
    '<details class="technical-details"><summary>Technical data</summary><pre class="ai-text technical-json"></pre></details>';

  const technicalJson = el.querySelector('.technical-json');
  if (technicalJson) {
    try {
      technicalJson.textContent = JSON.stringify(data.evidence ?? {}, null, 2);
    } catch (error) {
      technicalJson.textContent = 'Technical data could not be displayed.';
    }
  }
}

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
    ).join('') : '<div class="empty-state">No checks yet. Try your first address above.</div>';
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
  const button = $('scanBtn'); button.disabled = true; button.textContent = 'Tracking wallet activity…';
  $('result').classList.add('hidden');
  try {
    const data = await request('/investigate',{method:'POST',body:JSON.stringify({
      receiver_account:$('receiver').value.trim(),
      sender_account:null,
      amount_near:0
    })});
    renderResult(data); await loadMetrics(); toast('Wallet tracking complete: '+data.decision);
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; button.innerHTML = 'Track wallet <b>↗</b>'; }
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

initWallet(); loadMetrics(); loadThreats();
