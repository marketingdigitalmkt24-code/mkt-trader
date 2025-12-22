import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AvailableAsset {
  id: number;
  name: string;
  type: string;
  isOTC: boolean;
  enabled: boolean;
  payout?: number;
}

const IQ_OPTION_WS_URL = "wss://iqoption.com/echo/websocket";

async function connectAndGetInitData(email: string, password: string): Promise<any> {
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(IQ_OPTION_WS_URL);
    let done = false;

    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      try { ws.close(); } catch { /* ignore */ }
      reject(new Error("Timeout ao conectar na IQ Option"));
    }, 20000);

    const finishError = (message: string) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      try { ws.close(); } catch { /* ignore */ }
      reject(new Error(message));
    };

    const requestInit = () => {
      ws.send(JSON.stringify({
        name: "sendMessage",
        msg: { name: "get-initialization-data", version: "3.0", body: {} },
      }));
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
          return finishError(data?.msg?.message || "Falha ao autenticar na IQ Option");
        }

        if (data?.name === "authenticated" && data?.ssid) {
          ws.send(JSON.stringify({ name: "ssid", msg: data.ssid }));
          return;
        }

        if (data?.name === "profile") {
          requestInit();
          return;
        }

        if (data?.name === "initialization-data") {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          try { ws.close(); } catch { /* ignore */ }
          resolve(data.msg);
          return;
        }
      } catch (e) {
        console.error("Parse error:", e);
      }
    };

    ws.onerror = () => finishError("Erro de conexão WebSocket com a IQ Option");
    ws.onclose = () => {
      if (done) return;
      finishError("Conexão fechada antes de receber dados");
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

    const { data: configData, error: configError } = await supabase
      .from("iqoption_config")
      .select("email, password")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (configError || !configData) {
      return new Response(
        JSON.stringify({ success: false, error: "No IQ Option credentials configured", assets: [] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const initData = await connectAndGetInitData(configData.email, configData.password);

    const assets: AvailableAsset[] = [];
    const binary = initData?.binary?.actives || {};
    const turbo = initData?.turbo?.actives || {};
    const allActives = { ...binary, ...turbo };

    for (const [id, info] of Object.entries(allActives)) {
      const a: any = info;
      if (!a?.enabled || a?.is_suspended) continue;

      const name = a.name || "";
      const isOTC = name.toLowerCase().includes("otc") || a.underlying?.includes("-OTC") || a.description?.includes("OTC");

      let type = "forex";
      if (isOTC) type = "otc";
      else if (name.includes("BTC") || name.includes("ETH") || name.includes("LTC") || name.includes("XRP")) type = "crypto";

      const payout = a.option?.profit?.commission || a.profit_percent || a.option?.profit_commission || 0;

      assets.push({
        id: parseInt(id),
        name,
        type,
        isOTC,
        enabled: true,
        payout,
      });
    }

    const groupedAssets = {
      otc: assets.filter((x) => x.isOTC),
      forex: assets.filter((x) => x.type === "forex" && !x.isOTC),
      crypto: assets.filter((x) => x.type === "crypto"),
    };

    return new Response(
      JSON.stringify({
        success: true,
        assets,
        grouped: groupedAssets,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, assets: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
