import { state, TF, p2, nowTime, sessions, curSession } from '../main.js';
import { runAnalysis, buildDirectionDecision, buildMappingExplanation, buildSetupExecution } from '../api/market-data.js';
import { analyze } from '../engine/ict-core.js';
import { SUPPORTED_MAPPING_TIMEFRAMES } from '../engine/mapping-timeframes.js';
import { saveConnect, toggleBg, testNotif, downloadLogs } from '../bridge/android-bridge.js';
import { renderSetupLifecycle } from './setup-lifecycle.js';
import {
  executionPlanRuntimeInput,
  renderExecutionPlanCompact,
  renderExecutionPlanDetail
} from '../execution-plan-ui.js';

let lastRenderSignature = '';
let lastMarketSnapshotSignature = '';

function statusDot() {
  const connection = document.getElementById('conn');
  if (!connection) return;
  connection.textContent = '●';
  connection.className = state.conn === 'Connected' ? 'status on' : 'status';
}

function scalperShadowPlaceholder() {
  return `<section id="amy-scalper-entry-watch" class="card scalper-watch scalper-watch--wait" data-scalper-mode="shadow" data-dom-persistent="true" data-stability-key="scalper-shadow">
    <div class="scalper-watch__head"><div><div class="kicker">SCALPER ENGINE · SHADOW MODE</div><h2>MENUNGGU SETUP</h2></div><span class="scalper-watch__badge">MENUNGGU SETUP</span></div>
    <div class="scalper-watch__notice">SIMULASI — belum mengeksekusi atau memindahkan order broker otomatis.</div>
    <p class="scalper-watch__instruction">Engine memindai IFVG searah H1 dan FVG BUY High Quality dari candle yang sudah close.</p>
    <div class="scalper-watch__foot"><span>Engine MENUNGGU DATA</span><span>Maksimum rekomendasi 2 setup · semua sinyal tetap dicatat</span></div>
  </section>`;
}

function regimePlaceholder() {
  return `<section id="amy-regime-router-v3" class="card regime-router-card" data-dom-persistent="true" data-stability-key="market-regime">
    <div class="kicker">AMY FX · MARKET INTELLIGENCE</div><h2>Menunggu konteks market</h2><p class="muted">Analisis closed-candle sedang disiapkan.</p>
  </section>`;
}

function marketContextPlaceholder() {
  return `<details class="card amy-analysis-section" data-stability-key="market-context">
    <summary><span>Ringkasan Market</span><small>Struktur, arah, dan skenario</small></summary>
    ${regimePlaceholder()}
  </details>`;
}

function marketOutlookPlaceholder() {
  return `<details class="card disclosure outlook-disclosure" data-dom-persistent="true" data-stability-key="market-outlook">
    <summary class="amy-level-summary"><span class="amy-level-summary-title"><i>◎</i><b>Market Outlook</b></span><span class="amy-level-summary-status">WAIT</span></summary>
    <div class="amy-trade-scenario-panel" data-amy-level-panel="true"><p class="outlook-loading">Menunggu data Mapping closed-candle.</p></div>
  </details>`;
}

function livePriceKeyCard() {
  if (state.conn !== 'Key Required') return '';
  return `<section class="card" data-stability-key="live-price-websocket-key">
    <div class="kicker">HARGA LIVE · TWELVE DATA WEBSOCKET</div>
    <h2>Hubungkan harga XAU/USD</h2>
    <p class="muted">Masukkan API key Twelve Data satu kali. Key disimpan terenkripsi oleh Android; harga memakai WebSocket, sedangkan candle Mapping tetap memakai jalur REST yang sudah ada.</p>
    <input id="apiKey" type="password" autocomplete="off" placeholder="Twelve Data API Key">
    <button class="action" onclick="window.saveConnect()" style="width:100%;margin-top:10px">Hubungkan Harga Live</button>
  </section>`;
}

function asiaAnalyzePlaceholder() {
  return `<section class="card asia-liquidity-strip" data-asia-range-analyze data-dom-persistent="true" data-stability-key="asia-liquidity">
    <div class="asia-strip-head"><span>ASIA LIQUIDITY</span><small>-</small></div><div class="asia-range-empty">Data Asia Range belum tersedia.</div>
  </section>`;
}

function refreshResultContracts(result, { persist = true } = {}) {
  if (!result) return { directionDecision: null, setupExecution: null, mappingExplanation: null };
  const directionDecision = result.directionDecision || buildDirectionDecision(result);
  if (!result.directionDecision) result.directionDecision = directionDecision;
  const setupExecution = result.setupExecution || buildSetupExecution(result, { persist });
  if (!result.setupExecution) result.setupExecution = setupExecution;
  const mappingExplanation = result.mappingExplanation || buildMappingExplanation(result);
  if (!result.mappingExplanation) result.mappingExplanation = mappingExplanation;
  return { directionDecision, setupExecution, mappingExplanation };
}

function forecastConfidence(result, directionDecision, setupExecution) {
  const raw = Number(
    result?.validatedMarketContext?.directionForecast?.confidence
    ?? result?.validatedDirectionForecast?.confidence
    ?? 0
  );
  if (
    directionDecision?.source !== 'VALIDATED_DIRECTION_FORECAST' ||
    directionDecision?.invalidated ||
    !setupExecution?.active ||
    !Number.isFinite(raw)
  ) return 0;
  return Math.max(0, Math.min(100, raw));
}

