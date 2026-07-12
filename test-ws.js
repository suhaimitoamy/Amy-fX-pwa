const WebSocket = require('ws');
const ws = new WebSocket('wss://amy-fx.vercel.app/api/twelvedata-ws');
ws.on('open', () => { console.log('Connected'); ws.close(); });
ws.on('error', (e) => { console.log('Error:', e.message); });
