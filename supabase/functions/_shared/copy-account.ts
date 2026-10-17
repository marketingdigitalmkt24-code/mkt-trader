export function readCopyAccount(config: { account_type?: string | null } | null | undefined): 'PRACTICE' | 'REAL' | null {
  if (config?.account_type === 'PRACTICE' || config?.account_type === 'REAL') return config.account_type;
  return null;
}