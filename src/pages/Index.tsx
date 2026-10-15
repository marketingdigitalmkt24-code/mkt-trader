import { SimulatedTradingChart } from '@/components/SimulatedTradingChart';

const Index = () => (
  <div className="min-h-screen bg-background text-foreground">
    <header className="px-4 pb-10 pt-12 text-center sm:pb-12 sm:pt-16">
      <p className="mb-3 text-xs font-mono uppercase text-gold">Trading · Análise · Tecnologia</p>
      <h1 className="text-3xl font-bold sm:text-5xl">AGÊNCIA <span className="text-call">MKT</span> TRADER</h1>
      <div className="mt-5 inline-flex items-center gap-2 text-xs font-mono text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-gold" />DEMONSTRAÇÃO</div>
    </header>
    <main>
      <SimulatedTradingChart />
      <p className="mx-auto max-w-3xl px-5 py-6 text-center text-xs leading-relaxed text-muted-foreground">Simulação ilustrativa com ganhos fictícios, não conectada à IQ Option. Não representa resultados reais nem garantia de lucro. Operações reais podem resultar em perdas.</p>
    </main>
  </div>
);

export default Index;
