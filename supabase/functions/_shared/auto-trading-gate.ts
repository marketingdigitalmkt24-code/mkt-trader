// Principal IQ Option entries and copies only run while the admin's Auto Trading switch is on.
type Db = {
  rpc: (name: string) => PromiseLike<{ data: unknown; error: unknown }>;
  from: (table: string) => any;
};

export function autoTradingAllows(row: { auto_trading_enabled?: boolean | null } | null | undefined): boolean {
  return row?.auto_trading_enabled === true;
}

export async function masterAutoTradingEnabled(db: Db): Promise<boolean> {
  const { data, error } = await db.rpc('get_master_iq_config');
  const master = !error && Array.isArray(data) && data.length === 1 ? data[0] as { user_id?: string } : null;
  if (!master?.user_id) return false;
  const { data: settings, error: settingsError } = await db.from('user_trading_settings')
    .select('auto_trading_enabled').eq('user_id', master.user_id).maybeSingle();
  return !settingsError && autoTradingAllows(settings);
}
