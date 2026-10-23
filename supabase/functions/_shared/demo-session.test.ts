import { expect, test } from 'bun:test';
import { reusableDemoSession } from './demo-session';
test('reuses only a service-authenticated session for the resolved principal', () => {
  expect(reusableDemoSession(true,'principal',{configId:'principal',ssid:'test-session'})).toBe('test-session');
  expect(reusableDemoSession(false,'principal',{configId:'principal',ssid:'test-session'})).toBeNull();
  expect(reusableDemoSession(true,'principal',{configId:'client',ssid:'test-session'})).toBeNull();
  expect(reusableDemoSession(true,'principal',{configId:'principal',ssid:''})).toBeNull();
});