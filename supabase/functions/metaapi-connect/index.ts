import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROVISIONING_URL = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';

async function safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (e: any) {
    if (e.message?.includes('certificate') || e.message?.includes('peer')) {
      console.log('⚠️ TLS fallback...');
      // @ts-ignore
      const client = Deno.createHttpClient({ caCerts: [] });
      return await fetch(url, { ...options, client } as any);
    }
    throw e;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const METAAPI_TOKEN = Deno.env.get('METAAPI_TOKEN');
    if (!METAAPI_TOKEN) throw new Error('METAAPI_TOKEN não configurado');

    const { mt5Login, mt5Password, mt5Server, configId } = await req.json();

    if (!mt5Login || !mt5Password) {
      throw new Error('Login e senha MT5 são obrigatórios');
    }

    let resolvedServer = mt5Server || '';

    // Auto-detect server if not provided
    if (!resolvedServer) {
      console.log('🔍 Servidor não informado, buscando automaticamente...');
      try {
        const searchRes = await safeFetch(`${PROVISIONING_URL}/users/current/accounts`, {
          headers: { 'auth-token': METAAPI_TOKEN },
        });
        if (searchRes.ok) {
          const accounts = await searchRes.json();
          const match = accounts.find((a: any) => String(a.login) === String(mt5Login));
          if (match?.server) {
            resolvedServer = match.server;
            console.log(`✅ Servidor detectado de conta existente: ${resolvedServer}`);
          }
        }
      } catch (e) {
        console.log('⚠️ Falha ao buscar servidor automaticamente:', e);
      }

      if (!resolvedServer) {
        throw new Error('Servidor MT5 é obrigatório para novas contas. Informe o servidor (ex: XMGlobal-MT5).');
      }
    }

    console.log(`🔐 Conectando MT5: Login ${mt5Login} | Server: ${resolvedServer}`);

    // Step 1: List existing accounts to avoid duplicates
    console.log('📡 Buscando contas existentes...');
    let existingAccount: any = null;

    try {
      const listRes = await safeFetch(`${PROVISIONING_URL}/users/current/accounts`, {
        headers: { 'auth-token': METAAPI_TOKEN },
      });

      if (listRes.ok) {
        const accounts = await listRes.json();
        console.log(`📋 ${accounts.length} contas na MetaAPI`);
        
        // Log ALL accounts for debugging
        for (const acc of accounts) {
          console.log(`📋 Conta: _id=${acc._id} | login=${acc.login} | name=${acc.name} | state=${acc.state} | region=${acc.region} | application=${acc.application} | type=${acc.type} | primaryReplica=${acc.primaryReplica} | replicas=${JSON.stringify(acc.accountReplicas)} | connections=${JSON.stringify(acc.connections)}`);
        }
        
        // Find all accounts matching this login
        const matchingAccounts = accounts.filter((a: any) => String(a.login) === String(mt5Login));
        console.log(`🔍 ${matchingAccounts.length} conta(s) com login ${mt5Login}`);
        
        if (matchingAccounts.length > 1) {
          // Multiple accounts for same login - prefer the one that is a replica (has primaryReplica set)
          const replica = matchingAccounts.find((a: any) => a.primaryReplica);
          if (replica) {
            existingAccount = replica;
            console.log(`🔗 Usando réplica _id=${replica._id} (primaryReplica=${replica.primaryReplica})`);
          } else {
            existingAccount = matchingAccounts[0];
          }
        } else if (matchingAccounts.length === 1) {
          existingAccount = matchingAccounts[0];
        }
        
        if (existingAccount) {
          const accId = existingAccount.id || existingAccount._id;
          console.log(`✅ Conta selecionada: ID=${accId} | _id=${existingAccount._id} | region=${existingAccount.region} | State=${existingAccount.state} | Connection=${existingAccount.connectionStatus}`);
          console.log(`🔗 accountReplicas=${JSON.stringify(existingAccount.accountReplicas)} | primaryReplica=${existingAccount.primaryReplica}`);
        }
      } else {
        const err = await listRes.text();
        console.error(`❌ Lista de contas falhou [${listRes.status}]: ${err}`);
      }
    } catch (e) {
      console.error('❌ Erro ao listar contas:', e);
    }

    let accountId: string;
    let accountName: string;

    if (existingAccount) {
      // Use _id as the base account ID
      const primaryId = existingAccount._id;
      accountName = existingAccount.name || `MT5-${mt5Login}`;

      // Check if this is a primary account with replicas
      // MetaAPI Client API (trading) requires using the REPLICA ID, not the primary
      let tradingAccountId = primaryId;
      if (existingAccount.accountReplicas && existingAccount.accountReplicas.length > 0) {
        // Find the first deployed/active replica
        const replica = existingAccount.accountReplicas.find((r: any) => r.state === 'DEPLOYED') 
          || existingAccount.accountReplicas[0];
        const replicaId = replica._id || replica.id;
        if (replicaId) {
          tradingAccountId = replicaId;
          console.log(`🔗 Usando réplica para trading: ${tradingAccountId} (primária: ${primaryId})`);
        }
      }
      
      // Also check all accounts for a replica pointing to this primary
      if (tradingAccountId === primaryId) {
        const allAccounts = await safeFetch(`${PROVISIONING_URL}/users/current/accounts`, {
          headers: { 'auth-token': METAAPI_TOKEN },
        });
        if (allAccounts.ok) {
          const accs = await allAccounts.json();
          const replica = accs.find((a: any) => 
            a.primaryReplica === primaryId && a._id !== primaryId
          );
          if (replica) {
            tradingAccountId = replica._id || replica.id;
            console.log(`🔗 Réplica encontrada na lista: ${tradingAccountId} (primária: ${primaryId})`);
          }
        }
      }

      accountId = tradingAccountId;

      // Update password
      try {
        const updateRes = await safeFetch(`${PROVISIONING_URL}/users/current/accounts/${accountId}`, {
          method: 'PUT',
          headers: {
            'auth-token': METAAPI_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password: mt5Password }),
        });
        const updateBody = await updateRes.text();
        console.log(`🔄 Update [${updateRes.status}]: ${updateBody}`);
      } catch (e) {
        console.log('⚠️ Update falhou:', e);
      }

      // Deploy if not deployed
      if (existingAccount.state !== 'DEPLOYED') {
        try {
          const deployRes = await safeFetch(`${PROVISIONING_URL}/users/current/accounts/${accountId}/deploy`, {
            method: 'POST',
            headers: { 'auth-token': METAAPI_TOKEN },
          });
          const deployBody = await deployRes.text();
          console.log(`📡 Deploy [${deployRes.status}]: ${deployBody}`);
        } catch (e) {
          console.log('⚠️ Deploy falhou:', e);
        }
        await new Promise(r => setTimeout(r, 5000));
      }
    } else {
      // Create new account
      console.log('🆕 Criando nova conta...');
      const createRes = await safeFetch(`${PROVISIONING_URL}/users/current/accounts`, {
        method: 'POST',
        headers: {
          'auth-token': METAAPI_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          login: String(mt5Login),
          password: mt5Password,
          name: `MT5-${mt5Login}`,
          server: resolvedServer,
          platform: 'mt5',
          type: 'cloud-g2',
          magic: 0,
        }),
      });

      const createText = await createRes.text();
      console.log(`📋 Create [${createRes.status}]: ${createText}`);

      if (!createRes.ok) {
        throw new Error(`Erro ao criar conta: ${createText}`);
      }

      const createData = JSON.parse(createText);
      accountId = createData.id;
      accountName = `MT5-${mt5Login}`;
      console.log(`✅ Conta criada: ${accountId} (type: ${typeof accountId})`);

      // Wait then deploy
      await new Promise(r => setTimeout(r, 3000));
      
      try {
        const deployRes = await safeFetch(`${PROVISIONING_URL}/users/current/accounts/${accountId}/deploy`, {
          method: 'POST',
          headers: { 'auth-token': METAAPI_TOKEN },
        });
        const deployBody = await deployRes.text();
        console.log(`📡 Deploy [${deployRes.status}]: ${deployBody}`);
      } catch (e) {
        console.log('⚠️ Deploy falhou:', e);
      }

      await new Promise(r => setTimeout(r, 5000));
    }

    // Poll for connection status (up to 30s)
    let connectionStatus = 'connecting';
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const statusRes = await safeFetch(`${PROVISIONING_URL}/users/current/accounts/${accountId}`, {
          headers: { 'auth-token': METAAPI_TOKEN },
        });

        if (statusRes.ok) {
          const statusData = await statusRes.json();
          const rawStatus = statusData.connectionStatus || '';
          connectionStatus = rawStatus === 'CONNECTED' ? 'connected' : rawStatus.toLowerCase() || 'connecting';
          accountName = statusData.name || accountName;
          console.log(`📊 Attempt ${attempt}/${maxAttempts}: State=${statusData.state} | Connection=${rawStatus}`);
          
          // Check for accessToken field
          if (statusData.accessToken) {
            console.log(`🔑 Account access token found! Length: ${statusData.accessToken.length}`);
          } else {
            console.log(`🔑 No accessToken field. Keys: ${JSON.stringify(Object.keys(statusData).filter(k => k.toLowerCase().includes('token') || k.toLowerCase().includes('access')))}`);
          }
          
          if (connectionStatus === 'connected') {
            console.log('✅ Conexão estabelecida!');
            break;
          }
        } else {
          const errText = await statusRes.text();
          console.error(`❌ Status check [${statusRes.status}]: ${errText}`);
        }
      } catch (e) {
        console.log(`⚠️ Status check attempt ${attempt} failed:`, e);
      }
      
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    // Update DB
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (configId) {
      await supabaseAdmin.from('metaapi_config').update({
        account_id: accountId,
        account_name: accountName,
        connection_status: connectionStatus,
        mt5_login: String(mt5Login),
        mt5_password: mt5Password,
        mt5_server: mt5Server,
        updated_at: new Date().toISOString(),
      }).eq('id', configId);
      console.log('💾 DB atualizado');
    }

    return new Response(JSON.stringify({
      success: true,
      accountId,
      accountName,
      connectionStatus,
      message: existingAccount ? 'Conta existente reconectada' : 'Conta MT5 conectada com sucesso',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ MetaAPI connect error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
