# Recuperação Demo com quatro gales (28/10/2026)
- [ ] Análise Takashi por velas atuais da IQ Option e gráficos Demo confirmados, sem ranking por nota; testar seleção e registrar correspondência.
- [ ] Repetir implantação segura dos quatro gales pelo retorno, preservando confirmação, saldo e isolamento Demo: nova tentativa recusada pela mesma colisão protegida 0058/0059; SQL não executado, gales não ativados.
- [ ] Recuperação pelo retorno na próxima Takashi válida; máximo quatro gales/reinício base e exibição do nível: bloqueada pela colisão protegida dos snapshots 0058/0059; gravação segura não aplicada, executor/valores permanecem inalterados. Requer reparo do histórico de alterações da cópia pela plataforma.
- [x] Ganhos/perdas monetários e saldo líquido confirmado com eventos e polling; saldo da corretora atualizado pelo leitor compartilhado, sem misturar totais principais. Seis testes passaram; admin autenticado confirmou 32 WIN/32 LOSS, ganhos US$26,52/perdas US$32/saldo -US$5,48, sem erros; build OK. Gales não ativados.

# Confirmação rápida e busca contínua Demo (27/10/2026)
- [x] Pendências relidas após :00 com histórico repetido :01/:03/:06/:10/:15 na sessão preparada, separado da análise/envio; tentativa adicional de login só na preparação. 393 testes passaram, publicado e build OK.
- [x] Rotina ao vivo 22:04/22:05 analisou 110 ativos e consulta :01 confirmou zero pendências; painel autenticado mostrou SUGAR WIN/LOSS reais e IA Analisando. Principais/Telegram/clientes preservados.
- [ ] Medir atraso de fechamento de nova ordem com as novas tentativas: depende de candidato Takashi válido em mercado M1; nenhum novo envio autorizado durante conferência, sem forçar operação.

# Aprendizado recente Takashi (27/10/2026)
- [x] Ajuste recente da nota usa até 500 resultados próprios confirmados PRACTICE dos últimos 14 dias, paginados e deduplicados, incluindo os recém-liquidados; WIN favorece e LOSS penaliza. 390 testes passaram, sem mudança dos demais ajustes ou da elegibilidade por nota finita.
- [x] Publicado e confirmado na rotina 21:58 UTC: 24 resultados próprios lidos (11 WIN/13 LOSS). Painel autenticado conferido com notas/ordens reais; principais/Telegram/cópias zerados e build OK.

# Resultado SUGAR e entrada Demo :00 (27/10/2026)
- [x] SUGAR #14395548093 confirmou WIN +US$0,82 e foi conferida no painel; recuperação publicada consulta pendências Demo expiradas de qualquer minuto, por ID exato, mesmo sem candidato.
- [x] Envio Demo publicado na conexão PRACTICE já preparada, com reserva única, velas fechadas, mercado/valor/frescor rechecados; 386 testes passaram. Principais/Telegram/cópias seguem zerados.
- [x] Envio natural após otimização confirmado: SUGAR 21:56 enviada :00,665 e confirmada :00,840; :00 exato continua sem garantia.

# Título da lista de notas (27/10/2026)
- [x] Cabeçalho da aba Estratégias passou de "Notas com WIN e nenhum LOSS" para "Notas | Mais WIN"; painel autenticado confirmou "Notas | Mais WIN · 2" com notas 1,51 e 0,00 (1 WIN, 0 LOSS), 17 testes passaram, build OK.

# Card de análise IA (27/10/2026)
- [x] Card mostra IA Analisando e lê candidatos/rejeições Takashi Demo com notas e horários BRT; admin autenticado confirmou 3 ativos registrados e análise recente, sem STANDBY. Nove testes passaram, build OK; principal, Telegram e clientes preservados. Lista representa registros, não todos os mercados consultados.

# Tempo limite no painel (27/10/2026)
- [x] Consulta de resultados retorna imediatamente sem ordens principais pendentes; login limitado a uma rodada de três endpoints (5s cada), WebSockets 10s e consulta do navegador sem sobreposição com cancelamento. Executor publicado respondeu 200; 13 testes passaram; admin autenticado sob 504 simulado continuou visível sem erros, com Takashi 1,51 WIN +US$0,82 e nova nota 1,03. Build OK.

