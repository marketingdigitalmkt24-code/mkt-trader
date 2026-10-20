import { Wifi } from 'lucide-react';
import { IQOptionSettingsCard } from '@/components/IQOptionSettingsCard';

export function ClientBrokerConnectionCard() {
  return (
    <section className="glass-card p-3 sm:p-4">
      <h2 className="flex items-center gap-2 font-semibold text-base"><Wifi className="w-4 h-4 text-primary" />Conexão Corretora</h2>
      <IQOptionSettingsCard defaultOpen embedded />
    </section>
  );
}
