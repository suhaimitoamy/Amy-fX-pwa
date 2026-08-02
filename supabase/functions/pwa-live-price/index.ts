import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const SERVICE_ROLE_KEY = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
const ENV_TWELVEDATA_API_KEY = String(Deno.env.get("TWELVEDATA_API_KEY") || "").trim();
const SYMBOL = "XAU/USD";
const SOURCE = "TWELVE_DATA_WEBSOCKET_EDGE";
const SNAPSHOT_FRESH_MS = 180_000;
const PERSIST_THROTTLE_MS = 5_000;
const HEARTBEAT_MS = 10_000;
const STREAM_MAX_MS = 50_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
  "Access-Control-Expose-Headers": "content-type, cache-control, x-amyfx-market-source",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-AmyFX-Market-Source": SOURCE,
    },
  });
}

function serviceHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    Accept: "application/json",
    ...extra,
  };
}

async function runtimeApiKey() {
  if (ENV_TWELVEDATA_API_KEY) return ENV_TWELVEDATA_API_KEY;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_amyfx_runtime_secret`, {
    method: "POST",
    headers: serviceHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ p_name: "amyfx_twelvedata_api_key" }),
  });
  if (!response.ok) throw new Error(`vault_secret_${response.status}`);
  const value = await response.json().catch(() => null);
  return typeof value === "string" ? value.trim() : "";
}

async function resolveUser(request: Request) {
  const authorization = String(request.headers.get("authorization") || "");
  if (!authorization.startsWith("Bearer ")) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: authorization,
      Accept: "application/json",
    },
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

type QuoteSnapshot = {
  symbol: string;
  price: number;
  provider_timestamp: number;
  captured_at: string;
  source: string;
};

async function readSnapshot(): Promise<QuoteSnapshot | null> {
  const query = new URLSearchParams({
    select: "symbol,price,provider_timestamp,captured_at,source",
    symbol: `eq.${SYMBOL}`,
    limit: "1",
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/amyfx_live_quotes?${query}`, {
    headers: serviceHeaders(),
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function persistQuote(price: number, providerTimestamp: number) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/amyfx_live_quotes?on_conflict=symbol`, {
    method: "POST",
    headers: serviceHeaders({
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      symbol: SYMBOL,
      price,
      provider_timestamp: providerTimestamp,
      captured_at: new Date(providerTimestamp * 1000).toISOString(),
      source: SOURCE,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`quote_persist_${response.status}`);
}

function encodeEvent(event: string, payload: unknown) {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, error: "live_price_backend_not_configured" }, 503);

  const user = await resolveUser(request);
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);

  let apiKey = "";
  try {
    apiKey = await runtimeApiKey();
  } catch (error) {
    console.error("pwa-live-price vault", error instanceof Error ? error.message : String(error));
  }
  if (!apiKey) return json({ ok: false, error: "live_price_key_unavailable" }, 503);

  const snapshot = await readSnapshot().catch(() => null);
  const marketOpen = isMarketOpen();
  let socket: WebSocket | null = null;
  let closed = false;
  let heartbeatTimer = 0;
  let lifetimeTimer = 0;
  let lastPersistAt = 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (lifetimeTimer) clearTimeout(lifetimeTimer);
        try { socket?.close(1000, "stream closed"); } catch (_) {}
        socket = null;
        try { controller.close(); } catch (_) {}
      };
      const send = (event: string, payload: unknown) => {
        if (closed) return;
        try { controller.enqueue(encodeEvent(event, payload)); } catch (_) { cleanup(); }
      };

      if (snapshot) {
        const capturedAt = Date.parse(String(snapshot.captured_at || ""));
        const ageMs = Number.isFinite(capturedAt) ? Math.max(0, Date.now() - capturedAt) : Number.POSITIVE_INFINITY;
        send("price", {
          price: Number(snapshot.price),
          timestamp: Number(snapshot.provider_timestamp),
          capturedAt: Number(snapshot.provider_timestamp) * 1000,
          symbol: SYMBOL,
          source: snapshot.source || SOURCE,
          snapshot: true,
          stale: marketOpen && ageMs > SNAPSHOT_FRESH_MS,
          marketOpen,
        });
      } else {
        send("status", {
          status: marketOpen ? "WAITING_FOR_FIRST_TICK" : "MARKET_CLOSED_NO_WEBSOCKET_SNAPSHOT",
          source: SOURCE,
          message: marketOpen ? "Menunggu tick WebSocket pertama XAU/USD." : "Market tutup dan belum ada snapshot WebSocket tersimpan.",
          marketOpen,
        });
      }

      send("status", { status: "CONNECTING", source: SOURCE, marketOpen });
      socket = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(apiKey)}`);

      socket.onopen = () => {
        socket?.send(JSON.stringify({ action: "subscribe", params: { symbols: SYMBOL } }));
        send("status", { status: "CONNECTED", source: SOURCE, marketOpen: isMarketOpen() });
      };

      socket.onmessage = event => {
        let payload: Record<string, unknown>;
        try { payload = JSON.parse(String(event.data || "{}")); } catch (_) { return; }
        const eventType = String(payload.event || "").toLowerCase();
        if (eventType === "subscribe-status") {
          const status = String(payload.status || "").toLowerCase();
          send("status", {
            status: status === "error" ? "ERROR" : "SUBSCRIBED",
            source: SOURCE,
            message: status === "error" ? "Langganan harga XAU/USD ditolak." : "Harga live XAU/USD aktif.",
            marketOpen: isMarketOpen(),
          });
          return;
        }
        if (eventType && eventType !== "price") return;
        const price = Number(payload.price);
        const normalizedSymbol = String(payload.symbol || SYMBOL).replace("/", "").toUpperCase();
        if (!Number.isFinite(price) || price <= 0 || normalizedSymbol !== "XAUUSD") return;
        const providerTimestamp = Number(payload.timestamp) > 0 ? Math.floor(Number(payload.timestamp)) : Math.floor(Date.now() / 1000);
        send("price", {
          price,
          timestamp: providerTimestamp,
          capturedAt: providerTimestamp * 1000,
          symbol: SYMBOL,
          source: SOURCE,
          snapshot: false,
          stale: false,
          marketOpen: isMarketOpen(),
        });
        if (Date.now() - lastPersistAt >= PERSIST_THROTTLE_MS) {
          lastPersistAt = Date.now();
          persistQuote(price, providerTimestamp).catch(error => console.error("pwa-live-price persist", error instanceof Error ? error.message : String(error)));
        }
      };

      socket.onerror = () => send("status", { status: "ERROR", source: SOURCE, message: "WebSocket harga gagal tersambung.", marketOpen: isMarketOpen() });
      socket.onclose = () => {
        if (closed) return;
        send("status", { status: "RECONNECT", source: SOURCE, message: "Stream harga terputus dan akan disambungkan ulang.", marketOpen: isMarketOpen() });
        cleanup();
      };

      heartbeatTimer = setInterval(() => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        try { socket.send(JSON.stringify({ action: "heartbeat" })); } catch (_) {}
        try { controller.enqueue(new TextEncoder().encode(`: heartbeat ${Date.now()}\n\n`)); } catch (_) { cleanup(); }
      }, HEARTBEAT_MS);
      lifetimeTimer = setTimeout(() => {
        send("status", { status: "RECONNECT", source: SOURCE, marketOpen: isMarketOpen() });
        cleanup();
      }, STREAM_MAX_MS);
    },
    cancel() {
      closed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (lifetimeTimer) clearTimeout(lifetimeTimer);
      try { socket?.close(1000, "client disconnected"); } catch (_) {}
      socket = null;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform, max-age=0",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-AmyFX-Market-Source": SOURCE,
    },
  });
});
