import {mountChartFullscreen} from './chart-fullscreen.js';
import {loadCandles} from './data.js';
import {normalize,analyze,timestamp} from './engine.js';
import {createPriceChart} from './chart-view.js';
import {mountDisplay,renderAmy,loadDisplay,isGoldMarketOpen} from './ict-presentation.js';
const $=id=>document.getElementById(id);
let context=null,display=null,driverPlan=null;
let chart=null,controller=null,generation=0,timer=null,overlay=null,raw=null;
try{chart=createPriceChart($('chart'),{touchAxes:true});}catch{$('chart').textContent='Peta harga belum tersedia. Bukti struktur tetap dapat dibaca.';}
const fullscreen=mountChartFullscreen(chart);
$('chart-auto-price')?.addEventListener('click',()=>chart?.autoPrice());
display=mountDisplay(next=>{display=next;renderAmy(context?.amy,display,context?.news,context);draw();});
// A cached trade plan from the previous application version must not be served as current context.
try{localStorage.removeItem('amyfx.ict.mapping.v1');}catch{}
function isWeekendClosure(timeSec){
  try{
    const parts=new Intl.DateTimeFormat('en-US',{
      timeZone:'America/New_York',hourCycle:'h23',hour:'2-digit',minute:'2-digit',weekday:'short'
    }).formatToParts(new Date(timeSec*1000));
    const values=Object.fromEntries(parts.map(x=>[x.type,x.value]));
    const weekday=values.weekday,hour=Number(values.hour)+Number(values.minute)/60;
    if(weekday==='Sat')return true;
    if(weekday==='Sun')return hour<17;
    if(weekday==='Fri')return hour>=17;
    return false;
  }catch(_){
    const d=new Date(timeSec*1000),day=d.getUTCDay();
    return day===6||day===0;
  }
}
function filterCandles(values,closed){
  if(!closed||!Array.isArray(values))return values||[];
  return values.filter(c=>{
    if(c?.amyfxSyntheticCurrent||c?.synthetic)return false;
    const t=timestamp(c.time??c.datetime??c.open_time);
    return !isWeekendClosure(t);
  });
}
// Lenient fallback so one duplicate/odd provider row cannot blank the whole chart.
function lenientCandles(values){
  const closed=!isGoldMarketOpen(Date.now()/1000);
  const map=new Map();
  for(const c of values||[]){
    if(c?.amyfxSyntheticCurrent||c?.synthetic)continue;
    const t=timestamp(c.time??c.datetime??c.open_time);
    if(closed&&isWeekendClosure(t))continue;
    const o={time:t,open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)};
    if(Object.values(o).every(Number.isFinite)&&o.low>0)map.set(t,o);
  }
  return [...map.values()].sort((a,b)=>a.time-b.time);
}
function draw(degraded=false){
  const tf=$('timeframe').value;
  let result=null;
  const closed=!isGoldMarketOpen(Date.now()/1000);
  if(raw?.tf===tf&&raw.candles?.length){
    const safeCandles=filterCandles(raw.candles,closed);
    const safeContext=filterCandles(raw.context||[],closed);
    try{
      result=analyze({...raw,candles:safeCandles,context:safeContext,tf,now:Date.now()/1000,degraded:degraded||raw.degraded||false});
    }catch{
      const candles=lenientCandles(safeCandles);
      result={candles,tf,plan:null,sourceTime:candles.at(-1)?.time||null,fresh:!raw.degraded};
    }
  }else if(context?.amy?.chartCandles?.[tf]?.length){
    const rawCandles=context.amy.chartCandles[tf].map(c=>({time:c.open_time,open:c.open,high:c.high,low:c.low,close:c.close}));
    const candles=filterCandles(rawCandles,closed);
    result={candles,tf,plan:null,sourceTime:candles.at(-1)?.time||null,fresh:false};
  }
  if(!result||!result.candles?.length){
    if($('chart-price'))$('chart-price').textContent='—';
    if(degraded&&$('source'))$('source').textContent='Belum ada candle. Periksa koneksi lalu tekan Perbarui.';
    return;
  }
  const activePlan=driverPlan||context?.amy?.plan||overlay||result.plan;
  const presentation={settings:display||loadDisplay(),amy:context?.amy,context,candles:result.candles,tf};
  chart?.draw(result,activePlan,presentation);
  const last=result.candles.at(-1);
  if($('chart-price'))$('chart-price').textContent=last?last.close.toFixed(2):'—';
  if(last&&Number.isFinite(last.close)&&typeof window.AmyPriceAlertManager?.checkPrice==='function'){
    window.AmyPriceAlertManager.checkPrice(last.close);
  }
  if($('source')){
    const timeStr=new Date((result.sourceTime||last.time)*1000).toLocaleString('id-ID',{timeZone:'Asia/Makassar',hour12:false});
    if(closed){
      const statusText=isWeekendClosure(Date.now()/1000)?'Pasar Tutup (Akhir Pekan)':'Pasar Tutup';
      $('source').textContent=`${tf} · ${statusText} · Candle Terakhir: ${timeStr} WITA · ${result.fresh?'Data Terkini':'Referensi lama / data terlambat'}`;
    }else{
      $('source').textContent=`${tf} · Candle ${timeStr} WITA · ${result.fresh?'Candle terkini':'Referensi lama / data terlambat'}`;
    }
  }
  if($('chart-note'))$('chart-note').textContent=(driverPlan||context?.amy?.plan)?'Level terpasang: Entry, SL, TP1, TP2 (Entry Assistant V3)':overlay?'Level terpasang: batas area, 50% CE, dan target likuiditas.':result.plan?'Level entry, SL dan target: model ICT lokal, bukan setup Scalper server.':'';
  const coverage=$('ict-coverage');
  if(coverage){
    const k=context?.amy?.levels,p=context?.amy?.pivots;
    coverage.textContent=k?`MO: ${k.midnightStatus} · Asia: ${k.asiaStatus} · Pivot ${display?.pivotTf||'D'}: ${p?.[display?.pivotTf||'D']?'tersedia':'data periode belum lengkap'} · Bias M15 / trigger M5 tertutup`:'Menunggu konteks server; visual keputusan belum tersedia.';
  }
}
window.addEventListener('amyfx:driver-plan',event=>{driverPlan=event.detail||null;draw();});
window.addEventListener('amyfx:assistant-plan',event=>{driverPlan=event.detail||null;draw();});
window.addEventListener('amyfx:driver-setups',event=>{if(driverPlan){const s=(event.detail||[]).find(s=>s.id===driverPlan.id);driverPlan=s?{id:s.id,entry:s.entry,sl:s.stopLoss,tp:s.target,label:s.driverName}:null;draw();}});
window.addEventListener('amyfx:market-context',event=>{context=event.detail;window.amyfxLastContext=context;if(!context)driverPlan=null;renderAmy(context?.amy,display,context?.news,context);const scenario=context?.primary;
  overlay=scenario?.area?{area:scenario.area,invalidation:scenario.invalidation,target:scenario.target}:null;draw();});
