import { LogOut, Bot, TrendingUp, BarChart3, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ClientCopyTradingCard } from '@/components/ClientCopyTradingCard';
import { ClientResultsCard } from '@/components/ClientResultsCard';
import { useIQOptionConnection } from '@/hooks/useIQOptionConnection';
import { useClientCopyResults } from '@/hooks/useClientCopyResults';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { copyResultRates } from '@/lib/admin-copy-results';

const ClientDashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  
  const {
    balance: iqBalance,
  } = useIQOptionConnection({ silentMissingCredentials: true, fetchStatistics: false });
  const copyResults = useClientCopyResults();

  const balance = iqBalance?.balance ?? 0;
  const dailyProfit = copyResults.profit;
  const todayTrades = copyResults.trades;
  const wins = copyResults.wins;
  const losses = copyResults.losses;
  const { winPercent } = copyResultRates(wins, losses);

  const handleLogout = async () => {
    await signOut();
    navigate('/client/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-card border-b border-border/50">
        <div className="container px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 sm:w-6 sm:h-6 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-lg font-bold text-foreground truncate">
                  Painel do Cliente
                </h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Copy Trading & IQ Option
                </p>
              </div>
            </div>
            
            {/* User Info & Logout */}
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              {/* Balance Display - Hidden on very small screens */}
              {balance > 0 && (
                <div className="hidden xs:flex items-center gap-2 sm:gap-3">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground hidden sm:block">Saldo IQ</div>
                    <div className="text-sm sm:text-lg font-bold text-call">
                      ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <Badge variant={dailyProfit >= 0 ? "default" : "destructive"} className="text-xs">
                    {dailyProfit >= 0 ? '+' : ''}{dailyProfit.toFixed(2)}
                  </Badge>
                </div>
              )}
              
              {/* User & Logout */}
              <div className="flex items-center gap-2 border-l border-border/50 pl-2 sm:pl-4">
                <div className="text-right hidden md:block">
                  <div className="text-xs text-muted-foreground">Logado como</div>
                  <div className="text-sm font-medium truncate max-w-24 lg:max-w-32">
                    {user?.email}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="gap-1 sm:gap-2 text-destructive hover:text-destructive px-2 sm:px-3"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline text-sm">Sair</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 py-4 sm:py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-8">
          <Card className={cn('border', dailyProfit < 0 ? 'bg-put/5 border-put/20' : dailyProfit > 0 ? 'bg-call/5 border-call/20' : 'bg-secondary/20 border-border')}>
            <CardContent className="p-3 sm:pt-6 sm:px-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={cn('w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0', dailyProfit < 0 ? 'bg-put/20 text-put' : 'bg-call/20 text-call')}>
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Lucro Diário</p>
                  <p className={cn('text-lg sm:text-xl font-bold break-words tabular-nums', dailyProfit < 0 ? 'text-put' : dailyProfit > 0 ? 'text-call' : 'text-foreground')}>
                    {copyResults.isError ? 'Indisponível' : copyResults.isLoading ? '…' : `${dailyProfit > 0 ? '+' : dailyProfit < 0 ? '−' : ''}$${Math.abs(dailyProfit).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="p-3 sm:pt-6 sm:px-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Trades Hoje</p>
                  <p className="text-lg sm:text-xl font-bold text-foreground">
                    {todayTrades || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-call/10 to-call/5 border-call/20">
            <CardContent className="p-3 sm:pt-6 sm:px-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-call/20 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-call" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Wins</p>
                  <p className="text-lg sm:text-xl font-bold text-call">
                    {wins || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Win rate <span className="font-semibold text-call tabular-nums">{winPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span></p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-put/10 to-put/5 border-put/20">
            <CardContent className="p-3 sm:pt-6 sm:px-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-put/20 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-put" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Losses</p>
                  <p className="text-lg sm:text-xl font-bold text-put">
                    {losses || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Copy Trading + Resultados */}
        <div className="grid items-start gap-4 sm:gap-8 lg:grid-cols-2">
          <ClientResultsCard />
          <ClientCopyTradingCard />
        </div>

      </main>
    </div>
  );
};

export default ClientDashboard;