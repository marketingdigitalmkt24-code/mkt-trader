# Histórico de acertos por nota
- [x] Autorização Demo ampliada para todas as notas calculadas exatas dos WIN confirmados, paginadas e atualizadas por ciclo; seleção e envio publicados, principal preservada. 54 testes finais aprovados, build OK; ciclo automático registrou 373 notas de 374 WIN e 23 rejeições sem correspondência. Padrão vencedor conferido no painel autenticado: MAGNIFICENT7 21:01 BRT, 1W/0L +US$1,66; amostra insuficiente para provar lucro. Nova execução depende de candidato com nota idêntica, sem ordem forçada.
- [x] Congeladas 59 notas WIN e oito LOSS anteriores a 24/10 21:01 BRT com precisão IEEE-754; seleção e envio Demo sem arredondamento/fallback, principal preservada. 78 testes aprovados, funções publicadas, build OK e ciclo 01:08 UTC recusando notas fora da lista; nenhuma ordem forçada.
- [x] Tela Perdas Demo: 354 LOSS confirmados paginados, filtros por período/ativo/estratégia, nota integral, gráfico e tabela de velas, evidências e limitações históricas. Nove testes aprovados, build OK; TESLA e página 2 conferidas com sessão admin, celular sem overflow e sem erros.
- [x] Igualdade sem arredondamento nas 14 notas liberadas Demo e 2,26 principal publicada; migração 0049 verificada, 90 testes aprovados, build OK. Ciclo 00:55 UTC recusou GOO/GLE 2,029310 como 2,03; sem ordem forçada, histórico preservado.
- [x] Bloqueio GEV retirado; correspondência com qualquer WIN confirmado da amostra aceita além das 14 notas, com limites preservados. Origem persistida e selo prospectivo Padrão vencedor implementado; 40 testes aprovados, build OK e rotina nova confirmada às 23:30/23:31 UTC.
- [x] Correspondência prospectiva conferida na ordem MAGNIFICENT7-OTC 24/10 21:01 BRT: pattern_match persistido com referência AUD/CAD, WIN +US$1,66; painel mostra Padrão vencedor 1W/0L, estratégia original preservada.
- [x] Seis notas incorporadas às 14 referências e prioridades Demo; 42 testes aprovados, build OK e painel conferido. Rotina publicada e leitura das 14 notas confirmada às 23:25 UTC; principal/Telegram/copy só 2,26, bloqueios preservados.
- [x] Atualização por eventos de ordens/velas e consulta automática a cada 10 segundos, incluindo WIN recém-confirmados; seleção e últimos dados preservados. Quatro testes aprovados, build OK; consulta automática, horário atualizado e nota 2,20 mantida com três gráficos conferidos no painel. Nenhuma nova ordem WIN forçada para teste.
- [x] Aba Padrões vencedores com 41 gráficos WIN das oito notas, janela atual de referências, velas pré-entrada e comparação lado a lado com análises registradas. Oito testes aprovados, build OK; seis gráficos 2,26, comparação real e celular sem overflow conferidos. Referências disponíveis antes da decisão; candidato aparece somente após análise, sem pausar execução.
- [x] Rejeições prospectivas registradas com primeiro bloqueio e valores reais; lista admin com filtro exato e paginação, sem resultados fictícios. 37 testes aprovados, função publicada, build OK; 23 rejeições das 20:17 BRT conferidas no painel e filtro 2,69/página 2 verificados. Rejeições anteriores sem registro não reconstruídas.
- [x] Operações da nota exata com gráficos individuais na mesma aba; reutilizada comparação prevista/fechada e próxima vela real, paginação de seis ordens. Doze testes aprovados, build OK; seis operações 2,26 e segunda página 2,03 conferidas com sessão admin, celular sem overflow/erros. Execução preservada.
- [x] Aba admin somente leitura criada com notas exatas, saldo acumulado, taxa de acerto, filtros de período/nota e ordenação; oito testes aprovados, build OK, 718 ordens Demo conferidas com sessão admin, filtro 2,26 e Hoje funcionando, sem erros nem rolagem horizontal no celular. Prioridades de execução preservadas.

