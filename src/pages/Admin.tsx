import { ArrowLeft, Settings, Bot, TrendingUp, BarChart3, LogOut, Users, Zap, LayoutDashboard, Copy } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { TradingDashboard } from '@/components/TradingDashboard';
import { AutoTradingCard } from '@/components/AutoTradingCard';
import { IQOptionSettingsCard } from '@/components/IQOptionSettingsCard';
import { UserManagementCard } from '@/components/UserManagementCard';
import { CopyTradingCard } from '@/components/CopyTradingCard';
import { DemoScoreHistory } from '@/components/DemoScoreHistory';
import { useAutoTrading } from '@/hooks/useAutoTrading';
import { useIQOptionConnection } from '@/hooks/useIQOptionConnection';
import { useMasterIQResults } from '@/hooks/useMasterIQResults';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Admin = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const {
    config: autoTradingConfig,
    updateConfig: updateAutoTradingConfig,
    isPlacingTrade,
    lastTradeResult,
    resetDailyTrades,
  } = useAutoTrading();

  const {
    balance: iqBalance,
    isLoading: isLoadingBalance,
    connect: refresh,
  } = useIQOptionConnection();
  const { dailyStats } = useMasterIQResults();

  const balance = iqBalance?.balance ?? 0;
  const dailyProfit = dailyStats?.dailyProfit ?? 0;
  const todayTrades = dailyStats?.todayTrades ?? 0;
  const wins = dailyStats?.wins ?? 0;
  const losses = dailyStats?.losses ?? 0;
  const winRate = todayTrades > 0 ? Math.round((wins / todayTrades) * 100) : 0;

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Compact Header */}
      <header className="sticky top-0 z-50 glass-card border-b border-border/50">
        <div className="container px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
                <Settings className="w-4 h-4 text-primary-foreground" />
              </div>
              <h1 className="text-sm sm:text-base font-bold text-foreground truncate">Painel Admin</h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {balance > 0 && (
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-sm font-bold text-call">
                    ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  <Badge variant={dailyProfit >= 0 ? "default" : "destructive"} className="text-xs">
                    {dailyProfit >= 0 ? '+' : ''}{dailyProfit.toFixed(2)}
                  </Badge>
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-destructive hover:text-destructive px-2">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 py-4 sm:py-6 max-w-7xl">
        {/* Quick Stats - Compact */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 sm:mb-6">
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-call/10 to-call/5 border border-call/20 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Lucro</p>
            <p className="text-sm sm:text-lg font-bold text-call">${dailyProfit?.toFixed(0) || '0'}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Trades</p>
            <p className="text-sm sm:text-lg font-bold text-foreground">{todayTrades || 0}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-call/10 to-call/5 border border-call/20 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Win Rate</p>
            <p className="text-sm sm:text-lg font-bold text-call">{winRate}%</p>
          </div>
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-put/10 to-put/5 border border-put/20 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">W/L</p>
            <p className="text-sm sm:text-lg font-bold">
              <span className="text-call">{wins}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-put">{losses}</span>
            </p>
          </div>
        </div>

        {/* Tabbed Layout */}
        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 h-auto gap-1">
            <TabsTrigger value="dashboard" className="text-xs sm:text-sm py-2 gap-1"><LayoutDashboard className="w-3.5 h-3.5" />Dashboard</TabsTrigger>
            <TabsTrigger value="trading" className="text-xs sm:text-sm py-2 gap-1">
              <Bot className="w-3.5 h-3.5" />
              <span>Auto Trading</span>
            </TabsTrigger>
            <TabsTrigger value="brokers" className="text-xs sm:text-sm py-2 gap-1">
              <Zap className="w-3.5 h-3.5" />
              <span>Corretoras</span>
            </TabsTrigger>
            <TabsTrigger value="copy" className="text-xs sm:text-sm py-2 gap-1">
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Trading</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="text-xs sm:text-sm py-2 gap-1">
              <Users className="w-3.5 h-3.5" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="score-history" className="text-xs sm:text-sm py-2 gap-1"><BarChart3 className="w-3.5 h-3.5"/>Histórico por nota</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><TradingDashboard /></TabsContent>
          <TabsContent value="score-history"><DemoScoreHistory /></TabsContent>

          {/* Auto Trading Tab */}
          <TabsContent value="trading" className="space-y-4">
            <Card className="border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  Auto Trading
                  <Badge variant={autoTradingConfig.enabled ? "default" : "secondary"} className="ml-auto text-xs">
                    {autoTradingConfig.enabled ? '🟢 Ativo' : '⏸️ Parado'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AutoTradingCard
                  config={autoTradingConfig}
                  updateConfig={updateAutoTradingConfig}
                  isPlacingTrade={isPlacingTrade}
                  lastTradeResult={lastTradeResult}
                  defaultOpen={true}
                />
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button variant="outline" onClick={resetDailyTrades} className="flex-1 gap-2">
                <BarChart3 className="w-4 h-4" />
                Resetar Trades
              </Button>
              <Button variant="outline" onClick={refresh} disabled={isLoadingBalance} className="flex-1 gap-2">
                <TrendingUp className="w-4 h-4" />
                Atualizar Saldo
              </Button>
            </div>
          </TabsContent>

          {/* Brokers Tab - IQ Option only */}
          <TabsContent value="brokers" className="space-y-4">
            <div className="grid gap-4">
              <Card className="border-call/20">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="w-7 h-7 rounded-lg bg-call/20 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-call" />
                    </div>
                    IQ Option
                    <Badge className="ml-auto text-xs bg-call/20 text-call border-call/30">Binário</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  <IQOptionSettingsCard defaultOpen={true} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Copy Trading Tab */}
          <TabsContent value="copy">
            <CopyTradingCard />
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <UserManagementCard />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