export function killzonePanel(){
  const list=sessions(),cur=curSession(),focus=list.filter(s=>s.name.includes('London Open')||s.name.includes('New York Open'));
  return`<section class="card session-card" data-stability-key="session-focus"><div class="section-row"><div><div class="kicker">SESI TRADING</div><h2>Session focus</h2></div><span class="muted" id="kz-wita">WITA ${nowTime()}</span></div><div class="session-pill ${cur.active?'active':''}">${cur.active?'Aktif: '+cur.name:'Off-Session'}</div><div class="asia-range-block" data-asia-range-dashboard data-dom-persistent="true"><div class="asia-range-head"><b>ASIA RANGE</b><small>-</small></div><div class="asia-range-empty">Data Asia Range belum tersedia.</div></div><div class="session-grid">${focus.map(s=>`<div class="session-focus ${s.active?'active':''}"><b>${s.active?'● ':'○ '}${s.name.replace(' Kill Zone','')}</b><small>${s.wita} WITA</small><span>${s.active?'Aktif sekarang':'Menunggu sesi'}</span></div>`).join('')}</div></section>`;
}

export function fmtDir(x,status='',cf=''){x=String(x||'');let d=x.includes('BUY')?'BUY':x.includes('SELL')?'SELL':'';if(!d)return 'TUNGGU';if(status.includes('SL HIT')||status.includes('TP HIT')||status.includes('EXPIRED'))return `ABAIKAN ${d}`;if(status==='INVALID'||status==='BROKEN'||status==='WAIT'||cf==='FATAL')return `WAIT ${d}`;if(cf==='HIGH'||cf==='MEDIUM')return `BIAS ${d}`;if(status==='WATCH SETUP'||status==='PANTAU SETUP')return `WATCH ${d}`;return `FOKUS ${d}`;}
export function fmtStatus(x){x=String(x||'');return x.replace(/READY SETUP/g,'SETUP VALID').replace(/WATCH SETUP/g,'PANTAU SETUP').replace(/^WAIT$/g,'TUNGGU');}
export function dirClass(x){x=String(x||'');return x.includes('BUY')?'buy':x.includes('SELL')?'sell':'wait'}

export function setupCard(s, se, i = 0, mode = 'ACTIVE') {
  if (mode === 'HISTORY' || !se || !se.active) return historyCard(s, i);

  let q = s?.qualityLabel ? `<b>Quality: ${s.qualityLabel}</b> — ` : '';
  let ce = s?.ce ? `<br><small>CE Level: ${p2(s.ce)}</small>` : '';
  let comp = '';
  if (s?.components) {
    let c = s.components;
    comp = `<div class="num-grid" style="margin-top:10px;border-top:1px solid #333;padding-top:10px">
      <div class="num"><small>Model</small><strong>${c.model}</strong></div>
      <div class="num"><small>Sweep</small><strong>${c.sweep}</strong></div>
      <div class="num"><small>MSS</small><strong>${c.mss}</strong></div>
      <div class="num"><small>Entry</small><strong>${c.entry}</strong></div>
      <div class="num"><small>POI / Target</small><strong>${c.poi || c.target || c.htf || '-'}</strong></div>
    </div>`;
  }
  let chk = '';
  if (s?.scoreChecklist) {
    let list = s.scoreChecklist.map(x => `<div style="font-size:12px;margin:2px 0"><span style="color:${x.passed ? '#4ade80' : '#f87171'}">${x.passed ? '✓' : '×'}</span> ${x.name} <span class="muted">+${x.score}</span></div>`).join('');
    chk = `<div style="margin-top:10px;border-top:1px solid #333;padding-top:10px"><b>Checklist Score: ${s.score || 0}/100 — Grade ${s.grade || ''}</b><br>${list}</div>`;
  }
  let sess = '';
  if (s?.sessionContext) {
    let sc = s.sessionContext;
    sess = `<div class="ai-map-note" style="margin-top:10px;font-size:12px;background:#1a1a1a;padding:8px;border-radius:4px"><b>Session: ${sc.session.replace('_', ' ')}</b> — ${sc.killzone !== 'NONE' ? 'Killzone Aktif. ' : ''}${sc.note}</div>`;
  }
  let cfHtml = '';
  if (s?.conflictCheck) {
    let cf = s.conflictCheck, badge = cf.conflictLevel === 'NONE' ? '#4ade80' : cf.conflictLevel === 'FATAL' || cf.conflictLevel === 'HIGH' ? '#f87171' : '#fbbf24', cNotes = cf.conflicts.length ? cf.conflicts.map(x => x.note).join('<br>') : 'Komponen utama selaras.';
    cfHtml = `<div style="margin-top:10px;border-top:1px solid #333;padding-top:10px;font-size:12px"><b>Conflict: <span style="color:${badge}">${cf.conflictLevel}</span> — ${cf.recommendation}</b><br><span class="muted">${cNotes}</span></div>`;
  }

  const tpHtml = se.singleTarget
    ? `<div class="num" style="grid-column: span 2"><small>Target Utama</small><strong>${p2(se.target1)}</strong></div>`
    : `<div class="num"><small>TP1</small><strong>${p2(se.target1)}</strong></div><div class="num"><small>TP2</small><strong>${se.target2 ? p2(se.target2) : '-'}</strong></div>`;

  return `<div class="setup-card ready">
    <div class="setup-head">
      <div>
        <div class="setup-title">SETUP AKTIF — ${s?.type || 'Entry Map'}</div>
        <div class="muted">Timeframe: ${s?.tf || state.tf} • Status: ${se.status}</div>
      </div>
      <span class="badge ${se.direction === 'BUY' ? 'buy' : 'sell'}">FOKUS ${se.direction}</span>
    </div>
    <div class="num-grid">
      <div class="num"><small>Harga Live</small><strong>$${p2(state.price)}</strong></div>
      <div class="num"><small>Entry Area</small><strong>${p2(se.entryLow)} - ${p2(se.entryHigh)}</strong></div>
      <div class="num"><small>SL</small><strong>${p2(se.stopLoss)}</strong></div>
      ${tpHtml}
    </div>
    ${comp}${cfHtml}${chk}${sess}
    <div class="reason" style="margin-top:10px"><b>Alasan:</b><br>${q}${s?.reason || ''}${ce}</div>
  </div>`;
}

