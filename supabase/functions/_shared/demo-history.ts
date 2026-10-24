type Position = Record<string, any>;
export function demoHistoryOutcome(pos: Position) {
 const raw = pos.raw_event?.binary_options_option_changed1;
 const digital = pos.raw_event?.digital_options_position_changed1;
 const ids = [pos.option_id, pos.position_id, pos.external_id, pos.id, pos.order_id,
  raw?.id, raw?.option_id, digital?.order_id,
  ...(Array.isArray(pos.order_ids) ? pos.order_ids : []),
  ...(Array.isArray(digital?.order_ids) ? digital.order_ids : [])]
  .filter(v => v != null && /^\d+$/.test(String(v))).map(String);
 const explicit = raw?.result || pos.close_reason || pos.result || pos.win;
 const terminal = ['win','loose','loss','equal','tie'].includes(explicit);
 if (!(pos.status === 'closed' || pos.close_time || pos.close_at || terminal)) return null;
 const value = pos.pnl_net ?? pos.pnl ?? pos.close_profit ?? pos.profit ?? pos.close_profit_amount ?? pos.net_profit;
 let profit = value == null ? NaN : Number(value);
 if ((!Number.isFinite(profit) || profit === 0) && pos.win_amount != null) {
  const investment = pos.amount ?? pos.invest ?? pos.investment ?? pos.buy_amount ?? pos.open_amount;
  if (investment != null && Number.isFinite(Number(investment)) && Number.isFinite(Number(pos.win_amount))) {
   profit = Number(pos.win_amount) - Number(investment);
  }
 }
 if (!Number.isFinite(profit) || !ids.length) return null;
 const result = explicit === 'win' ? 'win' : ['loose','loss'].includes(explicit) ? 'loss'
  : ['equal','tie'].includes(explicit) ? 'tie' : profit > 0 ? 'win' : profit < 0 ? 'loss' : 'tie';
 return { ids, profit, result };
}