# Prioridade Demo por notas vencedoras
- [x] Oito notas reordenadas dinamicamente por saldo positivo, acerto, ganhos e saldo no histórico completo; 42 testes aprovados, rotina publicada e leitura real confirmada às 23:13 UTC: 2,26 → 2,23 → 2,18 → 2,64 → 2,88 → 2,69 → 2,91 → 2,03. Painel autenticado e build OK; sem candidato correspondente no minuto, bloqueio preservado e autorização principal inalterada.
- [x] Correspondência gráfica às oito notas obrigatória, sem alternativa; 32 testes aprovados, função publicada e republicada às 22:56 UTC, build OK; rotina ao vivo confirmada às 22:57 UTC (boot novo + "Demo blocked"), 0 ordens Demo desde 22:17 UTC.
- [x] Prioridade das próximas escolhas e gráficos vencedores das notas 2,26; 2,23; 2,18; 2,64; 2,88; 2,03; 2,69; 2,91 implementada, preservando nota original, filtros e autorização principal só 2,26.
- [x] 38 testes aprovados, multi-strategy-test publicada, build OK e painel autenticado conferido com notas carregadas.
- [ ] Conferir primeira seleção prospectiva da nova prioridade — depende de candidato elegível no minuto; nenhum novo selecionado às 22:06 UTC, sem replay/ordem forçada.

# Autorização adicional da nota Demo 2,26
- [x] Liberada exatamente nota exibida 2,26 nos filtros e claim, preservando faixa 4,0–<4,5, limites, Telegram e copy; migração 0044 aplicada, três executores publicados, 18 testes aprovados e build OK.
- [ ] Conferir primeira execução prospectiva completa — depende de nova Demo elegível e contas/limites disponíveis, sem replay.

# Retirar e desativar Tendência normal IQ
- [x] Bloqueada principal normal e cópias, retirada do histórico admin/cliente; Demo e estratégias invertida/3 perdas, registros financeiros e conciliação preservados.
- [x] Migração 0041 e dois executores publicados; claim sem fallback normal e serviço-only conferido; 34 testes aprovados, build OK e painel admin autenticado sem Tendência normal no histórico. Cliente validado pelos filtros/testes compartilhados, sem sessão cliente distinta.

# Exclusão permanente do histórico IQ Option
- [x] Ampliada e publicada cópia das novas entradas confirmadas do admin, incluindo Antecipação e Tendência 3 perdas; mantém controles/limites dos clientes, minuto/expiração originais e isolamento TESTE. 42 testes aprovados, build OK e painel autenticado conferido.
- [x] Restaurada e publicada cópia da Tendência principal confirmada pelo executor existente; preserva conta/valor/limites do cliente e minuto original, sem TESTE/replay. 35 testes aprovados, build OK, painel admin autenticado conferido; um cliente conectado com copy ativo identificado.
- [ ] Conferir primeira cópia principal no cliente após ampliação — depende de nova ordem autorizada e janela disponível; nenhuma nova principal no intervalo observado, sem replay ou negociação forçada.
- [x] Autorização Tendência selecionada → ordem principal adicional implementada e publicada com claim atômico, conta/valor principal, limites e ativo M1; Telegram após confirmação IQ, sem copy/replay. 22 testes aprovados, chamada com sessão navegador recusada 401. Configuração atual PRACTICE/US$10; Demo TESTE preservada.
- [x] Resultado Tendência principal USD/CHF-OTC 22:20 BRT confirmado LOSS −US$10 no registro e painel autenticado; alerta de entrada Telegram previamente confirmado.
- [x] Excluídos permanentemente 1.001 registros principais e 831 cópias; consulta confirmou zero entradas IQ restantes de qualquer dia/cliente, 18.848 TESTES simulados e 164 ordens Demo preservados. Painel admin autenticado conferido sem entradas e com resultado zerado; histórico cliente confirmado pela fonte compartilhada, sem sessão cliente distinta. Saldo/configuração da corretora intactos.

