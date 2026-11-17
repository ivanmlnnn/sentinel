const STORAGE_KEY = "sentinel:near-copy-traders:v1";
const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/i;
const grid = document.getElementById("copyWatchlistGrid");
const leaderboardGrid = document.getElementById("copyTraderGrid");
const feedStatus = document.getElementById("copyTradeFeedStatus");
const refreshButton = document.getElementById("copyTradeRefresh");
const windowLabel = document.getElementById("copyTradeWindow");
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const form = document.getElementById("copyTraderForm");
const accountInput = document.getElementById("copyTraderAccount");

function loadTraders() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => item && typeof item.account === "string" &&
      ACCOUNT_RE.test(item.account) && typeof item.watching === "boolean").slice(0, 30);
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
  return { from: start.toISOString(), to: now.toISOString(),
    label: new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(now) };
}
function renderLeaderboard(rows) {
  if (!leaderboardGrid) return;
  leaderboardGrid.replaceChildren();
  const valid = Array.isArray(rows) ? rows.filter(item =>
    item && typeof item.account === "string" &&
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*\.(?:near|testnet)$/i.test(item.account) &&
    Number.isInteger(item.successfulSwaps) && item.successfulSwaps > 0 &&
    Number.isFinite(item.volumeUsd) && item.volumeUsd >= 0 &&
    typeof item.lastSwapAt === "string" && Number.isFinite(Date.parse(item.lastSwapAt))
  ) : [];
  if (!valid.length) {
    const empty = node("article", "copy-trader-empty");
    empty.append(node("b", "", "No matching Intents activity in this sample"));
    empty.append(node("p", "", "The Explorer returned no successful 1Click swaps with a NEAR Intents recipient in the fetched page. This is not proof that no trader activity exists outside this source or page."));
    leaderboardGrid.append(empty);
    return;
  }
  for (const trader of valid.slice(0, 12)) {
    const card = node("article", "copy-trader-card");
    const head = node("div", "copy-trader-card-head");
    head.append(node("div", "copy-trader-avatar", trader.account.slice(0, 2).toUpperCase()));
    const identity = node("div", "copy-trader-identity");
    identity.append(node("b", "", trader.account));
    identity.append(node("small", "", "NEAR INTENTS · 1CLICK ACTIVITY"));
    head.append(identity, node("span", "copy-trader-badge", "INDEXED"));
    card.append(head);
    const stats = node("div", "copy-trader-stats");
    for (const [label, value] of [
      ["SUCCESSFUL SWAPS", String(trader.successfulSwaps)],
      ["INPUT VOLUME", "$" + trader.volumeUsd.toFixed(2)],
      ["TX HASHES", String(trader.transactionCountWithHashes)],
      ["LAST SWAP", new Date(trader.lastSwapAt).toLocaleDateString()]
    ]) {
      const stat = node("div", "copy-trader-stat");
      stat.append(node("span", "", label), node("b", "", value));
      stats.append(stat);
    }
    card.append(stats);
    card.append(node("div", "copy-trader-status",
      "Indexed activity only · " + (trader.transactionHashes.length ? "NEAR transaction hashes available" : "No NEAR tx hash returned") + " · not a profitability score."));
    leaderboardGrid.append(card);
  }
}
async function refreshLeaderboard() {
  if (!leaderboardGrid) return;
  const window = monthWindow();
  if (windowLabel) windowLabel.textContent = window.label + " · " +
    new Date(window.from).toLocaleDateString() + " – " + new Date(window.to).toLocaleDateString() +
    " · latest Explorer page";
  if (refreshButton) { refreshButton.disabled = true; refreshButton.textContent = "↻ Checking…"; }
  try {
    const params = new URLSearchParams({ from: window.from, to: window.to });
    const response = await fetch("/api/copy-trade/leaderboard?" + params.toString(), {
      headers: { accept: "application/json" }, cache: "no-store"
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.status || payload?.reason || "HTTP_" + response.status);
    if (!payload || payload.ok !== true || payload.source !== "NEAR Intents Explorer API" ||
        payload.complete !== false || payload.coverage !== "single_page_only" ||
        !Array.isArray(payload.traders)) throw new Error("UNEXPECTED_EXPLORER_RESPONSE");
    renderLeaderboard(payload.traders);
    if (feedStatus) feedStatus.textContent =
      "NEAR Intents Explorer · " + payload.sampleSize + " rows sampled · partial page · updated " +
      new Date(payload.fetchedAt).toLocaleTimeString();
  } catch (error) {
    renderLeaderboard([]);
    const reason = String(error?.message || "SOURCE_UNAVAILABLE");
    if (feedStatus) feedStatus.textContent = reason === "DATA_SOURCE_OFFLINE"
      ? "DATA SOURCE OFFLINE · configure Worker JWT secret"
      : reason === "AUTHENTICATION_FAILED"
        ? "EXPLORER AUTH FAILED · check Partner JWT"
        : reason === "UPSTREAM_RATE_LIMITED"
          ? "EXPLORER RATE LIMITED · wait at least 5 seconds"
          : "EXPLORER DATA UNAVAILABLE · " + reason;
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
    empty.append(node("p", "", "Add a public NEAR account to create a local watchlist card. This does not establish trading performance or ownership."));
    grid.append(empty);
    return;
  }
  for (const trader of traders) {
    const card = node("article", "copy-trader-card");
    const head = node("div", "copy-trader-card-head");
    head.append(node("div", "copy-trader-avatar", trader.account.slice(0, 2).toUpperCase()));
    const identity = node("div", "copy-trader-identity");
    identity.append(node("b", "", trader.account));
    identity.append(node("small", "", "PUBLIC NEAR ACCOUNT · LOCAL WATCHLIST"));
    head.append(identity, node("span", "copy-trader-badge", "UNRANKED"));
    card.append(head);
    const stats = node("div", "copy-trader-stats");
    for (const [label, value] of [["REALIZED PNL", "Not available"], ["WIN RATE", "Not available"], ["MAX DRAWDOWN", "Not available"], ["TRADES INDEXED", "—"]]) {
      const stat = node("div", "copy-trader-stat");
      stat.append(node("span", "", label), node("b", "", value));
      stats.append(stat);
    }
    card.append(stats);
    card.append(node("div", "copy-trader-status", "Not ranked · Explorer recipient activity is not a full wallet trade ledger."));
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
    setStatus("Enter a valid public NEAR account ID."); accountInput?.focus(); return;
  }
  if (traders.some(item => item.account === account)) { setStatus("This wallet is already in your watchlist."); return; }
  if (traders.length >= 30) { setStatus("Watchlist limit reached (30 wallets)."); return; }
  traders.unshift({ account, watching: true, addedAt: new Date().toISOString() });
  save(); render(); form.reset();
  setStatus("Added locally. Trader performance is not verified.");
});
render();
