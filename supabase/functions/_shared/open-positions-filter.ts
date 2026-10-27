/**
 * Vínculo exato entre posições abertas na corretora e ordens abertas por este app.
 * Uma posição da IQ Option só é exibida em "Operações Abertas" quando o payload
 * dela carrega o número da ordem que este app registrou — nunca por suposição de
 * ativo, direção ou horário, porque preços e momentos podem coincidir.
 */
export interface AppOpenOrder {
  id: string;
  asset: string;
  direction: string;
  invest: number;
  cohort: 'demo' | 'principal';
}

/** Coleta identificadores primitivos (números e códigos curtos) de uma posição da corretora. */
export function collectBrokerIdentifiers(value: unknown, out = new Set<string>(), depth = 0): Set<string> {
  if (depth > 6 || out.size > 400 || value === null || value === undefined) return out;
  if (typeof value === 'number') { if (Number.isFinite(value)) out.add(String(value)); return out; }
  if (typeof value === 'string') { if (value.length <= 64) out.add(value); return out; }
  if (Array.isArray(value)) { for (const v of value) collectBrokerIdentifiers(v, out, depth + 1); return out; }
  if (typeof value === 'object') { for (const v of Object.values(value as Record<string, unknown>)) collectBrokerIdentifiers(v, out, depth + 1); }
  return out;
}

/**
 * Retorna a ordem deste app que abriu aquela posição, ou null quando a corretora
 * não confirma o número da ordem (posição aberta fora deste app).
 */
export function matchAppOpenOrder(position: unknown, appOrders: Map<string, AppOpenOrder>): AppOpenOrder | null {
  const p = (position ?? {}) as Record<string, unknown>;
  const brokerId = String(p.id ?? p.external_id ?? '').trim();
  const direct = brokerId ? appOrders.get(brokerId) : undefined;
  if (direct) return direct;
  const identifiers = collectBrokerIdentifiers(p);
  for (const order of appOrders.values()) if (identifiers.has(order.id)) return order;
  return null;
}
