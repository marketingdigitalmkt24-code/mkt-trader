import { expect, test } from 'bun:test';
import { scanIsActive, latestDemoScan, latestCompletedDemoScan, demoScanSlot, type DemoScanStatus } from './demo-scan-status';
const scan: DemoScanStatus = {target_minute:'2026-10-28T05:20:00Z',observed_at:'2026-10-28T05:20:01Z',phase:'completed',assets:98,selected_signal:null,error_code:null};
test('completed scans with no candidate remain active for the next minute', () => {
  expect(scanIsActive(scan, Date.parse('2026-10-28T05:21:00Z'))).toBe(true);
});
test('unavailable and stale scans never indicate active analysis', () => {
  expect(scanIsActive({...scan,phase:'unavailable'},Date.parse('2026-10-28T05:20:02Z'))).toBe(false);
  expect(scanIsActive(scan,Date.parse('2026-10-28T05:22:01Z'))).toBe(false);
  expect(scanIsActive(null,Date.now())).toBe(false);
});
test('new target wins over late completion of an older run', () => {
  const next = {...scan,target_minute:'2026-10-28T05:21:00Z',phase:'preparing' as const};
  expect(latestDemoScan([{...scan,observed_at:'2026-10-28T05:21:10Z'},next])).toBe(next);
});
test('three rotating slots bound telemetry storage', () => {
  expect(demoScanSlot(0)).toBe('minute-0.json');
  expect(demoScanSlot(60000)).toBe('minute-1.json');
  expect(demoScanSlot(180000)).toBe('minute-0.json');
});
test('reconnection preserves the last completed asset analysis without inventing a zero score', () => {
  const completed={...scan,asset_analyses:[{asset:'USD/PHP-OTC',direction:null,score:null,state:'no_signal' as const}]};
  const reconnect={...scan,target_minute:'2026-10-28T05:21:00Z',phase:'unavailable' as const};
  expect(latestDemoScan([completed,reconnect])).toBe(reconnect);
  expect(latestCompletedDemoScan([completed,reconnect])?.asset_analyses).toEqual([
    {asset:'USD/PHP-OTC',direction:null,score:null,state:'no_signal'},
  ]);
});
test('newer completed scans replace prior asset analyses', () => {
  const first={...scan,asset_analyses:[]};
  const next={...first,target_minute:'2026-10-28T05:21:00Z',assets:99};
  expect(latestCompletedDemoScan([next,first])?.assets).toBe(99);
});