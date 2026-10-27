import { expect, test } from 'bun:test';
import { takashiBaseScore, TAKASHI_BNF } from './takashi-kotegawa';
import { demoFinalScore, combinedLearnedScore } from './demo-continuation';
import { demoAlternationAuthorized } from './demo-226-policy';
import { principalIQEnabled, telegramTradingEnabled } from './principal-pause';

test('Takashi raw note comes from concrete candle change and agreeing indicators', () => {
  const candle = {t:0,o:100,c:100.5,h:101,l:99};
  expect(takashiBaseScore(candle,2)).toBe(2.5);
  expect(takashiBaseScore({...candle,c:100.25},2)).toBe(2.25);
  expect(takashiBaseScore(candle,0)).toBe(0.5);
});
test('empty remix history contributes zero learning, not invented performance', () => {
  const learn = combinedLearnedScore([],[],0,TAKASHI_BNF,'EUR/USD',Date.parse('2026-10-27T21:00:00Z'));
  expect(learn).toBe(0);
  expect(demoFinalScore(0.5,learn,TAKASHI_BNF)).toBe(0.5);
  expect(demoFinalScore(0.5,0.25,TAKASHI_BNF)).toBe(1);
});
test('Takashi losing phase keeps distinct negative notes instead of 0.00', () => {
  expect(demoFinalScore(1,-0.75,TAKASHI_BNF)).toBe(-0.5);
  expect(demoFinalScore(1,-1,TAKASHI_BNF)).toBe(-1);
});
test('Takashi own recent losses on the same asset+direction lower its note', async () => {
  const { recentLearningAdjustment } = await import('./recent-signal-learning');
  const c = {asset:'GBP/NZD-OTC',direction:'CALL',entry_strategy:TAKASHI_BNF};
  const losses = [1,2,3].map(i=>({...c,result:'loss',created_at:new Date(Date.parse('2026-10-27T21:00:00Z')+i*60000).toISOString()}));
  const now = Date.parse('2026-10-27T21:10:00Z');
  expect(recentLearningAdjustment(losses as any,c,now)).toBeLessThan(recentLearningAdjustment([],c,now));
});
test('any finite Takashi Demo note never authorizes principal, copies or Telegram', () => {
  for (const score of [0,0.5,2.26,4,9]) {
    expect(demoAlternationAuthorized(score,TAKASHI_BNF)).toBe(true);
    expect(principalIQEnabled(TAKASHI_BNF)).toBe(false);
    expect(telegramTradingEnabled(TAKASHI_BNF)).toBe(false);
  }
  expect(demoAlternationAuthorized(Infinity,TAKASHI_BNF)).toBe(false);
});