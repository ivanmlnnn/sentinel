const PRESETS = {
  treasury: { name: 'Treasury Sentinel', role: 'Treasury & payment operations', mission: 'Monitor treasury health, prepare policy-compliant payments, reconcile activity, and explain every movement.', skills: ['Wallet risk checks','Payment preparation','Spend monitoring','Reconciliation'], autonomy: 'Guarded execution', differentiator: 'Every proposed movement is checked against recipient history, exact intent, and spend policy before execution.' },
  defi: { name: 'DeFi Strategist', role: 'DeFi research & portfolio operations', mission: 'Compare opportunities, inspect protocol and counterparty risk, simulate routes, and prepare bounded Testnet strategies.', skills: ['Market research','Protocol risk review','Swap quote comparison','Position monitoring'], autonomy: 'Research + approval gates', differentiator: 'Strategy quality is scored together with execution risk; a profitable route can still be rejected.' },
  guardian: { name: 'Contract Guardian', role: 'Smart-contract security', mission: 'Watch contract changes, permissions, suspicious interactions, and deployment events; produce evidence-linked alerts.', skills: ['Contract watch','Permission diff','Threat intelligence','Incident triage'], autonomy: 'Read-only monitoring', differentiator: 'Tracks what changed and why it matters, not just a generic risk score.' },
  dao: { name: 'DAO Operations Agent', role: 'DAO governance & operations', mission: 'Summarize proposals, map execution dependencies, detect suspicious governance changes, and prepare transparent action plans.', skills: ['Proposal analysis','Governance monitoring','Treasury impact','Execution checklist'], autonomy: 'Prepare, never self-vote', differentiator: 'Separates community sentiment, verified facts, and executable on-chain effects.' },
  scout: { name: 'Opportunity Scout', role: 'Research & ecosystem discovery', mission: 'Discover projects, compare evidence, identify ecosystem opportunities, and maintain a traceable research log.', skills: ['Ecosystem discovery','Evidence grading','Project comparison','Research briefs'], autonomy: 'Research only', differentiator: 'Every finding carries source quality and uncertainty; missing evidence is never scored as safe.' },
  custom: { name: 'My Sentinel Agent', role: 'Custom specialist', mission: '', skills: ['Custom workflow'], autonomy: 'Choose per skill', differentiator: 'A custom specialist built around your workflow and Sentinel policy.' }
};
const $ = id => document.getElementById(id);
function mountFoundry() {
  if ($('agentFoundry')) return;
  const anchor = $('protocol');
  if (!anchor) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = '/agent-foundry.css?v=20261112-foundry1';
  document.head.append(link);
  const section = document.createElement('section');
  section.id = 'agentFoundry'; section.className = 'agent-foundry reveal';
  section.innerHTML = `
    <div class="foundry-heading"><div><span class="section-index">04 / AGENT CREATION STUDIO</span><h2>Agent Foundry</h2><p>No agent fits your mission? Forge a specialist. Start from a blueprint or describe a role that does not exist yet.</p></div><span class="foundry-live-tag"><i></i> DESIGN STUDIO</span></div>
    <div class="foundry-layout">
      <div class="foundry-main panel">
        <div class="foundry-step-label">01 · CHOOSE A STARTING DNA</div>
        <div class="foundry-presets" role="group" aria-label="Agent blueprint">
          <button type="button" class="foundry-preset is-active" data-preset="treasury"><b>◈</b><strong>Treasury</strong><small>Payments & controls</small></button>
          <button type="button" class="foundry-preset" data-preset="defi"><b>⌁</b><strong>DeFi Strategist</strong><small>Research & routes</small></button>
          <button type="button" class="foundry-preset" data-preset="guardian"><b>⛨</b><strong>Contract Guardian</strong><small>Security watch</small></button>
          <button type="button" class="foundry-preset" data-preset="dao"><b>⌘</b><strong>DAO Ops</strong><small>Governance</small></button>
          <button type="button" class="foundry-preset" data-preset="scout"><b>⌕</b><strong>Opportunity Scout</strong><small>Discovery</small></button>
          <button type="button" class="foundry-preset" data-preset="custom"><b>＋</b><strong>Invent your own</strong><small>Unbounded brief</small></button>
        </div>
        <div class="foundry-step-label">02 · DEFINE THE MISSION</div>
        <div class="foundry-fields">
          <label>AGENT NAME<input id="foundryName" maxlength="48" value="Treasury Sentinel" placeholder="Give your agent a name"></label>
          <label>SPECIALTY<input id="foundryRole" maxlength="80" value="Treasury & payment operations" placeholder="What is this agent responsible for?"></label>
          <label class="foundry-wide">MISSION & CREATIVE BRIEF<textarea id="foundryMission" maxlength="1200" rows="4" placeholder="Describe a problem no existing agent solves. What should it discover, decide, and deliver?"></textarea></label>
          <label class="foundry-wide">SKILLS (comma separated)<input id="foundrySkills" maxlength="240" value="Wallet risk checks, Payment preparation, Spend monitoring, Reconciliation" placeholder="Research, monitor, simulate…"></label>
          <label>AUTONOMY PROFILE<select id="foundryAutonomy"><option>Research only</option><option>Prepare, ask before execution</option><option selected>Guarded execution</option><option>Custom per skill</option></select></label>
          <label>NETWORK<select id="foundryNetwork"><option>NEAR Testnet · sandbox</option><option>Read-only · any supported network</option></select></label>
        </div>
        <div class="foundry-innovation"><b>DON'T CLONE ANOTHER AGENT</b><p id="foundryDifferentiator">Every proposed movement is checked against recipient history, exact intent, and spend policy before execution.</p></div>
        <div class="foundry-actions"><button type="button" class="primary-btn" id="foundryGenerate">Forge agent blueprint ↗</button><button type="button" class="secondary-btn" id="foundryReset">Reset</button></div>
        <p class="foundry-footnote">Blueprint generation is local to this page. It does not deploy an agent, connect a wallet, grant permissions, or execute transactions.</p>
      </div>
      <aside class="foundry-side">
        <div class="panel foundry-identity"><span class="foundry-side-kicker">THE SENTINEL DIFFERENCE</span><h3>Not just an agent. An agent with a security constitution.</h3>
          <div class="foundry-edge"><b>01 / INTENT GRAPH</b><span>Breaks goals into verifiable steps, dependencies, and stop conditions.</span></div>
          <div class="foundry-edge"><b>02 / PROOF-CARRYING ACTIONS</b><span>Each action must carry matching policy evidence before execution can be considered.</span></div>
          <div class="foundry-edge"><b>03 / ADVERSARIAL SELF-REVIEW</b><span>Challenges its own plan for prompt injection, recipient substitution, and hidden side effects.</span></div>
          <div class="foundry-edge"><b>04 / ANOMALY CIRCUIT BREAKER</b><span>Blocks the action and can freeze the session when behavior leaves its approved envelope.</span></div>
          <div class="foundry-edge"><b>05 / EXPLAINABLE AUTONOMY</b><span>Shows what it can do, what it cannot do, and why each boundary exists.</span></div>
        </div>
        <div class="panel foundry-output" id="foundryOutput" aria-live="polite"><span class="foundry-side-kicker">02 / BLUEPRINT OUTPUT</span><h3>Your agent has not been forged yet.</h3><p>Choose a starting DNA, describe your mission, then generate a blueprint to inspect its identity and boundaries.</p><div class="foundry-output-empty">◈</div></div>
      </aside>
    </div>`;
  anchor.parentNode.insertBefore(section, anchor);
  const presets = section.querySelectorAll('[data-preset]');
  const fill = key => {
    const p = PRESETS[key]; if (!p) return;
    presets.forEach(button => button.classList.toggle('is-active', button.dataset.preset === key));
    $('foundryName').value = p.name; $('foundryRole').value = p.role;
    $('foundryMission').value = p.mission; $('foundrySkills').value = p.skills.join(', ');
    $('foundryAutonomy').value = p.autonomy; $('foundryDifferentiator').textContent = p.differentiator;
    section.dataset.preset = key;
  };
  presets.forEach(button => button.addEventListener('click', () => fill(button.dataset.preset)));
  $('foundryGenerate').addEventListener('click', () => {
    const name = $('foundryName').value.trim(), role = $('foundryRole').value.trim(), mission = $('foundryMission').value.trim();
    if (!name || !role || !mission) { $('foundryOutput').innerHTML = '<span class="foundry-side-kicker">INCOMPLETE BLUEPRINT</span><h3>Give your agent a mission.</h3><p>Name, specialty, and mission are required. Be ambitious; Sentinel will keep the execution boundaries explicit.</p>'; return; }
    const blueprint = {
      schema: 'sentinel.agent-blueprint.v1',
      id: 'draft-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)),
      name, specialty: role, mission,
      skills: $('foundrySkills').value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 12),
      autonomy: $('foundryAutonomy').value,
      network: $('foundryNetwork').value,
      sentinel_constitution: {
        intent_graph: true, proof_carrying_actions: true, adversarial_self_review: true,
        anomaly_circuit_breaker: true, explainable_permissions: true,
        deny_on: ['verified anomaly','policy violation','recipient or amount mismatch','expired or replayed authorization','incomplete critical evidence'],
        never_assume: ['wallet approval','delegated session','contract deployment','mainnet readiness']
      },
      status: 'BLUEPRINT_ONLY_NOT_DEPLOYED'
    };
    const output = $('foundryOutput'); output.replaceChildren();
    const kicker = document.createElement('span'); kicker.className = 'foundry-side-kicker'; kicker.textContent = 'BLUEPRINT GENERATED · NOT DEPLOYED';
    const title = document.createElement('h3'); title.textContent = name;
    const summary = document.createElement('p'); summary.textContent = role + ' · ' + blueprint.skills.length + ' skills · ' + blueprint.autonomy;
    const pre = document.createElement('pre'); pre.textContent = JSON.stringify(blueprint, null, 2);
    const actions = document.createElement('div'); actions.className = 'foundry-output-actions';
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'secondary-btn'; copy.textContent = 'Copy blueprint JSON';
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(JSON.stringify(blueprint, null, 2)); copy.textContent = 'Copied ✓'; } catch { copy.textContent = 'Clipboard unavailable'; } });
    actions.append(copy); output.append(kicker, title, summary, pre, actions);
    output.dataset.blueprintId = blueprint.id;
  });
  $('foundryReset').addEventListener('click', () => { fill('custom'); $('foundryMission').value = ''; $('foundryOutput').innerHTML = '<span class="foundry-side-kicker">BLUEPRINT OUTPUT</span><h3>Your agent has not been forged yet.</h3><p>Describe a mission and generate a blueprint.</p>'; });
  fill('treasury');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountFoundry, { once: true });
else mountFoundry();
