// Read-only feed of confirmed Demo (PRACTICE) operations, protected by a shared secret header.
// No user login, no broker/account data. Never writes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-feed-key, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

const parseTime = (v: string | null) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Use GET" }, 405);

  const expected = Deno.env.get("DEMO_FEED_SECRET");
  if (!expected) return json({ error: "Feed not configured" }, 503);
  const provided = req.headers.get("x-feed-key") ?? "";
  if (!safeEqual(provided, expected)) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 200) {
    return json({ error: "limit must be an integer between 1 and 200" }, 400);
  }
  const since = parseTime(url.searchParams.get("since"));
  const before = parseTime(url.searchParams.get("before"));
  if (since === undefined || before === undefined) {
    return json({ error: "since/before must be ISO-8601 timestamps" }, 400);
  }
  if (since && before) return json({ error: "Use either since or before, not both" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let q = supabase
    .from("iq_demo_test_orders")
    .select("signal_id, entry_minute, asset, direction, entry_strategy, amount, result, profit, settled_at")
    .eq("status", "confirmed")
    .eq("account_type", "PRACTICE")
    .in("result", ["win", "loss", "tie"]);

  if (since) {
    // Newest only: operations after the given time, oldest first so the caller can advance.
    q = q.gt("entry_minute", since).order("entry_minute", { ascending: true });
  } else {
    if (before) q = q.lt("entry_minute", before);
    q = q.order("entry_minute", { ascending: false });
  }
  const { data: orders, error } = await q.limit(limitRaw);
  if (error) {
    console.error("demo-operations-feed orders error", error.message);
    return json({ error: "Query failed" }, 500);
  }

  const rows = orders ?? [];
  const scores = new Map<string, number>();
  if (rows.length) {
    const { data: cands, error: cErr } = await supabase
      .from("iq_demo_test_candidates")
      .select("signal_id, entry_minute, score")
      .in("signal_id", rows.map((r) => r.signal_id));
    if (cErr) console.error("demo-operations-feed candidates error", cErr.message);
    for (const c of cands ?? []) scores.set(`${c.signal_id}|${new Date(c.entry_minute).toISOString()}`, c.score);
  }

  const operations = rows.map((r) => {
    const t = new Date(r.entry_minute).toISOString();
    const s = scores.get(`${r.signal_id}|${t}`);
    return {
      asset: r.asset,
      score: s == null ? null : Math.round(s * 100) / 100,
      direction: r.direction,
      strategy: r.entry_strategy,
      amount: Number(r.amount),
      result: String(r.result).toUpperCase(),
      profit: Number(r.profit),
      entry_time: t,
    };
  });

  const last = operations[operations.length - 1];
  const full = operations.length === limitRaw;
  return json({
    operations,
    count: operations.length,
    next_before: !since && full && last ? last.entry_time : null,
    next_since: since ? (last ? last.entry_time : since) : (operations[0]?.entry_time ?? null),
    has_more: since ? full : full,
  });
});
