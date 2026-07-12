import { state, TF, log, save } from '../main.js';
import { analyze, tfGroup } from '../engine/ict-core.js';
import { render, renderSoft, renderAnalyzeLive } from '../ui/ui-render.js';
import { sendTargetsToNative } from '../bridge/android-bridge.js';

export let ws = null;
export let reconnectTimer = null;
export let scanTimer = null;
export let lastWsTickAt = Number(localStorage.getItem('last_ws_tick_at')||0);

const PROXY_URL = 'https://amy-fx.vercel.app/api/twelvedata';
let candleFetchedAt = {};
export function isCandleStale(tf) {
  let age = (Date.now() - (candleFetchedAt[tf]||0)) / 1000 / 60;
  if(tf==='M1') return age >= 1;
  if(tf==='M5') return age >= 3;
  if(tf==='M15') return age >= 5;
  if(tf==='M30') return age >= 10;
  if(tf==='H1') return age >= 15;
  if(tf==='H4') return age >= 30;
  return age >= 120;
}

export async function fetchTf(tf){
  let params=new URLSearchParams({symbol:'XAU/USD',interval:TF[tf],outputsize:'300'});
  let url = `${PROXY_URL}?${params.toString()}`;
  let r = await fetch(url);
  let d = await r.json();
  if(d.status==='error') throw new Error(d.message||'Fetch gagal');
  let raw=(d.values||[]).reverse();
  let arr=raw.map((c,i)=>({time:new Date(c.datetime).getTime()/1000,timeframe:tf,open:+c.open,high:+c.high,low:+c.low,close:+c.close,tickCount:1,isClosed:i<raw.length-1})).filter(c=>c.isClosed);
  state.candles[tf]=arr;
  candleFetchedAt[tf]=Date.now();
  return arr;
}

export async function runAnalysis(tf=state.tf){if(typeof scanTimer!=='undefined'&&scanTimer){clearTimeout(scanTimer);scanTimer=null}state.tf=tf;render();try{log('Memindai '+tf+'...');let group=tfGroup(tf),scanGroup=[...new Set([...group,'M1','M5','M15','M30','H1','H4'])];await Promise.all(scanGroup.map(async x=>{if(!state.candles[x]?.length||isCandleStale(x)){try{if(state.candles[x]?.length)log('Refresh candle '+x);await fetchTf(x)}catch(e){log(`Gagal ambil ${x}, pakai cache jika ada.`)}}return state.candles[x]||[]}));let htfBiases={};for(let x of group.filter(x=>x!==tf)){let mini=state.candles[x];if(mini?.length>30){let a=analyze(mini,x,{},state.price);htfBiases[x]=a?.st?.trend||'NEUTRAL'}}let htfContext={H4:state.candles.H4,D1:state.candles.D1,W1:state.candles.W1};let res=analyze(state.candles[tf],tf,htfBiases,state.price,htfContext);if(!res||!res.st){throw new Error('Hasil analyze tidak valid')}if(res.final==='WAIT'&&res.score===0)log(`Warning: Data ${tf} kurang untuk analisis.`);else if(res.setups.length>0&&!res.bestSetup){let cf=res.setups[0].conflictCheck;if(cf&&cf.hasFatalConflict)log(`Setup ditolak karena konflik fatal: ${cf.conflicts[0]?.note}`);else log(`Setup masuk ke mode WAIT/WATCH karena kurang konfirmasi/poin.`)}state.result=res;state.setups=[...(res?.setups||[]),...state.setups].slice(0,50);state.analyses=[{id:Date.now(),...res},...state.analyses].slice(0,80);save();log(`${tf} selesai: ${res.signal} score ${res.score}/100`);sendTargetsToNative()}catch(e){log('Error '+tf+': '+e.message)}render()}

export function connect(){
  if(ws){clearInterval(ws);ws=null}
  state.conn='Connected';
  renderSoft();
  log('Live Price Proxy Connected.');
  runAnalysis(state.tf);
  ws=setInterval(async()=>{
    try{
      let r=await fetch(`${PROXY_URL}?symbol=XAU/USD&interval=1min&outputsize=1`);
      let d=await r.json();
      if(d.status==='ok'&&d.values&&d.values.length>0){
        let p=+d.values[0].close;
        if(p>1000&&p<10000){
          lastWsTickAt=Date.now();
          localStorage.setItem('last_ws_tick_at',String(lastWsTickAt));
          state.price=p;
          localStorage.setItem('last_price',String(p));
          renderAnalyzeLive();
          if(!scanTimer)scanTimer=setTimeout(()=>{scanTimer=null;runAnalysis(state.tf)},15000);
        }
      }
    }catch(_){}
  },10000);
}

export function stopLivePrice() {
  if (ws) { clearInterval(ws); ws = null; }
  clearTimeout(reconnectTimer);
  clearTimeout(scanTimer);
  reconnectTimer = null;
  scanTimer = null;
  state.conn = 'Scanner Mode';
  renderSoft();
}

export function updateWsVars(w, r, s, l) {
  ws = w;
  reconnectTimer = r;
  scanTimer = s;
  lastWsTickAt = l;
}