export function historyCard(s, i = 0) {
  if (!s) return '';
  const lo = s.entryLow != null ? p2(s.entryLow) : '-';
  const hi = s.entryHigh != null ? p2(s.entryHigh) : '-';
  const sl = s.sl != null ? p2(s.sl) : '-';
  const tp1 = s.tp1 != null ? p2(s.tp1) : '-';
  const tp2 = s.tp2 != null ? p2(s.tp2) : '-';

  return `<div class="setup-card wait">
    <div class="setup-head"><div><div class="setup-title">RIWAYAT SETUP ${i + 1} — ${s.type || 'Entry Map'}</div><div class="muted">Timeframe: ${s.tf || state.tf} • Status: TERMINAL / HISTORY</div></div><span class="badge wait">HISTORY / TERMINAL</span></div>
    <div class="num-grid"><div class="num"><small>Data Historis Entry</small><strong>${lo} - ${hi}</strong></div><div class="num"><small>Data Historis SL</small><strong>${sl}</strong></div><div class="num"><small>Data Historis TP1</small><strong>${tp1}</strong></div><div class="num"><small>Data Historis TP2</small><strong>${tp2}</strong></div></div>
    <div class="reason" style="margin-top:10px"><b>Catatan Riwayat:</b><br>${s.reason || 'Setup ini telah selesai atau digantikan.'}</div>
  </div>`;
}

export function dashboard() {
  let r = state.result;
  const contracts = refreshResultContracts(r);
  const se = contracts.setupExecution;
  let dec = decisionData();
  let tfList = SUPPORTED_MAPPING_TIMEFRAMES;
  let setupTitle = (se && se.active) ? (r?.bestSetup?.type || 'Setup Entry Map') : 'Belum ada setup';
  const forecastMode = r?.validatedMarketContext?.directionForecast?.validationMode;
  const setupAuthorityNote = forecastMode === 'RULE_BASED_MANUAL'
    ? 'Setup causal rule-based; timeframe ini perlu validasi manual.'
    : 'Setup causal searah Direction Forecast referensi.';
  let setupBody = se?.active
    ? `<div class="setup-summary"><div><small>Entry Area</small><strong>${p2(se.entryLow)} – ${p2(se.entryHigh)}</strong></div><div><small>Invalidasi</small><strong>${p2(se.stopLoss)}</strong></div><div><small>Target</small><strong>${p2(se.target1)}</strong></div><div><small>Status</small><strong>${se.status}</strong></div></div><p class="summary-note">${se.invalidationReason || setupAuthorityNote}</p>`
    : `<p class="muted">${se?.invalidationReason || 'Klik Analisis Setup untuk membuat mapping angka.'}</p>`;
  const executionPlan = renderExecutionPlanCompact(executionPlanRuntimeInput(r, state));
  return `<section class="card tf-card" data-stability-key="timeframe"><div class="section-row"><div><div class="kicker">TIMEFRAME</div><h2>Pilih mapping</h2></div><span class="muted">${state.tf}</span></div><div class="tf-grid compact-tf">${tfList.map(x => `<button class="${state.tf === x ? 'active' : ''}" onclick="window.runAnalysis('${x}')">${x}</button>`).join('')}</div></section>${livePriceKeyCard()}${killzonePanel()}${regimePlaceholder()}<section class="card setup-focus" data-stability-key="setup-focus"><div class="section-row"><div><div class="kicker">SETUP UTAMA</div><h2>${setupTitle}</h2></div>${se?.active ? `<span class="badge ${se.direction === 'BUY' ? 'buy' : 'sell'}">${se.direction}</span>` : ''}</div>${setupBody}<button class="action" onclick="setTab('Analyze')" style="width:100%;margin-top:12px">⚡ Buka Analisis Lengkap</button></section>${scalperShadowPlaceholder()}${executionPlan}`;
}

export function lifecycleSetupCard(s, i = 0) {
  const se = refreshResultContracts(state.result).setupExecution;
  if (!se?.active) return historyCard(s, i);
  const plan = s?.tradeManagement ? `<div class="precision-plan"><b>${s.tf || state.tf} CAUSAL PLAN</b><span>TP1 ${s.tradeManagement.tp1R}R · SL runner → Break-even</span><span>Target struktural ${Number(s.tradeManagement.tp2R || 0).toFixed(2)}R · Kedaluwarsa ${s.tradeManagement.expiryBars} candle</span></div>` : '';
  return setupCard(s, se, i, 'ACTIVE').replace('<div class="num-grid">', renderSetupLifecycle(se) + plan + '<div class="num-grid">');
}

