import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const SERVICE_ROLE_KEY = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
const TWELVEDATA_API_KEY = String(Deno.env.get("TWELVEDATA_API_KEY") || "").trim();
const SYMBOL = "XAU/USD";
const STREAM_MAX_MS = 105_000;
const HEARTBEAT_MS = 15_000;
const SNAPSHOT_FRESH_MS = 180_000;
const PERSIST_THROTTLE_MS = 5_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, accept, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store, no-transform",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function dbHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    Accept: "application/json",
    ...extra,
  };
}

async function resolveUser(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: authHeader },
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return typeof user?.id === "string" ? user : null;
}

function isMarketOpen(now = Date.now()) {
  const date = new Date(now);
  const day = date.getUTCDay();
  const hour = date.getUTCHours();
  if (day === 6) return false;
  if (day === 0 && hour < 22) return false;
  if (day === 5 && hour >= 22) return false;
  return true;
}

type Quote = {
  symbol: string;
  price: number;
  provider_timestamp: number;
  captured_at: string;
  source: string;
};

async function readSnapshot(): Promise<Quote | null> {
  const query = new URLSearchParams({
    select: "symbol,price,provider_timestamp,captured_at,source",
    symbol: `eq.${SYMBOL}`,
    limit: "1",
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/amyfx_live_quotes?${query}`, {
    headers: dbHeaders(),
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] as Quote : null;
}

async function persistQuote(price: number, providerTimestamp: number, source: string) {
  const now = new Date().toISOString();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/amyfx_live_quotes?on_conflict=symbol`, {
    method: "POST",
    headers: dbHeaders({
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      symbol: SYMBOL,
      price,
      provider_timestamp: providerTimestamp,
      captured_at: new Date(providerTimestamp * 1000).toISOString(),
      source,
      updated_at: now,
    }),
  });
  if (!response.ok) throw new Error(`quote_persist_${response.status}`);
}

async function bootstrapQuote(): Promise<Quote | null> {
  if (!TWELVEDATA_API_KEY) return null;
  const url = new URL("https://api.twelvedata.com/price");
  url.searchParams.set("symbol", SYMBOL);
  url.searchParams.set("apikey", TWELVEDATA_API_KEY);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    const price = Number(payload?.price);
    if (!Number.isFinite(price) || price <= 0) return null;
    const providerTimestamp = Math.floor(Date.now() / 1000);
    await persistQuote(price, providerTimestamp, "TWELVE_DATA_REST_BOOTSTRAP");
    return {
      symbol: SYMBOL,
      price,
      provider_timestamp: providerTimestamp,
      captured_at: new Date(providerTimestamp * 1000).toISOString(),
      source: "TWELVE_DATA_REST_BOOTSTRAP",
    };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !TWELVEDATA_API_KEY) {
    return json({ ok: false, error: "live_price_backend_not_configured" }, 503);
  }

  const user = await resolveUser(req.headers.get("Authorization"));
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);

  const encoder = new TextEncoder();
  let upstream: WebSocket | null = null;
  let heartbeatTimer: number | null = null;
  let lifetimeTimer: number | null = null;
  let closed = false;
  let lastPersistAt = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
        } catch (_) {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
        if (lifetimeTimer !== null) clearTimeout(lifetimeTimer);
        try { upstream?.close(1000, "stream closed"); } catch (_) {}
        upstream = null;
        try { controller.close(); } catch (_) {}
      };

      req.signal.addEventListener("abort", cleanup, { once: true });
      heartbeatTimer = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`)); }
        catch (_) { cleanup(); }
      }, HEARTBEAT_MS);
      lifetimeTimer = setTimeout(() => {
        send("status", { status: "RECONNECT", source: "TWELVE_DATA_WEBSOCKET_EDGE" });
        cleanup();
      }, STREAM_MAX_MS);

      const marketOpen = isMarketOpen();
      let snapshot = await readSnapshot();
      if (!snapshot) snapshot = await bootstrapQuote();
      if (snapshot) {
        const capturedAt = Date.parse(snapshot.captured_at);
        const ageMs = Number.isFinite(capturedAt) ? Math.max(0, Date.now() - capturedAt) : Number.POSITIVE_INFINITY;
        send("price", {
          price: Number(snapshot.price),
          timestamp: Number(snapshot.provider_timestamp),
          capturedAt: Number(snapshot.provider_timestamp) * 1000,
          symbol: SYMBOL,
          source: snapshot.source,
          snapshot: true,
          stale: marketOpen && ageMs > SNAPSHOT_FRESH_MS,
          marketOpen,
        });
      }

      send("status", {
        status: "CONNECTING",
        source: "TWELVE_DATA_WEBSOCKET_EDGE",
        marketOpen,
      });

      const encodedKey = encodeURIComponent(TWELVEDATA_API_KEY);
      const socket = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodedKey}`);
      upstream = socket;

      socket.onopen = () => {
        if (closed) return;
        socket.send(JSON.stringify({ action: "subscribe", params: { symbols: SYMBOL } }));
        send("status", {
          status: "CONNECTED",
          source: "TWELVE_DATA_WEBSOCKET_EDGE",
          marketOpen: isMarketOpen(),
        });
      };

      socket.onmessage = (message) => {
        if (closed) return;
        let payload: any;
        try { payload = JSON.parse(String(message.data || "")); }
        catch (_) { return; }

        const event = String(payload?.event || "").toLowerCase();
        if (event === "subscribe-status") {
          const status = String(payload?.status || "").toLowerCase();
          send("status", {
            status: status === "error" ? "ERROR" : "SUBSCRIBED",
            source: "TWELVE_DATA_WEBSOCKET_EDGE",
            message: status === "error" ? "Langganan harga XAU/USD ditolak." : "Harga live XAU/USD aktif.",
          });
          return;
        }
        if (event && event !== "price") return;

        const price = Number(payload?.price);
        if (!Number.isFinite(price) || price <= 0) return;
        const providerTimestamp = Number(payload?.timestamp) > 0
          ? Math.floor(Number(payload.timestamp))
          : Math.floor(Date.now() / 1000);
        const symbol = String(payload?.symbol || SYMBOL);
        if (symbol.replace("/", "").toUpperCase() !== "XAUUSD") return;

        send("price", {
          price,
          timestamp: providerTimestamp,
          capturedAt: providerTimestamp * 1000,
          symbol: SYMBOL,
          source: "TWELVE_DATA_WEBSOCKET_EDGE",
          snapshot: false,
          stale: false,
          marketOpen: isMarketOpen(),
        });

        if (Date.now() - lastPersistAt >= PERSIST_THROTTLE_MS) {
          lastPersistAt = Date.now();
          persistQuote(price, providerTimestamp, "TWELVE_DATA_WEBSOCKET_EDGE")
            .catch((error) => console.error("pwa-live-price persist", error));
        }
      };

      socket.onerror = () => {
        send("status", {
          status: "ERROR",
          source: "TWELVE_DATA_WEBSOCKET_EDGE",
          message: "WebSocket harga gagal tersambung.",
        });
      };

      socket.onclose = () => {
        if (closed) return;
        send("status", {
          status: "RECONNECT",
          source: "TWELVE_DATA_WEBSOCKET_EDGE",
          message: "Stream harga terputus dan akan disambungkan ulang.",
        });
        cleanup();
      };
    },
    cancel() {
      closed = true;
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
      if (lifetimeTimer !== null) clearTimeout(lifetimeTimer);
      try { upstream?.close(1000, "client cancelled"); } catch (_) {}
      upstream = null;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
});
