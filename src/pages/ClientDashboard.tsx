import { LogOut, Bot, LayoutDashboard, Wifi } from 'lucide-react';
import { useState } from 'react';
import { IQOptionSettingsCard } from '@/components/IQOptionSettingsCard';
import { useNavigate } from 'react-router-dom';
import { ClientCopyTradingCard } from '@/components/ClientCopyTradingCard';
import { ClientResultsCard } from '@/components/ClientResultsCard';
import { ClientBrokerConnectionCard } from '@/components/ClientBrokerConnectionCard';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ClientDashboard = () => {
  const [tab, setTab] = useState('dashboard');
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const handleLogout = async () => {
    await signOut();
    navigate('/client/login');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 glass-card border-b border-border/50">
        <div className="container px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0"><Bot className="w-4 h-4 text-primary" /></div>
              <h1 className="text-sm sm:text-base font-bold truncate">Painel do Cliente</h1>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="hidden md:block text-xs text-muted-foreground truncate max-w-48">{user?.email}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-destructive px-2" aria-label="Sair"><LogOut className="w-4 h-4" /></Button>
            </div>
          </div>
        </div>
      </header>
      <main className="container px-4 py-4 sm:py-6 max-w-7xl">
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 h-auto gap-1">
            <TabsTrigger value="dashboard" className="text-xs sm:text-sm py-2 gap-2"><LayoutDashboard className="w-4 h-4" />Dashboard</TabsTrigger>
            <TabsTrigger value="brokers" className="text-xs sm:text-sm py-2 gap-2"><Wifi className="w-4 h-4" />Corretoras</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="space-y-4">
            <ClientBrokerConnectionCard onConfigure={() => setTab('brokers')} />
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <ClientCopyTradingCard />
              <ClientResultsCard />
            </div>
          </TabsContent>
          <TabsContent value="brokers" className="space-y-4"><section className="glass-card p-3 sm:p-4"><h2 className="font-semibold">Configurar conta IQ Option</h2><IQOptionSettingsCard defaultOpen embedded /></section><ClientCopyTradingCard settingsOnly /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default ClientDashboard;
