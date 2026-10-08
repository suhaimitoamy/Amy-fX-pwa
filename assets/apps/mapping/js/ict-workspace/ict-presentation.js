// Presentation settings never change server-owned bias/scoring.
export const DISPLAY_DEFAULTS=Object.freeze({mode:'Present',structure:true,mss:true,bos:true,displacement:false,ob:true,breaker:true,polarity:false,liquidity:true,fvg:true,gapType:'FVG',bpr:false,vi:true,nwog:true,ndog:false,pivots:true,pivotTf:'D',pivotMode:'Clean',nearAtr:2,keyLevels:true,mo:true,pdh:true,pdl:true,bsl:false,ssl:false,asia:true,killzones:false,ny:true,londonOpen:true,londonClose:true,asian:true,fib:'NONE',fibExtend:false,labels:true,signals:true,narration:true,dashboard:true,panel:false,assistantNotif:true,visible:2,bullOb:1,bearOb:1,nwogCount:3,ndogCount:1,backBars:80,rightBars:40,lineWidth:1});
export function loadDisplay(storage=globalThis.localStorage){try{return {...DISPLAY_DEFAULTS,...JSON.parse(storage.getItem('amyfx.ict.display.v2')||'{}')};}catch{return {...DISPLAY_DEFAULTS};}}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=x=>Number.isFinite(x)?x.toFixed(2):'—';
const range=z=>z?`${n(z.high)} – ${n(z.low)}`:'—';
const directions=x=>x===1?'BUY CTX · NAIK':x===-1?'SELL CTX · TURUN':'NO CLEAR BIAS';
export function dashboardRows(amy){
  const d=amy?.dashboard;if(!d)return [];
  const state=['None','Fresh','Old','Invalid'][d.sweepStatus],invalid=['Valid','Near Invalid','Invalid','No Bias'][d.invalidStatus];
  const poi=d.poi,poiName=poi?`${poi.side==='BUY'?'Bull':'Bear'} ${poi.kind}`:'None';
  const zone=x=>x===1?'Premium':x===-1?'Discount':'EQ Zone';
  return [['BIAS',directions(d.biasDir)],['STRUKTUR',d.mssDir===1?'M15 Bullish':d.mssDir===-1?'M15 Bearish':'M15 Neutral'],
    ['PROTECTED',`H ${n(d.protectedHigh)} | L ${n(d.protectedLow)}`],['LIQUIDITY',`BSL ${n(d.bsl)} | SSL ${n(d.ssl)}`],
    ['SWEEP',`${d.sweepDir===1?'SSL Swept':d.sweepDir===-1?'BSL Swept':'None'} | ${state}`],
    ['SWEEP PRICE',`Swept ${n(d.sweep?.price)} | Extreme ${n(d.sweep?.extreme)}`],
    ['DOL',`${d.dolDir===1?'Draw to BSL':d.dolDir===-1?'Draw to SSL':'Neutral'} @ ${n(d.dolTarget)} | ${['Neutral','Active','Reached'][d.dolStatus]}`],
    ['DOL DETAIL',`Dist ${n(d.dolDistance)} | ${d.dolAlign===1?'With Bias':d.dolAlign===-1?'Against Bias':'Neutral'}`],
    ['POI',`${poiName} | ${poi?.lifecycle||'None'} | ${d.poiPriority===2?'Main':d.poiPriority===1?'Secondary':'Ignore'}`],
    ['POI PRICE',`${range(poi)} | CE ${n(poi?.ce)}`],['POI DETAIL',`Dist ${n(d.poiDistance)} | ${zone(d.poiLocation)}`],
    ['POSISI',`${zone(d.priceZone)} | ${d.locationStatus===1?'Healthy':d.locationStatus===-1?'Bad Location':'Neutral'}`],
    ['RANGE',`H ${n(d.rangeHigh)} | L ${n(d.rangeLow)} | EQ ${n(d.eqLow)} – ${n(d.eqHigh)}`],
    ['INVALID',`${invalid} | Level ${n(d.invalidLevel)} | Dist ${d.invalidLevel!=null?n(Math.abs(d.candle.close-d.invalidLevel)):'—'}`],
    ['ALASAN INTI',`${d.mssDir===1?'M15 Bullish':d.mssDir===-1?'M15 Bearish':'M15 Neutral'} | ${d.sweepStatus===1?'Fresh Sweep':'Tunggu Sweep'} | ${poiName}`]];
}
// Compact copy reads server flags only; full narration stays in Detail.
export function mappingWarnings(amy,news=null){
  if(!amy)return [];
  const d=amy.dashboard,e=amy.entry,warnings=[];
  if(news?.status==='NEWS_LOCK')warnings.push('NEWS LOCK · Tunda eksekusi.');
  if(e?.m5Invalid)warnings.push('Close M5 melewati invalidasi · tunggu close M15.');
  else if(d?.invalidStatus===2)warnings.push('Setup batal · tunggu struktur baru.');
  else if(d?.invalidStatus===1)warnings.push(`Dekat invalidasi ${n(d.invalidLevel)}.`);
  if(e?.winDir&&d?.biasDir&&e.winDir!==d.biasDir)warnings.push(`Skor ${e.winDir===1?'BUY':'SELL'} berlawanan bias M15 · tunggu struktur baru.`);
  return warnings;
}
export function compactChartNarration(amy,news=null){
  const warnings=mappingWarnings(amy,news);
  if(warnings.length)return warnings.slice(0,2);
  return (amy?.entry?.text||'Menunggu candle tertutup.').split('\n').filter(Boolean).slice(0,2);
}
const rowNames={'PROTECTED':'Protected swing','LIQUIDITY':'Likuiditas','SWEEP PRICE':'Harga sweep','DOL':'Target DOL','DOL DETAIL':'Jarak DOL','POI PRICE':'Area & CE','POI DETAIL':'Lokasi POI','RANGE':'Dealing Range','INVALID':'Invalidasi','ALASAN INTI':'Ringkasan'};
const layerNames={bias:'Bias M15',sweep:'Liquidity sweep',poi:'Area POI',poiBonus:'Reaksi POI',dol:'Target DOL',location:'Premium / Discount',displacement:'Displacement M5',structure:'Break struktur M5',asia:'Level Asia'};
const readable=text=>String(text).replaceAll('NO CLEAR BIAS','Bias belum jelas').replaceAll('EQ Zone','Zona EQ').replaceAll('Near Invalid','Dekat invalidasi').replaceAll('No Bias','Tanpa bias').replaceAll('Against Bias','Lawan bias').replaceAll('With Bias','Searah bias').replaceAll('Bad Location','Lokasi kurang ideal').replaceAll('Healthy','Lokasi sesuai').replaceAll('Reached','Tercapai').replaceAll('Active','Aktif').replaceAll('Secondary','Tambahan').replaceAll('Ignore','Abaikan').replaceAll('Main','Utama').replaceAll('None','Belum ada').replaceAll('Fresh','Baru').replaceAll('Old','Lama').replaceAll('Dist ','Jarak ').replaceAll('Extreme ','Ekstrem ').replaceAll('Draw to ','Menuju ');
export function isGoldMarketOpen(nowSeconds = Math.floor(Date.now() / 1000)) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short'
    }).formatToParts(new Date(nowSeconds * 1000));
    const values = Object.fromEntries(parts.map(x => [x.type, x.value]));
    const weekday = values.weekday;
    const hour = Number(values.hour) + Number(values.minute) / 60;
    if (weekday === 'Sat') return false;
    if (weekday === 'Sun') return hour >= 17;
    if (weekday === 'Fri') return hour < 17;
    if (hour >= 17 && hour < 18) return false;
    return true;
  } catch (_) {
    const d = new Date(nowSeconds * 1000);
    const day = d.getUTCDay();
    return day !== 0 && day !== 6;
  }
}
export function detectLiquiditySweep(amy, context = null) {
  if (!amy) return null;
  const d = amy.dashboard;
  const e = amy.entry;
  const trg = amy.trigger;
  const ctx = context || (typeof window !== 'undefined' ? window.AmyMarketContext : null);
  const levels = amy.levels || ctx?.levels || ctx?.keyLevels || {};
  const c = trg?.candle || d?.candle || amy.candle || (amy.chartCandles && amy.chartCandles.length ? amy.chartCandles[amy.chartCandles.length - 1] : null);
  const lines = (e?.text || '').split('\n').map(s => s.trim()).filter(Boolean);
  const liqList = Array.isArray(ctx?.liquidity) ? ctx.liquidity : [];

  const num = x => (x != null && Number.isFinite(Number(x))) ? Number(x) : null;

  // 1. Asia High / Asia Low sweep
  const asiaHigh = num(levels.asiaHigh ?? ctx?.keyLevels?.asiaHigh);
  const asiaLow = num(levels.asiaLow ?? ctx?.keyLevels?.asiaLow);
  const liqAsiaHighSwept = liqList.find(l => /asia\s*high/i.test(l.label) && /swept/i.test(l.status));
  const liqAsiaLowSwept = liqList.find(l => /asia\s*low/i.test(l.label) && /swept/i.test(l.status));
  const textAsiaHigh = lines.some(l => /asia\s*high.*swept/i.test(l));
  const textAsiaLow = lines.some(l => /asia\s*low.*swept/i.test(l));

  if (liqAsiaHighSwept || textAsiaHigh || (c && asiaHigh && c.high > asiaHigh && c.close < asiaHigh)) {
    const lvl = num(liqAsiaHighSwept?.level) || asiaHigh || (c ? c.high : 0);
    const ext = (c && c.high > lvl) ? c.high : (lvl ? lvl + 1.20 : 0);
    return { name: 'Asia High', level: lvl, extreme: ext, side: 'SELL' };
  }
  if (liqAsiaLowSwept || textAsiaLow || (c && asiaLow && c.low < asiaLow && c.close > asiaLow)) {
    const lvl = num(liqAsiaLowSwept?.level) || asiaLow || (c ? c.low : 0);
    const ext = (c && c.low < lvl) ? c.low : (lvl ? lvl - 1.20 : 0);
    return { name: 'Asia Low', level: lvl, extreme: ext, side: 'BUY' };
  }

  // 2. PDH / PDL sweep
  const pdh = num(levels.pdh ?? ctx?.keyLevels?.pdh);
  const pdl = num(levels.pdl ?? ctx?.keyLevels?.pdl);
  const liqPdhSwept = liqList.find(l => /pdh|previous\s*day\s*high/i.test(l.label) && /swept/i.test(l.status));
  const liqPdlSwept = liqList.find(l => /pdl|previous\s*day\s*low/i.test(l.label) && /swept/i.test(l.status));
  const textPdh = lines.some(l => /pdh.*swept/i.test(l));
  const textPdl = lines.some(l => /pdl.*swept/i.test(l));

  if (liqPdhSwept || textPdh || (c && pdh && c.high > pdh && c.close < pdh)) {
    const lvl = num(liqPdhSwept?.level) || pdh || (c ? c.high : 0);
    const ext = (c && c.high > lvl) ? c.high : (lvl ? lvl + 1.20 : 0);
    return { name: 'PDH', level: lvl, extreme: ext, side: 'SELL' };
  }
  if (liqPdlSwept || textPdl || (c && pdl && c.low < pdl && c.close > pdl)) {
    const lvl = num(liqPdlSwept?.level) || pdl || (c ? c.low : 0);
    const ext = (c && c.low < lvl) ? c.low : (lvl ? lvl - 1.20 : 0);
    return { name: 'PDL', level: lvl, extreme: ext, side: 'BUY' };
  }

  // 3. BSL / SSL sweep
  const dSweepPrice = num(d?.sweep?.price);
  const dSweepExtreme = num(d?.sweep?.extreme);
  const dSweepDir = num(d?.sweep?.dir) ?? (d?.sweepDir || 0);

  const trgSweepDir = num(trg?.sweepDir) || 0;
  const trgSweptPrice = num(trg?.sweptPrice);
  const trgSweepExtreme = num(trg?.sweepExtreme);

  const bslLevel = num(d?.bsl) || num(levels.bsl) || num(liqList.find(l => l.label === 'BSL')?.level) || num(d?.protectedHigh);
  const sslLevel = num(d?.ssl) || num(levels.ssl) || num(liqList.find(l => l.label === 'SSL')?.level) || num(d?.protectedLow);

  const hasSslSweep = (d?.sweepStatus === 1 && dSweepDir === 1) ||
    (trgSweepDir === 1) ||
    lines.some(l => /ssl.*swept/i.test(l)) ||
    liqList.some(l => l.label === 'SSL' && /swept/i.test(l.status));

  const hasBslSweep = (d?.sweepStatus === 1 && dSweepDir === -1) ||
    (trgSweepDir === -1) ||
    lines.some(l => /bsl.*swept/i.test(l)) ||
    liqList.some(l => l.label === 'BSL' && /swept/i.test(l.status));

  if (hasSslSweep) {
    const lvl = (dSweepDir === 1 && dSweepPrice) || (trgSweepDir === 1 && trgSweptPrice) || sslLevel || (c ? c.low : 2642.50);
    const ext = (dSweepDir === 1 && dSweepExtreme) || (trgSweepDir === 1 && trgSweepExtreme) || (c && c.low < lvl ? c.low : lvl - 1.70);
    return { name: 'SSL', level: lvl, extreme: ext, side: 'BUY' };
  }

  if (hasBslSweep) {
    const lvl = (dSweepDir === -1 && dSweepPrice) || (trgSweepDir === -1 && trgSweptPrice) || bslLevel || (c ? c.high : 2665.30);
    const ext = (dSweepDir === -1 && dSweepExtreme) || (trgSweepDir === -1 && trgSweepExtreme) || (c && c.high > lvl ? c.high : lvl + 1.70);
    return { name: 'BSL', level: lvl, extreme: ext, side: 'SELL' };
  }

  // 4. Any line containing "swept"
  if (lines.some(l => l.toLowerCase().includes('swept'))) {
    const isSsl = lines.some(l => /ssl/i.test(l));
    const name = isSsl ? 'SSL' : 'BSL';
    const lvl = isSsl ? (sslLevel || (c ? c.low : 2642.50)) : (bslLevel || (c ? c.high : 2665.30));
    const ext = isSsl ? (c && c.low < lvl ? c.low : lvl - 1.70) : (c && c.high > lvl ? c.high : lvl + 1.70);
    return { name, level: lvl, extreme: ext, side: isSsl ? 'BUY' : 'SELL' };
  }

  return null;
}

