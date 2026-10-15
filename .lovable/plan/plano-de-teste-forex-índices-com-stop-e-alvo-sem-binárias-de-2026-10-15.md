# Plano de teste: forex/índices com stop e alvo (sem binárias de 1 minuto)

## Objetivo
Testar se o lucro é possível com ganhos maiores que as perdas (ex.: alvo 2x o stop). Assim, cerca de 40% de acerto já pode dar lucro. Tudo começa só em TESTE, sem dinheiro real.

## 1. Pausar entradas reais agora
- Histórico bom, Tendência alinhada e Empate deixam de abrir real na IQ Option e deixam de ir para o Telegram.
- Tudo continua rodando só em TESTE, no card Últimas Operações.
- O Telegram recebe um aviso único: "Sinais reais pausados — período de testes".

## 2. Nova estratégia de teste: "Tendência com stop/alvo"
- Ativos: forex principais abertos (EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD) e índices quando o mercado estiver aberto. Sem OTC (o preço do OTC é gerado pela corretora).
- Entrada: a favor da tendência em gráfico de 5 minutos (médias 9 > 21 > 50 para compra, ao contrário para venda), depois de um recuo até a média 21.
- Stop: 1x a variação média das últimas velas (ATR 14). Alvo: 2x o stop.
- Saída também por tempo: fecha depois de no máximo 2 horas se não bater stop nem alvo.
- Uma operação por vez. Sem gale. Sem horário ruim (pausa das 08h às 12h BRT fica opcional, medida à parte).

## 3. Primeiro: estudo de 30 dias nos gráficos
- Antes de simular ao vivo, rodar essa regra nas velas dos últimos 30 dias da IQ Option.
- 20 dias para ajustar e 10 dias separados para conferir (para não enganar com sorte).
- Mostrar: número de entradas, acerto, ganho médio, perda média e resultado em "R" (múltiplos do stop).
- Só segue se os 10 dias de conferência derem resultado positivo.

## 4. Teste ao vivo simulado (2 a 4 semanas)
- O sistema simula as entradas em tempo real e acompanha o preço até bater stop, alvo ou tempo.
- Novo card "Teste Stop/Alvo" no painel admin: entradas abertas, fechadas, acerto, resultado em R e em dólar simulado (risco fixo de US$ 10 por entrada).
- Meta para considerar real: pelo menos 60 entradas e resultado positivo depois de custos (spread).

## 5. Decisão
- Se passar: liberar em conta real com valor pequeno, Telegram com stop e alvo na mensagem.
- Se não passar: manter o sistema como ferramenta de estudo, sem conta real.

## Detalhes técnicos
- Pausa: em auto-generate-signals forçar realTurn=false e desligar o gatilho EMPATE real (flag de configuração para religar).
- Estudo: nova função edge reaproveitando o download de velas de iqoption-pattern-study, com velas de 5 min e simulação de stop/alvo/tempo vela a vela (se stop e alvo caem na mesma vela, conta como stop).
- Teste ao vivo: nova tabela de posições simuladas (ativo, direção, entrada, stop, alvo, status, resultado_r, aberta/fechada em), atualizada pelo cron de cada minuto com preço ao vivo da IQ Option.
- Custos: descontar spread estimado por par no resultado.