# Takashi exclusiva Demo (27/10/2026)
- [x] Somente Takashi na Demo com qualquer nota finita, sem principal/mid-candle/observações extras; rotina privada por minuto ativa e dois executores publicados. 27 testes aprovados; primeiro ATOMUSD-OTC CALL PRACTICE US$1 confirmado às 21:11 UTC, nota bruta 1,50818880024869 exibida 1,51 no admin. Fila principal, resultados principais/TEST, Telegram e cópias ativos zerados. Aprendizado sem histórico contribui zero, sem inventar resultados.

# Interrupção das estratégias principais (27/10/2026)
- [x] Todas as entradas principais IQ Option, cópias e avisos Telegram bloqueados nos executores; configurações automáticas/cópias desligadas, sete funções publicadas, 17 testes aprovados e principal publicada recusou 410. Demo/histórico preservados.
- [ ] Defesa adicional: substituir claim_takashi_after_226 por retorno nulo; migração não aplicada devido à colisão preexistente dos snapshots 0058/0059 protegidos. Executores publicados bloqueiam antes de chamar essa função.

# Remix setup (27/10/2026)
- [x] Telegram connection linked and bot verified; seven notification-related functions deployed with the new connection.
- [ ] Update GOOGLE_AI_API_KEY, GROQ_API_KEY, METAAPI_ACCOUNT_ID, METAAPI_TOKEN, ZAPI_CLIENT_TOKEN, ZAPI_INSTANCE_ID, ZAPI_PHONE_NUMBER and ZAPI_TOKEN: secure update form was declined; new values remain required.
- [ ] Clear copied Drizzle migrations and scaffold empty history: copied 60-entry migration set remains; direct journal/snapshot deletion is protected by the migration workflow and no supported remix-reset action is available.

# Movimento diário das notas (27/10/2026)
- [x] Gráfico de linha de 30 dias com entradas/saídas por dia BRT reconstruídas de Demo confirmada, sem duplicar notas entre estratégias. Leitura paginada independente; criação de RPC não aplicada por conflito preexistente nos snapshots protegidos, sem alteração no banco.
- [x] Lista por mais WIN; 17 testes passaram. Admin autenticado confirmou duas linhas, 293 entradas/75 saídas e notas 2,23/2,18 com 7 WIN primeiro; histórico e gráfico no hover preservados, sem erros na tela.

# Lista de operações por nota (27/10/2026)
- [x] Retirado gráfico top 10; notas agrupadas e ordenadas da maior para a menor, estratégias somente no histórico aberto. Lista Demo reutilizada com datas BRT e gráficos no hover; admin autenticado confirmou nota 7,37/ALIBABA-OTC com WIN e gráfico, 14 testes passaram, sem erros na tela.

# Estratégias e notas rejeitadas (27/10/2026)
- [x] Gráfico das dez notas por estratégia com mais WIN, total Demo + rejeitadas TEST e datas reais de início/último WIN ao selecionar; filtros e exclusão por LOSS preservados. Nove testes passaram e painel autenticado confirmou dez notas e início da nota 2,34 em 23/10/2026 18:20 BRT, sem erros ou overflow.
- [x] Resumo admin somente leitura substituiu transferência do histórico completo; abertura autenticada medida em 1,74s, 278 grupos. LOSS retira nota inclusive fora do período, eventos e polling 10s; Vela de força 2,99 saiu após LOSS TEST confirmado. Registros preservados, 12 testes passaram e build OK.
- [x] Criar aba Estratégias com notas por estratégia com WIN e zero LOSS, incluindo rejeitadas com resultado TEST separado; histórico completo paginado, filtros de estratégia/período, nenhuma alteração na execução.
- [x] Mostrar nota registrada nas rejeitadas em Padrões vencedores; painel autenticado confirmou 279 grupos e notas em 10 rejeitadas, gráficos preservados, sem erros. 14 testes passaram e build OK.

