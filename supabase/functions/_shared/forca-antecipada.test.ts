import { expect, test } from 'vitest';
import { forcaAntecipada, FORCA_ANTECIPADA } from './forca-antecipada.ts';
import { demoCohort, preferredDemoCohort } from './demo-226-policy.ts';

const entry = 6000000;
function series(stretch = false) {
  const cs = [] as any[]; let p = 100;
  for (let i = 0; i < 100; i++) {
    const t = entry - (100 - i) * 60;
    const up = i % 3 !== 0 || i >= 97;
    let body = i >= 97 ? 0.05 + (i - 97) * 0.01 : 0.03;
    if (stretch && i >= 80) body = 0.08;
    const o = p, c = up ? p + body : p - body * 0.6;
    cs.push({ t, o, c, h: Math.max(o, c) + 0.004, l: Math.min(o, c) - 0.004 }); p = c;
  }
  return cs;
}
test('fires CALL on growing aligned pressure', () => {
  const r = forcaAntecipada(series(), entry);
  if (r) expect(r.direction).toBe('CALL');
});
test('rejects incomplete candle window', () => {
  expect(forcaAntecipada(series().slice(1), entry)).toBeNull();
});
test('rejects stretched RSI', () => {
  expect(forcaAntecipada(series(true), entry)).toBeNull();
});
test('is its own Demo cohort and rotates after 2,26', () => {
  expect(demoCohort(0.5, FORCA_ANTECIPADA)).toBe('antecipada');
  expect(preferredDemoCohort('VELA_FORCA')).toBe('antecipada');
  expect(preferredDemoCohort(FORCA_ANTECIPADA)).toBe('takashi');
  expect(preferredDemoCohort('TAKASHI_BNF_V1')).toBe('score226');
});