export function mapMini(tf){let cs=state.candles?.[tf]||[];if(!cs.length||cs.length<30)return null;try{return analyze(cs,tf,{},state.price,{...state.candles})}catch(e){return null}}
export function mapConcept(a,name){return (a?.concepts||[]).find(x=>x[0]===name)||null}
export function mapBiasClass(x){x=String(x||'NEUTRAL').toLowerCase();return x.includes('buy')||x.includes('bull')?'bullish':x.includes('sell')||x.includes('bear')?'bearish':'neutral'}
export function m1h4List(){return SUPPORTED_MAPPING_TIMEFRAMES.map(tf=>({tf,a:mapMini(tf)}))}
export function activeBias(){let rows=m1h4List().filter(x=>x.a).map(x=>x.a.directionDecision||buildDirectionDecision(x.a));let buy=rows.filter(x=>x.source==='VALIDATED_DIRECTION_FORECAST'&&x.signal==='BUY').length;let sell=rows.filter(x=>x.source==='VALIDATED_DIRECTION_FORECAST'&&x.signal==='SELL').length;if(buy>=sell+2)return 'BUY';if(sell>=buy+2)return 'SELL';if(buy||sell)return 'MIXED / CONFLICT';return 'WAIT'}
export function analyzeLivePrice(){return Number(state.price||localStorage.getItem('last_price')||state.result?.price||0)}

export function analyzeSetupLiveState() {
  const se = refreshResultContracts(state.result).setupExecution;
  if (!se) return { status: 'TUNGGU', fatal: false, note: 'Belum ada setup aktif.', setupExecution: null };
  return { status: se.status, fatal: se.terminal || !se.active, note: se.invalidationReason || se.status, setupExecution: se };
}
export function analyzeActiveSetups(){const se=refreshResultContracts(state.result).setupExecution;return(se?.active&&state.result?.bestSetup)?[state.result.bestSetup]:[]}
export function renderAnalyzeLive(){renderSoft();document.querySelectorAll('[data-live-price]').forEach(el=>el.textContent=p2(analyzeLivePrice()))}

export function decisionData(){
  let r=state.result;
  if(!r)return{bias:'WAIT',direction:'TUNGGU',confidence:0,confLabel:'Confidence',status:'WAIT — DATA ANALISIS BELUM TERSEDIA',entry:'-',invalid:'-',nearTarget:'-',mainTarget:'-',headline:'Data market belum tersedia',action:'Jangan mengambil keputusan entry.',reason:'Analisis Mapping belum tersedia.',confirmationNeeded:'Tunggu data candle dan hasil analisis terbaru.',invalidationText:'-',marketContext:'BELUM TERSEDIA',dataStatus:'BELUM TERSEDIA'};
  const {directionDecision:dd,setupExecution:se,mappingExplanation:expl}=refreshResultContracts(r);
  const confidence=forecastConfidence(r,dd,se);
  if(!se.active)return{bias:dd.bias,direction:'TUNGGU',confidence:0,confLabel:'Confidence',status:se.status||dd.status,entry:'-',invalid:'-',nearTarget:'-',mainTarget:'-',headline:expl.headline,action:expl.action,reason:expl.reason,confirmationNeeded:expl.confirmationNeeded,invalidationText:se.invalidationReason||expl.invalidation||'-',marketContext:expl.marketContext||'NETRAL',dataStatus:expl.dataStatus||'AKTIF'};
  const nearTarget=se.singleTarget?`${p2(se.target1)}`:`${p2(se.target1)} / ${p2(se.target2)}`;
  const mainTarget=se.liquidityTarget?`${se.liquidityTarget.type} ${p2(se.liquidityTarget.level)}`:(se.target2?`TP2 ${p2(se.target2)}`:`TP1 ${p2(se.target1)}`);
  return{bias:dd.bias,direction:`FOKUS ${se.direction}`,confidence,confLabel:'Confidence',status:se.status,entry:`${p2(se.entryLow)} - ${p2(se.entryHigh)}`,invalid:p2(se.stopLoss),nearTarget,mainTarget,headline:expl.headline,action:expl.action,reason:expl.reason,confirmationNeeded:expl.confirmationNeeded,invalidationText:se.invalidationReason||'-',marketContext:expl.marketContext||'NETRAL',dataStatus:expl.dataStatus||'AKTIF'};
}

