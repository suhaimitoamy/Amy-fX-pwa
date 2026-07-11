import "./bridge/sync-fix.js";
import "./bridge/notify-guard.js";
import { runAnalysis, connect, ws, lastWsTickAt, updateWsVars } from './api/market-data.js';
import { fmtDir } from './ui/ui-render.js';
import { render, applyAmyFxRoute, analyzeActiveSetups } from './ui/ui-render.js';
import { saveConnect, toggleBg, testNotif, downloadLogs } from './bridge/android-bridge.js';

export const TF={M1:'1min',M5:'5min',M15:'15min',M30:'30min',H1:'1h',H4:'4h',D1:'1day',W1:'1week'};
export const state={
  tab:'Dashboard',tf:'M5',
  key:localStorage.getItem('twelve_api_key')||'',
  price:Number(localStorage.getItem('last_price')||0),
  conn:'Offline',
  logs:JSON.parse(localStorage.getItem('amy_mapping_logs')||'[]'),
  analyses:JSON.parse(localStorage.getItem('amy_mapping_analyses')||'[]'),
  setups:JSON.parse(localStorage.getItem('amy_mapping_setups')||'[]'),
  candles:{},result:null,
  bg:localStorage.getItem('bg_scanner')==='true',
  notified:JSON.parse(localStorage.getItem('amy_mapping_notified')||'{}')
};

export const p2=v=>Number.isFinite(+v)?Number(v).toFixed(2):'-';
export function nowTime(){return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date())}
export function timeRange(zone,sh,sm,eh,em){let now=new Date(),fmt=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),g=t=>+fmt.find(x=>x.type===t).value;let guess=Date.UTC(g('year'),g('month')-1,g('day'),sh,sm);let txt=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(guess));let [hh,mm]=txt.split(':').map(Number);let start=guess+((sh*60+sm)-(hh*60+mm))*60000;let end=start+(((eh*60+em)-(sh*60+sm)+(eh*60+em<=sh*60+sm?1440:0))*60000);return{start,end}}
export function sessions(){let z=[['Asian Kill Zone','Asia/Tokyo',9,0,12,0],['London Judas Swing','Europe/London',7,0,8,30],['London Open Kill Zone','Europe/London',8,0,12,0],['New York Judas Swing','America/New_York',8,0,9,30],['New York Open Kill Zone','America/New_York',8,30,11,30],['Silver Bullet','America/New_York',10,0,11,0],['Swing Session','America/New_York',13,30,16,0]];let n=Date.now();return z.map(a=>{let r=timeRange(...a.slice(1));return{name:a[0],active:n>=r.start&&n<r.end,wib:new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(r.start))+' - '+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(r.end))}})}
export function curSession(){return sessions().find(x=>x.active)||{name:'Off-Session',active:false,wib:'-'}}

export function log(x){state.logs=[`[${nowTime()}] ${x}`,...state.logs].slice(0,200);save();try{render()}catch(e){}}
export function save(){
  localStorage.setItem('amy_mapping_logs',JSON.stringify(state.logs.slice(0,200)));
  localStorage.setItem('amy_mapping_analyses',JSON.stringify(state.analyses.slice(0,80)));
  localStorage.setItem('amy_mapping_setups',JSON.stringify(state.setups.slice(0,50)));
  localStorage.setItem('bg_scanner',String(state.bg));
}
export function setupText(s){
  if(!s)return'';
  return `${fmtDir(s.dir)} ${s.tf}\nScore: ${s.score}/100\nEntry: ${p2(s.entryLow)} - ${p2(s.entryHigh)}\nSL: ${p2(s.sl)}\nTP1: ${p2(s.tp1)}\nTP2: ${p2(s.tp2)}\n${s.reason}`
}

function setTab(t){state.tab=t;render()}
window.setTab=setTab;
window.runAnalysis=runAnalysis;
window.render=render;
window.analyzeActiveSetups = analyzeActiveSetups;
window.saveConnect=saveConnect;
window.toggleBg=toggleBg;
window.testNotif=testNotif;
window.downloadLogs=downloadLogs;

window.state = state;
window.TF = TF;

function wsLiveAlive(){
  try{return ws&&(ws.readyState===WebSocket.OPEN||ws.readyState===WebSocket.CONNECTING)}catch(e){return false}
}
function autoConnectLivePrice(){
  if(!state.key||!state.key.trim())return;
  if(wsLiveAlive())return;
  try{connect()}catch(e){log('Auto connect error: '+e.message)}
}
function livePriceWatchdog(){
  if(!state.key||!state.key.trim())return;
  let stale=lastWsTickAt&&Date.now()-lastWsTickAt>60000;
  if(!wsLiveAlive()||state.conn==='Offline'||stale){
    if(stale&&ws){try{ws.onclose=null;ws.close()}catch(e){} updateWsVars(null, null, null, null);}
    autoConnectLivePrice();
  }
}

function initApp() {
  document.querySelectorAll('.nav button').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
  applyAmyFxRoute();
  render();
  setTimeout(autoConnectLivePrice,600);
  setInterval(livePriceWatchdog,30000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
