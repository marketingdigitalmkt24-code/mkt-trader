# Copy Trading IQ Option + limpeza do painel

## O que muda

### 1. Remover MT5 do site
- Remover do Admin o código de monitoramento MT5 (já desativado) e qualquer referência visual restante.
- Remover o card de MetaTrader 5 do card de conexões (BrokerConnectionsCard mostra só IQ Option).
- Manter as tabelas/funções MT5 no banco sem uso (nada é apagado).

### 2. Remover a aba "Notificações" do Admin
- Sair a aba WhatsApp/Notificações e seu conteúdo; as abas ficam: Dashboard, Auto Trading, Corretoras, Copy Trading, Usuários.

### 3. Nova aba "Copy Trading" no Admin
- Lista de clientes cadastrados (reaproveita client_profiles/UserManagementCard).
- Para cada cliente: ativar/desativar copy trading e escolher conta **Demo (PRACTICE)** ou **Real (REAL)**.
- Nova tabela `copy_trading_configs` (user_id do cliente, enabled, account_type, created/updated) com RLS: admin gerencia, cliente lê a própria.
- Quando uma ordem real for confirmada na sua conta principal, o servidor repete a mesma operação (mesmo ativo/direção/expiração) na conta IQ Option de cada cliente com copy ativo, usando o valor de entrada configurado pelo próprio cliente.

### 4. Área do cliente (ClientDashboard)
- Seleção de conta: Demo ou Real (grava em copy_trading_configs.account_type).
- Botão liga/desliga do robô (copy ativo/inativo).
- Campos: valor de entrada e meta de lucro (reusa user_trading_settings: trade_amount, profit_target_type/value).
- Dashboard do cliente mostra resultados do dia e sinais/operações **sem exibir o nome da estratégia** (rótulo genérico "Sinal").

### 5. Execução no servidor
- Estender `iqoption-place-trade`: após confirmar a ordem da conta principal, buscar clientes com copy ativo, autenticar na IQ Option de cada um (credenciais já existem em iqoption_config por usuário) e enviar a ordem espelhada; falhas de um cliente não afetam os outros.
- Respeitar por cliente: robô desligado, meta de lucro atingida, conta demo/real escolhida.

## Detalhes técnicos
- Migração: `copy_trading_configs` com GRANTs + RLS (admin ALL via has_role; cliente SELECT/UPDATE da própria linha).
- Rótulos de estratégia no dashboard do cliente são apenas escondidos na interface; os dados continuam gravados.
- Nenhuma ordem é forçada em testes; verificação aguarda uma operação natural da conta principal.
- Pré-requisito: cada cliente precisa ter suas credenciais IQ Option salvas (aba Corretoras/login do cliente) para o copy funcionar.

## Verificação
- Testes de regra para seleção de clientes elegíveis ao copy.
- Build OK; checagem visual das abas Admin e do dashboard do cliente.
