import { state, TF, p2, nowTime, sessions, curSession } from '../main.js';
import { runAnalysis } from '../api/market-data.js';
import { analyze } from '../engine/ict-core.js';
import { saveConnect, toggleBg, testNotif, downloadLogs } from '../bridge/android-bridge.js';

export function killzonePanel(){let list=sessions(),cur=curSession(),focus=list.filter(s=>s.name.includes('London Open')||s.name.includes('New York Open'));return`<section class="card session-card"><div class="section-row"><div><div class="kicker">SESI TRADING</div><h2>Session focus</h2></div><span class="muted" id="kz-wib">WIB ${nowTime()}</span></div><div class="session-pill ${cur.active?'active':''}">${cur.active?'Aktif: '+cur.name:'Off-Session'}</div><div class="session-grid">${focus.map(s=>`<div class="session-focus ${s.active?'active':''}"><b>${s.active?'● ':'○ '}${s.name.replace(' Kill Zone','')}</b><small>${s.wib} WIB</small><span>${s.active?'Aktif sekarang':'Menunggu sesi'}</span></div>`).join('')}</div></section>`}

export function fmtDir(x,status='',cf=''){x=String(x||'');let d=x.includes('BUY')?'BUY':x.includes('SELL')?'SELL':'';if(!d)return 'TUNGGU';if(status.includes('SL HIT')||status.includes('TP HIT')||status.includes('EXPIRED'))return `ABAIKAN ${d}`;if(status==='INVALID'||status==='BROKEN'||status==='WAIT'||cf==='FATAL')return `WAIT ${d}`;if(cf==='HIGH'||cf==='MEDIUM')return `BIAS ${d}`;if(status==='WATCH SETUP'||status==='PANTAU SETUP')return `WATCH ${d}`;return `FOKUS ${d}`;}
export function fmtStatus(x){x=String(x||'');return x.replace(/READY SETUP/g,'SETUP VALID').replace(/WATCH SETUP/g,'PANTAU SETUP').replace(/^WAIT$/g,'TUNGGU');}
export function dirClass(x){x=String(x||'');return x.includes('BUY')?'buy':x.includes('SELL')?'sell':'wait';}

