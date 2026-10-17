import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readMasterIQConfig } from './master-iq-config.ts';
const admin = { id: 'admin-config', user_id: 'admin', is_active: true, account_type: 'PRACTICE' };
function reader(rows: unknown[], error: unknown = null) {
  return { rpc: async (name: string) => {
    assert.equal(name, 'get_master_iq_config');
    return { data: rows, error };
  } };
}
test('master placement uses admin resolver and rejects a client session config', async () => {
  assert.equal((await readMasterIQConfig(reader([admin]), 'admin-config')).data?.user_id, 'admin');
  assert.equal((await readMasterIQConfig(reader([admin]), 'client-config')).data, null);
});
test('no principal connection never falls back to any client', async () => {
  assert.equal((await readMasterIQConfig(reader([]))).data, null);
  assert.equal((await readMasterIQConfig(reader([{ ...admin, is_active: false }]))).data, null);
});
test('failed or ambiguous selection cannot authorize placement', async () => {
  assert.equal((await readMasterIQConfig(reader([admin], 'denied'))).data, null);
  assert.equal((await readMasterIQConfig(reader([admin, { ...admin, id: 'client' }]))).data, null);
});