import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TradeRequest {
  asset: string;
  direction: "call" | "put";
  amount: number;
  expiration: number; // minutes
  signalId?: string;
}

interface IQOptionCredentials {
  email: string;
  password: string;
  account_type: string;
}

const IQ_OPTION_WS_URL = "wss://iqoption.com/echo/websocket";

async function placeTradeViaWS(
  email: string,
  password: string,
  accountType: string,
  trade: TradeRequest,
): Promise<{ success: boolean; tradeId?: string; error?: string }> {
  return await new Promise((resolve) => {
    const ws = new WebSocket(IQ_OPTION_WS_URL);
    let done = false;

    let balanceId = 0;
    let activeAssets: Record<string, number> = {};

    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      try { ws.close(); } catch { /* ignore */ }
      resolve({ success: false, error: "Timeout ao enviar trade" });
    }, 30000);

    const finish = (payload: { success: boolean; tradeId?: string; error?: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      try { ws.close(); } catch { /* ignore */ }
      resolve(payload);
    };

    const requestInit = () => {
      ws.send(JSON.stringify({
        name: "sendMessage",
        msg: { name: "get-initialization-data", version: "3.0", body: {} },
      }));
    };

    const computeBalanceId = (profileMsg: any) => {
      const balances = profileMsg?.balances || [];
      for (const bal of balances) {
        if (accountType === "PRACTICE" && bal.type === 4) { balanceId = bal.id; break; }
        if (accountType === "REAL" && bal.type === 1) { balanceId = bal.id; break; }
      }
      if (!balanceId && balances.length > 0) balanceId = balances[0].id;
    };

    ws.onopen = () => {
      console.log("📡 WS conectado, autenticando...");
      ws.send(JSON.stringify({ name: "authenticate", msg: { email, password } }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.name !== "timeSync") console.log("Received:", data?.name);

        if (data?.name === "auth-error" || data?.name === "error") {
          return finish({ success: false, error: data?.msg?.message || "Falha ao autenticar" });
        }

        if (data?.name === "authenticated" && data?.ssid) {
          ws.send(JSON.stringify({ name: "ssid", msg: data.ssid }));
          return;
        }

        if (data?.name === "profile") {
          computeBalanceId(data.msg);
          requestInit();
          return;
        }

        if (data?.name === "initialization-data") {
          const binary = data.msg?.binary?.actives || {};
          for (const [id, info] of Object.entries(binary)) {
            const a: any = info;
            if (a?.enabled && !a?.is_suspended) {
              activeAssets[(a.name || "").toUpperCase()] = parseInt(id);
            }
          }

          const assetName = trade.asset.toUpperCase().replace(/\//g, "").replace(/-/g, "");
          const assetNameWithDash = trade.asset.toUpperCase().replace(/\//g, "-");
          const assetNameSlash = trade.asset.toUpperCase();

          let assetId =
            activeAssets[assetName] ||
            activeAssets[assetNameWithDash] ||
            activeAssets[assetNameSlash] ||
            activeAssets[trade.asset.toUpperCase()];

          if (!assetId) {
            const otcVariations = [assetName, assetName.replace("OTC", "-OTC"), assetName.replace("-OTC", "OTC"), assetNameWithDash];
            for (const v of otcVariations) {
              if (activeAssets[v]) { assetId = activeAssets[v]; break; }
            }
          }

          if (!assetId) {
            const base = assetName.replace("OTC", "").replace("-", "");
            for (const [n, id] of Object.entries(activeAssets)) {
              if (n.includes(base) && n.includes("OTC")) { assetId = id; break; }
            }
          }

          if (!assetId) return finish({ success: false, error: `Asset ${trade.asset} não disponível` });

          // Set balance
          ws.send(JSON.stringify({
            name: "sendMessage",
            msg: { name: "set-active-balance", version: "1.0", body: { balance_id: balanceId } },
          }));

          const now = Math.floor(Date.now() / 1000);
          const nextMinute = Math.ceil(now / 60) * 60;
          const expirationTime = nextMinute + trade.expiration * 60;

          ws.send(JSON.stringify({
            name: "sendMessage",
            msg: {
              name: "binary-options.open-option",
              version: "1.0",
              body: {
                user_balance_id: balanceId,
                active_id: assetId,
                option_type_id: 3,
                direction: trade.direction,
                expired: expirationTime,
                price: trade.amount,
                profit_percent: 0,
              },
            },
          }));
          return;
        }

        if (data?.name === "binary-options.option-opened") {
          const id = data.msg?.id || data.msg?.option_id;
          if (id) return finish({ success: true, tradeId: String(id) });
        }

        if (data?.name === "option" && data.msg?.id) {
          if (data.msg?.message?.includes("not found")) return finish({ success: false, error: data.msg.message });
          return finish({ success: true, tradeId: String(data.msg.id) });
        }

        if (data?.name === "binary-options.open-option" && data.msg?.result === "error") {
          return finish({ success: false, error: data.msg?.message || "Trade falhou" });
        }
      } catch (e) {
        console.error("Parse error:", e);
      }
    };

    ws.onerror = () => finish({ success: false, error: "Erro de conexão WebSocket" });
    ws.onclose = () => {
      if (!done) finish({ success: false, error: "Conexão fechada" });
    };
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tradeRequest: TradeRequest = await req.json();
    if (!tradeRequest.asset || !tradeRequest.direction || !tradeRequest.amount) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: configData, error: configError } = await supabase
      .from("iqoption_config")
      .select("email, password, account_type")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (configError || !configData) {
      return new Response(
        JSON.stringify({ success: false, error: "No IQ Option credentials configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const credentials: IQOptionCredentials = configData;

    const result = await placeTradeViaWS(credentials.email, credentials.password, credentials.account_type, tradeRequest);

    if (result.success && result.tradeId) {
      await supabase.from("operation_results").insert({
        signal_id: tradeRequest.signalId || `manual_${Date.now()}`,
        asset: tradeRequest.asset,
        direction: tradeRequest.direction.toUpperCase(),
        entry_price: tradeRequest.amount,
        result: "pending",
        profit: 0,
        iq_option_id: result.tradeId,
      });
    }

    return new Response(
      JSON.stringify(result),
      {
        status: result.success ? 200 : 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
