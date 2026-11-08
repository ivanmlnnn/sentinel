import { setupWalletSelector } from 'https://esm.sh/@near-wallet-selector/core@10';
import { setupModal } from 'https://esm.sh/@near-wallet-selector/modal-ui-js@10';

const $ = (id) => document.getElementById(id);
const API = window.__HATCHABLE__?.api || '/api';
let walletSelector, walletModal, connectedAccount = null, walletReady = false;
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2800)}
function short(value){return value&&value.length>28?value.slice(0,13)+'…'+value.slice(-9):value}
async function request(path,options={}){const r=await fetch(API+path,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});const data=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok)throw new Error(data.error||'Request failed');return data}
async function initWallet(){
 const button=$('walletBtn');
 button.disabled=true;button.textContent='Loading NEAR wallets…';
 try{
  const walletPackages=['near-snap','hot-wallet','meteor-wallet','here-wallet','sender','nightly'];
  const loaded=await Promise.allSettled(walletPackages.map(async name=>{
   const mod=await import('https://esm.sh/@near-wallet-selector/'+name+'@10');
   const factory=Object.entries(mod).find(([key,value])=>key.startsWith('setup')&&typeof value==='function')?.[1];
   if(!factory)throw new Error('No wallet factory: '+name);
   return factory();
  }));
  const modules=loaded.filter(x=>x.status==='fulfilled').map(x=>x.value);
  if(!modules.length)throw new Error('No NEAR wallet providers could be loaded');
  walletSelector=await setupWalletSelector({network:'testnet',modules,optimizeWalletOrder:true});
  walletModal=setupModal(walletSelector);
  const update=()=>{
   const state=walletSelector.store.getState();
   connectedAccount=state.accounts?.find(a=>a.active)?.accountId||state.accounts?.[0]?.accountId||null;
   button.disabled=false;
   button.textContent=connectedAccount?short(connectedAccount)+' · Connected':'Connect NEAR wallet ↗';
   button.classList.toggle('wallet-connected',!!connectedAccount);
   const sender=$('sender');
   if(connectedAccount){sender.value=connectedAccount;sender.placeholder='Connected NEAR account'}
   else if(sender.dataset.walletAutofill==='1'){sender.value='';sender.placeholder='Connect wallet'}
   sender.dataset.walletAutofill=connectedAccount?'1':'0';
  };
  walletSelector.store.observable.subscribe(update);
  update();
  button.addEventListener('click',async()=>{
   if(!walletReady){toast('Wallet selector is still initializing');return}
   if(connectedAccount){
    button.disabled=true;
    try{await walletSelector.signOut();toast('Wallet disconnected')}
    catch(e){toast('Disconnect failed: '+(e.message||'Please retry'))}
    finally{button.disabled=false}
   }else{
    try{walletModal.show()}
    catch(e){toast('Could not open wallet picker: '+(e.message||'Please retry'))}
   }
  });
  walletReady=true;
 }catch(e){
  console.error('NEAR wallet initialization failed',e);
  button.disabled=false;button.textContent='Wallet unavailable · Retry';
  button.addEventListener('click',()=>initWallet(),{once:true});
  toast('NEAR wallet providers failed to load. Check connection and retry.');
 }
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderResult(data){
 const el=$('result');el.classList.remove('hidden');
 const color={ALLOW:'var(--green)',WARN:'var(--amber)',BLOCK:'var(--red)'}[data.decision]||'var(--muted)';
 el.innerHTML='<div class="result-top"><b class="result-verdict" style="color:'+color+'">'+escapeHtml(data.decision)+' · '+Number(data.risk_score)+'/100 RISK</b><span class="result-score">ID '+escapeHtml(String(data.id||'').slice(0,8))+'</span></div><ul>'+(data.risk_factors||[]).map(f=>'<li><b>'+escapeHtml(f.code)+'</b> — '+escapeHtml(f.detail)+'</li>').join('')+'</ul><div class="result-actions"><button class="secondary-btn" id="aiExplain">Explain evidence</button><button class="secondary-btn" id="viewEvidence">Evidence JSON</button></div><div id="aiExplanation"></div><pre id="evidenceJson" class="ai-text hidden"></pre>';
 $('aiExplain').addEventListener('click',async()=>{const b=$('aiExplain');b.disabled=true;b.textContent='Loading…';try{const r=await request('/ai-review',{method:'POST',body:JSON.stringify({investigation_id:data.id})});$('aiExplanation').innerHTML='<p class="ai-text">'+escapeHtml(r.explanation)+'</p>'}catch(e){$('aiExplanation').innerHTML='<p class="ai-text">AI explanation is unavailable. The deterministic verdict and evidence remain available.</p>';toast(e.message)}finally{b.disabled=false;b.textContent='Explain evidence'}});
 $('viewEvidence').addEventListener('click',()=>{$('evidenceJson').textContent=JSON.stringify(data.evidence,null,2);$('evidenceJson').classList.toggle('hidden')});
}
async function loadMetrics(){
 try{const d=await request('/metrics');$('mTotal').textContent=d.totals.total??0;$('mAllowed').textContent=d.totals.allowed??0;$('mWarned').textContent=d.totals.warned??0;$('mBlocked').textContent=d.totals.blocked??0;$('threatTotal').textContent=d.threats.total??0;$('threatVerified').textContent=d.threats.verified??0;
 $('recentList').innerHTML=d.recent.length?d.recent.map(x=>'<div class="recent-item"><div><div class="recent-address">'+escapeHtml(x.receiver_account)+'</div><div class="recent-meta">'+new Date(x.created_at).toLocaleString()+' · '+Number(x.amount_near).toLocaleString()+' NEAR</div></div><span class="pill '+escapeHtml(x.decision)+'">'+escapeHtml(x.decision)+'</span><span class="recent-score">'+Number(x.risk_score)+'/100</span></div>').join(''):'<div class="empty-state">No inspection records.</div>';
 }catch(e){$('recentList').innerHTML='<div class="empty-state">Metrics unavailable: '+escapeHtml(e.message)+'</div>'}
}
async function loadThreats(){try{const d=await request('/threats');$('threatList').innerHTML=d.reports.slice(0,5).map(x=>'<div class="threat-item"><div><b>'+escapeHtml(x.account_id)+'</b><small>'+escapeHtml(x.category)+'</small></div><span class="threat-status">'+escapeHtml(x.status.toUpperCase())+'</span></div>').join('')||'<div class="empty-state">No reports submitted.</div>'}catch(e){console.warn(e)}}
$('investigateForm').addEventListener('submit',async e=>{e.preventDefault();const b=$('scanBtn');b.disabled=true;b.textContent='Reading NEAR RPC…';$('result').classList.add('hidden');try{const data=await request('/investigate',{method:'POST',body:JSON.stringify({receiver_account:$('receiver').value.trim(),sender_account:$('sender').value.trim()||connectedAccount,amount_near:Number($('amount').value||0)})});renderResult(data);await loadMetrics();toast('Inspection complete: '+data.decision)}catch(err){toast(err.message)}finally{b.disabled=false;b.innerHTML='Run inspection <b>↗</b>'}});
$('pasteReceiver').addEventListener('click',async()=>{try{$('receiver').value=await navigator.clipboard.readText()}catch(e){toast('Clipboard permission unavailable')}});
$('refreshBtn').addEventListener('click',()=>{loadMetrics();loadThreats();toast('Data refreshed')});
$('reportBtn').addEventListener('click',()=>$('reportForm').classList.toggle('hidden'));
$('sendReport').addEventListener('click',async()=>{const b=$('sendReport');b.disabled=true;try{await request('/threats',{method:'POST',body:JSON.stringify({account_id:$('reportAccount').value,category:$('reportCategory').value,evidence:$('reportEvidence').value,reporter:connectedAccount||'anonymous'})});toast('Report submitted for verification');$('reportForm').classList.add('hidden');$('reportAccount').value='';$('reportCategory').value='';$('reportEvidence').value='';await loadMetrics();await loadThreats()}catch(e){toast(e.message)}finally{b.disabled=false}});
initWallet();loadMetrics();loadThreats();