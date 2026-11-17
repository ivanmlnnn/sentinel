const STORAGE_KEY = "sentinel:near-copy-traders:v1";
const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/i;
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
// Profitability ranking is intentionally locked. The connected public Explorer
// data cannot prove trader ownership, complete DEX fills, or realized PnL.
if (windowLabel) windowLabel.textContent = "Monthly eligibility · 20+ closed trades · ≥80% win rate";
if (feedStatus) feedStatus.textContent = "VERIFIED TRADER LEADERBOARD LOCKED · performance source not integrated";
if (leaderboardGrid) {
  const empty = node("article", "copy-trader-empty");
  empty.append(node("b", "", "No verified traders qualify for display yet"));
  empty.append(node("p", "", "Sentinel requires receipt-attributed settled DEX fills, realized PnL after fees, holding periods, drawdown, and a complete monthly observation window. No cards appear until every metric is verifiable."));
  leaderboardGrid.replaceChildren(empty);
}

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