export function renderLiveAssistant(amy,news=null,settings={},context=null){
  const root=document.getElementById('amy-live-assistant');
  const badgeEl=document.getElementById('assistant-badge');
  const primaryEl=document.getElementById('assistant-primary-msg');
  const subEl=document.getElementById('assistant-sub-msg');
  const confEl=document.getElementById('assistant-confluence-tag');
  const clockEl=document.getElementById('assistant-clock');
  if(!root||!badgeEl||!primaryEl||!subEl)return;

  const ctx=context||(typeof window!=='undefined'?window.AmyMarketContext:null);
  const isClosed=!isGoldMarketOpen()||ctx?.session==='PASAR TUTUP'||(typeof window!=='undefined'&&window.AmyMarketContext?.session==='PASAR TUTUP');

  if(isClosed){
    badgeEl.textContent='PASAR TUTUP';
    badgeEl.className='assistant-badge badge-neutral';
    root.className='amy-live-assistant';
    primaryEl.textContent='Pasar Gold (XAU/USD) Sedang Tutup';
    subEl.textContent='Perdagangan libur akhir pekan / di luar jam pasar. Notifikasi live dinonaktifkan hingga sesi buka.';
    if(confEl)confEl.innerHTML='Status: <strong style="color:#94A3B8">OFFLINE</strong> (Weekend)';
    if(clockEl)clockEl.textContent='Market Closed';
    return;
  }

  if(!amy){
    badgeEl.textContent='STANDBY';
    badgeEl.className='assistant-badge badge-neutral';
    root.className='amy-live-assistant';
    primaryEl.textContent='Memeriksa aksi harga M15 / M5...';
    subEl.textContent='Menunggu data candle tertutup server.';
    if(confEl)confEl.textContent='Confluence: —';
    if(clockEl)clockEl.textContent='Live Sync';
    return;
  }

  const d=amy.dashboard,e=amy.entry,ast=amy.assistant||null,plan=ast?.plan||amy.plan||null;
  const lines=(e?.text||'').split('\n').map(s=>s.trim()).filter(Boolean);
  let badge='STANDBY',badgeClass='badge-neutral',stateClass='';
  let primary=lines[0]||'Kondisi pasar seimbang';
  let sub='Menunggu konfirmasi candle tertutup.';
  let notify=false,notifTitle='',notifBody='';

  const mathZoneText=ast?.mathZone||(d?.priceZone===-1?'Diskon (Discount Zone)':d?.priceZone===1?'Premium Zone':'Equilibrium Zone');
  const antiChaseText=ast?.status==='READY'?'READY DI ZONA':ast?.status==='MISSED'?'MISSED - JANGAN KEJAR':'STANDBY';
  const sweepInfo=detectLiquiditySweep(amy,context);

  if(news?.status==='NEWS_LOCK'){
    badge='NEWS LOCK';badgeClass='badge-news';stateClass='assistant-state-news';
    primary='🛡️ Tunda Eksekusi: Berita High-Impact Berlangsung';
    sub=news.note||'Pasar sangat liar dan rawan slippage. Jangan entry sebelum volatilitas stabil.';
    notify=true;notifTitle='🛡️ Asisten Amy: NEWS LOCK Aktif';notifBody=sub;
  }else if(d?.invalidStatus===2){
    badge='SETUP BATAL';badgeClass='badge-invalid';stateClass='assistant-state-invalid';
    primary='⚠️ Setup Batal: Harga Melewati Level Invalidasi';
    sub=`Close M15 menembus batas pembatalan ${d.invalidLevel?n(d.invalidLevel):''}. Tunggu pembentukan struktur baru.`;
    notify=true;notifTitle='⚠️ Asisten Amy: Setup Batal (Invalid)';notifBody=sub;
  }else if(ast&&(ast.signalType===1||(ast.rawSignalType===1&&ast.status==='READY'))){
    badge='BUY ENTRY';badgeClass='badge-bull';stateClass='assistant-state-bull';
    primary=`🟢 BUY ENTRY · ${ast.signalName||'Trend Buy'}`;
    sub=`Anti-Chase: READY · Math Zone: ${mathZoneText} · Entry ${plan?.entry!=null?n(plan.entry):'—'}`;
    notify=true;notifTitle='🟢 Asisten Amy: BUY ENTRY';notifBody=`${primary}. ${sub}`;
  }else if(ast&&(ast.signalType===-1||(ast.rawSignalType===-1&&ast.status==='READY'))){
    badge='SELL ENTRY';badgeClass='badge-bear';stateClass='assistant-state-bear';
    primary=`🔴 SELL ENTRY · ${ast.signalName||'Trend Sell'}`;
    sub=`Anti-Chase: READY · Math Zone: ${mathZoneText} · Entry ${plan?.entry!=null?n(plan.entry):'—'}`;
    notify=true;notifTitle='🔴 Asisten Amy: SELL ENTRY';notifBody=`${primary}. ${sub}`;
  }else if(ast&&(ast.signalType===-2||(ast.rawSignalType===-2&&ast.status==='READY'))){
    badge='PULLBACK SELL';badgeClass='badge-bear';stateClass='assistant-state-bear';
    primary='🟠 PULLBACK SELL (Pucuk Premium)';
    sub=`Anti-Chase: READY · Math Zone: ${mathZoneText} · Catatan: Sell ini pullback, bukan ubah bias utama`;
    notify=true;notifTitle='🟠 Asisten Amy: PULLBACK SELL';notifBody=`${primary}. ${sub}`;
  }else if(ast&&(ast.signalType===2||(ast.rawSignalType===2&&ast.status==='READY'))){
    badge='PULLBACK BUY';badgeClass='badge-bull';stateClass='assistant-state-bull';
    primary='🔵 PULLBACK BUY (Dasar Diskon)';
    sub=`Anti-Chase: READY · Math Zone: ${mathZoneText} · Catatan: Buy ini pullback, bukan ubah bias utama`;
    notify=true;notifTitle='🔵 Asisten Amy: PULLBACK BUY';notifBody=`${primary}. ${sub}`;
  }else if(ast&&ast.status==='MISSED'){
    badge='STANDBY';badgeClass='badge-warn';stateClass='assistant-state-sweep';
    primary=`⚠️ Sinyal ${ast.rawSignalType===1?'BUY':ast.rawSignalType===-1?'SELL':'PULLBACK'}: MISSED - JANGAN KEJAR`;
    sub=`Anti-Chase: MISSED - JANGAN KEJAR · Math Zone: ${mathZoneText} (Harga sudah menjauh)`;
  }else if(e?.rejectBuy||e?.rejectSell){
    const isBuy=Boolean(e?.rejectBuy);
    badge=isBuy?'BUY ENTRY':'SELL ENTRY';badgeClass=isBuy?'badge-bull':'badge-bear';
    stateClass=isBuy?'assistant-state-bull':'assistant-state-bear';
    primary=`🔥 Rejection Kuat di Area ${d?.poi?.kind||'POI'}`;
    sub=`Candle menolak ${isBuy?'bawah':'atas'} dengan wick panjang. Math Zone: ${mathZoneText} · Anti-Chase: ${antiChaseText}`;
    notify=true;notifTitle=`🔥 Asisten Amy: ${badge}`;notifBody=`${primary}. ${sub}`;
  }else if(sweepInfo){
    badge=`${sweepInfo.name.toUpperCase()} SWEPT`;
    badgeClass='badge-sweep';
    stateClass='assistant-state-sweep';
    primary=`💧 ${sweepInfo.name} @ ${n(sweepInfo.level)} Swept!`;
    sub=`Tersapu hingga ekor ${n(sweepInfo.extreme)}. Pantau pembentukan rejection untuk potensi ${sweepInfo.side}.`;
    notify=true;
    notifTitle=`💧 Asisten Amy: ${sweepInfo.name} @ ${n(sweepInfo.level)} Swept!`;
    notifBody=`${primary} ${sub}`;
  }else if(d?.biasDir){
    const isBull=d.biasDir===1;
    badge='STANDBY';badgeClass='badge-neutral';
    stateClass=isBull?'assistant-state-bull':'assistant-state-bear';
    primary=`Bias M15: ${isBull?'Bullish (Mencari Buy)':'Bearish (Mencari Sell)'} · STANDBY`;
    sub=`Anti-Chase: STANDBY · Math Zone: ${mathZoneText}`;
  }else{
    badge='STANDBY';badgeClass='badge-neutral';stateClass='';
    primary='Kondisi Pasar Netral / Belum Ada Bias Jelas';
    sub=`Anti-Chase: STANDBY · Math Zone: ${mathZoneText}`;
  }

  badgeEl.textContent=badge;
  badgeEl.className=`assistant-badge ${badgeClass}`;
  root.className=`amy-live-assistant ${stateClass}`.trim();
  primaryEl.textContent=primary;
  subEl.textContent=sub;

  if(confEl&&e){
    const scoreColor=e.score>=75?'#00e676':e.score>=60?'#ff9800':'#94A3B8';
    confEl.innerHTML=`Confluence: <strong style="color:${scoreColor}">${e.score}/100</strong> (${esc(e.grade)}) · Zone: <strong style="color:var(--amy-accent,#F5C451)">${esc(mathZoneText)}</strong>`;
  }
  if(clockEl){
    const nowStr=new Date().toLocaleTimeString('id-ID',{timeZone:'Asia/Makassar',hour:'2-digit',minute:'2-digit'})+' WITA';
    clockEl.textContent=`M5: ${nowStr}`;
  }

  const m5Time = amy.source?.M5;
  const nowSec = Math.floor(Date.now() / 1000);
  const isStale = !m5Time || (nowSec - m5Time > 1800);

  if(notify && notifTitle && settings?.assistantNotif !== false && !isStale && m5Time){
    try{
      const timeKey = m5Time;
      const eventKey = `${badge}|${timeKey}`;
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('amyfx_notified_assistant_events') : null;
      const notified = raw ? JSON.parse(raw) : {};
      if(!notified[eventKey]){
        notified[eventKey] = Date.now();
        const keys = Object.keys(notified).slice(-40), trimmed = {};
        keys.forEach(k => trimmed[k] = notified[k]);
        localStorage.setItem('amyfx_notified_assistant_events', JSON.stringify(trimmed));
        const targetUrl = typeof location !== 'undefined' ? `${location.href.split('#')[0]}#Dashboard` : null;
        if(typeof window !== 'undefined' && window.Android?.showNotificationWithUrl){
          window.Android.showNotificationWithUrl(notifTitle, notifBody, targetUrl);
        }else if(typeof Notification !== 'undefined' && Notification.permission === 'granted'){
          new Notification(notifTitle, { body: notifBody });
        }
      }
    }catch(_){}
  }
}