export function setupCard(s,i=0){let q=s.qualityLabel?`<b>${(s.status.includes('INVALID')||s.status.includes('WAIT'))?'Component Quality':'Quality'}: ${s.qualityLabel}</b>${(s.status.includes('INVALID')||s.status.includes('WAIT'))?', Setup Status: INVALID/WAIT':''} — `:'',ce=s.ce?`<br><small>CE Level: ${p2(s.ce)}</small>`:'',comp='';if(s.components){let c=s.components;comp=`<div class="num-grid" style="margin-top:10px;border-top:1px solid #333;padding-top:10px"><div class="num"><small>Model</small><strong>${c.model}</strong></div><div class="num"><small>Sweep</small><strong>${c.sweep}</strong></div><div class="num"><small>MSS</small><strong>${c.mss}</strong></div><div class="num"><small>Entry</small><strong>${c.entry}</strong></div><div class="num"><small>HTF</small><strong>${c.htf}</strong></div></div>`}let chk='';if(s.scoreChecklist){let list=s.scoreChecklist.map(x=>`<div style="font-size:12px;margin:2px 0"><span style="color:${x.passed?'#4ade80':'#f87171'}">${x.passed?'✓':'×'}</span> ${x.name} <span class="muted">+${x.score}</span></div>`).join('');chk=`<div style="margin-top:10px;border-top:1px solid #333;padding-top:10px"><b>Checklist Score: ${s.score}/100 — Grade ${s.grade||''}</b><br>${list}</div>`}let sess='';if(s.sessionContext){let sc=s.sessionContext;sess=`<div class="ai-map-note" style="margin-top:10px;font-size:12px;background:#1a1a1a;padding:8px;border-radius:4px"><b>Session: ${sc.session.replace('_',' ')}</b> — ${sc.killzone!=='NONE'?'Killzone Aktif. ':''}${sc.note}</div>`}let cfHtml='';if(s.conflictCheck){let cf=s.conflictCheck,badge=cf.conflictLevel==='NONE'?'#4ade80':cf.conflictLevel==='FATAL'||cf.conflictLevel==='HIGH'?'#f87171':'#fbbf24',cNotes=cf.conflicts.length?cf.conflicts.map(x=>x.note).join('<br>'):'Komponen utama selaras.';cfHtml=`<div style="margin-top:10px;border-top:1px solid #333;padding-top:10px;font-size:12px"><b>Conflict: <span style="color:${badge}">${cf.conflictLevel}</span> — ${cf.recommendation}</b><br><span class="muted">${cNotes}</span></div>`}let tpHtml = s.singleTarget ? `<div class="num" style="grid-column: span 2"><small>Single Target</small><strong>${p2(s.tp1)}</strong></div>` : `<div class="num"><small>TP1</small><strong>${p2(s.tp1)}</strong></div><div class="num"><small>TP2</small><strong>${p2(s.tp2)}</strong></div>`;return`<div class="setup-card ${s.status.includes('READY')?'ready':s.status.includes('WATCH')?'watch':'wait'}"><div class="setup-head"><div><div class="setup-title">SETUP ${i+1} — ${s.type}</div><div class="muted">Timeframe: ${s.tf} • Status: ${fmtStatus(s.status)}</div></div><span class="badge ${String(s.dir).includes('BUY')?'buy':'sell'}">${fmtDir(s.dir,s.status,s.conflictCheck?.conflictLevel)}</span></div><div class="num-grid"><div class="num"><small>Score</small><strong>${s.score}/100</strong></div><div class="num"><small>Harga Sekarang</small><strong>${p2(s.price)}</strong></div><div class="num"><small>Entry Area</small><strong>${p2(s.entryLow)} - ${p2(s.entryHigh)}</strong></div><div class="num"><small>SL</small><strong>${p2(s.sl)}</strong></div>${tpHtml}</div>${comp}${cfHtml}${chk}${sess}<div class="reason" style="margin-top:10px"><b>Alasan:</b><br>${q}${s.reason}${ce}</div></div>`}

export function dashboard(){let r=state.result,s=r?.bestSetup,dec=decisionData(),tfList=['M15','H1','H4','D1'];return`<section class="hero card mapping-hero"><div><div class="kicker">AMY FX MAPPING</div><h1>XAU/USD</h1><div class="muted" id="top-wib">${state.conn==='Connected'?'● Live Price':'○ '+state.conn} • WIB ${nowTime()}</div></div><div style="text-align:right"><div class="muted">Gold Price</div><div class="price">$${p2(state.price)}</div><div class="${dec.bias==='BULLISH'?'green':dec.bias==='BEARISH'?'red':'muted'}">${dec.bias} ${dec.confidence?`• ${dec.confidence}%`:''}</div></div></section><section class="card tf-card"><div class="section-row"><div><div class="kicker">TIMEFRAME</div><h2>Pilih mapping</h2></div><span class="muted">${state.tf}</span></div><div class="tf-grid compact-tf">${tfList.map(x=>`<button class="${state.tf===x?'active':''}" onclick="window.runAnalysis('${x}')">${x}</button>`).join('')}</div></section><section class="card setup-focus"><div class="section-row"><div><div class="kicker">SETUP UTAMA</div><h2>${s?s.type:'Belum ada setup'}</h2></div>${s?`<span class="badge ${String(s.dir).includes('BUY')?'buy':'sell'}">${fmtDir(s.dir,s.status,s.conflictCheck?.conflictLevel)}</span>`:''}</div>${s?`<div class="setup-summary"><div><small>Entry Area</small><strong>${p2(s.entryLow)} – ${p2(s.entryHigh)}</strong></div><div><small>Invalidasi</small><strong>${p2(s.sl)}</strong></div><div><small>Target</small><strong>${p2(s.tp1)}</strong></div><div><small>Score</small><strong>${s.score}/100</strong></div></div><p class="summary-note">${analyzeSetupLiveState(s).note}</p>`:'<p class="muted">Klik Analisis Setup untuk membuat mapping angka.</p>'}<button class="action" onclick="setTab('Analyze')" style="width:100%;margin-top:12px">⚡ Buka Analisis Lengkap</button></section>${killzonePanel()}`}

