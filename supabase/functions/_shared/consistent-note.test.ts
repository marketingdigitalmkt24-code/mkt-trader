import { expect, test } from 'bun:test';
import { consistentNoteDirection, type ConsistentNoteEvidence } from './consistent-note.ts';
const now = Date.parse('2026-10-30T02:21:01Z');
const candidate = { signal_id: 'takashi-bnf-v1-BTCUSD-1793326860', entry_strategy: 'TAKASHI_BNF_V1', direction: 'CALL', entry_minute: '2026-10-30T02:21:00Z', score: 2.264 };
const evidence = (signal_id: string, entry_minute: string): ConsistentNoteEvidence => ({ signal_id, entry_minute, settled_at: new Date(Date.parse(entry_minute)+61000).toISOString(), score: 2.26, entry_strategy: 'TAKASHI_BNF_V1', status: 'confirmed', account_type: 'PRACTICE', iq_option_id: signal_id, result: 'win' });
const rows = [evidence('1','2026-10-27T12:00:00Z'),evidence('2','2026-10-28T12:00:00Z'),evidence('3','2026-10-29T12:00:00Z')];
test('requires WIN today and the two previous BRT days, follows CALL and PUT without inversion', () => {
 expect(consistentNoteDirection(candidate,rows,now)).toBe('call');
 expect(consistentNoteDirection({...candidate,direction:'PUT'},rows,now)).toBe('put');
});
test('three wins on two days are insufficient', () => {
 expect(consistentNoteDirection(candidate,[rows[0],rows[0],rows[2]],now)).toBeNull();
});
test('any historical confirmed LOSS vetoes the matching displayed strategy note', () => {
 expect(consistentNoteDirection(candidate,[...rows,{...evidence('4','2026-09-01T12:00:00Z'),result:'loss'}],now)).toBeNull();
});
test('pending, rejected, invalid broker IDs and absent settlement do not qualify', () => {
 for (const patch of [{status:'pending'}, {status:'rejected'}, {iq_option_id:'invalid'}, {settled_at:null}]) {
  expect(consistentNoteDirection(candidate,[rows[0],rows[1],{...rows[2],...patch}],now)).toBeNull();
 }
});
test('BRT midnight follows entry day, not UTC date or later settlement date', () => {
 const shifted = [rows[0],rows[1],evidence('3','2026-10-29T02:59:00Z')];
 expect(consistentNoteDirection(candidate,shifted,now)).toBeNull();
 expect(consistentNoteDirection(candidate,[rows[0],rows[1],evidence('3','2026-10-30T02:00:00Z')],now)).toBe('call');
});
test('future evidence and expired candidates never qualify', () => {
 expect(consistentNoteDirection(candidate,[rows[0],rows[1],{...rows[2],settled_at:'2026-10-30T02:22:00Z'}],now)).toBeNull();
 expect(consistentNoteDirection(candidate,rows,now+30000)).toBeNull();
});
test('different strategy and different displayed notes cannot supply missing wins', () => {
 expect(consistentNoteDirection(candidate,[rows[0],rows[1],{...rows[2],entry_strategy:'TENDENCIA'}],now)).toBeNull();
 expect(consistentNoteDirection(candidate,[rows[0],rows[1],{...rows[2],score:2.27}],now)).toBeNull();
});