# Testes executados na Demo
- [x] Queda win +1 selecionada autorizada adicionalmente na principal/Telegram/copy: claim exige LOSS confirmado Queda win CALL no mesmo ativo/minuto anterior, stake/limites principais atuais. Migração 0040 e três funções publicadas; 37 testes aprovados, build OK e acesso serviço-only conferido. Original Queda win continua Demo-only.
- [x] Tendência WIN Demo → próximo Tendência selecionado invertido implementada no claim principal atômico (prioridade sobre principal normal, sem duplicar). Direção retornada usada na IQ, registros, Telegram e copy; valor/limites atuais e ativo aberto preservados. Migração 0039 aplicada, três funções publicadas, 34 testes aprovados, grants serviço-only conferidos, build OK e painel autenticado sem erros.
- [ ] Conferir primeira Tendência invertida e Telegram/copy — depende de WIN Demo + novo Tendência imediatamente seguinte, janela aberta e limites livres; nenhuma ordem anterior reexecutada e nenhuma inversão confirmada no intervalo.
- [x] Queda win verificada sem ordens anteriores; corrigida leitura antecipada dos resultados com conciliação por ID na sessão existente. Queda win +1 candidata CALL somente no minuto após LOSS original, mesmo ativo/valor, sem repetição recursiva; filtro/slot preservados. Duas funções publicadas, 31 testes aprovados e build OK.
- [ ] Conferir primeira Queda win +1 Demo/principal, Telegram e copy no painel — depende de nova Queda win LOSS confirmada e seleção dentro da janela; ainda sem ordens Queda win/+1 confirmadas, sem replay.
- [x] Preparação Demo publicada: login/WebSocket antes do próximo minuto, leituras independentes paralelas e histórico enviado depois da ordem. 28 testes aprovados. Execução real observada USD/CHF-OTC 22:20 BRT: velas :00.282, candidato :00.761, envio :03.153, confirmação :03.255; entrada lida no painel autenticado, build OK. Não garante :00 exato.
- [x] Publicadas otimizações pendentes da entrada Demo: sessão de serviço reaproveitada, leituras em paralelo e gráficos fora do envio; testes de sessão/seleção aprovados, :00 exato não garantido.
- [x] Incluir a próxima vela fechada no gráfico Demo; sete testes aprovados, rotina publicada e painel conferido; coleta automática não força ordens.
- [x] Assertividade agora lê todas as estratégias confirmadas Demo separadamente; contagem reiniciada às 16:33 BRT sem apagar ordens ou alterar demais totais. Seis testes aprovados, painel conferido Tendência/Vela de força 0W/0L, build OK.
- [x] Criar Continuação de queda Demo separada (corpo ≥70%, pavio inferior ≤10%, médias em queda, até 3 vermelhas; 100 velas fechadas contíguas); competir com seleção atual em ledger exclusivo, sem alterar claims principais. 16 testes aprovados, duas funções publicadas, painel e build OK; seleção prospectiva 16:30 VELA_FORCA registrada.
- [x] Continuação de queda conferida por consulta: 31 WIN, 32 LOSS e 2 empates confirmados até 24/10 03:15 UTC; novas ordens preservadas, sem replay.
- [x] Comparação somente leitura do padrão AMZN/ALIBABA-OTC 16:22: 25 sinais Tendência com 100 velas anteriores; aproximação primeira vela PUT/pavio inferior ≤10%/extensão ≤1,5 ATR encontrou referência WIN +0,83 e BONK 16:18 LOSS -1. Amostra insuficiente, corpo grande não medido pelo estudo atual; nenhuma regra automática alterada.
- [x] Consulta atual ALIBABA confirmou aberta somente em binary, ID1908, expiração disponível 900s (15min), ausente de turbo/M1. Bloqueio Demo M1 mantido; sem ordem retroativa nem mudança de prazo. Diagnóstico somente leitura publicado, 10 testes e build OK. MSFT não inspecionada ao vivo nesta consulta.
- [x] Valor entrada de teste Demo configurável separadamente no Auto Trading; US$1 salvo e conferido após recarregar, executor publicado usa valor persistido e grava por ordem. Dez testes aprovados e build OK; preservados histórico e valores principais/clientes. Valor diferente não enviado sem escolha do usuário.
- [x] Mostrar ganhos, perdas, acerto e saldo acumulado Demo de todas as páginas; conferidos no painel 6 ganhos/6 perdas, 50%, -US$1,05. Dez testes aprovados e build OK. Seleção existente já avalia sete estratégias e envia somente o melhor candidato do minuto; removidas e shadows preservadas fora do ranking.
- [x] Corrigir leitura dos IDs e resultados do histórico Demo; cinco IDs informados liquidados e conferidos no painel: 15:59 WIN +0,82; 16:00 LOSS -1; 16:01 WIN +0,83; 16:02 e 16:03 LOSS -1 cada. Sete testes aprovados; função publicada e build OK, sem alterar operações principais.
- [x] Executor e agendamento publicados para sinal TESTE selecionado por minuto na Demo USD por US$1, com unicidade por minuto e ordens simultâneas independentes.
- [x] Ledger separado e conciliação por ID IQ exato; lista Demo autenticada conferida sem Telegram, copy ou inclusão em Entradas IQ/Resultado de Hoje. O saldo Demo da própria corretora será afetado.
- [x] Oito testes de valor, conta, frescor e isolamento aprovados; build OK.
- [x] Corrigidos erro de inicialização e atraso da fila; envio imediato após seleção. Ordens ARB/USD-OTC Demo US$1 #14383504823 (15:59) e #14383507171 (16:00) confirmadas e lidas no painel; sem repetir histórico.
- [x] Confirmada liquidação pelo ID exato no histórico Demo e na lista autenticada; primeira ordem #14383504823 WIN +US$0,82.