export function mapMini(tf){
  let cs=state.candles?.[tf]||[];
  if(!cs.length||cs.length<30)return null;
  try{return analyze(cs,tf,{},state.price,{H4:state.candles?.H4,D1:state.candles?.D1,W1:state.candles?.W1})}catch(e){return null}
}
export function mapConcept(a,name){
  return (a?.concepts||[]).find(x=>x[0]===name)||null
}
export function mapBiasClass(x){
  x=String(x||'NEUTRAL').toLowerCase();
  return x.includes('bull')?'bullish':x.includes('bear')?'bearish':'neutral'
}
export function m1h4List(){
  return ['M1','M5','M15','M30','H1','H4'].map(tf=>({tf,a:mapMini(tf)}))
}
export function activeBias(){
  let rows=m1h4List().filter(x=>x.a);
  let bull=rows.filter(x=>x.a.final==='BULLISH').length;
  let bear=rows.filter(x=>x.a.final==='BEARISH').length;
  if(bull>=bear+2)return 'BULLISH';
  if(bear>=bull+2)return 'BEARISH';
  if(bull||bear)return 'MIXED / CONFLICT';
  return 'NEUTRAL';
}

export function analyzeLivePrice(){
  return Number(state.price||localStorage.getItem('last_price')||state.result?.price||0)
}
export function analyzeSetupLiveState(s){
  if(!s)return{status:'TUNGGU',fatal:false,note:'Belum ada setup aktif.'}
  if(s.timestamp&&Date.now()-s.timestamp>86400000)return{status:'EXPIRED',fatal:true,note:'Setup sudah kedaluwarsa (lebih dari 24 jam).'}
  const price=analyzeLivePrice()
  if(!price)return{status:fmtStatus(s.status),fatal:false,note:'Harga live belum tersedia.'}
  const dir=String(s.dir||''),isBuy=dir.includes('BUY'),isSell=dir.includes('SELL')
  const lo=Math.min(Number(s.entryLow),Number(s.entryHigh)),hi=Math.max(Number(s.entryLow),Number(s.entryHigh))
  const sl=Number(s.sl),tp1=Number(s.tp1),tp2=Number(s.tp2)
  let lcKey=`${s.type}:${s.dir}:${s.tf}:${s.entryLow}:${s.entryHigh}:${s.sl}:${s.tp1}:${s.tp2}:${s.timestamp||0}`;
  let lc=JSON.parse(localStorage.getItem('amy_mapping_lifecycle')||'{}');
  let touched=lc[lcKey]===true;
  if(isBuy&&Number.isFinite(sl)&&price<=sl)return{status:'SL HIT / INVALID',fatal:true,note:`Setup BUY invalid karena harga live ${p2(price)} sudah di bawah SL ${p2(sl)}.`}
  if(isSell&&Number.isFinite(sl)&&price>=sl)return{status:'SL HIT / INVALID',fatal:true,note:`Setup SELL invalid karena harga live ${p2(price)} sudah di atas SL ${p2(sl)}.`}
  if(Number.isFinite(lo)&&Number.isFinite(hi)&&price>=lo&&price<=hi){
    if(!touched){
      lc[lcKey]=true;
      let keys=Object.keys(lc);
      if(keys.length>50)keys.slice(0,keys.length-30).forEach(k=>delete lc[k]);
      localStorage.setItem('amy_mapping_lifecycle',JSON.stringify(lc));
      touched=true;
    }
    return{status:'DALAM AREA',fatal:false,note:`Harga live ${p2(price)} sedang berada di area entry.`}
  }
  if(isBuy&&((Number.isFinite(tp2)&&price>=tp2)||(Number.isFinite(tp1)&&price>=tp1))){
    if(touched)return{status:'TP HIT',fatal:true,note:`Target BUY sudah tercapai di harga live ${p2(price)}.`}
  }
  if(isSell&&((Number.isFinite(tp2)&&price<=tp2)||(Number.isFinite(tp1)&&price<=tp1))){
    if(touched)return{status:'TP HIT',fatal:true,note:`Target SELL sudah tercapai di harga live ${p2(price)}.`}
  }
  return{status:'MENUNGGU ENTRY',fatal:false,note:`Harga live ${p2(price)} belum berada di area entry ${p2(lo)} - ${p2(hi)}.`}
}
export function analyzeActiveSetups(list){
  return (list||[]).filter(s=>!analyzeSetupLiveState(s).fatal)
}
export function renderAnalyzeLive(){
  if(state.tab==='Analyze'&&state.result)render()
  else renderSoft()
}

