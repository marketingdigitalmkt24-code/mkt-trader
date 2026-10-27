import { describe, expect, test } from 'bun:test';
import { collectBrokerIdentifiers, matchAppOpenOrder, type AppOpenOrder } from './open-positions-filter.ts';

const demo = (id: string, over: Partial<AppOpenOrder> = {}): AppOpenOrder => ({
  id, asset: 'EUR/JPY OTC', direction: 'CALL', invest: 1, cohort: 'demo', ...over,
});

const appOrders = new Map<string, AppOpenOrder>([
  ['14395507935', demo('14395507935')],
  ['14395505574', demo('14395505574', { asset: 'GBP/NZD OTC', direction: 'PUT' })],
]);

describe('Operações Abertas: só ordens abertas por este app', () => {
  test('mantém a posição cujo payload carrega o número da ordem deste app', () => {
    const position = {
      id: 'b51174ce1dbe4bf27e4dedbb28c4359c',
      instrument_type: 'turbo-option',
      active_id: 132,
      open_time: 1793136303102,
      raw_event: { digital_options_position_changed1: { order_ids: [14395507935], margin: 1 } },
    };
    const match = matchAppOpenOrder(position, appOrders);
    expect(match?.id).toBe('14395507935');
    expect(match?.asset).toBe('EUR/JPY OTC');
    expect(match?.direction).toBe('CALL');
    expect(match?.invest).toBe(1);
  });

  test('descarta posição aberta fora deste app, ainda que no mesmo ativo e horário', () => {
    const foreign = {
      id: '7ceaa44bc29761d85467c79102ee1fb6',
      instrument_type: 'turbo-option',
      active_id: 132,
      invest: 5,
      open_time: 1793136303000,
      expiration_time: 1793136360,
      raw_event: { instrument_id: 'EURJPY-OTC', instrument_dir: 'buy', margin: 5 },
    };
    expect(matchAppOpenOrder(foreign, appOrders)).toBeNull();
  });

  test('reconhece a ordem quando a corretora devolve o próprio número da ordem como id', () => {
    expect(matchAppOpenOrder({ id: '14395505574', invest: 1 }, appOrders)?.direction).toBe('PUT');
  });

  test('não identifica por timestamps, id de ativo ou valores de margem', () => {
    const ids = collectBrokerIdentifiers({ open_time: 1793136303102, active_id: 132, margin: 1, order_ids: [14395507935] });
    expect([...ids].filter((v) => v === '14395507935')).toEqual(['14395507935']);
    expect(matchAppOpenOrder({ open_time: 1793136303102, active_id: 132, margin: 1 }, appOrders)).toBeNull();
  });
});