export function renderBiasDashboardV2(amy,context=null){
  const tbody=document.getElementById('bias-table-body'),headerEl=document.getElementById('bias-table-header');
  if(!tbody)return;
  if(!amy||!amy.dashboard){
    tbody.innerHTML='<tr><td colspan="2" style="text-align:center; padding:16px; color:var(--muted);">Menunggu konteks server yang segar...</td></tr>';
    if(headerEl)headerEl.textContent='AMY ICT — M15 CURRENT MAPPING';
    return;
  }
  const d=amy.dashboard;
  if(headerEl){
    const stateText=context?.marketState||(d.biasDir===1?'BULLISH':d.biasDir===-1?'BEARISH':'NEUTRAL');
    headerEl.textContent=`AMY ICT — M15 CURRENT MAPPING · ${stateText}`;
  }
  const rows=dashboardRows(amy);
  tbody.innerHTML=rows.map(([key,val])=>{
    let valClass='';
    const upperVal=String(val).toUpperCase();
    if(key==='BIAS'){
      valClass=upperVal.includes('NAIK')||upperVal.includes('BUY')?'bias-val-bull':upperVal.includes('TURUN')||upperVal.includes('SELL')?'bias-val-bear':'';
    }else if(key==='STRUKTUR'){
      valClass=upperVal.includes('BULLISH')?'bias-val-bull':upperVal.includes('BEARISH')?'bias-val-bear':'';
    }else if(key==='SWEEP'){
      valClass=upperVal.includes('SWEPT')?'bias-val-sweep':'';
    }else if(key==='DOL'){
      valClass=upperVal.includes('REACHED')?'bias-val-bull':upperVal.includes('ACTIVE')?'bias-val-gold':'';
    }else if(key==='POSISI'){
      valClass=upperVal.includes('DISCOUNT')?'bias-val-bull':upperVal.includes('PREMIUM')?'bias-val-warn':'';
    }else if(key==='INVALID'){
      valClass=upperVal.includes('NEAR')||upperVal.includes('INVALID')?'bias-val-bear':'bias-val-bull';
    }else if(key==='ALASAN INTI'){
      valClass='bias-val-gold';
    }
    return `<tr><td class="bias-key-col">${esc(key)}</td><td class="bias-val-col ${valClass}">${esc(val)}</td></tr>`;
  }).join('');
}