export function decisionData(){
  let r=state.result;
  if(!r)return{bias:'WAIT',direction:'TUNGGU',confidence:0,confLabel:'Confidence',status:'TUNGGU',entry:'-',invalid:'-',nearTarget:'-',mainTarget:'-',reason:'Belum ada data mapping.'};
  let bias=r.final||'WAIT';
  let s=r.bestSetup;
  let live=s?analyzeSetupLiveState(s):null;
  if(s&&live?.fatal)return{bias,direction:'TUNGGU',confidence:0,confLabel:'Confidence',status:live.status,entry:`${p2(s.entryLow)} - ${p2(s.entryHigh)}`,invalid:p2(s.sl),nearTarget:'-',mainTarget:'-',reason:live.note+' Tunggu setup baru.'};
  let rawDir=s?.dir||r.signal||'WAIT';
  let focus=fmtDir(rawDir,s?s.status:'',s?s.conflictCheck?.conflictLevel:'');
  let score=s?.score||r.score||0;
  let aligned=(bias==='BULLISH'&&String(rawDir).includes('BUY'))||(bias==='BEARISH'&&String(rawDir).includes('SELL'));
  let conflict=['HIGH','MEDIUM','FATAL'].includes(String(s?.conflictCheck?.conflictLevel||''));
  let confidence=Math.max(0,Math.min(95,Math.round(score+(aligned?8:0)-(conflict?12:0))));
  let stat = s?(live?.status||fmtStatus(s.status)):'TUNGGU';
  
  let confLabel = 'Bias Confidence';
  if(!s || stat.includes('WAIT') || stat.includes('INVALID') || focus.includes('ABAIKAN')){
      confidence = 0;
      confLabel = 'Confidence';
  } else if(stat.includes('VALID') || stat.includes('READY')){
      confLabel = 'Setup Confidence';
  }
  
  let nearTarget='-';
  let mainTarget='-';
  if(s){
     nearTarget = s.singleTarget ? `${p2(s.tp1)}` : `${p2(s.tp1)} / ${p2(s.tp2)}`;
     mainTarget = r.liquidityHierarchy?.drawTarget ? `${r.liquidityHierarchy.drawTarget.type} ${p2(r.liquidityHierarchy.drawTarget.level)}` : (String(rawDir).includes('BUY')?`BSL ${p2(r.bsl)}`:`SSL ${p2(r.ssl)}`);
  }
  let reason=s?`Bias aktif ${bias}. Setup utama membaca ${s.type}. ${live?live.note:''} Area entry ${p2(s.entryLow)} - ${p2(s.entryHigh)}, invalidasi ${p2(s.sl)}.`:`Bias aktif ${bias}. Belum ada setup aktif yang aman, jadi fokus utama adalah menunggu konfirmasi baru.`;
  return{bias,direction:s?focus:'TUNGGU',confidence,confLabel,status:stat,entry:s?`${p2(s.entryLow)} - ${p2(s.entryHigh)}`:'-',invalid:s?p2(s.sl):'-',nearTarget,mainTarget,reason}
}
export function amyDecisionCard(){
  let d=decisionData();
  let targetHtml = '';
  if (d.nearTarget === '-' && d.mainTarget === '-') {
      targetHtml = `<div class="decision-box"><small>Target</small><strong>-</strong></div>`;
  } else if (d.nearTarget === d.mainTarget || d.nearTarget.includes(d.mainTarget.split(' ')[1]||'none')) {
      targetHtml = `<div class="decision-box" style="grid-column: span 2"><small>Draw Target</small><strong>${d.mainTarget}</strong></div>`;
  } else {
      targetHtml = `<div class="decision-box"><small>Near-term Target</small><strong>${d.nearTarget}</strong></div><div class="decision-box"><small>Main Draw Target</small><strong>${d.mainTarget}</strong></div>`;
  }
  return`<section class="card"><div class="kicker">AMY FX DECISION</div><div class="decision-main ${dirClass(d.direction)}">${d.direction}</div><div class="decision-grid">
    <div class="decision-box"><small>Active Bias</small><strong>${d.bias}</strong></div>
    <div class="decision-box"><small>${d.confLabel}</small><strong>${d.confidence}%</strong></div>
    <div class="decision-box"><small>Status</small><strong>${d.status}</strong></div>
    <div class="decision-box"><small>Entry Area</small><strong>${d.entry}</strong></div>
    <div class="decision-box"><small>Invalidation</small><strong>${d.invalid}</strong></div>
    ${targetHtml}
  </div><div class="decision-reason"><b>Reason:</b><br>${d.reason}</div></section>`
}

