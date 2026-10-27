import { useState } from 'react';
import { Button } from './ui/button';
import { demoStrategyNames } from './DemoTestOperations';
import { topWinningStrategyScores, type StrategyScoreSummary } from '@/lib/demo-strategy-scores';

const brtDate = (value: string) => new Date(value).toLocaleString('pt-BR', {
 timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function DemoStrategyScoreChart({ rows }: { rows: StrategyScoreSummary[] }) {
 const [selectedKey, setSelectedKey] = useState<string | null>(null);
 const top = topWinningStrategyScores(rows);
 const selected = top.find(row => `${row.strategy}:${row.score}` === selectedKey);
 const max = Math.max(1, ...top.map(row => row.demoWins + row.rejectedWins));
 if (!top.length) return null;
 return <div className="min-w-0 space-y-3 border-b border-border pb-5">
  <h3 className="text-sm font-semibold">10 melhores notas · Total de WIN</h3>
  <div role="group" aria-label="Gráfico das 10 notas com mais WIN" className="space-y-1">
   {top.map(row => {
    const key = `${row.strategy}:${row.score}`;
    const total = row.demoWins + row.rejectedWins;
    const name = demoStrategyNames[row.strategy] ?? row.strategy;
    return <Button key={key} variant="ghost" aria-pressed={selectedKey === key} aria-label={`Nota ${row.score.replace('.', ',')} · ${name} · ${total} WIN`} onClick={() => setSelectedKey(key)} className="grid h-auto w-full grid-cols-[minmax(0,8rem)_minmax(0,1fr)_3.5rem] gap-3 rounded-sm px-2 py-2 text-left data-[state=selected]:bg-secondary" data-state={selectedKey === key ? 'selected' : undefined}>
     <span className="min-w-0"><span className="block font-mono text-sm">{row.score.replace('.', ',')}</span><span className="block truncate text-[10px] font-normal text-muted-foreground" title={name}>{name}</span></span>
     <svg viewBox="0 0 1000 22" preserveAspectRatio="none" className="h-5 w-full" aria-hidden="true"><rect width="1000" height="22" rx="3" className="fill-secondary"/><rect width={total / max * 1000} height="22" rx="3" className="fill-call"/></svg>
     <span className="text-right font-mono text-sm text-call">{total}</span>
    </Button>;
   })}
  </div>
  {selected && <div role="status" className="space-y-2 border-l-2 border-call pl-3 text-sm">
   <p className="font-medium">Nota {selected.score.replace('.', ',')} · {demoStrategyNames[selected.strategy] ?? selected.strategy}</p>
   <p className="text-call">{selected.demoWins + selected.rejectedWins} WIN · {selected.demoWins} Demo + {selected.rejectedWins} rejeitadas (teste) · 0 LOSS</p>
   <p>Resultado desde <span className="font-mono">{brtDate(selected.firstWinAt)}</span></p>
   <p className="text-xs text-muted-foreground">Último WIN: {brtDate(selected.lastWinAt)} · Brasília</p>
   {selected.historyFirstWinAt !== selected.firstWinAt && <p className="text-xs text-muted-foreground">Primeiro WIN no histórico: {brtDate(selected.historyFirstWinAt)} · Brasília</p>}
  </div>}
 </div>;
}