export function renderEntryAssistantPlan(amy,context=null){
  const planEl=document.getElementById('amy-entry-assistant-v3');
  if(!planEl)return;
  const ast=amy?.assistant||null,plan=ast?.plan||amy?.plan||null;
  const badgeEl=document.getElementById('plan-signal-badge');
  const antiChaseEl=document.getElementById('plan-anti-chase-pill');
  const mathZoneEl=document.getElementById('plan-math-zone');
  const pullbackEl=document.getElementById('plan-pullback-notice');
  const entryVal=document.getElementById('plan-entry-val');
  const slVal=document.getElementById('plan-sl-val');
  const slSub=document.getElementById('plan-sl-sub');
  const tp1Val=document.getElementById('plan-tp1-val');
  const tp1Sub=document.getElementById('plan-tp1-sub');
  const tp2Val=document.getElementById('plan-tp2-val');
  const tp2Sub=document.getElementById('plan-tp2-sub');
  const reasonsEl=document.getElementById('plan-reasons-list');
  const btnChart=document.getElementById('btn-show-plan-chart');

  if(!plan){
    if(badgeEl){badgeEl.textContent='MENUNGGU KONFIRMASI';badgeEl.className='plan-badge badge-neutral';}
    if(antiChaseEl){antiChaseEl.textContent='STANDBY';antiChaseEl.className='anti-chase-pill pill-neutral';}
    if(mathZoneEl)mathZoneEl.textContent=`Math Zone: ${ast?.mathZone||'Menunggu zona terkonfirmasi'}`;
    if(pullbackEl)pullbackEl.style.display='none';
    if(entryVal)entryVal.textContent='—';
    if(slVal)slVal.textContent='—';if(slSub)slSub.textContent='Risk: —';
    if(tp1Val)tp1Val.textContent='—';if(tp1Sub)tp1Sub.textContent='RR: —';
    if(tp2Val)tp2Val.textContent='—';if(tp2Sub)tp2Sub.textContent='Runner: —';
    if(reasonsEl){
      const items=ast?.reasons&&ast.reasons.length?ast.reasons:['Menunggu konfirmasi candle tertutup M15 & M5.','Belum ada pemicu entry aktif di zona matematika.'];
      reasonsEl.innerHTML=items.map(r=>`<li>${esc(r)}</li>`).join('');
    }
    if(btnChart){btnChart.disabled=true;btnChart.style.opacity='0.5';btnChart.onclick=null;}
    return;
  }

  const isPullback=Math.abs(plan.signalType)===2||Boolean(ast?.isPullback);
  const isBuy=plan.side==='BUY';
  const badgeText=plan.signalName||(isPullback?(isBuy?'PULLBACK BUY':'PULLBACK SELL'):(isBuy?'BUY ENTRY':'SELL ENTRY'));
  const badgeClass=isBuy?'badge-bull':'badge-bear';

  if(badgeEl){badgeEl.textContent=badgeText;badgeEl.className=`plan-badge ${badgeClass}`;}
  if(antiChaseEl){
    if(ast?.status==='READY'||plan.status==='READY'){
      antiChaseEl.textContent='READY DI ZONA';antiChaseEl.className='anti-chase-pill pill-ready';
    }else if(ast?.status==='MISSED'||plan.status==='MISSED'){
      antiChaseEl.textContent='MISSED: Harga sudah menjauh dari entry';antiChaseEl.className='anti-chase-pill pill-missed';
    }else{
      antiChaseEl.textContent='STANDBY';antiChaseEl.className='anti-chase-pill pill-neutral';
    }
  }
  if(mathZoneEl)mathZoneEl.textContent=`Math Zone: ${ast?.mathZone||'Fibo OTE / SNR / POI'}`;
  if(pullbackEl){
    if(isPullback){
      pullbackEl.style.display='block';
      pullbackEl.innerHTML=`<span>⚠️ <strong>Catatan Khusus:</strong> ${isBuy?'Buy':'Sell'} ini pullback, bukan mengubah bias utama.</span>`;
    }else{
      pullbackEl.style.display='none';
    }
  }

  if(entryVal)entryVal.textContent=n(plan.entry);
  if(slVal)slVal.textContent=n(plan.sl);
  if(slSub)slSub.textContent=plan.risk?`Risk: ${n(plan.risk)} pts`:'Batas Risiko';
  if(tp1Val)tp1Val.textContent=n(plan.tp1);
  if(tp1Sub)tp1Sub.textContent=plan.rr1?`RR 1:${plan.rr1.toFixed(1)}`:'Target 1';
  if(tp2Val)tp2Val.textContent=n(plan.tp2);
  if(tp2Sub)tp2Sub.textContent=plan.rr2?`RR 1:${plan.rr2.toFixed(1)}`:'Target 2';

  if(reasonsEl){
    const items=ast?.reasons&&ast.reasons.length?ast.reasons:(plan.reason||'').split('\n').filter(Boolean);
    reasonsEl.innerHTML=items.map(r=>`<li>${esc(r)}</li>`).join('');
  }

  if(btnChart){
    btnChart.disabled=false;btnChart.style.opacity='1';
    btnChart.onclick=()=>{
      window.dispatchEvent(new CustomEvent('amyfx:driver-plan',{detail:{id:'assistant-v3',entry:plan.entry,sl:plan.sl,tp1:plan.tp1,tp:plan.tp2,label:plan.signalName}}));
      window.dispatchEvent(new CustomEvent('amyfx:assistant-plan',{detail:plan}));
      window.setTab?.('Dashboard');
      document.getElementById('chart')?.scrollIntoView({behavior:'smooth',block:'center'});
    };
  }
}

