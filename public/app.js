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
  const sender = $('sender');
  if (connectedAccount) {
    sender.value = connectedAccount;
    sender.placeholder = 'Connected NEAR account';
    sender.dataset.walletAutofill = '1';
  } else if (sender.dataset.walletAutofill === '1') {
    sender.value = '';
    sender.placeholder = 'Connect a NEAR wallet';
    sender.dataset.walletAutofill = '0';
  }
  $('walletConnectionState').textContent = connectedAccount
    ? 'Connected to ' + (connectedWalletName || 'NEAR wallet') + ': ' + connectedAccount
    : 'Not connected — you can still check any public NEAR account.';
}
async function initWallet() {
  const button = $('walletBtn');
  button.disabled = true;
  button.textContent = 'Loading NEAR wallet options…';
  try {
    // NEAR Connect is the current recommended connector in the NEAR Wallet Selector transition.
    const { NearConnector } = await import('https://esm.sh/@hot-labs/near-connect@0.11.4');
    connector = new NearConnector({ network:'testnet', autoConnect:false });
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
    console.info('NEAR Connect ready. Network: testnet. Available wallets:', walletCount);
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
  const el = $('result'); el.classList.remove('hidden');
  const verdict = ['ALLOW','WARN','BLOCK'].includes(data.decision) ? data.decision : 'WARN';
  const color = {ALLOW:'var(--green)',WARN:'var(--amber)',BLOCK:'var(--red)'}[verdict];
  const explanation = {
    ALLOW:'No matching verified threat was found in the available checks. This is not a safety guarantee.',
    WARN:'Evidence is incomplete or indicates caution. Verify independently before proceeding.',
    BLOCK:'This account matched a verified threat report. Do not proceed unless that report is proven incorrect.'
  }[verdict];
  const factors = Array.isArray(data.risk_factors) ? data.risk_factors : [];
  el.innerHTML = '<div class="result-top"><b class="result-verdict" style="color:'+color+'">'+verdict+'</b><span class="result-score">Risk score: '+(Number(data.risk_score)||0)+'/100</span></div>'
    + '<p class="result-explanation">'+explanation+'</p><ul>'
    + factors.map(x => '<li><b>'+escapeHtml(x.code)+'</b> — '+escapeHtml(x.detail)+'</li>').join('')
    + '</ul><div class="result-actions"><button class="secondary-btn" id="aiExplain" type="button">Explain this result</button><button class="secondary-btn" id="viewEvidence" type="button">Technical evidence</button></div><div id="aiExplanation"></div><pre id="evidenceJson" class="ai-text hidden"></pre>';
  $('aiExplain').addEventListener('click', async () => {
    const button = $('aiExplain'); button.disabled = true; button.textContent = 'Preparing…';
    try {
      const answer = await request('/ai-review',{method:'POST',body:JSON.stringify({investigation_id:data.id})});
      $('aiExplanation').innerHTML = '<p class="ai-text">'+escapeHtml(answer.explanation)+'</p>';
    } catch (error) {
      $('aiExplanation').innerHTML = '<p class="ai-text">AI explanation unavailable. The result above still comes from the security rules and evidence.</p>';
      toast(error.message);
    } finally { button.disabled = false; button.textContent = 'Explain this result'; }
  });
  $('viewEvidence').addEventListener('click', () => {
    $('evidenceJson').textContent = JSON.stringify(data.evidence || {},null,2);
    $('evidenceJson').classList.toggle('hidden');
  });
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
  const button = $('scanBtn'); button.disabled = true; button.textContent = 'Checking public data…';
  $('result').classList.add('hidden');
  try {
    const data = await request('/investigate',{method:'POST',body:JSON.stringify({
      receiver_account:$('receiver').value.trim(),
      sender_account:$('sender').value.trim() || connectedAccount,
      amount_near:Number($('amount').value||0)
    })});
    renderResult(data); await loadMetrics(); toast('Address check complete: '+data.decision);
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; button.innerHTML = 'Check address <b>↗</b>'; }
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