export function amyDecisionCard(){let d=decisionData();let targetHtml='';if(d.nearTarget==='-'&&d.mainTarget==='-')targetHtml='<div class="decision-box"><small>Target Harga</small><strong>-</strong></div>';else if(d.nearTarget===d.mainTarget||d.nearTarget.includes(d.mainTarget.split(' ')[1]||'none'))targetHtml=`<div class="decision-box" style="grid-column: span 2"><small>Target Likuiditas Utama</small><strong>${d.mainTarget}</strong></div>`;else targetHtml=`<div class="decision-box"><small>Target Terdekat</small><strong>${d.nearTarget}</strong></div><div class="decision-box"><small>Target Likuiditas Utama</small><strong>${d.mainTarget}</strong></div>`;return`<section class="card"><div class="kicker">AMY FX DECISION</div><div class="decision-main ${dirClass(d.direction)}">${d.direction}</div><div class="decision-grid"><div class="decision-box"><small>Arah Utama</small><strong>${d.bias}</strong></div><div class="decision-box"><small>Tingkat Keyakinan</small><strong>${d.confidence}%</strong></div><div class="decision-box"><small>Status Data</small><strong>${d.dataStatus||'AKTIF'}</strong></div><div class="decision-box"><small>Area Rencana</small><strong>${d.entry}</strong></div><div class="decision-box"><small>Batas Salah</small><strong>${d.invalid}</strong></div>${targetHtml}</div><div class="decision-explanation" style="margin-top:12px;border-top:1px solid #333;padding-top:10px"><b style="font-size:14px;color:#fff">${d.headline||'Mapping Explanation'}</b><br><span class="muted" style="font-size:12px">Tindakan: <b>${d.action}</b></span><p style="margin:6px 0;font-size:13px">${d.reason}</p><small class="muted" style="display:block;font-size:11px">Konfirmasi Dibutuhkan: ${d.confirmationNeeded}</small>${d.invalidationText&&d.invalidationText!=='-'?`<small class="muted" style="display:block;font-size:11px">Invalidasi: ${d.invalidationText}</small>`:''}</div></section>`}

export function validBreakInfo(){const r=state.result,tf=r?.tf,cs=state.candles?.[tf]||[],last=cs.at(-1),br=r?.st?.lastEvent||r?.st?.last,price=analyzeLivePrice();if(!r||!last||!br)return`<section class="card"><div class="kicker">VALID BREAK INFO</div><h2>Belum Ada Valid Break</h2><div class="break-reason">Belum ada BOS/CHOCH yang cukup jelas. Tunggu candle close yang valid.</div></section>`;const isSweep=br.breakType==='SWEEP_ONLY'||br.sweepOnly,isFailed=br.breakType==='BREAK_FAILED'||br.failed,isValid=br.breakType==='VALID_BREAK'||br.valid,scope=br.structureScope||'MAJOR',isTransition=br.confirmationStage==='TRANSITION'||br.trendConfirmed===false,crossedBack=isValid&&(br.dir==='BULLISH'?price<br.price:price>br.price),atRisk=!isFailed&&!isSweep&&(br.atRisk||br.liveStatus==='AT_RISK'||crossedBack),confirmedTrend=r.st?.confirmedTrend||r.st?.trend||'NEUTRAL',nextLevel=Number(r.st?.transitionConfirmationLevel),nextText=Number.isFinite(nextLevel)?p2(nextLevel):'-';let title='WAIT';if(isFailed)title='BREAK FAILED';else if(isSweep)title='SWEEP ONLY';else if(atRisk)title=`${scope==='INTERNAL'?'INTERNAL CHOCH':'VALID BREAK'} AT RISK`;else if(isValid&&isTransition)title=`INTERNAL ${br.kind} ${br.dir}`;else if(isValid)title=`VALID ${br.kind} ${br.dir}`;let conclusion='Belum ada BOS/CHOCH valid. Tunggu candle close yang jelas.';if(isFailed)conclusion='Break gagal dipertahankan karena candle sudah kembali close melewati level break.';else if(isSweep)conclusion='Harga hanya menyapu level dengan wick; belum ada candle close yang mengonfirmasi perubahan struktur.';else if(atRisk)conclusion=`Break internal sudah close valid, tetapi harga live kembali ${br.dir==='BULLISH'?'di bawah':'di atas'} ${p2(br.price)}. Status AT RISK; tunggu penutupan candle ${tf} untuk menentukan hold atau failed break.`;else if(isValid&&isTransition)conclusion=`Break internal valid dan didukung displacement, tetapi tren utama masih ${confirmedTrend}. Reversal belum terkonfirmasi${Number.isFinite(nextLevel)?`; tunggu break protected swing sekitar ${p2(nextLevel)}`:''}.`;else if(isValid)conclusion=`Break mayor valid dan tren ${br.dir} sudah terkonfirmasi oleh candle close serta displacement.`;return`<section class="card"><div class="kicker">VALID BREAK INFO</div><h2>${title}</h2><div class="break-grid"><div class="break-box"><small>Level yang diuji</small><strong>${p2(br.price)}</strong></div><div class="break-box"><small>High / Low candle</small><strong>${p2(br.candleHigh)} / ${p2(br.candleLow)}</strong></div><div class="break-box"><small>Candle close</small><strong>${p2(br.candleClose)}</strong></div><div class="break-box"><small>Harga live</small><strong>${p2(price)}</strong></div><div class="break-box"><small>Percobaan struktur</small><strong>${scope==='INTERNAL'?'INTERNAL ':''}${br.kind} ${br.dir}</strong></div><div class="break-box"><small>Struktur terkonfirmasi</small><strong>${confirmedTrend}</strong></div><div class="break-box"><small>Status break</small><strong>${atRisk?'AT RISK':isTransition?'TRANSITION':isFailed?'FAILED':isSweep?'SWEEP':'CONFIRMED'}</strong></div><div class="break-box"><small>Konfirmasi berikutnya</small><strong>${nextText}</strong></div><div class="break-box" style="grid-column:span 2"><small>Displacement</small><strong>${br.hasDisplacement?'KUAT + TERKONFIRMASI':'TIDAK TERKONFIRMASI'} · body ratio ${p2(br.bodyRatio)}</strong></div></div><div class="break-reason"><b>Kesimpulan:</b><br>${conclusion}</div></section>`}