export function validBreakInfo(){let r=state.result,tf=r?.tf,cs=state.candles?.[tf]||[],last=cs.at(-1),br=r?.st?.last,price=analyzeLivePrice();if(!r||!last||!br)return`<section class="card"><div class="kicker">VALID BREAK INFO</div><h2>Belum Ada Valid Break</h2><div class="break-reason">Belum ada BOS/CHOCH yang cukup jelas. Tunggu candle close yang valid.</div></section>`;let isSweep=br.breakType==='SWEEP_ONLY'||br.sweepOnly,isFailed=br.breakType==='BREAK_FAILED'||br.failed,isValid=br.breakType==='VALID_BREAK'||br.valid,title=isFailed?'BREAK FAILED':isSweep?'SWEEP ONLY':isValid?'VALID BREAK':'WAIT',dispNote=br.hasDisplacement?' dan didukung displacement':'',conclusion=isFailed?`Break sebelumnya gagal dipertahankan karena harga kembali close melewati level break.`:(isSweep?`Harga hanya menyapu level dengan wick, tetapi close belum valid melewati struktur.`:(isValid?`Candle close sudah valid melewati level struktur${dispNote}.`:`Belum ada BOS/CHOCH valid. Tunggu candle close yang jelas.`));return`<section class="card"><div class="kicker">VALID BREAK INFO</div><h2>${title}</h2><div class="break-grid"><div class="break-box"><small>Break Level</small><strong>${p2(br.price)}</strong></div><div class="break-box"><small>High / Low</small><strong>${p2(br.candleHigh)} / ${p2(br.candleLow)}</strong></div><div class="break-box"><small>Candle Close</small><strong>${p2(br.candleClose)}</strong></div><div class="break-box"><small>Structure</small><strong>${br.kind} ${br.dir}</strong></div><div class="break-box"><small>Harga Live</small><strong>${p2(price)}</strong></div><div class="break-box"><small>Displacement</small><strong>${br.hasDisplacement?'YA':'TIDAK'} (${p2(br.bodyRatio)})</strong></div></div><div class="break-reason"><b>Kesimpulan:</b><br>${conclusion}</div></section>`}

