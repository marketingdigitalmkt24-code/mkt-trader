import { test, expect } from 'bun:test';
import { configuredEntryAmount, hasOpenIQOrder, canMirrorToBroker } from './iq-entry-policy';
test('admin sends the exact configured IQ amount without scaling', () => {
  expect(configuredEntryAmount(10)).toBe(10);
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
const master = { user_id: 'admin', email: 'master@example.test', account_type: 'PRACTICE' };
test('principal never copies its own entry', () => {
  expect(canMirrorToBroker(master, master)).toBe(false);
});
test('shared principal broker account cannot open a second or third copy', () => {
  expect(canMirrorToBroker(master, { ...master, user_id: 'client', email: ' MASTER@example.test ' })).toBe(false);
  expect(canMirrorToBroker(master, { ...master, user_id: 'client2' })).toBe(false);
});
test('independent client broker account retains its own copy', () => {
  expect(canMirrorToBroker(master, { ...master, user_id: 'client', email: 'client@example.test' })).toBe(true);
});