export function m1h4MappingTable(){const rows=m1h4List().map(({tf,a})=>{if(!a)return`<tr><td>${tf}</td><td colspan="6" class="muted">Belum dimuat</td></tr>`;let ob=mapConcept(a,'OB'),fvg=mapConcept(a,'FVG'),dd=a.directionDecision||buildDirectionDecision(a),se=a.setupExecution||buildSetupExecution(a,{persist:false}),biasText=dd.source==='VALIDATED_DIRECTION_FORECAST'?dd.bias:'WAIT',statusText=se?.active?`${se.direction} · ${se.status}`:(a.entryMap?.scenario?.status||'TUNGGU');return`<tr><td>${tf}</td><td><span class="map-bias ${mapBiasClass(biasText)}">${biasText}</span></td><td>${p2(a.bsl)}</td><td>${p2(a.ssl)}</td><td>${ob?ob[2]:'-'}</td><td>${fvg?fvg[2]:'-'}</td><td>${statusText}</td></tr>`}).join('');return`<section class="card"><div class="kicker">ALL-TIMEFRAME MAPPING TABLE</div><h2>BSL • SSL • OB • FVG • Entry State</h2><div class="map-table-wrap"><table class="map-table"><thead><tr><th>TF</th><th>Bias</th><th>BSL</th><th>SSL</th><th>OB</th><th>FVG</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></section>`}

export function aiMappingExplanation(){let r=state.result,s=r?.bestSetup;const{directionDecision:dd,setupExecution:se}=refreshResultContracts(r);if(!r||!dd)return`<section class="card"><div class="kicker">MAPPING NOTES</div><h2>Amy FX Mapping Explanation</h2><div class="ai-map-note muted">Klik timeframe untuk membuat penjelasan mapping.</div></section>`;let htfNote=r.htfNarrative?.reason?`<p><b>HTF Narrative</b>: ${r.htfNarrative.reason}</p>`:`<p><b>HTF Narrative</b>: Data HTF belum cukup. Mapping memakai struktur timeframe aktif.</p>`,sessNote=r.sessionContext?`<p><b>Session Context</b>: ${r.sessionContext.session.replace('_',' ')} — ${r.sessionContext.killzone!=='NONE'?'Killzone Aktif. ':''}${r.sessionContext.note}</p>`:'',drNote=r.dealingRange?`<p><b>Dealing Range</b>: ${r.dealingRange.rangeSource} (${r.dealingRange.confidence}) di High ${p2(r.dealingRange.high)} - Low ${p2(r.dealingRange.low)}.</p>`:'',liqNote=se?.liquidityTarget?`<p><b>Target Likuiditas</b>: ${se.liquidityTarget.type} ${p2(se.liquidityTarget.level)}</p>`:'';if(!se?.active)return`<section class="card"><div class="kicker">MAPPING NOTES</div><h2>Amy FX Mapping Explanation</h2><div class="ai-map-note">${htfNote}${sessNote}${drNote}${liqNote}<p>Mapping ${r.tf} menunjukkan bias utama <b>${dd.bias}</b>.</p><p><b>Status Setup: NON-AKTIF</b> (${se?.invalidationReason||'Belum ada setup Entry Map valid.'})</p><p>Kesimpulan: belum ada setup angka aktif yang aman. Tunggu konfirmasi baru.</p></div></section>`;return`<section class="card"><div class="kicker">MAPPING NOTES</div><h2>Amy FX Mapping Explanation</h2><div class="ai-map-note">${htfNote}${sessNote}${drNote}${liqNote}<p>Mapping ${se.direction} sedang aktif untuk <b>${s?.type||'Entry Map'}</b>. Harga sekarang $<b>${p2(analyzeLivePrice()||r.price)}</b>.</p><p>Area entry utama di <b>${p2(se.entryLow)} - ${p2(se.entryHigh)}</b>. Status: <b>${se.status}</b>.</p><p>Invalidasi pada <b>${p2(se.stopLoss)}</b>. Target awal pada <b>${p2(se.target1)}</b>${se.target2?`, target lanjutan pada <b>${p2(se.target2)}</b>`:''}.</p><p>Kesimpulan: <b>PANTAU SETUP ${se.direction}</b>. Tetap hormati invalidasi pada ${p2(se.stopLoss)}.</p></div></section>`}

function readableBias(value){return value==='BUY'||value==='BULLISH'?'naik (bullish)':value==='SELL'||value==='BEARISH'?'turun (bearish)':'netral'}
function readableZone(value){return value==='PREMIUM'?'bagian atas range (premium)':value==='DISCOUNT'?'bagian bawah range (discount)':'tengah range (equilibrium)'}
function readableSetup(value){return({'ORDER BLOCK':'Order Block — zona asal dorongan harga','FAIR VALUE GAP':'Fair Value Gap — celah harga yang belum seimbang','LIQUIDITY SWEEP':'Liquidity Sweep — sapuan level lalu harga kembali','SWEEP_MSS_FVG':'Sweep → perubahan struktur → Fair Value Gap','STRUCTURE SETUP':'Setup perubahan struktur','DISPLACEMENT CANDLE':'Candle dorongan kuat'})[value]||value}

