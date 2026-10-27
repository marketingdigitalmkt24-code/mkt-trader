import { useState } from 'react';
import { ArrowLeft, Settings, Bot, TrendingUp, BarChart3, LogOut, Users, Zap, LayoutDashboard, Copy, Menu } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { TradingDashboard } from '@/components/TradingDashboard';
import { AutoTradingCard } from '@/components/AutoTradingCard';
import { IQOptionSettingsCard } from '@/components/IQOptionSettingsCard';
import { UserManagementCard } from '@/components/UserManagementCard';
import { CopyTradingCard } from '@/components/CopyTradingCard';
import { DemoScoreHistory } from '@/components/DemoScoreHistory';
import { DemoWinningPatterns } from '@/components/DemoWinningPatterns';
import { DemoStrategyScores } from '@/components/DemoStrategyScores';
import { useAutoTrading } from '@/hooks/useAutoTrading';
import { useIQOptionConnection } from '@/hooks/useIQOptionConnection';
import { useMasterIQResults } from '@/hooks/useMasterIQResults';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const MENU = [
  { value: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { value: 'trading', label: 'Auto Trading', icon: Bot },
  { value: 'brokers', label: 'Corretoras', icon: Zap },
  { value: 'copy', label: 'Copy Trading', icon: Copy },
  { value: 'users', label: 'Usuários', icon: Users },
  { value: 'score-history', label: 'Histórico por nota', icon: BarChart3 },
  { value: 'winning-patterns', label: 'Padrões vencedores', icon: TrendingUp },
  { value: 'strategies', label: 'Estratégias', icon: BarChart3 },
];

const Admin = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);

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
              <Button variant="ghost" size="sm" onClick={() => setMenuOpen(true)} className="px-2 shrink-0" aria-label="Abrir menu">
                <Menu className="w-5 h-5" />
              </Button>
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
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetContent side="left" className="w-64 max-w-[80vw]">
              <SheetHeader><SheetTitle>Menu</SheetTitle></SheetHeader>
              <nav className="mt-4 flex flex-col gap-1">
                {MENU.map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    variant={tab === value ? 'secondary' : 'ghost'}
                    className="justify-start gap-2"
                    onClick={() => { setTab(value); setMenuOpen(false); }}
                  >
                    <Icon className="w-4 h-4" />{label}
                  </Button>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <TabsContent value="dashboard"><TradingDashboard /></TabsContent>
          <TabsContent value="score-history"><DemoScoreHistory /></TabsContent>
          <TabsContent value="winning-patterns"><DemoWinningPatterns /></TabsContent>
          <TabsContent value="strategies"><DemoStrategyScores /></TabsContent>

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
