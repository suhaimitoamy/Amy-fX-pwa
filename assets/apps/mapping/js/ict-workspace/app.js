import {mountChartFullscreen} from './chart-fullscreen.js';
import {loadCandles} from './data.js';
import {normalize} from './engine.js';
import {createPriceChart} from './chart-view.js';
import {mountDisplay,renderAmy} from './ict-presentation.js';
const $=id=>document.getElementById(id);
let context=null,display=null,driverPlan=null;
let chart=null,controller=null,generation=0,timer=null,overlay=null,raw=null;
try{chart=createPriceChart($('chart'),{touchAxes:true});}catch{$('chart').textContent='Peta harga belum tersedia. Bukti struktur tetap dapat dibaca.';}
const fullscreen=mountChartFullscreen(chart);
$('chart-auto-price').addEventListener('click',()=>chart?.autoPrice());
display=mountDisplay(next=>{display=next;renderAmy(context?.amy,display,context?.news,context);draw();});
// A cached trade plan from the previous application version must not be served as current context.
try{localStorage.removeItem('amyfx.ict.mapping.v1');}catch{}
function draw(){
  const tf=$('timeframe').value,serverCandles=context?.amy?.chartCandles?.[tf];
  const candles=serverCandles?.length?serverCandles.map(c=>({time:c.open_time,open:c.open,high:c.high,low:c.low,close:c.close})):raw?.tf===tf?normalize(raw.values,tf,Date.now()/1000).candles:[];
  if(candles.length>0&&$('error'))$('error').hidden=true;
  chart?.draw({tf,candles,plan:null},context?driverPlan||overlay:null,context?.amy?{amy:context.amy,settings:display,news:context.news}:null);
  const coverage=$('ict-coverage');if(coverage){const k=context?.amy?.levels,p=context?.amy?.pivots;coverage.textContent=k?`MO: ${k.midnightStatus} · Asia: ${k.asiaStatus} · Pivot ${display.pivotTf}: ${p?.[display.pivotTf]?'tersedia':'data periode belum lengkap'} · Bias M15 / trigger M5 tertutup`:'Menunggu konteks server; visual keputusan belum tersedia.';}
  const last=candles.at(-1),duration=tf==='M1'?60:tf==='M5'?300:900;
  $('source').textContent=last?`Candle ${tf} terakhir ditutup ${new Date((last.time+duration)*1000).toLocaleString('id-ID',{timeZone:'Asia/Makassar',hour12:false})} WITA`:'Menunggu candle tertutup.';
  $('chart-caption').textContent=last?(serverCandles?.length?'Candle server · engine yang sama':'Candle tertutup · referensi'):'Belum ada candle valid';
}
window.addEventListener('amyfx:driver-plan',event=>{driverPlan=context?event.detail:null;draw();});
window.addEventListener('amyfx:driver-setups',event=>{if(driverPlan){const s=(event.detail||[]).find(s=>s.id===driverPlan.id);driverPlan=s?{id:s.id,entry:s.entry,sl:s.stopLoss,tp:s.target,label:s.driverName}:null;draw();}});
window.addEventListener('amyfx:market-context',event=>{context=event.detail;window.amyfxLastContext=context;if(!context)driverPlan=null;renderAmy(context?.amy,display,context?.news,context);const scenario=context?.primary;
  overlay=scenario?.area?{area:scenario.area,invalidation:scenario.invalidation,target:scenario.target}:null;draw();});
function schedule(){clearTimeout(timer);if(!document.hidden)timer=setTimeout(refresh,60000);}
async function refresh(){
  const id=++generation;controller?.abort();controller=new AbortController();const request=controller;
  const timeout=setTimeout(()=>request.abort(),20000),tf=$('timeframe').value;
  $('refresh').disabled=true;
  try{
    const response=await loadCandles(tf,request.signal);
    if(id!==generation)return;
    raw={tf,values:response.candles};window.amyfxLastCandles=raw.values;draw();$('error').hidden=true;
    if(response.degraded){$('error').hidden=false;$('error').textContent='Sumber chart menggunakan cache lama; tinjau waktu candle sebelum membaca area.';}
  }catch{
    if(id!==generation)return;
    const serverCandles=context?.amy?.chartCandles?.[tf];
    if(serverCandles?.length){
      draw();$('error').hidden=true;
    }else if(raw?.tf===tf){
      draw();$('error').hidden=false;$('error').textContent='Sumber chart menggunakan cache lama; tinjau waktu candle sebelum membaca area.';
    }else{
      $('error').hidden=false;$('error').textContent='Peta harga belum berhasil diperbarui. Konteks server ditampilkan terpisah.';
      if(raw?.tf===tf)draw();
    }
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
$('timeframe').addEventListener('change',()=>{raw=null;chart?.reset();draw();refresh();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){generation++;controller?.abort();clearTimeout(timer);}else refresh();});
window.addEventListener('pagehide',()=>{generation++;controller?.abort();clearTimeout(timer);});
window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});
window.addEventListener('online',refresh);
window.setTab(new URLSearchParams(location.search).get('route')||location.hash.slice(1)||'Dashboard');
draw();refresh();
