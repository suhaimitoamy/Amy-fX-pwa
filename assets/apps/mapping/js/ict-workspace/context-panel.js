import {deviceHeaders,initializeMethods,methodControls} from '../method-toggles.js';
import {ENDPOINT} from './scalper-model.js';
import {currentContext} from './context-model.js';
import {SIX_DRIVERS} from '../engine/six-driver-definitions.js';
import {currentDriverEvaluation,driverSetupReady} from './driver-model.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number.isFinite(Number(value))&&value!=null?Number(value).toFixed(2):'—';
const time=value=>value?new Date(Number(value)*1000).toLocaleString('id-ID',{timeZone:'Asia/Makassar',hour12:false})+' WITA':'—';
const id=value=>({BULLISH:'NAIK',BEARISH:'TURUN',NEUTRAL:'NETRAL',HEALTHY:'KUAT',WEAKENING:'MELEMAH',INVALIDATED:'BATAL',
  BUYER:'PEMBELI',SELLER:'PENJUAL',BALANCED:'SEIMBANG',WAITING:'MENUNGGU',CONFIRMING:'SEDANG DIKONFIRMASI',
  CONFIRMED:'TERKONFIRMASI',FAILED:'GAGAL','NOT READY':'BELUM SIAP','READY TO REVIEW':'SIAP DITINJAU',
  'WAITING CONFIRMATION':'MENUNGGU KONFIRMASI','NO VALID POI':'AREA BELUM VALID',FRESH:'SEGAR',TESTED:'SUDAH DIUJI',
  MITIGATED:'TERPAKAI',INVALID:'BATAL','HIGH VOLATILITY':'VOLATILITAS TINGGI',UNKNOWN:'BELUM DIKETAHUI'})[value]||value||'—';
