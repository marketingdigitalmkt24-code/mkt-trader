# Roadmap — troca de estratégias reais (18/10/2026) — CONCLUÍDO

- [x] 1. Tendência, THREE_FORCE, FOUR_WIN_REVERSAL → só TESTE (claims desativados)
- [x] 2. Reversão RSI, Retomada, Força Invertida → reais (IQ Option + Telegram) via claim_test_strategy_entry
- [x] 3. Backfill desde 16/10 como "real simulada" (prefixo sim-): RSI 7W/2L, Retomada 5W/2L, Força Invertida 18W/11L
- [x] 4. Histórico real das removidas apagado (admin + cliente); TESTE preservado
- [x] 5. Rótulos admin/cliente atualizados (Retomada, Força Invertida)
- [x] 6. 81 testes OK, funções republicadas, build OK

# Horário de entrada e Força Invertida
- [x] Reduzir esperas na análise e preparação de ordens sem antecipar velas fechadas.
- [x] Comparar 29 perdas reais com abertura :00: 2 ganhos simulados, 27 perdas; histórico preservado.
- [x] 27 testes aprovados; duas funções publicadas; acesso manual não autorizado recusado.
- [x] Confirmar horário real após ajuste — SEI #14369555193 abriu às 02:26:03,603 BRT; :00 ainda não garantido.

# Informação de teste e ordem real
- [x] Separar resultado simulado :00 e resultado IQ vinculado na Força Invertida sem alterar estatísticas.
- [x] Validar vínculo SEI na área administrativa: simulado WIN +8,50 e ordem #14369555193 LOSS -10 separados; 6 testes aprovados.

# Estudo de viés M15
- [x] Consultar 253 ativos e recuperar 126.380 candles M15; 5.028/5.348 entradas analisáveis, 320 excluídas por lacunas regulares.
- [x] Cruzar candles fechados antes do minuto de entrada; separar TESTE/corretora e OTC/regular. Corretora usa minuto de registro aproximado, não fill exato.
- [x] Cinco testes aprovados; chamada admin e rejeição sem autorização verificadas; relatório e CSVs com validação temporal de 19/10 entregues, sem alterar operações.

# Estudo Tendência e velas anteriores
- [x] Recuperar 1.234.687 candles M1 de 251 ativos; 3.863/4.040 entradas analisáveis, 177 excluídas.
- [x] Comparar extensão, sequência e pavio: combinado OTC 49,11% em 19/10, sem melhora consistente nos dias anteriores.
- [x] Dez testes aprovados, admin autorizado e acesso anônimo recusado; relatório e CSVs preparados sem alterar entradas.
- [x] Regra de antecipação da vela forte (somente estudo) testada 17–19/10: ~49,8% acerto, sem vantagem
- [x] Teste entrada no meio da vela (30s, histórico 17–19/10): ~50% acerto, retorno negativo

# Painel do cliente
- [x] Resumir conexão com corretora/email, ativação segura e acesso à aba Corretoras; 15 testes aprovados e navegação autenticada conferida. Conta aberta é admin, copy desligado, sem cópias; histórico agora preserva estratégias nulas e atualiza em 10s.
- [x] Organizar banca, entradas e conexão com abas Dashboard e Corretoras, preservando copy.
- [x] Mostrar operações abertas próprias acima das entradas; isolamento testado e abas verificadas com sessão autenticada. Nenhuma operação aberta disponível durante a conferência.
