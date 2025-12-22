import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IQOptionCredentials {
  email: string;
  password: string;
  account_type: string;
}

interface PositionResult {
  matchIds: string[];
  rawJson: string;
  win: string;
  profit: number;
  close_quote?: number;
}

const IQ_OPTION_WS_URL = "wss://iqoption.com/echo/websocket";

async function getClosedPositionsViaWS(
  email: string,
  password: string,
  accountType: string,
): Promise<{ success: boolean; positions: PositionResult[]; error?: string }> {
  return await new Promise((resolve) => {
    const positions: PositionResult[] = [];
    let balanceId = 0;
    let done = false;

    const ws = new WebSocket(IQ_OPTION_WS_URL);

    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      try { ws.close(); } catch { /* ignore */ }
      resolve({ success: false, positions: [], error: "Timeout ao buscar resultados" });
    }, 30000);

    const finish = (payload: { success: boolean; positions: PositionResult[]; error?: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      try { ws.close(); } catch { /* ignore */ }
      resolve(payload);
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
          return finish({ success: false, positions: [], error: data?.msg?.message || "Falha ao autenticar" });
        }

        if (data?.name === "authenticated" && data?.ssid) {
          ws.send(JSON.stringify({ name: "ssid", msg: data.ssid }));
          return;
        }

        if (data?.name === "profile") {
          const balances = data.msg?.balances || [];
          for (const bal of balances) {
            if (accountType === "PRACTICE" && bal.type === 4) { balanceId = bal.id; break; }
            if (accountType === "REAL" && bal.type === 1) { balanceId = bal.id; break; }
          }
          if (!balanceId && balances.length > 0) balanceId = balances[0].id;

          console.log("Balance ID:", balanceId);

          ws.send(JSON.stringify({
            name: "sendMessage",
            msg: {
              name: "portfolio.get-history-positions",
              version: "2.0",
              body: {
                user_balance_id: balanceId,
                instrument_types: ["binary-option", "turbo-option", "digital-option"],
                limit: 100,
                offset: 0,
              },
            },
          }));
          return;
        }

        if (data?.name === "portfolio.get-history-positions" || data?.name === "history-positions") {
          let positionsList: any[] = [];
          if (data.msg?.positions) positionsList = data.msg.positions;
          else if (Array.isArray(data.msg)) positionsList = data.msg;
          else if (data.msg?.history) positionsList = data.msg.history;

          for (const pos of positionsList) {
            let win = "pending";
            const profit = pos.close_profit ?? pos.pnl ?? pos.profit ?? pos.win_amount ?? 0;

            if (pos.status === "closed" || pos.close_time || pos.close_at) {
              if (typeof pos.win === "string") win = pos.win;
              else if (profit > 0) win = "win";
              else if (profit < 0) win = "loose";
              else win = "equal";
            } else if (pos.result) {
              win = pos.result;
            }

            const candidateIds = [pos.option_id, pos.position_id, pos.external_id, pos.id]
              .filter((v) => v !== undefined && v !== null)
              .map((v) => String(v));

            const matchIds = Array.from(new Set(candidateIds)).filter(Boolean);

            if (matchIds.length > 0) {
              positions.push({
                matchIds,
                rawJson: JSON.stringify(pos),
                win,
                profit,
                close_quote: pos.close_quote || pos.close_rate || pos.close_price,
              });
            }
          }

          return finish({ success: true, positions });
        }
      } catch (e) {
        console.error("Parse error:", e);
      }
    };

    ws.onerror = () => finish({ success: false, positions: [], error: "Erro de conexão WebSocket" });
    ws.onclose = () => {
      if (!done) finish({ success: false, positions: [], error: "Conexão fechada" });
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

    const res = await getClosedPositionsViaWS(credentials.email, credentials.password, credentials.account_type);

    if (!res.success) {
      return new Response(
        JSON.stringify({ success: false, error: res.error || "Falha ao conectar" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase
      .from("iqoption_config")
      .update({ last_connected_at: new Date().toISOString() })
      .eq("email", credentials.email);

    const { data: pendingOperations } = await supabase
      .from("operation_results")
      .select("id, iq_option_id, signal_id")
      .eq("result", "pending");

    let updatedCount = 0;
    const closedPositions = res.positions;

    if (pendingOperations && closedPositions.length > 0) {
      for (const pending of pendingOperations) {
        const iqId = pending.iq_option_id ? String(pending.iq_option_id) : "";

        const closed = closedPositions.find((p) =>
          (iqId && (p.matchIds.includes(iqId) || p.rawJson.includes(iqId))) ||
          p.matchIds.includes(String(pending.signal_id)) ||
          p.rawJson.includes(String(pending.signal_id))
        );

        if (closed && closed.win !== "pending") {
          const resultStatus = closed.win === "win" ? "win" : closed.win === "loose" ? "loss" : "tie";

          const { error: updateError } = await supabase
            .from("operation_results")
            .update({
              result: resultStatus,
              profit: closed.profit,
              exit_price: closed.close_quote || null,
            })
            .eq("id", pending.id);

          if (!updateError) updatedCount++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        pendingChecked: pendingOperations?.length || 0,
        closedPositions: closedPositions.length,
        updatedResults: updatedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