# Análise Takashi Demo (26/10/2026)
- [x] Comparadas 494 ordens PRACTICE confirmadas por signal_id/minuto exatos, todas com 20 velas pré-entrada contíguas: 256 WIN/238 LOSS, 51,82%, −US$124,25 (5 empates excluídos). Último WIN da amostra 26/10 14:07 UTC; snapshots posteriores excluídos das features.
- [x] Validação cronológica: treino 329 ordens (47,72%), holdout 165 (60%, +16,85 unidades de entrada). Vizinhos lucrativos k=7/15/25 só usam resultados liquidados antes da entrada; holdout filtrado 55,81%/47,92%/51,61%, abaixo do baseline. Pavios ≥20%, corpo ≤50%, direção de entrada e corpo decrescente não mostraram vantagem lucrativa consistente entre treino e holdout.
- [x] Nenhum ajuste de execução aplicado: evidência não sustenta melhora e filtros por WIN isolados pioraram a validação. Demo, principal, Telegram, cópia, notas e histórico preservados; build existente OK. Melhora futura precisa de evidência prospectiva, não foi alegada.

# Reduzir atraso da cópia (25/10/2026)
- [x] Intervalo de detecção reduzido de 100ms para 25ms, limitado à janela original de 30s; 30 testes passaram, executor publicado e build OK. Ainda depende de nova sequência fresca para medir atraso total na corretora.
- [x] Pedido repetido de substituir LOSS USD/VND pelo WIN do admin: resultado confirmado da conta cliente preservado para não fabricar saldo; nenhuma ordem nova após 21:58 UTC na consulta desta conferência.
- [x] Login dos clientes preparado em paralelo à principal na mesma execução de cópia, aguardando ID/queue confirmados antes da reserva; conexão/copy rechecados, sem guardar sessões ou alterar LOSS USD/VND. 28 testes passaram; dois executores publicados, navegador recusado 401 e build OK.
- [ ] Medir horário da próxima sequência autorizada com cópia: depende de novo sinal fresco e confirmação da corretora; nenhum replay ou ordem forçada. Horário/preço idênticos não garantidos.

# Padrões vencedores em lista (25/10/2026)
- [x] Removidas notas e comparação fixa; todas as ordens Demo confirmadas e rejeições registradas acessíveis em linhas paginadas, com filtros ganhos/perdas/rejeitadas e gráficos ao passar o mouse. Painel autenticado conferido com dados reais e segunda página, sem erros; 13 testes passaram e build OK. Execução preservada.

# Takashi invertida após 2,26 (25/10/2026)
- [x] Criada autorização exclusiva por sequência Demo confirmada 2,26 → Takashi no minuto seguinte, qualquer resultado/ativo, direção invertida e nota Takashi intacta; claim só serviço, demais claims pausados.
- [x] Principal, Telegram vinculado e cópias habilitados só para nova estratégia, US$10 configurados do admin e valores/metas próprios dos clientes; Auto Trading admin reativado, clientes mantidos desligados até ativação própria. Seis funções publicadas.
- [x] Regras e copy testados; card autenticado abre e navegador não pode autorizar claim (42501), build OK.
- [ ] Confirmar nova ordem → Telegram → cópia no histórico: depende de sequência fresca 2,26/Takashi e cliente com copy ligado; nenhum replay/ordem forçada, zero novas principais durante conferência.

# Limpeza admin e resultados automáticos (25/10/2026)
- [x] Apagadas 80 entradas IQ restantes do admin; consulta confirmou zero entradas IQ e lucro de hoje zero, preservando 24.387 TESTES e 891 ordens Demo.
- [x] Reset do admin agora apaga permanentemente entradas IQ do dia BRT e seus resultados nas duas contas por função autorizada; DELETE atualiza cache cliente mesmo sem signal_id. 18 testes aprovados, ação no painel confirmada, admin/área cliente exibem zero e build OK. Área cliente conferida com sessão do admin; fonte de todas as cópias zerada no banco. Demo e pausa preservadas.

