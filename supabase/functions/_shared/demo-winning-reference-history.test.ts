import { describe, it, expect } from 'bun:test';
import { readDemoWinningReferences } from './demo-winning-reference-history.ts';
const win = (signal_id: string) => ({ signal_id, status: 'confirmed', account_type: 'PRACTICE', iq_option_id: '123', result: 'win' });
describe('continuous Demo winning chart references', () => {
  it('reads every page and preserves WIN scores outside the old displayed list', async () => {
    const references = await readDemoWinningReferences(
      async from => from === 0 ? Array.from({ length: 1000 }, (_, i) => win(String(i))) : [win('older')],
      async ids => ids.map(signal_id => ({ signal_id, score: 2.26032894533026 })),
    );
    expect(references).toHaveLength(1001);
    expect(references[1000]).toEqual({ signal_id: 'older', score: 2.26032894533026 });
  });
  it('adds a newly confirmed WIN on the next read, not while pending', async () => {
    let result = 'pending';
    const read = () => readDemoWinningReferences(async () => [{ ...win('new'), result }], async ids => ids.map(signal_id => ({ signal_id })));
    expect(await read()).toEqual([]);
    result = 'win';
    expect(await read()).toEqual([{ signal_id: 'new' }]);
  });
  it('excludes LOSS, REAL, simulation and mismatched signal IDs', async () => {
    const refs = await readDemoWinningReferences(async () => [win('ok'), { ...win('loss'), result: 'loss' }, { ...win('real'), account_type: 'REAL' }, { ...win('sim'), iq_option_id: 'test' }], async () => [{ signal_id: 'ok' }, { signal_id: 'unrelated' }]);
    expect(refs).toEqual([{ signal_id: 'ok' }]);
  });
  it('does not silently accept incomplete history on a read error', async () => {
    await expect(readDemoWinningReferences(async () => { throw new Error('unavailable'); }, async () => [])).rejects.toThrow('unavailable');
  });
});