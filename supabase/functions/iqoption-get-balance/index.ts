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

interface BalanceInfo {
  balance: number;
  currency: string;
  accountType: string;
}

const IQ_OPTION_WS_URL = "wss://iqoption.com/echo/websocket";

function getBalanceFromProfile(profileMsg: any, accountType: string): BalanceInfo | null {
  const balances = profileMsg?.balances || [];

  for (const bal of balances) {
    // type 1 = REAL, type 4 = PRACTICE (demo)
    if (accountType === "PRACTICE" && bal.type === 4) {
      return { balance: bal.amount, currency: bal.currency || "USD", accountType: "PRACTICE" };
    }
    if (accountType === "REAL" && bal.type === 1) {
      return { balance: bal.amount, currency: bal.currency || "USD", accountType: "REAL" };
    }
  }

  // Fallback: first balance
  if (balances.length > 0) {
    return { balance: balances[0].amount, currency: balances[0].currency || "USD", accountType: accountType || "UNKNOWN" };
  }

  return null;
}

async function connectAndGetProfile(email: string, password: string): Promise<{ ws: WebSocket; profileMsg: any }>{
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(IQ_OPTION_WS_URL);
    let done = false;

    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      try { ws.close(); } catch { /* ignore */ }
      reject(new Error("Timeout ao conectar na IQ Option"));
    }, 15000);

    const finishError = (message: string) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      try { ws.close(); } catch { /* ignore */ }
      reject(new Error(message));
    };

    ws.onopen = () => {
      console.log("📡 WS conectado, autenticando...");
      ws.send(JSON.stringify({
        name: "authenticate",
        msg: { email, password },
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.name !== "timeSync") console.log("Received:", data?.name);

        if (data?.name === "auth-error" || data?.name === "error") {
          return finishError(data?.msg?.message || "Falha ao autenticar na IQ Option");
        }

        // Sometimes comes as 'authenticated' first
        if (data?.name === "authenticated" && data?.ssid) {
          console.log("✅ authenticated, enviando ssid...");
          ws.send(JSON.stringify({ name: "ssid", msg: data.ssid }));
          return;
        }

        // Some implementations send profile directly
        if (data?.name === "profile" && data?.msg) {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          resolve({ ws, profileMsg: data.msg });
          return;
        }

        // If 'authenticated' already includes profile-ish msg
        if (data?.name === "authenticated" && data?.msg?.balances) {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          resolve({ ws, profileMsg: data.msg });
          return;
        }
      } catch (e) {
        console.error("Parse error:", e);
      }
    };

    ws.onerror = () => {
      finishError("Erro de conexão WebSocket com a IQ Option");
    };

    ws.onclose = () => {
      if (done) return;
      finishError("Conexão fechada antes de autenticar");
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

    // Get user_id from request body (optional)
    let userId: string | null = null;
    try {
      const body = await req.json();
      userId = body?.userId || null;
    } catch {
      // ignore
    }

    // Build query for IQ Option credentials
    let query = supabase
      .from("iqoption_config")
      .select("email, password, account_type")
      .eq("is_active", true);

    if (userId) query = query.eq("user_id", userId);

    const { data: configData, error: configError } = await query.limit(1).maybeSingle();

    if (configError || !configData) {
      return new Response(
        JSON.stringify({ success: false, error: "No IQ Option credentials configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const credentials: IQOptionCredentials = configData;

    // Auth via WebSocket (no HTTP login)
    const { ws, profileMsg } = await connectAndGetProfile(credentials.email, credentials.password);

    const balanceInfo = getBalanceFromProfile(profileMsg, credentials.account_type);

    try { ws.close(); } catch { /* ignore */ }

    if (!balanceInfo) {
      return new Response(
        JSON.stringify({ success: false, error: "Não foi possível ler o saldo da conta" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Today's stats from operation_results
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: todayResults, error: resultsError } = await supabase
      .from("operation_results")
      .select("result, profit, entry_price")
      .gte("created_at", today.toISOString());

    let dailyProfit = 0;
    let todayTrades = 0;
    let wins = 0;
    let losses = 0;
    let consecutiveLosses = 0;
    let tempConsecutive = 0;

    if (todayResults && !resultsError) {
      todayTrades = todayResults.length;
      for (const r of todayResults) {
        if (r.result === "win") {
          dailyProfit += r.profit || 0;
          wins++;
          tempConsecutive = 0;
        } else if (r.result === "loose" || r.result === "loss") {
          dailyProfit -= r.entry_price || 0;
          losses++;
          tempConsecutive++;
          consecutiveLosses = Math.max(consecutiveLosses, tempConsecutive);
        } else if (r.result === "equal" || r.result === "tie") {
          tempConsecutive = 0;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        balance: balanceInfo.balance,
        currency: balanceInfo.currency,
        accountType: balanceInfo.accountType,
        dailyProfit,
        todayTrades,
        wins,
        losses,
        consecutiveLosses,
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