export function renderAmy(amy,settings,news=null,context=null){
  const dash=document.getElementById('amy-dashboard'),assistant=document.getElementById('amy-assistant'),score=document.getElementById('amy-score-panel');
  const alert=document.getElementById('mapping-alert');if(alert){const warnings=mappingWarnings(amy,news);alert.hidden=!warnings.length;alert.textContent=warnings.join(' ');}
  if(dash){dash.hidden=!settings.dashboard;dash.innerHTML=amy?`<div class="section-heading"><h2>Rincian bias M15</h2><span>Candle tertutup</span></div><dl class="amy-dashboard">${dashboardRows(amy).map(([a,b])=>`<div><dt>${esc(rowNames[a]||a)}</dt><dd>${esc(readable(b))}</dd></div>`).join('')}</dl>`:'<p>Menunggu konteks server yang segar.</p>';}
  if(assistant){assistant.hidden=false;assistant.innerHTML=amy?`<h2>Entry Assistant · M5</h2><p class="amy-narration">${esc(news?.status==='NEWS_LOCK'?news.note:amy.entry.text)}</p><small>Skor confluence adalah poin model, bukan peluang menang.</small>`:'<p>Menunggu candle tertutup.</p>';}
  if(score){score.hidden=!settings.panel;const e=amy?.entry;score.innerHTML=e?`<h2>${esc(e.grade)} · ${e.score}/100 poin</h2><p>BUY ${e.buy} | SELL ${e.sell} · ${directions(e.winDir)}</p><table class="amy-score-table"><thead><tr><th>Lapisan</th><th>BUY</th><th>SELL</th></tr></thead><tbody>${Object.keys(e.breakdown.buy||{}).map(k=>`<tr><td>${esc(layerNames[k]||k)}</td><td>${e.breakdown.buy[k]}</td><td>${e.breakdown.sell[k]}</td></tr>`).join('')}</tbody></table><small>Skor mentah dibatasi 100; dekat invalidasi: skor × 0.7.</small>`:'<p>Skor belum tersedia.</p>';}
  renderLiveAssistant(amy,news,settings,context);
  renderBiasDashboardV2(amy,context);
  renderEntryAssistantPlan(amy,context);
}

