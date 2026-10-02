// Read-only presentation of the deployed cloud lifecycle. No local trade signals.
export const ENDPOINT='https://amy-fx.vercel.app/api/scalper-setups';
const pending=new Set(['WAITING_TRIGGER','WAITING_NEXT_OPEN','ENTRY_READY']);
const active=new Set(['ACTIVE','BE_ACTIVE']);
export const terminal=new Set(['TP_HIT','SL_HIT','BE_HIT','TIME_EXIT','INVALIDATED','CANCELLED']);
export const number=value=>value!==null && value!=='' && value!==undefined && Number.isFinite(Number(value)) && Number(value)>0?Number(value):null;
export function timestamp(value){const n=Number(value);if(Number.isFinite(n)&&n>0)return n>1e10?n:n*1000;return Date.parse(value)||0;}
export function engineFresh(payload,now=Date.now()){
  const time=timestamp(payload?.engine?.completed_at);
  return payload?.ok===true && payload?.engine?.result?.ok!==false && payload?.engine?.result?.skipped!==true && String(payload?.engine?.status).toUpperCase()==='COMPLETED' && time>0 && now-time>=-30000 && now-time<=150000;
}
export function setupView(setup,fresh,now=Date.now()){
  const direction=['BUY','SELL'].includes(setup.direction)?setup.direction:null;
  const entry=number(setup.entry),sl=number(setup.stopLoss),tp1=number(setup.tp1),tp2=number(setup.tp2??setup.target);
  const sign=direction==='BUY'?1:-1;
  const geometry=Boolean(direction&&entry&&sl&&tp2&&(entry-sl)*sign>0&&(tp2-entry)*sign>0);
  const evaluated=timestamp(setup.lastEvaluatedOpenTime || (pending.has(setup.status)?setup.signalCandleCloseTime:setup.entryTimestamp||setup.entryCandleOpenTime));
  const timeframeSeconds=({M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400})[setup.timeframe]||900;
  const recent=evaluated>0&&now-evaluated>=-30000&&now-evaluated<=(pending.has(setup.status)?timeframeSeconds+150:210)*1000;
  const expired=timestamp(setup.entryTimestamp||setup.entryCandleOpenTime)>0&&number(setup.maxHoldSeconds)&&now>timestamp(setup.entryTimestamp||setup.entryCandleOpenTime)+Number(setup.maxHoldSeconds)*1000;
  const actionable=fresh&&recent&&!expired&&geometry&&setup.recommendationStatus==='VALID'&&setup.status==='ACTIVE';
  let label=terminal.has(setup.status)?setup.status.replaceAll('_',' '):pending.has(setup.status)?'MENUNGGU KONFIRMASI':active.has(setup.status)?'AKTIF DI SERVER':'STATUS BELUM DIKENAL';
  let note=terminal.has(setup.status)?'Setup selesai. Level ini adalah catatan historis.':pending.has(setup.status)?'Tunggu trigger/open berikutnya; level belum menjadi entry aktif.':'Level milik setup server; bukan instruksi mengejar harga saat ini.';
  if(!terminal.has(setup.status)&&(!fresh||!recent||expired)){label='DATA TERLAMBAT · WAIT';note='Tunggu evaluasi server terbaru sebelum menggunakan level ini.';}
  else if(actionable)label=`${direction} · SETUP AKTIF`;
  else if(!geometry&&!terminal.has(setup.status))note='Entry, SL, atau target belum lengkap/valid. Tunggu pembaruan server.';
  else if(setup.recommendationStatus!=='VALID'&&!terminal.has(setup.status))note=`Status rekomendasi server: ${setup.recommendationStatus||'belum tersedia'}. Bukan entry baru.`;
  return {...setup,direction,entry,sl,tp1,tp2,geometry,actionable,label,note,rr:geometry?Math.abs(tp2-entry)/Math.abs(entry-sl):null};
}
export function setupList(payload,fresh,now=Date.now()){
  const seen=new Set();return (Array.isArray(payload?.active)?payload.active:[]).filter(s=>s&&s.id&&!seen.has(s.id)&&seen.add(s.id)&&!terminal.has(s.status)&&s.symbol==='XAU/USD').map(s=>setupView(s,fresh,now));
}
export async function loadSetups({headers,signal,selectedId='',fetcher=fetch}){
  const query=new URLSearchParams({limit:'100',history_limit:'100'});if(selectedId)query.set('setup_id',selectedId);
  const response=await fetcher(`${ENDPOINT}?${query}`,{headers:{Accept:'application/json',...headers},signal,cache:'no-store'});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const data=await response.json();if(data?.ok!==true||!Array.isArray(data.active)||!Array.isArray(data.history))throw new Error('Respons setup tidak lengkap');return data;
}