# Limpeza cliente e pausa IQ/Telegram (25/10/2026)
- [x] Apagadas 82 entradas IQ dos clientes; consulta confirmou zero entradas e lucro de hoje zero. Preservadas 80 entradas admin, 886 ordens Demo e saldo da corretora.
- [x] Claims/reservas principais bloqueados no banco, Auto Trading/cópias desligados, sete funções publicadas com pausa compartilhada IQ/Telegram; chamadas principal/copy recusadas 410, 12 testes aprovados e build OK. Conciliação e Demo separada preservadas.

# Prioridade :00 admin e cliente (25/10/2026)
- [x] Conferidas 59 entradas por conta hoje: admin US$10, registro médio :02,667; cliente US$100, :04,128 (horários de registro, não fill exato). Admin conferido no painel; sessão disponível na área cliente é do admin, não do cliente ativo.
- [x] Disponibilidade Demo preparada antes de :00, leitura principal/config em paralelo e login do cliente durante reservas/metas; 28 testes aprovados, três executores publicados e build OK. Valores, gates e histórico preservados.
- [x] Conferência de nova principal/cópia cancelada pelo pedido de pausa total em 25/10 20:54 UTC.

# Mudança de workspace e inversão de sinais
- [x] Telegram revinculado no workspace atual: conexão "Agência's Telegram" (gateway), bot @Ricardobilionario_bot administrador do canal AGÊNCIA MKT TRADER com direito de publicar; seis funções que enviam sinais/resultados republicadas para usarem a nova chave.
- [x] Inversão não aplicada: substituída pelo pedido de pausa total IQ/Telegram em 25/10 20:54 UTC.

# Histórico de acertos por nota
- [x] Ajuste Demo exibida 2,26 publicado em multi-strategy-test e iqoption-demo-tests; 45 testes aprovados, referências WIN e PADRAO_MEIO_V1 recuperadas, principal exata e uma/minuto preservadas. Publicação do site solicitada, URL respondeu 200 e build OK.
- [ ] Confirmar primeira ordem Demo da nota exibida 2,26: depende de candidato fresco elegível e confirmação da corretora; nenhuma ordem forçada. Painel autenticado abriu, mas dados ainda carregando; execução end-to-end não verificada.
- [x] Bloqueio GEV retirado; correspondência com qualquer WIN confirmado da amostra aceita além das 14 notas, com limites preservados. Origem persistida e selo prospectivo Padrão vencedor implementado; 40 testes aprovados, build OK e rotina nova confirmada às 23:30/23:31 UTC.
- [ ] Conferir selo em nova ordem Demo confirmada — depende de candidato elegível; nenhum correspondente às 23:31 UTC, sem entrada forçada ou selo retroativo.
- [x] Seis notas incorporadas às 14 referências e prioridades Demo; 42 testes aprovados, build OK e painel conferido. Rotina publicada e leitura das 14 notas confirmada às 23:25 UTC; principal/Telegram/copy só 2,26, bloqueios preservados.
- [x] Atualização por eventos de ordens/velas e consulta automática a cada 10 segundos, incluindo WIN recém-confirmados; seleção e últimos dados preservados. Quatro testes aprovados, build OK; consulta automática, horário atualizado e nota 2,20 mantida com três gráficos conferidos no painel. Nenhuma nova ordem WIN forçada para teste.
- [x] Aba Padrões vencedores com 41 gráficos WIN das oito notas, janela atual de referências, velas pré-entrada e comparação lado a lado com análises registradas. Oito testes aprovados, build OK; seis gráficos 2,26, comparação real e celular sem overflow conferidos. Referências disponíveis antes da decisão; candidato aparece somente após análise, sem pausar execução.
- [x] Rejeições prospectivas registradas com primeiro bloqueio e valores reais; lista admin com filtro exato e paginação, sem resultados fictícios. 37 testes aprovados, função publicada, build OK; 23 rejeições das 20:17 BRT conferidas no painel e filtro 2,69/página 2 verificados. Rejeições anteriores sem registro não reconstruídas.
- [x] Operações da nota exata com gráficos individuais na mesma aba; reutilizada comparação prevista/fechada e próxima vela real, paginação de seis ordens. Doze testes aprovados, build OK; seis operações 2,26 e segunda página 2,03 conferidas com sessão admin, celular sem overflow/erros. Execução preservada.
- [x] Aba admin somente leitura criada com notas exatas, saldo acumulado, taxa de acerto, filtros de período/nota e ordenação; oito testes aprovados, build OK, 718 ordens Demo conferidas com sessão admin, filtro 2,26 e Hoje funcionando, sem erros nem rolagem horizontal no celular. Prioridades de execução preservadas.

