const terminal = document.getElementById("agentTerminal");
if (terminal && !terminal.dataset.initialized) {
  terminal.dataset.initialized = "1";
  const output = terminal.querySelector("#agentTerminalOutput");
  const form = terminal.querySelector("#agentTerminalForm");
  const prompt = terminal.querySelector("#agentTerminalPrompt");
  const submit = terminal.querySelector("#agentTerminalSubmit");
  const status = terminal.querySelector("#agentTerminalStatus");

  function line(message, kind = "") {
    const row = document.createElement("p");
    row.className = "agent-terminal-line" + (kind ? " is-" + kind : "");
    const prefix = document.createElement("span");
    prefix.className = "prefix";
    prefix.textContent = kind === "error" ? "✕ " : kind === "result" ? "✓ " : "› ";
    row.append(prefix, document.createTextNode(String(message)));
    output.append(row);
    output.scrollTop = output.scrollHeight;
  }

  async function tokenHeaders() {
    const headers = { "content-type": "application/json" };
    if (typeof window.getSentinelAccessToken !== "function") throw new Error("Sesi login belum siap. Muat ulang halaman setelah sign-in.");
    const token = await window.getSentinelAccessToken();
    if (!token) throw new Error("Sesi autentikasi tidak tersedia. Login kembali.");
    headers.authorization = "Bearer " + token;
    return headers;
  }

  async function loadStatus() {
    try {
      const headers = await tokenHeaders();
      const response = await fetch("/api/terminal/status", { headers, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Terminal status unavailable");
      status.textContent = data.status === "online" ? "PRODUCTION ONLINE" : "OFFLINE";
      line("Connected to Sentinel production agent runtime · " + data.network.toUpperCase(), "muted");
      line("User Mode: enabled · authenticated production Agent API", "result");
      line("Developer Mode: locked · one-time delegated wallet authorization is not configured.", "muted");
      line("No shell commands are executed. Agent tools are typed and policy-gated.", "muted");
    } catch (error) {
      status.textContent = "AUTH REQUIRED";
      line(error.message || "Could not connect to production terminal.", "error");
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const text = prompt.value.trim();
    if (!text || submit.disabled) return;
    submit.disabled = true;
    submit.textContent = "RUNNING…";
    status.textContent = "AGENT WORKING";
    line("USER: " + text);
    line("Routing task to /api/terminal/run → /api/agent/run", "muted");
    try {
      const headers = await tokenHeaders();
      headers["Idempotency-Key"] = crypto.randomUUID();
      const response = await fetch("/api/terminal/run", {
        method: "POST",
        headers,
        body: JSON.stringify({ mode: "user", prompt: text })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(data?.message || data?.error || "Agent request failed (" + response.status + ")");
      line("AGENT STATUS: " + String(data.status || "COMPLETED"), "result");
      if (data.message || data.agent_message) line(data.message || data.agent_message, "result");
      if (data.investigation) {
        const inv = data.investigation;
        line("INVESTIGATION: " + (inv.receiver_account || "unknown") + " · " + (inv.decision || "INCOMPLETE") +
          (Number.isFinite(inv.risk_score) ? " · risk " + inv.risk_score : ""), "result");
        if (Array.isArray(inv.risk_factors)) {
          for (const factor of inv.risk_factors.slice(0, 8)) {
            line("[" + String(factor.severity || "info").toUpperCase() + "] " + String(factor.code || "FINDING") + " — " + String(factor.detail || ""), "muted");
          }
        }
      }
      if (data.proposal) line("PAYMENT PROPOSAL: " + String(data.proposal.amount_near ?? "?") + " NEAR → " + String(data.proposal.receiver_account || "?") + " · " + (data.execution_enabled ? "EXECUTED" : "NOT EXECUTED"), data.execution_enabled ? "result" : "muted");
      if (data.transaction_hash) line("TX: " + data.transaction_hash, "result");
      if (!data.message && !data.agent_message && !data.investigation && !data.proposal) line(JSON.stringify(data), "muted");
      prompt.value = "";
      status.textContent = "READY";
    } catch (error) {
      line(error.message || "Agent execution failed.", "error");
      status.textContent = "REQUEST FAILED";
    } finally {
      submit.disabled = false;
      submit.textContent = "EXECUTE TASK";
      prompt.focus();
    }
  });

  terminal.querySelector("#agentTerminalClear").addEventListener("click", () => {
    output.replaceChildren();
    line("Terminal output cleared. Production session remains active.", "muted");
  });

  loadStatus();
}
