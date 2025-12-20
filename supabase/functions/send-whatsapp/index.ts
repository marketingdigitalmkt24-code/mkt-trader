import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
    const token = Deno.env.get('ZAPI_TOKEN');
    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
    const phoneNumber = Deno.env.get('ZAPI_PHONE_NUMBER');

    if (!instanceId || !token || !clientToken || !phoneNumber) {
      console.error('Missing Z-API credentials');
      return new Response(
        JSON.stringify({ error: 'Missing Z-API credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { signal }: { signal: SignalNotification } = await req.json();

    const emoji = signal.type === 'CALL' ? '🟢' : '🔴';
    const direction = signal.type === 'CALL' ? 'COMPRA' : 'VENDA';
    
    const message = `
🎯 *SINAL DE ALTA ASSERTIVIDADE* 🎯

${emoji} *${signal.asset}* - ${direction}

📊 *Confluência:* ${signal.confluenceScore}%
⏰ *Timeframe:* ${signal.timeframe}
🕐 *Entrada:* ${signal.entryTime}

✅ *Confirmações:*
${signal.confirmations.map(c => `• ${c}`).join('\n')}

⚠️ _Gerencie seu risco adequadamente_
    `.trim();

    const zapiUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

    console.log('Sending WhatsApp notification to:', phoneNumber);
    console.log('Signal:', JSON.stringify(signal));

    const response = await fetch(zapiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': clientToken,
      },
      body: JSON.stringify({
        phone: phoneNumber,
        message: message,
      }),
    });

    const result = await response.json();
    console.log('Z-API response:', JSON.stringify(result));

    if (!response.ok) {
      throw new Error(`Z-API error: ${JSON.stringify(result)}`);
    }

    return new Response(
      JSON.stringify({ success: true, result }),
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