let payload=null,failed=false,request=null,generation=0,timer=null;
const row=(label,value)=>`<div class="record"><strong>${esc(label)}</strong><p>${esc(value)}</p></div>`;
function scenario(s,alternative=false){
  if(!s)return '<p>Menunggu struktur dan zona M15 yang tervalidasi.</p>';
  return `<h3 data-side="${esc(s.side)}">${esc(s.label)}</h3>`+
    `<dl><div><dt>Area POI · M15</dt><dd>${s.area?`${number(s.area.low)} – ${number(s.area.high)}`:'Belum ada POI'}</dd></div>`+
    `<div><dt>50% CE</dt><dd>${number(s.area?.ce)}</dd></div><div><dt>Invalidasi</dt><dd>${number(s.invalidation)}</dd></div><div><dt>Target likuiditas</dt><dd>${number(s.target)}</dd></div></dl>`+
    `<details class="inline-detail"><summary>Alasan &amp; syarat rencana</summary><p>${esc(s.reasons?.join(' · ')||'Menunggu bukti.')}</p><p>${esc(alternative?'Aktif setelah seluruh syarat berikut terpenuhi.':s.waiting)}</p>`+
    (alternative&&s.activation?`<ul>${s.activation.map(rule=>`<li>${esc(rule)}</li>`).join('')}</ul>`:'')+'</details>';
}
function renderScenario(element,value,alternative=false){
  const open=Boolean(element.querySelector?.('details[open]'));
  element.innerHTML=scenario(value,alternative);
  if(open){const detail=element.querySelector?.('details');if(detail)detail.open=true;}
}
const DEFAULT_TOURNAMENT_DRIVERS = SIX_DRIVERS;
function getTournamentDrivers(history = []) {
  const seen = new Set();
  const rows = (Array.isArray(history) ? history : []).filter(s => s?.id && s.symbol === 'XAU/USD' &&
    !seen.has(s.id) && seen.add(s.id));
  return DEFAULT_TOURNAMENT_DRIVERS.map(driver => {
    const results = rows.filter(s => (s.driverId || s.model) === driver.id && ['TP_HIT','SL_HIT'].includes(s.status));
    const wins = results.filter(s => s.status === 'TP_HIT').length;
    return {...driver, score:wins*10-(results.length-wins)*15,
      archiveWR:results.length ? (wins/results.length*100).toFixed(1) : null, samples:results.length};
  });
}
function renderTournament(c) {
  const container=$('driver-tournament-list'),badge=$('tournament-leader-badge');
  if(!container)return;
  const evaluation=currentDriverEvaluation(payload,c);
  const labels={DISABLED:'NONAKTIF',DATA_STALE:'DATA TERLAMBAT',NEWS_LOCK:'NEWS LOCK',CALENDAR_UNVERIFIED:'KALENDER BELUM VALID',WAITING_STRUCTURE:'MENUNGGU STRUKTUR',ARMED:'MENUNGGU RETEST',WAITING_M5_BREAK:'MENUNGGU BREAK M5',WAITING_TARGET:'MENUNGGU TARGET',CONFIRMED:'TERKONFIRMASI',RISK_PAUSED:'BATAS RISIKO',INVALIDATED:'BATAL',EXPIRED:'KEDALUWARSA',WAITING_TRIGGER:'MENUNGGU LIMIT',WAITING_NEXT_OPEN:'MENUNGGU OPEN',ACTIVE:'AKTIF · SIMULASI',BE_ACTIVE:'BE AKTIF · SIMULASI'};
  if(badge){badge.textContent=!c?'MENUNGGU KONTEKS':!evaluation?'Evaluasi strategi belum tersedia':`${evaluation.drivers.filter(d=>d.state==='CONFIRMED').length}/6 driver terkonfirmasi · M5 ${time(evaluation.sourceTime)}`;badge.style.color='var(--muted)';}
  const opened=new Set(Array.from(container.querySelectorAll?.('details[open]')||[]).map(el=>el.dataset.driver));
  container.innerHTML=getTournamentDrivers(payload?.history).map((d,idx)=>{
    const live=evaluation?.drivers.find(x=>x.id===d.id),stats=evaluation?.statistics?.[d.id];
    const status=!c?'WAIT · DATA BELUM SIAP':c.news?.status==='NEWS_LOCK'?'WAIT · NEWS LOCK':live?labels[live.state]||live.state:'BELUM DIEVALUASI';
    const plan=live?.plan;
    return `<details class="driver-item" data-driver="${esc(d.id)}" ${opened.has(d.id)?'open':''}>
      <summary class="driver-header"><span class="driver-rank">${idx+1}</span><strong class="driver-name">${esc(d.name)}</strong></summary>
      <p class="driver-badge">${esc(status)}${live?.lifecycleStatus?' · '+esc(labels[live.lifecycleStatus]||live.lifecycleStatus):''}</p>
      <p>${esc(live?.reason||'Menunggu evaluasi strategi dari server.')}</p><p class="driver-desc">${esc(d.desc)}</p>
      <div class="driver-meta"><span>Kualitas: <strong>${live?esc(live.score)+'/100 poin':'—'}</strong></span>
      <span>WR live: <strong>${stats?.measured?number(stats.winRate)+'% ('+stats.measured+' hasil)':'belum tersedia'}</strong></span>
      <span>R bruto hari UTC: <strong>${stats?.measured?number(stats.totalR):'—'}</strong></span>
      <span>WR arsip: <strong>${d.archiveWR==null?'—':d.archiveWR+'%'} (${d.samples} hasil TP/SL)</strong></span></div>
      ${stats?.ambiguous?`<p>${esc(stats.ambiguous)} hasil ambigu tidak dimasukkan ke WR/R.</p>`:''}
      ${plan?`<dl><div><dt>Zona ${esc(plan.direction)}</dt><dd>${number(plan.zoneLow)}–${number(plan.zoneHigh)}</dd></div><div><dt>Entry acuan / SL / TP</dt><dd>${number(plan.entry)} / ${number(plan.stopLoss)} / ${number(plan.target)}</dd></div><div><dt>Target likuiditas</dt><dd>${number(plan.liquidityTarget)}</dd></div></dl>`:''}
      ${live?.checks?`<ul>${live.checks.map(x=>`<li>${x.ok?'✓':'○'} ${esc(x.label)}</li>`).join('')}</ul>`:''}
      </details>`;
  }).join('');
}
function renderDriverSetups(c){
  const root=$('driver-setups'),summary=$('driver-summary');if(!root)return;
  const e=currentDriverEvaluation(payload,c),items=c&&e?(payload?.active||[]):[];
  if(summary)summary.textContent=!c?'Menunggu data server terkini.':!e?'Menunggu evaluasi driver.':items.length?`${items.length} rencana driver · evaluasi ${time(e.sourceTime)}`:'Belum ada trigger driver baru. Alasan tiap driver tersedia di Detail.';
  root.innerHTML=items.map(s=>`<details class="inline-detail"><summary>${esc(s.driverName)} · ${esc(s.direction)} · ${['WAITING_TRIGGER','WAITING_NEXT_OPEN'].includes(s.status)?(s.status==='WAITING_TRIGGER'?'MENUNGGU LIMIT':'MENUNGGU OPEN'):driverSetupReady(s,c)?'AKTIF · SIMULASI':'WAIT · PERIKSA DATA / BERITA'}</summary><p>Entry ${number(s.entry)} · SL ${number(s.stopLoss)} · TP ${number(s.target)}</p><p>${['WAITING_TRIGGER','WAITING_NEXT_OPEN'].includes(s.status)?(s.status==='WAITING_TRIGGER'?'Limit Fib aktif setelah observasi; tunggu retest berikutnya.':'Entry acuan; harga final mengikuti open setelah observasi.'):'Harga milik posisi model; jangan mengejar entry yang sudah lewat.'}</p><button type="button" data-driver-plan="${esc(s.id)}">Tampilkan level di chart</button></details>`).join('');
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('amyfx_notified_driver_plans') : null;
    const notified = raw ? JSON.parse(raw) : {};
    let hasNew = false;
    for (const s of items) {
      const planKey = `${s.id}_${s.status}`;
      if (!notified[planKey]) {
        notified[planKey] = Date.now();
        hasNew = true;
        const statusText = s.status === 'WAITING_TRIGGER' ? 'Rencana Limit' : (s.status === 'ARMED' ? 'Menunggu Retest' : (s.status === 'ACTIVE' ? 'Aktif' : s.status));
        const title = `⚡ Setup Driver: ${s.driverName || 'Gold'} (${s.direction})`;
        const body = `${statusText} · Entry ${number(s.entry)} · SL ${number(s.stopLoss)} · TP ${number(s.target)}`;
        if (window.Android?.showNotificationWithUrl) {
          window.Android.showNotificationWithUrl(title, body, `${location.href.split('#')[0]}#Dashboard`);
        }
      }
    }
    if (hasNew && typeof localStorage !== 'undefined') {
      const keys = Object.keys(notified).slice(-40);
      const trimmed = {};
      keys.forEach(k => trimmed[k] = notified[k]);
      localStorage.setItem('amyfx_notified_driver_plans', JSON.stringify(trimmed));
    }
  } catch (_) {}
  window.dispatchEvent(new CustomEvent('amyfx:driver-setups',{detail:items}));
}
function empty(reason){
  $('connection').textContent='WAIT · data belum siap';$('context-state').textContent='Menunggu data server';
  $('market-state').textContent='KONTEKS BELUM TERSEDIA';$('market-story').textContent=reason;
  $('context-source').textContent='Candle lama tidak menjadi dasar keputusan baru.';
  for(const id of ['h1-bias','h1-health','m15-poi','m15-range','m15-control','m15-risk','m1-confirmation','m1-evidence','m5-confirmation','m5-evidence']){
    const el=$(id);if(el)el.textContent='—';
  }
  $('primary-status').textContent='MENUNGGU';$('primary-scenario').textContent='Tunggu candle H1, M15, dan M5 yang segar.';
  $('alternative-scenario').textContent='Belum ada skenario alternatif yang dapat ditinjau.';
  $('execution-status').textContent='BELUM SIAP';$('execution-reason').textContent=reason;
  $('execution-checklist').innerHTML='';$('evidence').innerHTML='';$('liquidity').innerHTML='<p>Level belum tersedia.</p>';
  $('gold-condition').textContent='Menunggu data volatilitas.';$('news-awareness').textContent='Periksa berita berdampak tinggi secara manual.';
  renderTournament(null);renderDriverSetups(null);
  {
    try{localStorage.removeItem('amyfx.market-context.v1');}catch{}
    window.AmyMarketContext=null;window.dispatchEvent(new CustomEvent('amyfx:market-context',{detail:null}));
  }
}
function render(){
  const c=failed?null:currentContext(payload);
  if(!c){
    empty(failed?'Server belum berhasil dihubungi. Coba Perbarui saat koneksi pulih.':'Evaluasi server belum lengkap atau candle tertutup sudah terlambat.');
    return;
  }
  const tf=c.source?.M5?'M5':'M1';
  const confTime=c.source?.M5||c.source?.M1;
  const confObj=c.m5||c.m1;
  $('connection').textContent='Candle server terkini';$('context-state').textContent='KONTEKS · BUKAN SINYAL';
  $('market-state').textContent=(c.marketState||'MENUNGGU').replaceAll('NO_SETUP','Belum ada setup').replaceAll('BULLISH','Bullish').replaceAll('BEARISH','Bearish').replaceAll('NEUTRAL','Netral');$('market-story').textContent=c.narrative||'Menunggu penjelasan server.';
  $('context-source').textContent=`H1 ${time(c.source.H1)} · M15 ${time(c.source.M15)} · ${tf} ${time(confTime)}`;
  const dr = c.m15?.dealingRange;
  const drLoc = dr?.location ? ` [${dr.location}]` : '';
  const confScore = c.confluence ? ` · Skor: ${c.confluence.score}/100 (${c.confluence.grade})${c.confluence.winDir?` · dominan ${c.confluence.winDir===1?'BUY':'SELL'}`:''}` : '';
  $('h1-bias').textContent=id(c.h1?.bias||'NEUTRAL');$('h1-health').textContent=`Kesehatan: ${id(c.h1?.health)}`;
  $('m15-poi').textContent=c.m15?.poi?`${c.m15.poi.label}${c.m15.poi.ce?` (CE: ${number(c.m15.poi.ce)})`:''} · ${id(c.m15.poi.lifecycle)}`:'Area belum valid';
  $('m15-range').textContent=c.m15?.poi?`${number(c.m15.poi.low)}–${number(c.m15.poi.high)}`:'Menunggu area M15';
  $('m15-control').textContent=id(c.m15?.control||'BALANCED');
  const aPlus = c.execution?.aPlusReady === true && c.execution?.status === 'READY TO REVIEW' && c.confluence?.score >= 75;
  $('m15-risk').textContent=aPlus?`🟢 Grade A+${drLoc}: Bukti lengkap${confScore}`:c.m15?.opposingControl?`H1 berlawanan · konteks tambahan${drLoc}${confScore}`:`BIAS M15${drLoc} · BELUM A+${confScore}`;
  const confStatus=id(confObj?.status||'WAITING');
  const confEvidence=confObj?.sweep?`Sweep ${number(confObj.sweep.level)} · MSS ${number(confObj.mss?.level)}`:'Menunggu sweep atau respons POI dan break/displacement M5.';
  if($('m5-confirmation'))$('m5-confirmation').textContent=confStatus;
  if($('m1-confirmation'))$('m1-confirmation').textContent=confStatus;
  if($('m5-evidence'))$('m5-evidence').textContent=confEvidence;
  if($('m1-evidence'))$('m1-evidence').textContent=confEvidence;
  $('primary-status').textContent=id(c.primary?.status||'WAITING');renderScenario($('primary-scenario'),c.primary);
  renderScenario($('alternative-scenario'),c.alternative,true);
  $('execution-status').textContent=id(c.execution?.status||'NOT READY');$('execution-reason').textContent=c.execution?.reason||'Menunggu bukti.';
  $('execution-checklist').innerHTML=(c.execution?.checklist||[]).map(item=>`<li>${item.ok?'✓':'○'} ${esc(item.label)}</li>`).join('');
  renderTournament(c);renderDriverSetups(c);
  const newsEl=$('news-awareness');
  if(newsEl){
    newsEl.textContent=c.news?.status==='SAFE'?'Berita: tidak ada rilis berdampak tinggi di waktu dekat.':c.news?.status==='UNVERIFIED'?'Berita belum diverifikasi · periksa kalender.':c.news?.note||'Status berita belum diverifikasi.';
    newsEl.className='muted '+(c.news?.status==='NEWS_LOCK'?'news-lock':c.news?.status==='UPCOMING'?'news-warning':c.news?.status==='SAFE'?'news-safe':'');
  }
  const drInfo = dr
    ? `${dr.location} (EQ: ${number(dr.eq)}, Range: ${number(dr.rangeLow)}–${number(dr.rangeHigh)})`
    : '—';
  const confScoreInfo = c.confluence
    ? `${c.confluence.score}/100 (${c.confluence.grade})`
    : '—';
  $('evidence').innerHTML=row('H1 · HH/HL/LH/LL',`${c.h1?.highPattern||'—'} / ${c.h1?.lowPattern||'—'} · ${c.h1?.lastBreak?.type||'belum ada break'} di ${number(c.h1?.lastBreak?.level)}`)+
    row('M15 · struktur',`${c.m15?.structure||'NEUTRAL'} · ${c.m15?.lastBreak?.type||'belum ada break'} di ${number(c.m15?.lastBreak?.level)}`)+
    row('Dealing Range (EQ)', drInfo)+
    row('Skor Konfluensi (0–100)', confScoreInfo)+
    row('POI · siklus',c.m15?.poi?`${c.m15.poi.label} ${number(c.m15.poi.low)}–${number(c.m15.poi.high)}${c.m15.poi.ce?` (50% CE: ${number(c.m15.poi.ce)})`:''} · ${c.m15.poi.lifecycle}`:'Tidak ada zona valid')+
    row(`${tf} · bukti`,`${confObj?.status||'WAITING'} · sweep ${number(confObj?.sweep?.level)} · MSS ${number(confObj?.mss?.level)} · micro FVG ${confObj?.microFvg?`${number(confObj.microFvg.low)}–${number(confObj.microFvg.high)}`:'—'}`);
  $('liquidity').innerHTML=(c.liquidity||[]).map(item=>row(`${item.label} · ${item.status}`,number(item.level))).join('')||'<p>Belum ada level eksternal/internal yang tervalidasi.</p>';
  $('gold-condition').innerHTML=row('Volatilitas',`${id(c.volatility?.condition||'UNKNOWN')} · ATR M15 ${number(c.volatility?.atr)}`)+row('Sesi',c.session||'Belum tersedia')+row('Berita berdampak tinggi',c.news?.note||'Belum diverifikasi');
  window.AmyMarketContext=Object.freeze(c);
  try{localStorage.setItem('amyfx.market-context.v1',JSON.stringify(c));}catch{}
  window.dispatchEvent(new CustomEvent('amyfx:market-context',{detail:c}));
}
function renderArchive(){
  $('history').innerHTML=(payload?.history||[]).filter(x=>x.symbol==='XAU/USD').slice(0,20).map(s=>row(`${s.direction} · ${s.status} · ${s.driverName||s.model}`,
    `Candle ${time(s.signalCandleCloseTime)} · entry historis ${number(s.entry)} · SL ${number(s.stopLoss)} · target ${number(s.target)}`)).join('')||'<p>Belum ada riwayat lama dalam respons 24 jam terakhir.</p>';
}
function schedule(){clearTimeout(timer);if(!document.hidden)timer=setTimeout(refresh,30000);}
async function refresh(){
  const id=++generation;request?.abort();request=new AbortController();const active=request,signal=active.signal;
  const timeout=setTimeout(()=>active.abort(),15000);
  try{
    const response=await fetch(`${ENDPOINT}?limit=100&history_limit=100`,{headers:{Accept:'application/json',...deviceHeaders()},signal,cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const next=await response.json();if(next?.ok!==true||next?.mode!=='market_context')throw new Error('Kontrak konteks server tidak valid');
    if(id!==generation)return;payload=next;failed=false;render();renderArchive();
  }catch{if(id===generation){failed=true;render();}}
  finally{clearTimeout(timeout);if(id===generation)schedule();}
}
window.addEventListener('amyfx:refresh-context',refresh);
window.addEventListener('online',refresh);
window.addEventListener('offline',()=>{generation++;request?.abort();clearTimeout(timer);failed=true;render();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){generation++;request?.abort();clearTimeout(timer);}else {if($('driver-methods'))$('driver-methods').innerHTML=methodControls();
window.addEventListener('amy-method-toggles',()=>{if($('driver-methods'))$('driver-methods').innerHTML=methodControls();refresh();});
document.addEventListener('click',event=>{const button=event.target.closest?.('[data-driver-plan]');if(!button)return;const c=failed?null:currentContext(payload);if(!c)return;const s=(payload?.active||[]).find(x=>x.id===button.dataset.driverPlan);if(!s)return;window.dispatchEvent(new CustomEvent('amyfx:driver-plan',{detail:{id:s.id,entry:s.entry,sl:s.stopLoss,tp:s.target,label:s.driverName}}));window.setTab?.('Dashboard');$('chart').scrollIntoView?.({behavior:'smooth',block:'center'});});
render();refresh();void initializeMethods();}});
window.addEventListener('pagehide',()=>{generation++;request?.abort();clearTimeout(timer);});
window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});

if($('driver-methods'))$('driver-methods').innerHTML=methodControls();
window.addEventListener('amy-method-toggles',()=>{if($('driver-methods'))$('driver-methods').innerHTML=methodControls();refresh();});
document.addEventListener('click',event=>{const button=event.target.closest?.('[data-driver-plan]');if(!button)return;const c=failed?null:currentContext(payload);if(!c)return;const s=(payload?.active||[]).find(x=>x.id===button.dataset.driverPlan);if(!s)return;window.dispatchEvent(new CustomEvent('amyfx:driver-plan',{detail:{id:s.id,entry:s.entry,sl:s.stopLoss,tp:s.target,label:s.driverName}}));window.setTab?.('Dashboard');$('chart').scrollIntoView?.({behavior:'smooth',block:'center'});});
render();refresh();void initializeMethods();
