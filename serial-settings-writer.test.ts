import { test, expect } from 'bun:test';
import { serialSettingsWriter } from './src/lib/serial-settings-writer';
test('saving 10 while 100 is saving never drops the requested admin stake', async () => {
  const saved: number[] = [];
  const write = serialSettingsWriter(async (value: number) => {
    await new Promise(resolve => setTimeout(resolve, 5));
    saved.push(value);
  });
  await Promise.all([write(100), write(10)]);
  expect(saved).toEqual([100, 10]);
});
test('failed save is reported and does not block the next value', async () => {
  let saved = 100;
  const write = serialSettingsWriter(async (value: number) => {
    if (value === 0) throw new Error('save failed');
    saved = value;
  });
  await expect(write(0)).rejects.toThrow('save failed');
  await write(10);
  expect(saved).toBe(10);
});