export function m1h4MappingTable(){
  const rows=m1h4List().map(({tf,a})=>{
    if(!a)return`<tr><td>${tf}</td><td colspan="6" class="muted">Belum dimuat</td></tr>`;
    let ob=mapConcept(a,'OB'),fvg=mapConcept(a,'FVG');
    let status=a.bestSetup?`${fmtDir(a.bestSetup.dir,a.bestSetup.status,a.bestSetup.conflictCheck?.conflictLevel)} ${a.bestSetup.score}/100`:fmtDir(a.signal);
    return`<tr><td>${tf}</td><td><span class="map-bias ${mapBiasClass(a.final)}">${a.final}</span></td><td>${p2(a.bsl)}</td><td>${p2(a.ssl)}</td><td>${ob?ob[2]:'-'}</td><td>${fvg?fvg[2]:'-'}</td><td>${status}</td></tr>`;
  }).join('');
  return`<section class="card"><div class="kicker">M1–H4 MAPPING TABLE</div><h2>BSL • SSL • OB • FVG</h2><div class="map-table-wrap"><table class="map-table"><thead><tr><th>TF</th><th>Bias</th><th>BSL</th><th>SSL</th><th>OB</th><th>FVG</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></section>`
}

export function aiMappingExplanation(){let r=state.result,s=r?.bestSetup;if(!r)return`<section class="card"><div class="kicker">MAPPING NOTES</div><h2>Amy FX Mapping Explanation</h2><div class="ai-map-note muted">Klik timeframe untuk membuat penjelasan mapping.</div></section>`;let live=s?analyzeSetupLiveState(s):null,htfNote=r.htfNarrative?.reason?`<p><b>HTF Narrative</b>: ${r.htfNarrative.reason}</p>`:`<p><b>HTF Narrative</b>: Data HTF belum cukup. Mapping memakai struktur timeframe aktif.</p>`;let sessNote='';if(r.sessionContext){sessNote=`<p><b>Session Context</b>: ${r.sessionContext.session.replace('_',' ')} — ${r.sessionContext.killzone!=='NONE'?'Killzone Aktif. ':''}${r.sessionContext.note}</p>`}let drNote='';if(r.dealingRange){let dr=r.dealingRange, htfZn=r.premiumDiscountZone||dr.currentZone;drNote=`<p><b>Dealing Range</b>: ${dr.rangeSource} (${dr.confidence}) di High ${p2(dr.high)} - Low ${p2(dr.low)}. Equilibrium di ${p2(dr.equilibrium)}. HTF Zone: <b>${htfZn}</b>. Current Dealing Range Zone: <b>${dr.currentZone}</b>. ${dr.reason}</p>`}let liqNote='';if(r.liquidityHierarchy){let lh=r.liquidityHierarchy,dtStr=lh.drawTarget?`<p><b>Draw Target</b>: ${lh.drawTarget.type} ${p2(lh.drawTarget.level)} — external liquidity aktif di ${lh.drawTarget.type==='BSL'?'atas':'bawah'} harga.</p>`:'',sweptStr='';if(lh.swept.length>0){if(s&&!s.components?.sweep){sweptStr=`<p><b>Swept Liquidity</b>: Liquidity historis sudah tersapu, tetapi setup ini belum memiliki liquidity sweep valid sebagai trigger entry.</p>`}else{sweptStr=`<p><b>Swept Liquidity</b>: ${lh.swept.slice(0,3).map(x=>`${x.type} ${p2(x.level)}`).join(', ')} sudah tersapu.</p>`}}liqNote=dtStr+sweptStr}let chkNote='';if(s&&s.scoreChecklist){if(s.grade==='A+'||s.grade==='A'){chkNote=`<p><b>Grade ${s.grade}</b>: Setup ini mendapat Grade tinggi karena HTF searah, liquidity sudah disapu, MSS valid, dan FVG fresh/kuat.</p>`}else{chkNote=`<p><b>Grade ${s.grade||'WAIT'}</b>: Setup belum layak karena ${s.scoreChecklist.filter(x=>!x.passed).map(x=>x.name).join(', ')||'kurangnya konfirmasi'}.</p>`}}let cfNote='';if(s&&s.conflictCheck){let cf=s.conflictCheck;if(cf.hasFatalConflict){cfNote=`<p><b>Fatal Conflict</b>: ${cf.conflicts.map(x=>x.note).join(', ')}. Setup ini ditolak / tidak valid.</p>`}else if(cf.conflictLevel!=='NONE'){cfNote=`<p><b>Conflicts (${cf.conflictLevel})</b>: ${cf.conflicts.map(x=>x.note).join(', ')}. Setup status = ${cf.recommendation}.</p>`}else{cfNote=`<p><b>Conflict</b>: NONE — Komponen utama selaras.</p>`}}if(s&&live?.fatal)return`<section class="card"><div class="kicker">MAPPING NOTES</div><h2>Amy FX Mapping Explanation</h2><div class="ai-map-note">${htfNote}${sessNote}${drNote}${liqNote}${cfNote}<p>Setup ${s.tf} sebelumnya membaca <b>${s.type}</b> dengan arah <b>${fmtDir(s.dir,s.status,s.conflictCheck?.conflictLevel)}</b>.</p><p><b>${live.status}</b>: ${live.note}</p><p>Kesimpulan: setup aktif tidak layak dipakai. Tunggu mapping ulang atau setup baru.</p></div></section>`;if(!s)return`<section class="card"><div class="kicker">MAPPING NOTES</div><h2>Amy FX Mapping Explanation</h2><div class="ai-map-note">${htfNote}${sessNote}${drNote}${liqNote}<p>Mapping ${r.tf} menunjukkan bias utama <b>${r.final}</b> dengan posisi harga berada di area <b>${r.zone}</b>.</p><p>Kesimpulan: belum ada setup angka yang cukup kuat. Tunggu OB, FVG, sweep liquidity, atau displacement yang lebih jelas.</p></div></section>`;let finalConcl='SETUP VALID';if(s.conflictCheck?.hasFatalConflict||s.status==='INVALID')finalConcl='INVALID / ABAIKAN SETUP';else if(s.status==='WAIT')finalConcl='MENUNGGU KONFIRMASI';else if(s.status.includes('WATCH'))finalConcl='PANTAU SETUP';return`<section class="card"><div class="kicker">MAPPING NOTES</div><h2>Amy FX Mapping Explanation</h2><div class="ai-map-note">${htfNote}${sessNote}${drNote}${liqNote}${chkNote}${cfNote}<p>Mapping ${s.tf} sedang membaca <b>${s.type}</b> dengan arah <b>${fmtDir(s.dir,s.status,s.conflictCheck?.conflictLevel)}</b>. Harga sekarang berada di sekitar <b>${p2(analyzeLivePrice()||s.price)}</b>.</p><p>Area entry utama berada di <b>${p2(s.entryLow)} - ${p2(s.entryHigh)}</b>. ${live?live.note:''}</p><p>Invalidasi berada di <b>${p2(s.sl)}</b>. Target awal berada di <b>${p2(s.tp1)}</b>${(Math.abs(s.tp1-s.tp2)>0.05)?`, lalu target lanjutan di <b>${p2(s.tp2)}</b>`:''}.</p><p>Kesimpulan: <b>${finalConcl}</b>. Jangan paksa entry sebelum harga memberi konfirmasi di area mapping.</p></div></section>`;}

