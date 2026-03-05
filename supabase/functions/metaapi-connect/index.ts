import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROVISIONING_URL = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';

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

    // Step 1: Create/provision account on MetaAPI
    const createRes = await fetch(`${PROVISIONING_URL}/users/current/accounts`, {
      method: 'POST',
      headers: {
        'auth-token': METAAPI_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        login: mt5Login,
        password: mt5Password,
        name: `MT5-${mt5Login}`,
        server: mt5Server,
        platform: 'mt5',
        magic: 0,
        type: 'cloud-g2',
      }),
    });

    const createData = await createRes.json();

    if (!createRes.ok) {
      console.error(`❌ MetaAPI provision failed [${createRes.status}]:`, JSON.stringify(createData));
      
      // If account already exists, try to find it
      if (createRes.status === 409 || (createData.message && createData.message.includes('already'))) {
        console.log('📡 Conta já existe, buscando...');
        
        const listRes = await fetch(`${PROVISIONING_URL}/users/current/accounts`, {
          headers: { 'auth-token': METAAPI_TOKEN },
        });
        
        if (listRes.ok) {
          const accounts = await listRes.json();
          const existing = accounts.find((a: any) => 
            a.login === mt5Login || a.login === String(mt5Login)
          );
          
          if (existing) {
            console.log(`✅ Conta encontrada: ${existing.id} | ${existing.name}`);
            
            // Deploy if needed
            if (existing.state !== 'DEPLOYED') {
              await fetch(`${PROVISIONING_URL}/users/current/accounts/${existing.id}/deploy`, {
                method: 'POST',
                headers: { 'auth-token': METAAPI_TOKEN },
              });
              console.log('📡 Deploy solicitado');
            }

            // Update DB
            const supabase = createClient(
              Deno.env.get('SUPABASE_URL')!,
              Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            );

            if (configId) {
              await supabase.from('metaapi_config').update({
                account_id: existing.id,
                account_name: existing.name || `MT5-${mt5Login}`,
                connection_status: existing.connectionStatus === 'CONNECTED' ? 'connected' : 'connecting',
                mt5_login: mt5Login,
                mt5_password: mt5Password,
                mt5_server: mt5Server,
                updated_at: new Date().toISOString(),
              }).eq('id', configId);
            }

            return new Response(JSON.stringify({
              success: true,
              accountId: existing.id,
              accountName: existing.name,
              state: existing.state,
              connectionStatus: existing.connectionStatus,
              message: 'Conta existente reconectada',
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }
        
        throw new Error(createData.message || 'Conta já existe mas não foi possível localizar');
      }
      
      throw new Error(createData.message || `Erro ao provisionar: ${createRes.status}`);
    }

    const accountId = createData.id;
    console.log(`✅ Conta provisionada: ${accountId}`);

    // Step 2: Deploy the account
    const deployRes = await fetch(`${PROVISIONING_URL}/users/current/accounts/${accountId}/deploy`, {
      method: 'POST',
      headers: { 'auth-token': METAAPI_TOKEN },
    });

    if (!deployRes.ok) {
      const deployText = await deployRes.text();
      console.error(`⚠️ Deploy warning [${deployRes.status}]: ${deployText}`);
    } else {
      console.log('📡 Deploy iniciado');
    }

    // Step 3: Wait briefly and check status
    await new Promise(r => setTimeout(r, 3000));

    const statusRes = await fetch(`${PROVISIONING_URL}/users/current/accounts/${accountId}`, {
      headers: { 'auth-token': METAAPI_TOKEN },
    });

    let connectionStatus = 'connecting';
    let accountName = `MT5-${mt5Login}`;
    
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      connectionStatus = statusData.connectionStatus === 'CONNECTED' ? 'connected' : statusData.connectionStatus?.toLowerCase() || 'connecting';
      accountName = statusData.name || accountName;
      console.log(`📊 Status: ${statusData.state} | Connection: ${statusData.connectionStatus}`);
    }

    // Step 4: Update DB with account ID
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (configId) {
      await supabase.from('metaapi_config').update({
        account_id: accountId,
        account_name: accountName,
        connection_status: connectionStatus,
        mt5_login: mt5Login,
        mt5_password: mt5Password,
        mt5_server: mt5Server,
        updated_at: new Date().toISOString(),
      }).eq('id', configId);
    }

    // Update secrets for edge functions
    // The account_id is now stored in DB and read by auto-generate-signals

    return new Response(JSON.stringify({
      success: true,
      accountId,
      accountName,
      connectionStatus,
      message: 'Conta MT5 conectada com sucesso via MetaAPI',
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