# Últimas operações somente reais
- [x] Limpar a exibição a partir de 23/10 15:39:21 BRT e mostrar só ordens principais confirmadas na IQ Option; registros e Resultado de Hoje preservados.

# Remover testes do card Antecipação e desativar Rejeição por pavio
- [x] Retirados placar e lista simulados; seis ordens confirmadas preservadas e conferidas no painel autenticado. Novos sinais de pavio bloqueados, histórico preservado; rotina publicada, 27 testes aprovados e build OK.

# Tendência 3 perdas → venda
- [x] Criar autorização prospectiva após três perdas Tendência em minutos consecutivos, PUT no próximo candidato, IQ + Telegram; preservar TESTE, limites e demais estratégias. Função separada acionada por sinal original/fechamento, sem republicar geradores divergentes; mercado M1 confirmado antes de reservar.
- [x] 20 testes aprovados, função publicada, claim só serviço, acesso usuário recusado; painel autenticado sem erros e build OK.
- [ ] Confirmar primeira ordem e Telegram — depende de sequência nova elegível, ativo aberto e limites livres; nenhuma ordem forçada ou histórica.

# Antecipação de Força — execução IQ autorizada
- [x] Comparar 2.689 Força encerradas em 218 ativos, 2.530 cobertas/159 lacunas; 2 pendentes excluídas. Todos os minutos anteriores vencem por seleção retrospectiva, não vantagem: v3 sem volume 151 casos, rejeição pequena387/sequência27. Relatório/CSV entregues; 10 testes e build OK. Nenhuma entrada alterada; validação preditiva exige todos os minutos, não só Força.
- [x] Publicar v3: corpo até 65% amplitude/85% média20, RSI CALL40–75/PUT25–60, volume reportado ≥0,5×média20; alinhamento preservado. 34 testes aprovados. Referência descritiva de 32 sinais PENGU/RAYDIUM (18W/14L), sem volume histórico: não valida acerto/retorno da antecipação. Comparação v2/v3 registrada na rotina; envio prospectivo depende de ordem fresca confirmada.
- [x] Habilitar Telegram após confirmação IQ da antecipação fresca e vincular resultado pelo ledger, sem TESTE/copy; 19 testes aprovados e função publicada.
- [ ] Confirmar primeiro envio prospectivo de antecipação ao Telegram — ainda não há ordem IQ elegível registrada; não reenviar histórico ou forçar sinal.
- [x] Habilitar execução principal na conta configurada, sinal fresco, ativo aberto, reserva, valor/limites atuais e confirmação IQ; TESTES separados, sem copy/Telegram. Atual conta PRACTICE, valor 10; metas percentuais bloqueiam sem saldo verificado.
- [x] 36 testes, build OK, painel autenticado conferido; rotina 16:07 solicitou velas em :00.082, 122 ativos, nenhum sinal elegível.
- [ ] Confirmar primeira ordem da Antecipação e resultado no painel — depende de novo sinal elegível em mercado aberto; nenhum sinal forçado ou histórico reexecutado.
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
- [x] Estrategia Demo "Queda win" (QUEDA_WIN_CALL_V1): CALL no minuto seguinte a WIN confirmado de Queda PUT; policy, rotulos e 21 testes OK; deploy multi-strategy-test + iqoption-demo-tests
