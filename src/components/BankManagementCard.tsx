import { BankManagement } from '@/types/trading';
import { Wallet, TrendingUp, AlertTriangle, Target, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface BankManagementCardProps {
  bank: BankManagement;
}

export function BankManagementCard({ bank }: BankManagementCardProps) {
  const suggestedBet = (bank.balance * bank.riskPerTrade) / 100;
  const tradeProgress = (bank.todayTrades / bank.maxDailyTrades) * 100;
  const isOvertrading = bank.todayTrades >= bank.maxDailyTrades * 0.8;
  const hasConsecutiveLosses = bank.consecutiveLosses >= 2;

  return (
    <section className="glass-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Wallet className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Gestão de Banca</h3>
      </div>

      {/* Balance */}
      <div className="bg-secondary/50 rounded-xl p-4 mb-4">
        <div className="text-sm text-muted-foreground mb-1">Saldo Atual</div>
        <div className="text-2xl font-bold font-mono text-foreground">
          R$ {bank.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <TrendingUp className="w-4 h-4 text-call" />
          <span className="text-sm text-call font-medium">
            +R$ {bank.dailyProfit.toFixed(2)} hoje
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-secondary/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Risco/Trade</span>
          </div>
          <div className="font-mono font-bold text-call">{bank.riskPerTrade}%</div>
          <div className="text-xs text-muted-foreground">
            R$ {suggestedBet.toFixed(2)}
          </div>
        </div>

        <div className="bg-secondary/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Trades Hoje</span>
          </div>
          <div className={cn('font-mono font-bold', isOvertrading ? 'text-gold' : 'text-foreground')}>
            {bank.todayTrades}/{bank.maxDailyTrades}
          </div>
        </div>
      </div>

      {/* Trade Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-2">
          <span>Progresso Diário</span>
          <span>{tradeProgress.toFixed(0)}%</span>
        </div>
        <Progress
          value={tradeProgress}
          className={cn('h-2', isOvertrading && '[&>div]:bg-gold')}
        />
      </div>

      {/* Alerts */}
      {(isOvertrading || hasConsecutiveLosses) && (
        <div className="space-y-2">
          {isOvertrading && (
            <div className="flex items-center gap-2 p-2 bg-gold/10 border border-gold/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-gold flex-shrink-0" />
              <span className="text-xs text-gold">
                Atenção: Limite de operações próximo
              </span>
            </div>
          )}
          {hasConsecutiveLosses && (
            <div className="flex items-center gap-2 p-2 bg-put/10 border border-put/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-put flex-shrink-0" />
              <span className="text-xs text-put">
                {bank.consecutiveLosses} perdas consecutivas - Considere pausar
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
