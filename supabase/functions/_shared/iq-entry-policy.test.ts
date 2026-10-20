import { test, expect } from 'bun:test';
import { configuredEntryAmount, hasOpenIQOrder } from './iq-entry-policy';
test('admin sends the exact configured IQ amount without scaling', () => {
  expect(configuredEntryAmount(12.34)).toBe(12.34);
});
test('client sends own configured amount rather than master amount', () => {
  expect(configuredEntryAmount(37.25)).toBe(37.25);
  expect(configuredEntryAmount(undefined)).toBeNull();
});
test('one principal pending order blocks another', () => {
  expect(hasOpenIQOrder([{ result: 'pending' }])).toBe(true);
  expect(hasOpenIQOrder([{ result: 'win' }])).toBe(false);
});
test('one client open copy blocks another', () => {
  expect(hasOpenIQOrder([{ result: 'open' }])).toBe(true);
  expect(hasOpenIQOrder([{ result: 'loss' }])).toBe(false);
});