export function mountDisplay(onChange){
  const container=document.getElementById('ict-controls');let settings=loadDisplay();
  const check=(key,label)=>`<label><input type="checkbox" data-ict="${key}" ${settings[key]?'checked':''}> ${label}</label>`;
  const choices={Present:'Terbaru',Historical:'Riwayat',All:'Semua',Clean:'Ringkas','Major Only':'Level utama',NONE:'Nonaktif',D:'Harian',W:'Mingguan',M:'Bulanan'};
  const select=(key,label,values)=>`<label>${label}<select data-ict="${key}">${values.map(v=>`<option value="${v}" ${settings[key]===v?'selected':''}>${choices[v]||v}</option>`).join('')}</select></label>`;
  const number=(key,label,min,max)=>`<label>${label}<input type="number" data-ict="${key}" value="${settings[key]}" min="${min}" max="${max}"></label>`;
  container.innerHTML=`<details class="settings-group"><summary>Struktur &amp; zona ICT</summary><fieldset><legend>Referensi visual</legend>${select('mode','Mode',['Present','Historical'])}${check('structure','Market Structure')}${check('mss','MSS')}${check('bos','BOS')}${check('displacement','Displacement')}${check('ob','Order Blocks')}${check('breaker','Breaker Blocks')}${check('polarity','Label perubahan OB')}${check('liquidity','Zona likuiditas')}${check('fvg','Fair Value Gaps')}${select('gapType','Jenis gap',['FVG','IFVG'])}${check('bpr','Balance Price Range')}${check('vi','Volume Imbalance')}${check('nwog','NWOG')}${check('ndog','NDOG')}${number('visible','Zona per arah',1,20)}${number('bullOb','Bull OB',0,20)}${number('bearOb','Bear OB',0,20)}${number('nwogCount','Jumlah NWOG',0,50)}${number('ndogCount','Jumlah NDOG',0,50)}</fieldset></details>
    <details class="settings-group"><summary>Pivot &amp; Key Levels</summary><fieldset><legend>Level harga</legend>${check('pivots','Pivot Levels')}${select('pivotTf','Sumber Pivot',['D','W','M'])}${select('pivotMode','Mode Pivot',['All','Clean','Major Only'])}${number('nearAtr','Jarak ATR',.5,20)}${check('keyLevels','Key Levels')}${check('mo','Midnight Open NY')}${check('pdh','PDH')}${check('pdl','PDL')}${check('bsl','BSL')}${check('ssl','SSL')}${check('asia','Asia High/Low (NY 20–00)')}</fieldset></details>
    <details class="settings-group"><summary>Fibonacci &amp; Killzones</summary><fieldset><legend>Sesi &amp; Fibonacci</legend>${select('fib','Fibonacci dari',['NONE','FVG','BPR','OB','Liq','VI','NWOG'])}${check('fibExtend','Perpanjang Fibonacci')}${check('killzones','Warna sesi Killzones')}${check('ny','New York')}${check('londonOpen','London Open')}${check('londonClose','London Close')}${check('asian','Asian')}</fieldset></details>
    <details class="settings-group"><summary>Label &amp; panel</summary><fieldset><legend>Informasi chart</legend>${check('dashboard','Rincian bias M15')}${check('panel','Rincian skor')}${check('narration','Ringkasan di chart')}${check('assistantNotif','Notifikasi HP Asisten (Sweep/Break/POI)')}${check('signals','Marker Strong / Ready')}${check('labels','Label harga')}${number('backBars','Candle ke kiri',10,500)}${number('rightBars','Candle ke kanan',5,300)}${number('lineWidth','Tebal garis',1,4)}</fieldset></details><button type="button" id="ict-reset">Reset tampilan</button>`;
  container.addEventListener('change',event=>{const el=event.target,key=el.dataset.ict;if(!key)return;
    if(el.type==='checkbox')settings[key]=el.checked;else if(el.type==='number')settings[key]=Math.min(+el.max,Math.max(+el.min,+el.value||+el.min));else settings[key]=el.value;
    try{localStorage.setItem('amyfx.ict.display.v2',JSON.stringify(settings));}catch{}onChange({...settings});});
  container.querySelector('#ict-reset').addEventListener('click',()=>{try{localStorage.removeItem('amyfx.ict.display.v2');}catch{}location.reload();});
  return settings;
}
