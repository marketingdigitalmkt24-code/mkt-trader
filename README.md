# MKT TRADER | TAKASHI

Criar uma ferramenta de análise técnica avançada para opções binárias e digitais, identificando entradas de alta probabilidade com base em confluência de indicadores, price action e controle de risco, exibindo apenas os melhores sinais do momento.

⏱ CONFIGURAÇÕES DE OPERAÇÃO

Tipo de Operação: Binárias e Digitais

Timeframes: M1 e M5

Expiração:

M1 → expiração 1 a 2 minutos

M5 → expiração 5 minutos

Ativos: Forex e Cripto com maior liquidez na IQ Option

📊 INDICADORES UTILIZADOS (FOCO EM CURTO PRAZO)

RSI (14) – Sobrecompra e sobrevenda

EMA 9 e EMA 21 – Direção e pullback

Bandas de Bollinger (20,2) – Excesso de preço

Price Action (padrões de candle)

Suporte e Resistência dinâmicos

🔥 LÓGICA DAS ENTRADAS (PONTO FORTE DO APP)
🟢 ENTRADA CALL (COMPRA)

Gerar sinal somente se houver no mínimo 3 confirmações:

RSI abaixo de 30

Preço tocando suporte ou banda inferior

Candle de reversão (martelo, engolfo, pin bar)

Tendência neutra ou levemente favorável

🔴 ENTRADA PUT (VENDA)

Gerar sinal somente se houver no mínimo 3 confirmações:

RSI acima de 70

Preço tocando resistência ou banda superior

Candle de reversão (estrela cadente, engolfo)

Tendência neutra ou levemente favorável

🚫 FILTROS DE SEGURANÇA (ANTI LOSS)

❌ Não operar em:

Mercado lateral extremo

Alta volatilidade (notícias)

Candles muito grandes (spikes)

❌ Bloquear sinais após:

2 perdas consecutivas no mesmo ativo

⭐ CLASSIFICAÇÃO DOS SINAIS (DESTAQUE VISUAL)

Cada entrada deve mostrar:

Tipo: CALL ou PUT

Ativo

Timeframe

Expiração sugerida

Força do Sinal: ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐

Status: “Alta Probabilidade” ou “Moderado”

👉 Mostrar em destaque:

🔥 MELHORES ENTRADAS AGORA

💰 GESTÃO DE BANCA INTELIGENTE

Sugestão automática:

1% a 3% da banca por operação

Alerta de overtrade

Aviso após sequência negativa

Nunca sugerir martingale agressivo

📱 INTERFACE DO USUÁRIO

Dashboard simples e rápido

Cores intuitivas:

Verde = CALL

Vermelho = PUT

Ranking de ativos com melhor desempenho

Versão mobile-first

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mkt-trader.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d3e2a176-52ca-417e-942e-9fcd400b5217).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
