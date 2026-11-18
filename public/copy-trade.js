const STORAGE_KEY = "sentinel:near-copy-traders:v1";
const ACCOUNT_RE = /^(?=.{2,64}$)(?:[a-z0-9]+(?:[._-][a-z0-9]+)*\.near|[a-f0-9]{64})$/i;
const grid = document.getElementById("copyWatchlistGrid");
const leaderboardGrid = document.getElementById("copyTraderGrid");
const feedStatus = document.getElementById("copyTradeFeedStatus");
const windowLabel = document.getElementById("copyTradeWindow");
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
function formatUsd(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}
function renderActivityCards(cards) {
  if (!leaderboardGrid) return;
  leaderboardGrid.replaceChildren();
  if (!cards.length) {
    const empty = node("article", "copy-trader-empty");
    empty.append(node("b", "", "No matching Intents recipient activity"));
    empty.append(node("p", "", "No successful 1Click swaps to recognizable NEAR account recipients were found in the sampled current-month page."));
    leaderboardGrid.append(empty);
    return;
  }
  for (const item of cards) {
    const card = node("article", "copy-trader-card");
    const head = node("div", "copy-trader-card-head");
    head.append(node("div", "copy-trader-avatar", item.account.slice(0, 2).toUpperCase()));
    const identity = node("div", "copy-trader-identity");
    identity.append(node("b", "", item.account));
    identity.append(node("small", "", "NEAR INTENTS RECIPIENT · MAINNET"));
    head.append(identity, node("span", "copy-trader-badge", "UNRANKED"));
    card.append(head);
    const stats = node("div", "copy-trader-stats");
    for (const [label, value] of [
      ["SUCCESSFUL INTENTS", String(item.successfulIntents)],
      ["RECEIVED VALUE", formatUsd(item.receivedValueUsd)],
      ["LATEST ACTIVITY", item.latestActivity ? new Date(item.latestActivity).toLocaleDateString() : "Unknown"],
      ["TX HASHES OBSERVED", String((item.transactionHashes || []).length)]
    ]) {
      const stat = node("div", "copy-trader-stat");
      stat.append(node("span", "", label), node("b", "", value));
      stats.append(stat);
    }
    card.append(stats);
    card.append(node("div", "copy-trader-status", "Activity only · recipient is not proof of trader ownership, realized PnL, or complete DEX history."));
    const actions = node("div", "copy-trader-actions");
    const copy = node("button", "", "Copy account");
    copy.type = "button";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(item.account); setStatus("NEAR account copied."); }
      catch { setStatus("Clipboard unavailable. Select the account manually."); }
    });
    const explorer = node("a", "", "View Explorer");
    explorer.href = "https://explorer.near.org/accounts/" + encodeURIComponent(item.account);
    explorer.target = "_blank";
    explorer.rel = "noopener noreferrer";
    actions.append(copy, explorer);
    card.append(actions);
    leaderboardGrid.append(card);
  }
}
async function loadActivityCards() {
  if (!leaderboardGrid) return;
  if (feedStatus) feedStatus.textContent = "LOADING NEAR INTENTS ACTIVITY…";
  try {
    const response = await fetch("/api/copy-trade/leaderboard", {
      headers: { accept: "application/json" },
      credentials: "same-origin"
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "NEAR Intents activity is unavailable.");
    }
    renderActivityCards(Array.isArray(payload.cards) ? payload.cards : []);
    if (feedStatus) feedStatus.textContent =
      "NEAR INTENTS · " + payload.sampledTransactions + "/" + payload.sampleLimit + " TRANSACTIONS SAMPLED · NOT A PROFIT RANKING";
    if (windowLabel) windowLabel.textContent = "Current month · successful 1Click swaps · NEAR recipients";
  } catch (error) {
    const empty = node("article", "copy-trader-empty");
    empty.append(node("b", "", "NEAR Intents activity is unavailable"));
    empty.append(node("p", "", error instanceof Error ? error.message : "Explorer data could not be loaded."));
    leaderboardGrid.replaceChildren(empty);
    if (feedStatus) feedStatus.textContent = "EXPLORER UNAVAILABLE · CHECK SERVER-SIDE PARTNER JWT";
  }
}
loadActivityCards();

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
    for (const [label, value] of [["VERIFIED PNL", "Not available"], ["WIN RATE", "Not available"], ["MAX DRAWDOWN", "Not available"], ["TRADES INDEXED", "—"]]) {
      const stat = node("div", "copy-trader-stat");
      stat.append(node("span", "", label), node("b", "", value));
      stats.append(stat);
    }
    card.append(stats);
    card.append(node("div", "copy-trader-status", "Saved locally only · no per-wallet activity feed is queried for this account."));
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
      save(); render(); setStatus("Wallet removed from this device.");
    });
    actions.append(copy, remove);
    card.append(actions);
    const follow = node("div", "copy-trader-follow");
    const label = node("label", "", trader.watching ? "Saved in watchlist" : "Save to watchlist");
    label.append(node("small", "", "Local bookmark only · no per-wallet activity feed is queried"));
    const toggle = node("input");
    toggle.type = "checkbox";
    toggle.checked = trader.watching;
    toggle.setAttribute("aria-label", "Save " + trader.account + " to watchlist");
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
  setStatus("Saved locally. This account is not being polled for activity.");
});
render();
