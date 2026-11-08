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
  el.classList.remove('hidden');
  const verdict = ['ALLOW','WARN','BLOCK','INCOMPLETE'].includes(data.decision) ? data.decision : 'WARN';
  const config = {
    ALLOW: { title:'Tidak ada ancaman terverifikasi yang ditemukan', label:'Tidak ditemukan ancaman', color:'var(--green)', note:'Pemeriksaan yang tersedia tidak menemukan kecocokan dengan daftar ancaman terverifikasi. Ini bukan jaminan bahwa wallet sepenuhnya aman.' },
    WARN: { title:'Perlu diperiksa lebih lanjut', label:'Perlu perhatian', color:'var(--amber)', note:'Ada sinyal risiko atau bukti yang perlu ditinjau. Periksa aktivitas dan sumber terkait sebelum berinteraksi.' },
    BLOCK: { title:'Ancaman terverifikasi ditemukan', label:'Jangan lanjutkan', color:'var(--red)', note:'Wallet cocok dengan laporan ancaman yang telah diverifikasi. Jangan bertransaksi kecuali kecocokan tersebut terbukti keliru.' },
    INCOMPLETE: { title:'Belum dapat disimpulkan', label:'Data belum lengkap', color:'#a9d8e9', note:'Belum ada ancaman terverifikasi yang ditemukan, tetapi data riwayat transaksi belum cukup untuk menilai wallet. Hasil ini bukan status aman.' }
  }[verdict];
  const factors = Array.isArray(data.risk_factors) ? data.risk_factors : [];
  const descriptions = {
    ACCOUNT_EXISTS:'Akun NEAR ditemukan di jaringan.',
    NO_CONTRACT_CODE:'Akun tidak memiliki kode smart contract. Ini umum untuk wallet biasa dan bukan bukti penipuan.',
    TRANSACTION_HISTORY_ANALYZED:'Riwayat transaksi berhasil diperiksa.',
    TRANSACTION_HISTORY_INCOMPLETE:'Sebagian data transaksi tidak memiliki informasi yang cukup untuk diverifikasi.',
    TRANSACTION_HISTORY_UNAVAILABLE:'Penyedia riwayat transaksi sedang tidak dapat diakses.',
    VERIFIED_THREAT_MATCH:'Wallet cocok dengan entri ancaman yang sudah diverifikasi.',
    SPAM_ACTIVITY:'Aktivitas transaksi menunjukkan pola berulang yang perlu ditinjau.'
  };
  const activity = data.evidence?.wallet_activity;
  const sourceState = complete => complete ? 'Data tersedia' : 'Belum lengkap';
  const activitySummary = !data.simulation && activity ? (() => {
    const native = activity.native_transactions || {};
    const receipts = activity.receipts || {};
    const tokens = activity.fungible_token_transfers || {};
    const rows = [
      ['Transaksi NEAR', native.count || 0, sourceState(native.complete)],
      ['Receipts jaringan', receipts.count || 0, sourceState(receipts.complete)],
      ['Transfer token', tokens.count || 0, sourceState(tokens.complete)]
    ];
    return '<section class="wallet-activity-summary readable-activity"><div class="readable-section-title">Aktivitas wallet</div><div class="activity-count-grid">' +
      rows.map(row => '<div class="activity-count"><span>'+row[0]+'</span><b>'+Number(row[1]).toLocaleString()+'</b><small>'+row[2]+'</small></div>').join('') +
      '</div><a class="explorer-link" href="'+escapeHtml(activity.explorer_url || '#')+'" target="_blank" rel="noopener noreferrer">Lihat wallet di NEAR Explorer ↗</a></section>';
  })() : '';
  const factorMarkup = factors.length ? factors.map(item => {
    const code = String(item.code || 'INFO');
    const detail = descriptions[code] || String(item.detail || 'Sinyal ini tercatat dalam hasil pemeriksaan.');
    return '<li class="readable-factor"><b>'+escapeHtml(code.replaceAll('_',' '))+'</b><span>'+escapeHtml(detail)+'</span></li>';
  }).join('') : '<li class="readable-factor"><b>Tidak ada sinyal tambahan</b><span>Tidak ada faktor risiko lain yang dilaporkan oleh pemeriksaan ini.</span></li>';
  const score = Number.isFinite(Number(data.risk_score)) ? Number(data.risk_score) : 0;
  const scoreNote = verdict === 'INCOMPLETE' ? 'Skor belum dapat menggambarkan risiko karena data belum lengkap.' : 'Skor mengikuti aturan penilaian Sentinel; baca juga bukti dan status pemeriksaan.';
  const simulationNote = data.simulation
    ? '<p class="result-explanation"><b>SIMULASI</b> — Contoh lokal untuk menguji aturan, bukan temuan langsung dari jaringan.</p>'
    : '<p class="result-explanation">'+escapeHtml(config.note)+'</p>';
  const aiButton = data.simulation ? '' : '<button class="secondary-btn" id="aiExplain" type="button">Jelaskan hasil</button>';
  el.innerHTML = '<section class="result-overview result-'+verdict.toLowerCase()+'"><div class="result-status-line"><span class="result-status-dot"></span><span>'+escapeHtml(config.label)+'</span></div><h3>'+escapeHtml(config.title)+'</h3>'+simulationNote+
    '<div class="result-score-row"><div><span>Skor risiko</span><b>'+score+'/100</b></div><small>'+escapeHtml(scoreNote)+'</small></div></section>' +
    activitySummary +
    '<section class="result-factors"><div class="readable-section-title">Apa yang ditemukan?</div><ul class="readable-factor-list">'+factorMarkup+'</ul></section>' +
    '<div class="result-actions">'+aiButton+'<button class="secondary-btn" id="viewEvidence" type="button">Detail teknis</button></div><div id="aiExplanation"></div><pre id="evidenceJson" class="ai-text hidden"></pre>';
  if (!data.simulation) $('aiExplain').addEventListener('click', async () => {
    const button = $('aiExplain'); button.disabled = true; button.textContent = 'Menyiapkan…';
    try {
      const answer = await request('/ai-review',{method:'POST',body:JSON.stringify({investigation_id:data.id})});
      $('aiExplanation').innerHTML = '<p class="ai-text">'+escapeHtml(answer.explanation)+'</p>';
    } catch (error) {
      $('aiExplanation').innerHTML = '<p class="ai-text">Penjelasan AI sedang tidak tersedia. Hasil utama tetap berasal dari aturan keamanan dan data pemeriksaan.</p>';
      toast(error.message);
    } finally { button.disabled = false; button.textContent = 'Jelaskan hasil'; }
  });
  $('viewEvidence').addEventListener('click', () => {
    const evidence = $('evidenceJson');
    const opening = evidence.classList.contains('hidden');
    evidence.textContent = JSON.stringify(data.evidence || {},null,2);
    evidence.classList.toggle('hidden');
    $('viewEvidence').textContent = opening ? 'Tutup detail teknis' : 'Detail teknis';
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