export function plainMappingExplanation(){const r=state.result,s=r?.bestSetup;const{directionDecision:dd,setupExecution:se}=refreshResultContracts(r);if(!r||!dd)return`<section class="card"><div class="kicker">PENJELASAN MAPPING</div><h2>Belum Ada Analisis</h2><div class="ai-map-note muted">Pilih timeframe untuk mulai membaca kondisi market.</div></section>`;const price=p2(analyzeLivePrice()||r.price),targetText=se?.liquidityTarget?`${se.liquidityTarget.type} pada ${p2(se.liquidityTarget.level)} menjadi target likuiditas utama.`:'Belum ada target likuiditas searah yang cukup jelas.';let plan='Belum ada setup aktif yang memenuhi seluruh syarat. Jangan mengejar harga.';if(se?.active)plan=`Amy membaca setup aktif <b>${readableSetup(s?.type||'Entry Map')}</b> pada ${r.tf}. Area entry ${p2(se.entryLow)}–${p2(se.entryHigh)}, SL ${p2(se.stopLoss)}, TP1 ${p2(se.target1)}${se.target2?`, TP2 ${p2(se.target2)}`:''}. Status: ${se.status}.`;return`<section class="card"><div class="kicker">PENJELASAN MAPPING</div><h2>Apa yang Sedang Terjadi?</h2><div class="ai-map-note"><p><b>1. Arah utama</b><br>Direction Decision membaca <b>${readableBias(dd.bias)}</b>. Harga ${price} berada di <b>${readableZone(r.premiumDiscountZone||r.zone)}</b>.</p><p><b>2. Target market</b><br>${targetText}</p><p><b>3. Rencana tindakan</b><br>${plan}</p><p><b>Kesimpulan</b><br>${se?.active?`<b>FOKUS ${se.direction}</b> — status: ${se.status}.`:`<b>TUNGGU</b> — ${se?.invalidationReason||'belum ada setup aktif.'}`}</p></div></section>`}

export function analyzeView(){
  const r=state.result,se=refreshResultContracts(r).setupExecution;
  const dec=decisionData();
  const activeSetupCard=se?.active&&r?.bestSetup?lifecycleSetupCard(r.bestSetup,0):`<p class="muted">${se?.invalidationReason||r?.entryMap?.scenario?.reason||'Belum ada setup aktif yang aman. Tunggu mapping baru.'}</p>`;
  const executionPlan=renderExecutionPlanDetail(executionPlanRuntimeInput(r,state));
  const header=`<section class="hero card mapping-hero" data-stability-key="analysis-header"><div><div class="kicker">AMY FX MAPPING</div><h1>XAU/USD</h1></div><div style="text-align:right"><div class="muted">Gold Price</div><div class="price">$${p2(state.price)}</div><div class="${dec.bias==='BUY'?'green':dec.bias==='SELL'?'red':'muted'}">${dec.bias} ${dec.confidence?`• ${dec.confidence}%`:''}</div></div></section>`;
  return`${header}${marketOutlookPlaceholder()}${marketContextPlaceholder()}${executionPlan}<details class="card disclosure" data-stability-key="mapping-explanation"><summary>Penjelasan Mapping</summary>${plainMappingExplanation()}</details>${asiaAnalyzePlaceholder()}<details class="card disclosure" data-stability-key="valid-break" open><summary>Valid Break</summary>${validBreakInfo()}</details><details class="card disclosure" data-stability-key="mapping-all-timeframes"><summary>Mapping Semua Timeframe</summary>${m1h4MappingTable()}</details><details class="card disclosure" data-stability-key="active-setup"><summary>Setup Aktif (${se?.active?1:0})</summary><section class="card"><h2>Setup Aktif</h2>${activeSetupCard}</section></details>${scalperShadowPlaceholder()}`;
}
export function setupsView(){let list=state.setups.slice(0,20);return`<section class="card"><h1>Riwayat Setup (HISTORY / TERMINAL)</h1>${list.map((s,i)=>historyCard(s,i)).join('')||'<p class="muted">Belum ada setup tersimpan.</p>'}</section>`}
export function historyView(){return`<section class="card"><h1>Event Logs</h1><button class="action" onclick="window.downloadLogs()">⇩ Download TXT</button>${state.logs.map(x=>`<div class="log">${x}</div>`).join('')||'<p class="muted">Belum ada event.</p>'}</section>`}
export function settingsView(){return`<section class="card settings"><h1>Settings & API</h1><label>Twelve Data API Key <span class="muted">(khusus harga WebSocket)</span></label><input id="apiKey" type="password" autocomplete="off" value="" placeholder="Twelve Data API Key"><button class="action" onclick="window.saveConnect()" style="width:100%">🔑 Simpan & Hubungkan Live</button><p class="muted">Key disimpan terenkripsi oleh Android. Harga memakai WebSocket Twelve Data; candle Mapping tetap memakai REST.</p><div class="warn"><b>Monitor Causal</b><br>Scanner hanya aktif ketika setup causal pada timeframe terpilih masih aktif dan belum terminal.</div><button data-scanner-status class="action" onclick="window.toggleBg()" style="width:100%;margin-top:14px">📡 Scanner mengikuti setup causal</button><button class="action" onclick="window.testNotif()" style="width:100%;margin-top:12px">🔔 Tes Notifikasi Setup</button><button class="action" onclick="window.AmyFXUpdate?.checkNow()" style="width:100%;margin-top:12px">🔄 Cek Pembaruan Versi</button></section>`}

