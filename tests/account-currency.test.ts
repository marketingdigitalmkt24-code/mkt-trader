import { expect, test } from 'bun:test';
import { formatAccountMoney } from '../src/lib/account-currency';

test('BRL account amounts stay in reais without conversion', () => {
  expect(formatAccountMoney(1234.56, 'BRL').replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  expect(formatAccountMoney(-20.5, 'BRL', true).replace(/\s/g, ' ')).toBe('−R$ 20,50');
});
test('USD and EUR use their own currency without conversion', () => {
  expect(formatAccountMoney(20.5, 'USD', true).replace(/\s/g, ' ')).toBe('+US$ 20,50');
  expect(formatAccountMoney(20.5, 'EUR').replace(/\s/g, ' ')).toBe('€ 20,50');
});
test('unknown account currency never defaults to USD', () => {
  expect(formatAccountMoney(20, undefined)).toBe('—');
  expect(formatAccountMoney(20, '')).toBe('—');
});