export function analyzeView(){
  const active=analyzeActiveSetups(state.result?.setups||[]);
  return`<section class="card"><div class="tf-grid">${Object.keys(TF).map(x=>`<button class="${state.tf===x?'active':''}" onclick="window.runAnalysis('${x}')">${x}</button>`).join('')}</div></section>
  ${amyDecisionCard()}
  <details class="card disclosure" open><summary>Valid Break</summary>${validBreakInfo()}</details>
  <details class="card disclosure"><summary>Mapping M1–H4</summary>${m1h4MappingTable()}</details>
  <details class="card disclosure"><summary>Penjelasan Mapping</summary>${aiMappingExplanation()}</details>
  <details class="card disclosure"><summary>Setup Aktif (${active.length})</summary><section class="card"><h2>Setup Aktif</h2>${active.map(s => setupCard(s, 0)).join('')||'<p class="muted">Belum ada setup aktif yang aman. Tunggu mapping baru.</p>'}</section></details>`
}

export function setupsView(){let list=state.setups.slice(0,20);return`<section class="card"><h1>Riwayat Setup</h1>${list.map(s => setupCard(s, 0)).join('')||'<p class="muted">Belum ada setup tersimpan.</p>'}</section>`}
export function historyView(){return`<section class="card"><h1>Event Logs</h1><button class="action" onclick="window.downloadLogs()">⇩ Download TXT</button>${state.logs.map(x=>`<div class="log">${x}</div>`).join('')||'<p class="muted">Belum ada event.</p>'}</section>`}
export function settingsView(){return`<section class="card settings"><h1>Settings & API</h1><label>Twelve Data API Key <span class="muted">(opsional untuk candle)</span></label><input id="apiKey" value="${state.key}" placeholder="Kosongkan jika key sudah di Vercel"><button class="action" onclick="window.saveConnect()" style="width:100%">🔑 Simpan & Hubungkan Live</button><p class="muted">Analisis candle memakai API Vercel. Key lokal hanya diperlukan untuk live price WebSocket dan Background Scanner native.</p><div class="warn"><b>Background Scanner</b><br>Jika ON, scanner akan memantau Entry Area setup terbaik dari Mapping saat aplikasi ditutup.</div><button class="${state.bg?'action':'chip'}" onclick="window.toggleBg()" style="width:100%;margin-top:14px">${state.bg?'📡 Background Scanner ON':'📴 Background Scanner OFF'}</button><button class="action" onclick="window.testNotif()" style="width:100%;margin-top:12px">🔔 Tes Notifikasi Setup</button></section>`}

