import {loadCandles} from '../mapping/js/ict-workspace/data.js';
import {SNAPSHOT_KEY,validSnapshot,isFresh,liquidityBands,nearestLevels} from '../mapping/js/ict-workspace/snapshot.js';
const $=id=>document.getElementById(id);
const price=n=>Number.isFinite(n)?n.toFixed(2):'—';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=t=>t?new Date(t*1000).toLocaleString('id-ID',{timeZone:'Asia/Makassar',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})+' WITA':'—';
let snapshot=null,request=null,controller=null,timer=null,failed=false,filter='all';
// This page maps unswept levels only. Trade-plan generation belongs to the retired model.
function liquidityOnly(rows,now){
  const byTime=new Map();
  for(const raw of rows||[]){
    const value=raw.time??raw.datetime??raw.open_time;
    const iso=String(value).replace(' ','T');
    const t=Number(value)>1e10?Number(value)/1000:Number(value)||Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(iso)?iso:`${iso}Z`)/1000;
    const c={time:t,open:Number(raw.open),high:Number(raw.high),low:Number(raw.low),close:Number(raw.close)};
    if(raw.is_closed===false||raw.isClosed===false||raw.synthetic||raw.amyfxSyntheticCurrent||
       !Number.isFinite(t)||!Object.values(c).every(Number.isFinite)||t+900>now-10||c.low<=0||c.low>Math.min(c.open,c.close)||c.high<Math.max(c.open,c.close))continue;
    byTime.set(t,c);
  }
  const candles=[...byTime.values()].sort((a,b)=>a.time-b.time),levels=[];
  for(let i=2;i<candles.length-2;i++)for(const kind of ['high','low']){
    const c=candles[i],window=candles.slice(i-2,i+3);
    const pivot=window.every((x,index)=>index===2||(kind==='high'?c.high>x.high:c.low<x.low));
    if(!pivot)continue;
    const level=c[kind],later=candles.slice(i+3);
    if(later.some(x=>kind==='high'?x.high>=level:x.low<=level))continue;
    levels.push({kind,level,time:c.time,confirmed:candles[i+2].time,used:false});
  }
  const last=candles.at(-1),fresh=Boolean(last&&now-(last.time+900)>=-30&&now-(last.time+900)<=1020);
  return {model:'ICT-SWEEP-MSS-FVG-1',tf:'M15',signal:'WAIT',fresh,sourceTime:last?.time||null,
    capturedAt:now*1000,close:last?.close||null,levels,reason:'Level likuiditas saja; skenario terbaru tersedia di Mapping.',plan:null};
}
try {
  const cached=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||'null');
  if(validSnapshot(cached))snapshot=cached;
  else {
    const serverCtx=JSON.parse(localStorage.getItem('amyfx.market-context.v1')||'null');
    if(serverCtx?.fresh&&serverCtx.price&&Array.isArray(serverCtx.liquidity)){
      const levels=serverCtx.liquidity.filter(l=>Number.isFinite(l.level)&&l.status==='ACTIVE').map(l=>({
        kind:l.side==='BUY'?'high':'low',level:l.level,time:l.sourceTime||Date.now()/1000,confirmed:l.sourceTime||Date.now()/1000,used:false
      }));
      snapshot={model:'ICT-SWEEP-MSS-FVG-1',tf:'M15',signal:'WAIT',fresh:true,sourceTime:serverCtx.source?.M15||Date.now()/1000,
        capturedAt:Date.now(),close:serverCtx.price,levels,reason:'Likuiditas aktif dari konteks pasar Amy FX.',plan:null};
    }
  }
} catch {}
function paint() {
  const valid=validSnapshot(snapshot),fresh=isFresh(snapshot)&&!failed;
  const levels=nearestLevels(snapshot),bands=liquidityBands(snapshot),close=snapshot?.close;
  const status=valid?(fresh?'Candle terkini':'Referensi lama'):'Menunggu Mapping';
  const strip=$('market-command-strip');
  if(strip)strip.innerHTML=`<div class="amy-command-main"><span>XAU/USD · MAPPING ${escape(snapshot?.tf||'M15')}</span><strong>${price(close)}</strong></div><div class="amy-command-metric"><small>BSL TERDEKAT</small><b class="red">${price(levels.bsl)}</b></div><div class="amy-command-metric"><small>SSL TERDEKAT</small><b class="green">${price(levels.ssl)}</b></div><div class="ict-source"><span>${status} · ${time(snapshot?.sourceTime)}</span><button type="button" data-ict-refresh ${request?'disabled':''}>${request?'Memperbarui…':'Perbarui'}</button></div>`;
  $('intel-briefing').innerHTML=`<div class="amy-briefing-title">Peta likuiditas Mapping</div><p>${valid?'Level swing terkonfirmasi yang belum tersentuh. BSL berada di atas referensi harga; SSL di bawahnya.':'Belum ada data Mapping yang dapat ditampilkan.'}</p>${failed?'<small>Pembaruan gagal. Data terakhir tetap ditandai sebagai referensi lama.</small> ':''}<a href="../mapping/index.html#Analyze">Lihat bukti Mapping →</a>`;
  const hp=$('heatmap-price');if(hp)hp.textContent=`XAU/USD ${price(close)} · ${status}`;
  const count=bands.reduce((n,b)=>n+b.levels.length,0);
  for(const id of ['heatmap-status','liquidity-status']){const el=$(id);if(el)el.textContent=`${status} · ${count} level · ${bands.length} zona · ${time(snapshot?.sourceTime)}`;}
  const strongest=bands.slice().sort((a,b)=>b.levels.length-a.levels.length)[0];
  const max=Math.max(1,...bands.map(b=>b.levels.length));
  const range=b=>b.low===b.high?price(b.low):`${price(b.low)}–${price(b.high)}`;
  const row=b=>`<details class="ict-band ${b.type.toLowerCase()}"><summary><span class="ict-band-price"><strong>${range(b)}</strong><small>${b.type} · ${b.type==='BSL'?'+':''}${price((b.type==='BSL'?b.low:b.high)-close)} USD</small></span><span class="ict-band-density"><span class="ict-band-track"><i style="width:${b.levels.length/max*100}%"></i></span><small>${b.levels.length} level swing${b.levels.length===max&&max>1?' · Terpadat':''}</small></span></summary><div class="ict-band-detail">${b.levels.map(l=>`<p>${price(l.level)} · Konfirmasi ${time(l.confirmed)}</p>`).join('')}</div></details>`;
  const visible=bands.filter(b=>filter==='all'||b.type===filter);
  const above=visible.filter(b=>b.type==='BSL'),below=visible.filter(b=>b.type==='SSL');
  const hc=$('heatmap-canvas');if(hc)hc.innerHTML=`<div class="ict-heat-intro"><h2>Di mana level berkumpul?</h2><p>${strongest?(max>1?`Zona terpadat: ${strongest.type} ${range(strongest)} · ${max} level.`:'Setiap zona berisi satu level; belum ada konsentrasi yang dominan.'):'Belum ada level aktif yang dapat dipetakan.'}</p><small>Lebar batang membandingkan jumlah level. Pengelompokan maksimal $1 per zona; bukan volume order atau probabilitas.</small></div><div class="ict-heat-filters" role="group" aria-label="Filter sisi likuiditas">${[['all','Semua'],['BSL','Di atas · BSL'],['SSL','Di bawah · SSL']].map(([key,label])=>`<button type="button" data-ict-filter="${key}" aria-pressed="${filter===key}">${label}</button>`).join('')}</div>${above.map(row).join('')}<div class="ict-price-divider"><span>Referensi harga ${escape(snapshot?.tf||'')}</span><strong>${price(close)}</strong></div>${below.map(row).join('')}${!visible.length?'<p class="ict-empty">Tidak ada level untuk sisi ini dalam snapshot Mapping.</p>':''}`;
  const ll=$('liquidity-list');if(ll)ll.innerHTML=bands.length?bands.map(row).join(''):'<p class="ict-empty">Belum ada level belum tersentuh. Perbarui data atau buka Mapping.</p>';
}
async function refresh() {
  if(request)return request;
  controller=new AbortController();const activeController=controller;
  const timeout=setTimeout(()=>activeController.abort(),20000);
  const tf='M15';
  request=(async()=>{
    try {
      const entry=await loadCandles(tf,activeController.signal);
      if(activeController.signal.aborted)return;
      const next=liquidityOnly(entry.candles,Date.now()/1000);
      if(entry.degraded)next.fresh=false;
      if(!validSnapshot(next))throw new Error('Data Mapping belum cukup');
      if(snapshot?.tf===next.tf && snapshot.sourceTime>next.sourceTime)throw new Error('Respons lebih lama dari snapshot');
      snapshot=next;failed=false;
      try { localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(next)); } catch {}
      window.dispatchEvent(new CustomEvent('amyfx:ict-mapping-updated',{detail:next}));
    } catch { if(!document.hidden)failed=true; }
    finally { clearTimeout(timeout);request=null;paint(); }
  })();
  paint();return request;
}
window.AmyICTIntel=Object.freeze({refresh});
document.addEventListener('click',event=>{
  if(event.target.closest('[data-ict-refresh]'))refresh();
  const button=event.target.closest('[data-ict-filter]');if(button){filter=button.dataset.ictFilter;paint();}
});
window.addEventListener('storage',event=>{
  if(event.key!==SNAPSHOT_KEY)return;
  try { const next=JSON.parse(event.newValue);if(validSnapshot(next)){controller?.abort();snapshot=next;failed=false;paint();} } catch {}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)controller?.abort();else refresh();});
window.addEventListener('online',refresh);
window.addEventListener('pagehide',()=>{controller?.abort();clearInterval(timer);});
window.addEventListener('pageshow',event=>{if(event.persisted){startTimer();refresh();}});
function startTimer(){clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)refresh();},60000);}
paint();startTimer();
