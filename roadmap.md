# Antecipação de Força — TESTE
- [x] Preparar conexão antes do próximo :00 e preservar horário/preço observados; acesso automático corrigido com credencial privada, 23 testes e build OK. Rotina alvo 15:59:00 concluída 15:59:01, 120 ativos consultados, sem sinal elegível; :00 exato não garantido, sem alterar reais.
- [x] PUT espelhado, liquidação por direção e rótulo correto; 20 testes aprovados, rotina publicada, build OK e primeiro PUT UK100:N 15:49:12 registrado e lido no painel autenticado; sem alterar reais/copy/Telegram.
- [x] Exigir sessão IQ cobrindo análise/expiração M1 e suspensão confirmada; JAPAN225:N fica bloqueado por divergência entre API habilitada e tela do usuário. Não interpretar option.start_time como abertura de mercado. Testes e execução autenticada conferidos; registros antigos preservados.
- [x] Criar regra prospectiva após primeira vela vermelha pequena, com médias, RSI e volume disponível, isolada em force_anticipation_tests; sem alterar reais/copy/Telegram.
- [x] 16 testes aprovados, geração na rotina por minuto existente e painel admin conferido; 117 ativos consultados, 29 com volume informado. Primeiro CALL JAPAN225:N 15:37:25 BRT gravado e fechado LOSS simulado -10, lido na tela. Sem validação de vantagem lucrativa.

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
- [x] Bloquear ativação sem conexão confirmada e mostrar orientação para Corretoras; botão e navegação conferidos em visualização desconectada, sem alterar conta. 16 testes aprovados.
- [x] Ajustar e conferir principal, admin e cliente em 375, 768 e 1280px, incluindo todas as abas; sem rolagem horizontal, build OK.
- [x] Colocar conexão primeiro e mover entrada/meta para Corretoras; navegação autenticada conferida.
- [x] Verificar entradas e histórico: WLD e dias 16–19/10 visíveis no admin; cliente aberto sem cópias. 15 testes aprovados, build OK.
- [x] Resumir conexão com corretora/email, ativação segura e acesso à aba Corretoras; 15 testes aprovados e navegação autenticada conferida. Conta aberta é admin, copy desligado, sem cópias; histórico agora preserva estratégias nulas e atualiza em 10s.
- [x] Organizar banca, entradas e conexão com abas Dashboard e Corretoras, preservando copy.
- [x] Mostrar operações abertas próprias acima das entradas; isolamento testado e abas verificadas com sessão autenticada. Nenhuma operação aberta disponível durante a conferência.

# Estudo Vela de Força — oito ordens
- [x] Recuperar velas anteriores: oito ordens e duas perdas com cobertura, sem alterar entradas reais.
- [x] Comparar 804 TESTE anteriores (758 cobertos): corpo≥90% retém 6/8 ganhos mas fica em 46,63% e 51,81% nos períodos anteriores, retorno negativo. Relatório entregue; 7 testes, estudo autorizado e acesso anônimo 401.

# Entrada única e valores independentes
- [x] Permitir clientes distintos na mesma conta IQ do admin, preservando valores e limite por usuário; reserva e placement atualizados, 21 testes e build OK. Nenhuma nova ordem no intervalo; cópia futura ainda não observada.
- [x] HYPE 02:13: uma principal e duas cópias na mesma conta; rejeitar self/shared-principal copies na reserva e placement. Salvar 10 e conferir após reload; 9 testes e build OK. Vela forte sem rompimento20; nenhuma nova ordem autorizada ocorreu durante a verificação, execução futura ainda não observada.
- [x] Limitar a principal e cada cliente a uma operação por vez, com reservas atômicas e bloqueio conservador de confirmação ambígua.
- [x] Validar valores exatos do admin Auto Trading e cliente Corretoras, sem fallback nem escala: 20 testes; ordem EOS com entrada/configuração 100 conferida. Copy real não exercitado sem cliente ativo.

# Conferência PENGU e paginação
- [x] Encurtar os rótulos para “forca sem”; painel autenticado sem erros e build OK. Sem resultados dessa estratégia disponíveis para conferir o rótulo na tela.
- [x] Estudar RAYDIUM 02:54: vela 02:53 verde (1,874625→1,894475), corpo 89,50%, 6,14×média20 e rompimento; CALL 02:53→02:54 venceria retrospectivamente. Regra congelada RSI/médias/compressão com 100 velas anteriores não gerou sinal às 02:53; nenhuma operação alterada. Nove testes aprovados.
- [x] Criar estratégia separada TESTE sem rompimento + primeira vela; 17 testes passaram, funções publicadas e admin conferido sem erros. Ainda sem ocorrência prospectiva; acerto e retorno aguardam novos sinais elegíveis.
- [x] PENGU #14372665294: vela 02:23 fechou 8,457475 acima da máxima20 8,422765; corpo 72,3%, ordem LOSS -10. Estudo somente leitura, minuto registrado como aproximação da entrada.
- [x] Cache/prefetch de páginas, contagem só na primeira, enriquecimento paralelo e placares diários memoizados; navegação autenticada 1→2→3→2→1 em 0,057–0,097s, sem erros; 10 testes e build OK.

# Remover entradas de hoje no admin e no cliente (21/10/2026) — CONCLUÍDO
- [x] Corrigir alcance: somente o dia BRT do reset até o corte fica oculto; admin mostra 16–20/10 novamente. 100 cópias anteriores preservadas pelo filtro; 14 testes e build OK. Conta cliente distinta não exercitada na tela.
- [x] Corte global de exibição em iq_display_reset (tabela nova, gravação só admin); reset do admin aplica em admin e cliente
- [x] Aplicado em Entradas IQ, Resultado de Hoje, Histórico Diário, saldo/profit e cópias do cliente (exibição, sem apagar registros)
- [x] Corte aplicado agora (21/10 ~18:27 UTC); admin verificado zerado no preview; TESTE preservado em Operações em Tempo Real
- [x] 103 testes OK (bun), build OK
