const ASSETS = ['BTC', 'ETH', 'NEAR', 'USDC', 'USDT', 'SOL', 'WNEAR'];

export function buildTradeSkillDraft(prompt) {
  const text = String(prompt || '').trim().slice(0, 4000);
  const negatedAction = /\b(don't|do not|never|jangan|tidak|bukan)\s+(?:buy|sell|swap|trade|beli|jual|tukar)\b/i.test(text);
  const action = negatedAction ? null
    : /\b(sell|jual)\b/i.test(text) ? 'SELL'
    : /\b(swap|tukar|exchange)\b/i.test(text) ? 'SWAP'
    : /\b(buy|beli|dca)\b/i.test(text) ? 'BUY' : null;
  const mentions = ASSETS.map(symbol => ({
    symbol,
    index: text.search(new RegExp('\\b' + symbol + '\\b', 'i'))
  })).filter(item => item.index >= 0).sort((a, b) => a.index - b.index);
  const amountMatch = text.match(/\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(USD|USDC|USDT|BTC|ETH|NEAR|SOL|WNEAR)\b/i);
  const amount = amountMatch ? Number(amountMatch[1] || amountMatch[2]) : null;
  const amountUnit = amountMatch?.[3] ? amountMatch[3].toUpperCase() : (amountMatch?.[1] ? 'USD' : null);
  const schedule = /\b(hourly|every hour|per jam)\b/i.test(text) ? 'HOURLY'
    : /\b(daily|every day|setiap hari|harian)\b/i.test(text) ? 'DAILY'
    : /\b(weekly|every week|setiap minggu|mingguan|monday|senin|friday|jumat)\b/i.test(text) ? 'WEEKLY'
    : /\b(monthly|every month|setiap bulan|bulanan)\b/i.test(text) ? 'MONTHLY' : 'ON_DEMAND';
  const fromAsset = action === 'SWAP' ? mentions[0]?.symbol || null : null;
  const toAsset = action === 'SWAP' ? mentions[1]?.symbol || null : null;
  const asset = action === 'SWAP' ? null : mentions[0]?.symbol || null;
  return {
    skill_id: 'sentinel.trade.' + (action || 'unknown').toLowerCase() + '.draft',
    skill_version: 1,
    action,
    asset,
    from_asset: fromAsset,
    to_asset: toAsset,
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    amount_unit: amountUnit,
    schedule,
    leverage_requested: /\b(use|enable|with|pakai|gunakan)\s+(?:any\s+)?(?:leverage|margin|futures)\b/i.test(text)
      && !/\b(don't|do not|not|without|jangan|tanpa)\s+(?:use\s+)?(?:any\s+)?(?:leverage|margin|futures)\b/i.test(text),
    source_prompt: text,
    execution_mode: 'DRAFT_ONLY',
    approval_status: 'NOT_APPROVED',
    execution_status: 'DISABLED_NO_TRADING_ADAPTER'
  };
}