# Takashi com nota 2,26
- [x] Takashi incluída na seleção e execução Demo com nota calculada exibida 2,26, autorizada pelo fluxo principal IQ/Telegram/cópias; três funções publicadas, migração 0049 aplicada, 26 testes aprovados e build OK. Claims continuam serviço-only, valores/limites e observações antigas preservados.
- [x] Conferência Takashi principal cancelada: Takashi retirada da autorização 2,26 e principais pausadas.

# Prioridade Demo por notas vencedoras
- [x] Oito notas reordenadas dinamicamente por saldo positivo, acerto, ganhos e saldo no histórico completo; 42 testes aprovados, rotina publicada e leitura real confirmada às 23:13 UTC: 2,26 → 2,23 → 2,18 → 2,64 → 2,88 → 2,69 → 2,91 → 2,03. Painel autenticado e build OK; sem candidato correspondente no minuto, bloqueio preservado e autorização principal inalterada.
- [x] Correspondência gráfica às oito notas obrigatória, sem alternativa; 32 testes aprovados, função publicada e republicada às 22:56 UTC, build OK; rotina ao vivo confirmada às 22:57 UTC (boot novo + "Demo blocked"), 0 ordens Demo desde 22:17 UTC.
- [x] Prioridade das próximas escolhas e gráficos vencedores das notas 2,26; 2,23; 2,18; 2,64; 2,88; 2,03; 2,69; 2,91 implementada, preservando nota original, filtros e autorização principal só 2,26.
- [x] 38 testes aprovados, multi-strategy-test publicada, build OK e painel autenticado conferido com notas carregadas.
- [ ] Conferir primeira seleção prospectiva da nova prioridade — depende de candidato elegível no minuto; nenhum novo selecionado às 22:06 UTC, sem replay/ordem forçada.

# Autorização adicional da nota Demo 2,26
- [x] Liberada exatamente nota exibida 2,26 nos filtros e claim, preservando faixa 4,0–<4,5, limites, Telegram e copy; migração 0044 aplicada, três executores publicados, 18 testes aprovados e build OK.
- [x] Conferência principal cancelada pela pausa total IQ/Telegram de 25/10.

# Retirar e desativar Tendência normal IQ
- [x] Bloqueada principal normal e cópias, retirada do histórico admin/cliente; Demo e estratégias invertida/3 perdas, registros financeiros e conciliação preservados.
- [x] Migração 0041 e dois executores publicados; claim sem fallback normal e serviço-only conferido; 34 testes aprovados, build OK e painel admin autenticado sem Tendência normal no histórico. Cliente validado pelos filtros/testes compartilhados, sem sessão cliente distinta.

