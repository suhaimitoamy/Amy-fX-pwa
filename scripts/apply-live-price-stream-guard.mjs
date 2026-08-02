import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const RELAY_ENDPOINT = 'https://amy-fx.vercel.app/api/pwa-live-price';

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function write(relative, content) {
  fs.writeFileSync(path.join(root, relative), content);
}

let bridge = read('pwa-live-price-bridge.js');
bridge = bridge
  .replace(
    /\/\* Amy FX PWA live-price stream bridge\.[^*]+\*\//,
    '/* Amy FX PWA live-price stream bridge. Twelve Data credentials stay on the Amy FX production relay. */'
  )
  .replace(
    /const FALLBACK_ENDPOINT = '[^']+';/,
    `const FALLBACK_ENDPOINT = '${RELAY_ENDPOINT}';`
  )
  .replace(
    /version: 'pwa-websocket-[^']+',/,
    "version: 'pwa-websocket-production-relay-3.0.0',"
  );
write('pwa-live-price-bridge.js', bridge);

const configPath = path.join(root, 'pwa-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.livePriceStreamEndpoint = RELAY_ENDPOINT;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

let worker = read('service-worker.js');
worker = worker.replace(
  /const VERSION = '([^']+)';/,
  (_match, current) => {
    const base = String(current).replace(/-pwa-ws-price-v\d+$/, '');
    return `const VERSION = '${base}-pwa-ws-price-v3';`;
  }
);

if (!worker.includes('function isLivePriceStream(url)')) {
  const anchor = "function isDataRequest(url) {\n  return url.pathname.includes('/api/') ||\n    url.hostname.includes('supabase.co') ||\n    url.hostname.includes('twelvedata.com') ||\n    url.pathname.includes('/functions/v1/');\n}\n";
  const addition = `${anchor}\nfunction isLivePriceStream(url) {\n  return url.pathname.endsWith('/functions/v1/pwa-live-price') ||\n    url.pathname.endsWith('/api/pwa-live-price');\n}\n`;
  if (!worker.includes(anchor)) throw new Error('[live-price-stream-guard] service-worker data matcher missing');
  worker = worker.replace(anchor, addition);
}

const legacyBypass = "  if (url.hostname.includes('supabase.co') && url.pathname.endsWith('/functions/v1/pwa-live-price')) {\n    event.respondWith(fetch(request));\n    return;\n  }";
const relayBypass = "  if (isLivePriceStream(url)) {\n    event.respondWith(fetch(request));\n    return;\n  }";
if (worker.includes(legacyBypass)) worker = worker.replace(legacyBypass, relayBypass);
if (!worker.includes(relayBypass)) {
  const dataBlock = "  if (isDataRequest(url)) {\n    event.respondWith(networkFirst(request, DATA_CACHE, 10000).catch(() => fetch(request)));\n    return;\n  }";
  if (!worker.includes(dataBlock)) throw new Error('[live-price-stream-guard] service-worker fetch block missing');
  worker = worker.replace(dataBlock, `${relayBypass}\n\n${dataBlock}`);
}
write('service-worker.js', worker);

const liveEdgePath = 'supabase/functions/pwa-live-price/index.ts';
if (fs.existsSync(path.join(root, liveEdgePath))) {
  let liveEdge = read(liveEdgePath);
  liveEdge = liveEdge.replace(
    "      let snapshot = await readSnapshot();\n      if (!snapshot) snapshot = await bootstrapQuote();",
    "      const snapshot = await readSnapshot();"
  );
  write(liveEdgePath, liveEdge);
}

console.log('Amy FX PWA production WebSocket relay guard applied.');
