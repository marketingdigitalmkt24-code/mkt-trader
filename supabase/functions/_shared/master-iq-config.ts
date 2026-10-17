type MasterConfig = {
  id: string; user_id: string; email: string; password: string;
  account_type: string; is_active: boolean; last_connected_at: string | null;
};
type Reader = { rpc: (name: string) => PromiseLike<{ data: unknown; error: unknown }> };
// SQL owns admin-role checks and stable selection; never fall back to clients.
export async function readMasterIQConfig(db: Reader, expectedId?: string) {
  const { data, error } = await db.rpc('get_master_iq_config');
  if (error) return { data: null, error };
  const row = Array.isArray(data) && data.length === 1 ? data[0] as MasterConfig : null;
  if (!row?.id || !row.user_id || !row.is_active || (expectedId && row.id !== expectedId)) {
    return { data: null, error: 'Principal IQ Option connection unavailable or changed' };
  }
  return { data: row, error: null };
}