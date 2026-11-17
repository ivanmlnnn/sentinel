const STORAGE_KEY = "sentinel:near-copy-traders:v1";
const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/i;
const grid = document.getElementById("copyWatchlistGrid");
const leaderboardGrid = document.getElementById("copyTraderGrid");
const feedStatus = document.getElementById("copyTradeFeedStatus");
const refreshButton = document.getElementById("copyTradeRefresh");
const windowLabel = document.getElementById("copyTradeWindow");
const MIN_WIN_RATE = 80;
const MIN_CLOSED_TRADES = 20;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const form = document.getElementById("copyTraderForm");
const accountInput = document.getElementById("copyTraderAccount");
function loadTraders() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => item && typeof item.account === "string" &&
      ACCOUNT_RE.test(item.account) && typeof item.watching === "boolean")
      .slice(0, 30);
  } catch { return []; }
}
let traders = loadTraders();
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(traders)); }
  catch { setStatus("Browser storage is unavailable. Your watchlist may not persist."); }
}
function setStatus(message) {
  const note = document.querySelector(".copy-trade-toolbar-note");
  if (note) note.textContent = message;
}
function node(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}

function monthWindow(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: start.toISOString(), to: now.toISOString(), label: new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(now) };
}
function renderLeaderboard(rows) {
  if (!leaderboardGrid) return;
  leaderboardGrid.replaceChildren();
  const valid = Array.isArray(rows) ? rows.filter(item =>
    item && item.verified === true &&
    typeof item.account === "string" && ACCOUNT_RE.test(item.account) &&
    Number.isFinite(item.winRate) && item.winRate >= MIN_WIN_RATE && item.winRate <= 100 &&
    Number.isInteger(item.closedTrades) && item.closedTrades >= MIN_CLOSED_TRADES &&
    Number.isFinite(item.realizedPnlUsd) && Number.isFinite(item.feesUsd) &&
    Number.isFinite(item.holdingPeriodHours) && Number.isFinite(item.maxDrawdownPct) &&
    typeof item.source === "string" && item.source.length > 0 &&
    typeof item.observationStart === "string" && typeof item.observationEnd === "string"
  ).sort((a,b) => b.realizedPnlUsd - a.realizedPnlUsd) : [];
  if (!valid.length) {
    const empty = node("article", "copy-trader-empty");
    empty.append(node("b", "", "No verified traders meet the monthly criteria"));
    empty.append(node("p", "", "No leaderboard cards are shown until the source supplies receipt-attributed DEX fills and complete monthly performance metrics. This prevents stale or invented 80% win rates."));
    leaderboardGrid.append(empty);
    return;
  }
  for (const trader of valid.slice(0, 12)) {
    const card = node("article", "copy-trader-card");
    const head = node("div", "copy-trader-card-head");
    head.append(node("div", "copy-trader-avatar", trader.account.slice(0,2).toUpperCase()));
    const identity = node("div", "copy-trader-identity");
    identity.append(node("b", "", trader.account));
    identity.append(node("small", "", "VERIFIED DEX FILLS · " + trader.source));
    head.append(identity, node("span", "copy-trader-badge", "VERIFIED"));
    card.append(head);
    const stats = node("div", "copy-trader-stats");
    for (const [label,value] of [
      ["WIN RATE", trader.winRate.toFixed(1) + "%"],
      ["REALIZED PNL", "$" + trader.realizedPnlUsd.toFixed(2)],
      ["MAX DRAWDOWN", trader.maxDrawdownPct.toFixed(1) + "%"],
      ["CLOSED TRADES", String(trader.closedTrades)]
    ]) {
      const stat=node("div","copy-trader-stat");
      stat.append(node("span","",label),node("b","",value)); stats.append(stat);
    }
    card.append(stats);
    card.append(node("div","copy-trader-status","Monthly verified · fees $" + trader.feesUsd.toFixed(2) + " · avg hold " + trader.holdingPeriodHours.toFixed(1) + "h"));
    leaderboardGrid.append(card);
  }
}
async function refreshLeaderboard() {
  if (!leaderboardGrid) return;
  const window = monthWindow();
  if (windowLabel) windowLabel.textContent = window.label + " · " + new Date(window.from).toLocaleDateString() + " – " + new Date(window.to).toLocaleDateString();
  if (refreshButton) { refreshButton.disabled = true; refreshButton.textContent = "↻ Checking…"; }
  try {
    const params = new URLSearchParams({ period: "month", from: window.from, to: window.to, minWinRate: String(MIN_WIN_RATE), minClosedTrades: String(MIN_CLOSED_TRADES) });
    const response = await fetch("/api/copy-trade/leaderboard?" + params.toString(), { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error("HTTP_" + response.status);
    const payload = await response.json();
    if (!payload || payload.period !== "month" || !Array.isArray(payload.traders) || payload.verified !== true) throw new Error("UNVERIFIED_FEED");
    renderLeaderboard(payload.traders);
    if (feedStatus) feedStatus.textContent = "Verified source · updated " + new Date().toLocaleTimeString();
  } catch (error) {
    renderLeaderboard([]);
    if (feedStatus) feedStatus.textContent = "Leaderboard API not connected · rankings hidden";
  } finally {
    if (refreshButton) { refreshButton.disabled = false; refreshButton.textContent = "↻ Refresh"; }
  }
}
refreshButton?.addEventListener("click", refreshLeaderboard);
refreshLeaderboard();
window.setInterval(refreshLeaderboard, REFRESH_INTERVAL_MS);

function render() {
  if (!grid) return;
  grid.replaceChildren();
  if (!traders.length) {
    const empty = node("article", "copy-trader-empty");
    empty.append(node("div", "copy-empty-icon", "⌁"));
    empty.append(node("b", "", "Your watchlist is empty"));
    empty.append(node("p", "", "Add a public NEAR account to create a trader card. Sentinel will show verified on-chain metrics only when a DEX trade-history indexer is connected."));
    grid.append(empty);
    return;
  }
  for (const trader of traders) {
    const card = node("article", "copy-trader-card");
    const head = node("div", "copy-trader-card-head");
    head.append(node("div", "copy-trader-avatar", trader.account.slice(0, 2).toUpperCase()));
    const identity = node("div", "copy-trader-identity");
    identity.append(node("b", "", trader.account));
    identity.append(node("small", "", "NEAR MAINNET · PUBLIC WALLET"));
    head.append(identity, node("span", "copy-trader-badge", "UNRANKED"));
    card.append(head);
    const stats = node("div", "copy-trader-stats");
    for (const [label, value] of [["REALIZED PNL", "Not verified"], ["WIN RATE", "Not verified"], ["MAX DRAWDOWN", "Not verified"], ["TRADES INDEXED", "—"]]) {
      const stat = node("div", "copy-trader-stat");
      stat.append(node("span", "", label), node("b", "", value));
      stats.append(stat);
    }
    card.append(stats);
    card.append(node("div", "copy-trader-status", "Not ranked · no verified DEX performance feed is connected."));
    const actions = node("div", "copy-trader-actions");
    const copy = node("button", "", "Copy wallet address");
    copy.type = "button";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(trader.account); setStatus("Wallet address copied."); }
      catch { setStatus("Clipboard unavailable. Select the wallet address manually."); }
    });
    const remove = node("button", "", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => {
      traders = traders.filter(item => item.account !== trader.account);
      save(); render(); setStatus("Trader removed from this device.");
    });
    actions.append(copy, remove);
    card.append(actions);
    const follow = node("div", "copy-trader-follow");
    const label = node("label", "", trader.watching ? "Watching wallet" : "Watch wallet");
    label.append(node("small", "", "Local watchlist only · no orders copied"));
    const toggle = node("input");
    toggle.type = "checkbox";
    toggle.checked = trader.watching;
    toggle.setAttribute("aria-label", "Watch " + trader.account);
    toggle.addEventListener("change", () => {
      trader.watching = toggle.checked;
      save(); setStatus(toggle.checked ? "Wallet added to your local watchlist." : "Wallet watch paused.");
    });
    follow.append(label, toggle);
    card.append(follow);
    grid.append(card);
  }
}
form?.addEventListener("submit", event => {
  event.preventDefault();
  const account = String(accountInput?.value || "").trim().toLowerCase();
  if (!ACCOUNT_RE.test(account) || account.includes("..") || account.startsWith(".") || account.endsWith(".")) {
    setStatus("Enter a valid public NEAR account ID.");
    accountInput?.focus();
    return;
  }
  if (traders.some(item => item.account === account)) {
    setStatus("This wallet is already in your watchlist.");
    return;
  }
  if (traders.length >= 30) {
    setStatus("Watchlist limit reached (30 wallets).");
    return;
  }
  traders.unshift({ account, watching: true, addedAt: new Date().toISOString() });
  save(); render(); form.reset();
  setStatus("Added locally. Trader performance is not yet verified.");
});
render();