export function mappingRenderSignature() {
  const result = state.result;
  const candleTimes = SUPPORTED_MAPPING_TIMEFRAMES.map(tf => {
    const candle = state.candles?.[tf]?.at(-1);
    return [tf, candle?.time || 0, candle?.open || 0, candle?.high || 0, candle?.low || 0, candle?.close || 0];
  });
  return JSON.stringify({
    tab: state.tab,
    tf: state.tf,
    candleTimes,
    dataStale: Boolean(result?.dataStale),
    direction: result?.directionDecision || null,
    execution: result?.setupExecution || null,
    explanation: result?.mappingExplanation || null,
    scenario: result?.entryMap?.scenario || null,
    breakEvent: result?.st?.lastEvent || result?.st?.last || null,
    bsl: result?.bsl || null,
    ssl: result?.ssl || null
  });
}

export function render(){
  document.querySelectorAll('.nav button').forEach(button => button.classList.toggle('active',button.dataset.tab===state.tab));
  statusDot();
  const app=document.getElementById('app');
  const signature=mappingRenderSignature();
  if(app&&app.childElementCount&&signature===lastRenderSignature){
    syncMarketSnapshot();
    return false;
  }
  const disclosureState=new Map([...document.querySelectorAll('#app details[data-stability-key]')].map(details=>[details.dataset.stabilityKey,details.open]));
  if(app)app.innerHTML=state.tab==='Dashboard'?dashboard():state.tab==='Analyze'?analyzeView():state.tab==='Setups'?setupsView():state.tab==='History'?historyView():settingsView();
  document.querySelectorAll('#app details[data-stability-key]').forEach(details=>{
    const key=details.dataset.stabilityKey;
    if(disclosureState.has(key))details.open=disclosureState.get(key);
  });
  lastRenderSignature=signature;
  syncMarketSnapshot();
  return true;
}

function syncMarketSnapshot(){
  if(!window.AmyFXIntel?.write)return false;
  const r=state.result,previous=window.AmyFXIntel.read?.()?.mapping||{},contracts=refreshResultContracts(r),dd=contracts.directionDecision,se=contracts.setupExecution,exp=contracts.mappingExplanation,d=decisionData();
  const timeframe=r?.tf||state.tf;
  const candle=state.candles?.[timeframe]?.at(-1);
  const sourceCandleTime=Number(candle?.time||0);
  const nextSignature=JSON.stringify({
    timeframe,
    sourceCandleTime,
    price:Number(analyzeLivePrice()||0).toFixed(2),
    bias:dd?.bias||'WAIT',
    direction:dd?.signal||'WAIT',
    status:se?.active?se.status:(dd?.status||'WAIT'),
    confidence:d.confidence,
    execution:se,
    explanation:exp,
    dataStatus:exp?.dataStatus||'BELUM TERSEDIA'
  });
  if(nextSignature===lastMarketSnapshotSignature)return false;
  lastMarketSnapshotSignature=nextSignature;
  window.AmyFXIntel.write('mapping',{...previous,price:analyzeLivePrice(),timeframe,bias:dd?.bias||'WAIT',direction:dd?.signal||'WAIT',status:se?.active?se.status:(dd?.status||'WAIT'),confidence:d.confidence,directionDecision:dd,setupExecution:se,mappingExplanation:exp,mappingSnapshot:r?.mappingSnapshot||null,dataStatus:exp?.dataStatus||'BELUM TERSEDIA',sourceCandleTime,analyzedAt:sourceCandleTime||previous.analyzedAt||0});
  return true;
}

export function syncStickyBar(){const bar=document.getElementById('sticky-bar');if(!bar)return;const shouldShow=['Dashboard','Analyze'].includes(state.tab)&&window.scrollY>110;bar.classList.toggle('visible',shouldShow);bar.setAttribute('aria-hidden',String(!shouldShow));if(shouldShow){const priceEl=bar.querySelector('.sticky-price'),biasEl=bar.querySelector('.sticky-bias');if(priceEl)priceEl.textContent=`$${p2(state.price)}`;if(biasEl){const b=(decisionData().bias||'WAIT').toUpperCase();biasEl.textContent=b;biasEl.className=`sticky-bias ${mapBiasClass(b)}`}}}
if(typeof window!=='undefined')window.addEventListener('scroll',syncStickyBar,{passive:true});
export function skeletonCardMarkup(){return`<section class="card skeleton-card"><div class="skeleton-line h-24 w-50"></div><div class="skeleton-line w-100"></div><div class="skeleton-line w-75"></div></section>`}
export function renderSoft(){statusDot();let p=document.querySelector('.price');if(p)p.textContent='$'+p2(state.price);let tw=document.getElementById('top-wita');if(tw){tw.textContent='';tw.style.display='none';tw.setAttribute('aria-hidden','true')}let kw=document.getElementById('kz-wita');if(kw)kw.textContent='WITA '+nowTime();syncStickyBar()}
export function applyAmyFxRoute(){let route='';try{route=decodeURIComponent((location.hash||'').replace(/^#/,''))}catch(e){}try{route=route||new URLSearchParams(location.search||'').get('route')||''}catch(e){}try{route=route||localStorage.getItem('amyfx.notification.route')||''}catch(e){}if(!route)route=localStorage.getItem('amy_mapping_tab')||'';if(['Dashboard','Analyze','Setups','History','Settings'].includes(route)){state.tab=route;try{localStorage.removeItem('amyfx.notification.route')}catch(e){}}else state.tab='Dashboard'}
