import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROVISIONING_URL = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';

async function metaApiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (e: any) {
    if (e.message?.includes('certificate') || e.message?.includes('tls') || e.message?.includes('ssl') || e.message?.includes('peer')) {
      console.log('⚠️ TLS error, retrying with custom HTTP client...');
      try {
        // @ts-ignore - Deno API
        const client = Deno.createHttpClient({ caCerts: [] });
        return await fetch(url, { ...options, client } as any);
      } catch (e2) {
        console.error('❌ Custom client also failed:', e2);
        throw e;
      }
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

    if (!mt5Login || !mt5Password || !mt5Server) {
      throw new Error('Login, senha e servidor MT5 são obrigatórios');
    }

    console.log(`🔐 Provisionando conta MT5: Login ${mt5Login} | Server: ${mt5Server}`);

    // Step 1: Check if account already exists
    console.log('📡 Buscando contas existentes...');
    const listRes = await metaApiFetch(`${PROVISIONING_URL}/users/current/accounts`, {
      headers: { 'auth-token': METAAPI_TOKEN },
    });

    let existingAccount = null;
    if (listRes.ok) {
      const accounts = await listRes.json();
      console.log(`📋 ${accounts.length} contas encontradas na MetaAPI`);
      existingAccount = accounts.find((a: any) => 
        String(a.login) === String(mt5Login) && a.server === mt5Server
      );
      
      if (existingAccount) {
        console.log(`✅ Conta existente encontrada: ${existingAccount.id} | State: ${existingAccount.state} | Connection: ${existingAccount.connectionStatus}`);
      }
    } else {
      const errText = await listRes.text();
      console.error(`⚠️ Erro ao listar contas [${listRes.status}]: ${errText}`);
    }

    let accountId: string;
    let accountName: string;

    if (existingAccount) {
      accountId = existingAccount.id;
      accountName = existingAccount.name || `MT5-${mt5Login}`;
      
      // Update password if needed
      try {
        console.log('🔄 Atualizando credenciais da conta...');
        const updateRes = await metaApiFetch(`${PROVISIONING_URL}/users/current/accounts/${accountId}`, {
          method: 'PUT',
          headers: {
            'auth-token': METAAPI_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            password: mt5Password,
          }),
        });
        if (updateRes.ok) {
          console.log('✅ Credenciais atualizadas');
        } else {
          const updateErr = await updateRes.text();
          console.log(`⚠️ Update response [${updateRes.status}]: ${updateErr}`);
        }
      } catch (e) {
        console.log('⚠️ Falha ao atualizar credenciais:', e);
      }

      // Deploy if needed
      if (existingAccount.state !== 'DEPLOYED') {
        console.log('📡 Fazendo deploy da conta...');
        const deployRes = await metaApiFetch(`${PROVISIONING_URL}/users/current/accounts/${accountId}/deploy`, {
          method: 'POST',
          headers: { 'auth-token': METAAPI_TOKEN },
        });
        if (deployRes.ok) {
          console.log('✅ Deploy solicitado');
        } else {
          const deployErr = await deployRes.text();
          console.log(`⚠️ Deploy response [${deployRes.status}]: ${deployErr}`);
        }
        // Wait for deploy
        await new Promise(r => setTimeout(r, 5000));
      }
    } else {
      // Create new account
      console.log('🆕 Criando nova conta na MetaAPI...');
      const createRes = await metaApiFetch(`${PROVISIONING_URL}/users/current/accounts`, {
        method: 'POST',
        headers: {
          'auth-token': METAAPI_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          login: String(mt5Login),
          password: mt5Password,
          name: `MT5-${mt5Login}`,
          server: mt5Server,
          platform: 'mt5',
          type: 'cloud-g2',
          magic: 0,
        }),
      });

      const createData = await createRes.json();
      console.log(`📋 Create response [${createRes.status}]:`, JSON.stringify(createData));

      if (!createRes.ok) {
        throw new Error(createData.message || `Erro ao criar conta: ${createRes.status}`);
      }

      accountId = createData.id;
      accountName = `MT5-${mt5Login}`;
      console.log(`✅ Conta criada: ${accountId}`);

      // Deploy
      console.log('📡 Fazendo deploy...');
      await new Promise(r => setTimeout(r, 2000));
      
      const deployRes = await metaApiFetch(`${PROVISIONING_URL}/users/current/accounts/${accountId}/deploy`, {
        method: 'POST',
        headers: { 'auth-token': METAAPI_TOKEN },
      });
      
      if (deployRes.ok) {
        console.log('✅ Deploy solicitado');
      } else {
        const deployErr = await deployRes.text();
        console.log(`⚠️ Deploy [${deployRes.status}]: ${deployErr}`);
      }

      // Wait for deploy
      await new Promise(r => setTimeout(r, 5000));
    }

    // Check final status
    let connectionStatus = 'connecting';
    try {
      const statusRes = await metaApiFetch(`${PROVISIONING_URL}/users/current/accounts/${accountId}`, {
        headers: { 'auth-token': METAAPI_TOKEN },
      });

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        connectionStatus = statusData.connectionStatus === 'CONNECTED' ? 'connected' : 
                          statusData.connectionStatus?.toLowerCase() || 'connecting';
        accountName = statusData.name || accountName;
        console.log(`📊 Final status: State=${statusData.state} | Connection=${statusData.connectionStatus}`);
      }
    } catch (e) {
      console.log('⚠️ Status check failed:', e);
    }

    // Update DB
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (configId) {
      await supabase.from('metaapi_config').update({
        account_id: accountId,
        account_name: accountName,
        connection_status: connectionStatus,
        mt5_login: String(mt5Login),
        mt5_password: mt5Password,
        mt5_server: mt5Server,
        updated_at: new Date().toISOString(),
      }).eq('id', configId);
      console.log('💾 Config atualizada no banco');
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
