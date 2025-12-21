import { ArrowLeft, Settings, Bot, MessageCircle, TrendingUp, Shield, BarChart3, LogOut, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AutoTradingCard } from '@/components/AutoTradingCard';
import { WhatsAppSettingsCard } from '@/components/WhatsAppSettingsCard';
import { IQOptionSettingsCard } from '@/components/IQOptionSettingsCard';
import { UserManagementCard } from '@/components/UserManagementCard';
import { useAutoTrading } from '@/hooks/useAutoTrading';
import { useIQOptionBalance } from '@/hooks/useIQOptionBalance';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const Admin = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  
  const {
    config: autoTradingConfig,
    updateConfig: updateAutoTradingConfig,
    isPlacingTrade,
    lastTradeResult,
    resetDailyTrades,
  } = useAutoTrading();

  const { balance, dailyProfit, todayTrades, wins, losses, isLoading: isLoadingBalance, refresh } = useIQOptionBalance();

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-card border-b border-border/50">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link 
                to="/" 
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline">Voltar</span>
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                  <Settings className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-foreground">
                    Painel Administrativo
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Configurações do Sistema
                  </p>
                </div>
              </div>
            </div>
            
            {/* User Info & Logout */}
            <div className="flex items-center gap-4">
              {/* Balance Display */}
              {balance > 0 && (
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Saldo IQ Option</div>
                    <div className="text-lg font-bold text-call">
                      ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <Badge variant={dailyProfit >= 0 ? "default" : "destructive"}>
                    {dailyProfit >= 0 ? '+' : ''}{dailyProfit.toFixed(2)}
                  </Badge>
                </div>
              )}
              
              {/* User & Logout */}
              <div className="flex items-center gap-2 border-l border-border/50 pl-4">
                <div className="text-right hidden sm:block">
                  <div className="text-xs text-muted-foreground">Logado como</div>
                  <div className="text-sm font-medium truncate max-w-32">
                    {user?.email}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sair</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-call/10 to-call/5 border-call/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-call/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-call" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lucro Diário</p>
                  <p className="text-xl font-bold text-call">
                    ${dailyProfit?.toFixed(2) || '0.00'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Trades Hoje</p>
                  <p className="text-xl font-bold text-foreground">
                    {todayTrades || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-call/10 to-call/5 border-call/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-call/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-call" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Wins</p>
                  <p className="text-xl font-bold text-call">
                    {wins || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-put/10 to-put/5 border-put/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-put/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-put" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Losses</p>
                  <p className="text-xl font-bold text-put">
                    {losses || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Configuration Sections */}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Auto Trading Section */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Auto Trading</h2>
            </div>
            <Card className="border-primary/20">
              <CardContent className="pt-6">
                <AutoTradingCard 
                  config={autoTradingConfig}
                  updateConfig={updateAutoTradingConfig}
                  isPlacingTrade={isPlacingTrade}
                  lastTradeResult={lastTradeResult}
                  defaultOpen={true}
                />
              </CardContent>
            </Card>
          </section>

          {/* IQ Option Section */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-call/20 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-call" />
              </div>
              <h2 className="text-xl font-bold text-foreground">IQ Option</h2>
            </div>
            <Card className="border-call/20">
              <CardContent className="pt-6">
                <IQOptionSettingsCard defaultOpen={true} />
              </CardContent>
            </Card>
          </section>

          {/* WhatsApp Section */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-foreground">WhatsApp</h2>
            </div>
            <Card className="border-green-500/20">
              <CardContent className="pt-6">
                <WhatsAppSettingsCard defaultOpen={true} />
              </CardContent>
            </Card>
          </section>

          {/* User Management Section */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gold/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-gold" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Usuários</h2>
            </div>
            <UserManagementCard />
          </section>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-wrap gap-4">
          <button
            onClick={resetDailyTrades}
            className="px-6 py-3 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <BarChart3 className="w-4 h-4" />
            Resetar Trades Diários
          </button>
          
          <button
            onClick={refresh}
            disabled={isLoadingBalance}
            className="px-6 py-3 bg-call/20 hover:bg-call/30 text-call rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <TrendingUp className="w-4 h-4" />
            Atualizar Saldo
          </button>
        </div>
      </main>
    </div>
  );
};

export default Admin;
