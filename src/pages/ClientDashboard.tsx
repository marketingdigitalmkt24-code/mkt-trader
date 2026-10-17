import { LogOut, Bot, TrendingUp, BarChart3, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAutoTrading } from '@/hooks/useAutoTrading';
import { IQOptionSettingsCard } from '@/components/IQOptionSettingsCard';
import { ClientCopyTradingCard } from '@/components/ClientCopyTradingCard';
import { ClientResultsCard } from '@/components/ClientResultsCard';
import { useIQOptionConnection } from '@/hooks/useIQOptionConnection';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const ClientDashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  
  const { resetDailyTrades } = useAutoTrading();

  const {
    balance: iqBalance,
    dailyStats,
    isLoading: isLoadingBalance,
    connect: refresh,
  } = useIQOptionConnection();

  const balance = iqBalance?.balance ?? 0;
  const dailyProfit = dailyStats?.dailyProfit ?? 0;
  const todayTrades = dailyStats?.todayTrades ?? 0;
  const wins = dailyStats?.wins ?? 0;
  const losses = dailyStats?.losses ?? 0;

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
                  Auto Trading & IQ Option
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
          <Card className="bg-gradient-to-br from-call/10 to-call/5 border-call/20">
            <CardContent className="p-3 sm:pt-6 sm:px-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-call/20 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-call" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Lucro Diário</p>
                  <p className="text-lg sm:text-xl font-bold text-call truncate">
                    ${dailyProfit?.toFixed(2) || '0.00'}
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

        {/* IQ Option Section */}
        <section>
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-call/20 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-call" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-foreground">IQ Option</h2>
          </div>
          <Card className="border-call/20">
            <CardContent className="pt-6">
              <IQOptionSettingsCard defaultOpen={true} />
            </CardContent>
          </Card>
        </section>

        {/* Copy Trading + Resultados */}
        <div className="grid gap-4 sm:gap-8 lg:grid-cols-2 mt-4 sm:mt-8">
          <ClientCopyTradingCard />
          <ClientResultsCard />
        </div>

        {/* Action Buttons */}
        <div className="mt-4 sm:mt-8 flex flex-col sm:flex-row gap-2 sm:gap-4">
          <button
            onClick={resetDailyTrades}
            className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <BarChart3 className="w-4 h-4" />
            Resetar Trades Diários
          </button>
          
          <button
            onClick={refresh}
            disabled={isLoadingBalance}
            className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-call/20 hover:bg-call/30 text-call rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm sm:text-base"
          >
            <TrendingUp className="w-4 h-4" />
            Atualizar Saldo
          </button>
        </div>
      </main>
    </div>
  );
};

export default ClientDashboard;