export function render(){
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
  document.getElementById('conn').textContent=state.conn;
  document.getElementById('conn').className='status '+(state.conn==='Connected'?'on':'');
  document.getElementById('app').innerHTML=state.tab==='Dashboard'?dashboard():state.tab==='Analyze'?analyzeView():state.tab==='Setups'?setupsView():state.tab==='History'?historyView():settingsView();
}
export function renderSoft(){
  let c=document.getElementById('conn');
  if(c){c.textContent=state.conn;c.className=state.conn==='Connected'?'status on':'status';}
  let p=document.querySelector('.price');
  if(p)p.textContent='$'+p2(state.price);
  let tw=document.getElementById('top-wib');
  if(tw)tw.textContent=(state.conn==='Connected'?'● Live Price':'○ '+state.conn)+' • WIB '+nowTime();
  let kw=document.getElementById('kz-wib');
  if(kw)kw.textContent='WIB '+nowTime();
}
export function applyAmyFxRoute(){
  let route='';
  try{route=decodeURIComponent((location.hash||'').replace(/^#/,''))}catch(e){}
  try{route=route||new URLSearchParams(location.search||'').get('route')||''}catch(e){}
  try{route=route||localStorage.getItem('amyfx.notification.route')||''}catch(e){}
  if(['Dashboard','Analyze','Setups','History','Settings'].includes(route)){
    state.tab=route;
    try{localStorage.removeItem('amyfx.notification.route')}catch(e){}
  }
}