function getStoredCandles(timeframe){
  try{
    if(typeof localStorage==='undefined')return null;
    const rawData=localStorage.getItem(`amyfx.mapping.candles.${timeframe}`);
    if(!rawData)return null;
    const parsed=JSON.parse(rawData);
    if(Array.isArray(parsed?.values)&&parsed.values.length>0)return parsed.values;
  }catch(_){}
  return null;
}
function getRefreshInterval(tf){
  if(!isGoldMarketOpen(Date.now()/1000))return 300000;
  const durationSec={M1:60,M5:300,M15:900,H1:3600}[tf]||900;
  const now=Date.now();
  const nextClose=(Math.floor(now/(durationSec*1000))+1)*(durationSec*1000)+5000;
  const msUntilClose=nextClose-now;
  return Math.min(120000,Math.max(90000,msUntilClose));
}
function schedule(){
  clearTimeout(timer);
  if(!document.hidden){
    const tf=$('timeframe')?.value||'M15';
    const interval=isGoldMarketOpen(Date.now()/1000)?getRefreshInterval(tf):300000;
    timer=setTimeout(refresh,interval);
  }
}
async function refresh(){
  const id=++generation;controller?.abort();controller=new AbortController();const request=controller;
  const timeout=setTimeout(()=>request.abort(),35000),tf=$('timeframe').value;
  $('refresh').disabled=true;if($('chart-error'))$('chart-error').textContent='';
  if(raw)draw();
  try{
    const [response,h1Context]=await Promise.all([
      loadCandles(tf,request.signal),
      loadCandles('H1',request.signal).catch(()=>({candles:[],degraded:true}))
    ]);
    if(id!==generation)return;
    const closed=!isGoldMarketOpen(Date.now()/1000);
    const candles=filterCandles(response.candles,closed);
    const contextCandles=filterCandles(h1Context.candles,closed);
    const next={candles,context:contextCandles,tf,degraded:response.degraded||h1Context.degraded};
    const result=analyze({...next,now:Date.now()/1000});
    const previous=raw?analyze({...raw,now:Date.now()/1000}):null;
    if(!result.candles.length||(previous&&result.sourceTime<previous.sourceTime))throw Error('Candle tidak lengkap atau lebih lama');
    raw=next;window.amyfxLastCandles=candles;
    draw();
  }catch{
    if(id!==generation)return;
    if(!raw||!raw.candles?.length){
      const cachedTf=getStoredCandles(tf);
      if(cachedTf&&cachedTf.length>0){
        const closed=!isGoldMarketOpen(Date.now()/1000);
        raw={candles:filterCandles(cachedTf,closed),context:filterCandles(getStoredCandles('H1')||[],closed),tf,degraded:true};
      }
    }
    if(raw)raw.degraded=true;
    draw(true);
    if($('chart-error'))$('chart-error').textContent='Pembaruan gagal. Menggunakan data cache lokal.';
  }finally{clearTimeout(timeout);if(id===generation){$('refresh').disabled=false;schedule();}}
}
window.setTab=name=>{
  if(name!=='Dashboard')fullscreen?.close();
  const tab=['Dashboard','Analyze','Advisor','History'].includes(name)?name:'Dashboard';
  document.querySelectorAll('.panel').forEach(el=>el.hidden=el.id!==tab);
  document.querySelectorAll('[data-tab]').forEach(el=>el.setAttribute('aria-selected',String(el.dataset.tab===tab)));
  if(tab==='Dashboard')chart?.resize();
  if(tab==='Advisor'&&typeof window.initAdvisorPanel==='function')window.initAdvisorPanel();
};
document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>window.setTab(el.dataset.tab)));
$('refresh').addEventListener('click',()=>{refresh();window.dispatchEvent(new CustomEvent('amyfx:refresh-context'));});
$('btn-custom-price-alert')?.addEventListener('click',()=>{
  if(typeof window.AmyPriceAlertManager?.openAddAlertDialog==='function'){
    window.AmyPriceAlertManager.openAddAlertDialog();
  }
});
$('btn-plan-price-alert')?.addEventListener('click',()=>{
  const plan=driverPlan||context?.amy?.assistant?.plan||context?.amy?.plan;
  const prefill=plan?.entry||null;
  if(typeof window.AmyPriceAlertManager?.openAddAlertDialog==='function'){
    window.AmyPriceAlertManager.openAddAlertDialog(prefill);
  }
});
$('timeframe').addEventListener('change',()=>{
  const newTf=$('timeframe').value;
  const stored=getStoredCandles(newTf);
  if(stored&&stored.length>0){
    const closed=!isGoldMarketOpen(Date.now()/1000);
    raw={candles:filterCandles(stored,closed),context:filterCandles(getStoredCandles('H1')||[],closed),tf:newTf,degraded:true};
  }else{
    raw=null;
  }
  chart?.reset();draw();refresh();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){generation++;controller?.abort();clearTimeout(timer);}else refresh();});
window.addEventListener('pagehide',()=>{generation++;controller?.abort();clearTimeout(timer);});
window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});
window.addEventListener('online',refresh);
window.setTab(new URLSearchParams(location.search).get('route')||location.hash.slice(1)||'Dashboard');
const initialStored=getStoredCandles($('timeframe')?.value||'M15');
if(initialStored&&initialStored.length>0){
  const closed=!isGoldMarketOpen(Date.now()/1000);
  raw={candles:filterCandles(initialStored,closed),context:filterCandles(getStoredCandles('H1')||[],closed),tf:$('timeframe')?.value||'M15',degraded:true};
}
draw();refresh();
