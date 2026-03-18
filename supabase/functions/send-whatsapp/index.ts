import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SignalNotification {
  asset: string;
  type: 'CALL' | 'PUT';
  confluenceScore: number;
  timeframe: string;
  entryTime: string;
  confirmations: string[];
  tag?: string;
}

interface ZAPIConfig {
  instance_id: string;
  token: string;
  client_token: string;
}

interface WhatsAppNumber {
  phone_number: string;
  is_active: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Z-API config from database
    const { data: configData, error: configError } = await supabase
      .from('zapi_config')
      .select('instance_id, token, client_token')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (configError || !configData) {
      // Fallback to environment variables
      const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
      const token = Deno.env.get('ZAPI_TOKEN');
      const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

      if (!instanceId || !token || !clientToken) {
        console.error('No Z-API configuration found');
        return new Response(
          JSON.stringify({ error: 'No Z-API configuration found' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Use env variables as config
      Object.assign(configData || {}, { instance_id: instanceId, token, client_token: clientToken });
    }

    const zapiConfig: ZAPIConfig = configData || {
      instance_id: Deno.env.get('ZAPI_INSTANCE_ID')!,
      token: Deno.env.get('ZAPI_TOKEN')!,
      client_token: Deno.env.get('ZAPI_CLIENT_TOKEN')!,
    };

    // Get active phone numbers from database
    const { data: numbersData, error: numbersError } = await supabase
      .from('whatsapp_numbers')
      .select('phone_number')
      .eq('is_active', true);

    let phoneNumbers: string[] = [];

    if (numbersError || !numbersData || numbersData.length === 0) {
      // Fallback to environment variable
      const envPhone = Deno.env.get('ZAPI_PHONE_NUMBER');
      if (envPhone) {
        phoneNumbers = [envPhone];
      } else {
        console.error('No phone numbers configured');
        return new Response(
          JSON.stringify({ error: 'No phone numbers configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      phoneNumbers = numbersData.map((n) => n.phone_number);
    }

    const { signal }: { signal: SignalNotification } = await req.json();

    const emoji = signal.type === 'CALL' ? '🟢' : '🔴';
    const direction = signal.type === 'CALL' ? 'COMPRA' : 'VENDA';
    const tagLine = signal.tag ? `\n🏷️ *${signal.tag}*` : '';
    
    const message = `
🎯 *SINAL DE ALTA ASSERTIVIDADE* 🎯
${tagLine}
${emoji} *${signal.asset}* - ${direction}

📊 *Confluência:* ${signal.confluenceScore}%
⏰ *Timeframe:* ${signal.timeframe}
🕐 *Entrada:* ${signal.entryTime}

✅ *Confirmações:*
${signal.confirmations.map(c => `• ${c}`).join('\n')}

⚠️ _Gerencie seu risco adequadamente_
    `.trim();

    const zapiUrl = `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-text`;

    console.log(`Sending WhatsApp notification to ${phoneNumbers.length} number(s)`);
    console.log('Signal:', JSON.stringify(signal));

    const results = [];

    // Send to all active numbers
    for (const phone of phoneNumbers) {
      try {
        console.log(`Sending to: ${phone}`);
        
        const response = await fetch(zapiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Client-Token': zapiConfig.client_token,
          },
          body: JSON.stringify({
            phone: phone,
            message: message,
          }),
        });

        const result = await response.json();
        console.log(`Z-API response for ${phone}:`, JSON.stringify(result));
        
        results.push({ phone, success: response.ok, result });
      } catch (err) {
        console.error(`Error sending to ${phone}:`, err);
        results.push({ phone, success: false, error: String(err) });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`Sent successfully to ${successCount}/${phoneNumbers.length} numbers`);

    return new Response(
      JSON.stringify({ 
        success: successCount > 0, 
        sent: successCount,
        total: phoneNumbers.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending WhatsApp notification:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
