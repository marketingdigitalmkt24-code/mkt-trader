import { expect, test } from 'bun:test';
import { ichimokuRecuo21Direction } from './ichimoku-recuo21';

test('enters only when Ichimoku and Recuo 21 fire in the same direction', () => {
  expect(ichimokuRecuo21Direction([['ICHIMOKU', 'PUT'], ['RECUO_EMA21', 'PUT']])).toBe('PUT');
  expect(ichimokuRecuo21Direction([['RECUO_EMA21', 'CALL'], ['KDJ', 'PUT'], ['ICHIMOKU', 'CALL']])).toBe('CALL');
});

test('no entry when only one fires or directions disagree', () => {
  expect(ichimokuRecuo21Direction([['ICHIMOKU', 'CALL']])).toBeNull();
  expect(ichimokuRecuo21Direction([['RECUO_EMA21', 'PUT']])).toBeNull();
  expect(ichimokuRecuo21Direction([['ICHIMOKU', 'CALL'], ['RECUO_EMA21', 'PUT']])).toBeNull();
});
