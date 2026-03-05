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

    if (!mt5Login || !mt5Password || !mt5Server) {
      throw new Error('Login, senha e servidor MT5 são obrigatórios');
    }

    console.log(`🔐 Conectando MT5: Login ${mt5Login} | Server: ${mt5Server}`);

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
        
        existingAccount = accounts.find((a: any) => 
          String(a.login) === String(mt5Login)
        );
        
        if (existingAccount) {
          console.log(`✅ Conta existente: ID=${existingAccount.id} | State=${existingAccount.state} | Connection=${existingAccount.connectionStatus}`);
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
      accountId = existingAccount.id;
      accountName = existingAccount.name || `MT5-${mt5Login}`;

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
          server: mt5Server,
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
