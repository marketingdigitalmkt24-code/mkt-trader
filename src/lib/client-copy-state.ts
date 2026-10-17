export function readCopyEnabled(config: { enabled?: boolean | null } | null | undefined): boolean {
  return config?.enabled === true;
}

export function canEnableCopy(config: { is_active?: boolean | null; last_connected_at?: string | null } | null | undefined): boolean {
  return config?.is_active === true && Boolean(config.last_connected_at);
}

export function readCopyAccount(config: { account_type?: string | null } | null | undefined): 'PRACTICE' | 'REAL' | null {
  if (config?.account_type === 'PRACTICE' || config?.account_type === 'REAL') return config.account_type;
  return null;
}