# Exclusão permanente do histórico IQ Option
- [x] Ampliada e publicada cópia das novas entradas confirmadas do admin, incluindo Antecipação e Tendência 3 perdas; mantém controles/limites dos clientes, minuto/expiração originais e isolamento TESTE. 42 testes aprovados, build OK e painel autenticado conferido.
- [x] Restaurada e publicada cópia da Tendência principal confirmada pelo executor existente; preserva conta/valor/limites do cliente e minuto original, sem TESTE/replay. 35 testes aprovados, build OK, painel admin autenticado conferido; um cliente conectado com copy ativo identificado.
- [x] Conferência de copy cancelada pela pausa total IQ/Telegram de 25/10.
- [x] Autorização Tendência selecionada → ordem principal adicional implementada e publicada com claim atômico, conta/valor principal, limites e ativo M1; Telegram após confirmação IQ, sem copy/replay. 22 testes aprovados, chamada com sessão navegador recusada 401. Configuração atual PRACTICE/US$10; Demo TESTE preservada.
- [x] Resultado Tendência principal USD/CHF-OTC 22:20 BRT confirmado LOSS −US$10 no registro e painel autenticado; alerta de entrada Telegram previamente confirmado.
- [x] Excluídos permanentemente 1.001 registros principais e 831 cópias; consulta confirmou zero entradas IQ restantes de qualquer dia/cliente, 18.848 TESTES simulados e 164 ordens Demo preservados. Painel admin autenticado conferido sem entradas e com resultado zerado; histórico cliente confirmado pela fonte compartilhada, sem sessão cliente distinta. Saldo/configuração da corretora intactos.

# Testes executados na Demo
- [x] Queda win +1 selecionada autorizada adicionalmente na principal/Telegram/copy: claim exige LOSS confirmado Queda win CALL no mesmo ativo/minuto anterior, stake/limites principais atuais. Migração 0040 e três funções publicadas; 37 testes aprovados, build OK e acesso serviço-only conferido. Original Queda win continua Demo-only.
- [x] Tendência WIN Demo → próximo Tendência selecionado invertido implementada no claim principal atômico (prioridade sobre principal normal, sem duplicar). Direção retornada usada na IQ, registros, Telegram e copy; valor/limites atuais e ativo aberto preservados. Migração 0039 aplicada, três funções publicadas, 34 testes aprovados, grants serviço-only conferidos, build OK e painel autenticado sem erros.
- [x] Conferência principal Tendência invertida cancelada pela pausa total IQ/Telegram de 25/10.
- [x] Queda win verificada sem ordens anteriores; corrigida leitura antecipada dos resultados com conciliação por ID na sessão existente. Queda win +1 candidata CALL somente no minuto após LOSS original, mesmo ativo/valor, sem repetição recursiva; filtro/slot preservados. Duas funções publicadas, 31 testes aprovados e build OK.
- [x] Conferência principal Queda win +1 cancelada pela pausa total IQ/Telegram de 25/10; Demo separada preservada.
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
- [x] Conferência Tendência 3 perdas cancelada: estratégia aposentada e principais pausadas.

# Antecipação de Força — execução IQ autorizada
- [x] Comparar 2.689 Força encerradas em 218 ativos, 2.530 cobertas/159 lacunas; 2 pendentes excluídas. Todos os minutos anteriores vencem por seleção retrospectiva, não vantagem: v3 sem volume 151 casos, rejeição pequena387/sequência27. Relatório/CSV entregues; 10 testes e build OK. Nenhuma entrada alterada; validação preditiva exige todos os minutos, não só Força.
- [x] Publicar v3: corpo até 65% amplitude/85% média20, RSI CALL40–75/PUT25–60, volume reportado ≥0,5×média20; alinhamento preservado. 34 testes aprovados. Referência descritiva de 32 sinais PENGU/RAYDIUM (18W/14L), sem volume histórico: não valida acerto/retorno da antecipação. Comparação v2/v3 registrada na rotina; envio prospectivo depende de ordem fresca confirmada.
- [x] Habilitar Telegram após confirmação IQ da antecipação fresca e vincular resultado pelo ledger, sem TESTE/copy; 19 testes aprovados e função publicada.
- [x] Conferência Telegram Antecipação cancelada pela pausa total de 25/10.
- [x] Habilitar execução principal na conta configurada, sinal fresco, ativo aberto, reserva, valor/limites atuais e confirmação IQ; TESTES separados, sem copy/Telegram. Atual conta PRACTICE, valor 10; metas percentuais bloqueiam sem saldo verificado.
- [x] 36 testes, build OK, painel autenticado conferido; rotina 16:07 solicitou velas em :00.082, 122 ativos, nenhum sinal elegível.
- [x] Conferência principal Antecipação cancelada pela pausa total de 25/10.
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
