// ICT-inspired operational model. Thresholds are explicit engineering choices,
// not claims of an official ICT formula or historically proven profitability.
export const MODEL = Object.freeze({ id: 'ICT-SWEEP-MSS-FVG-1', pivot: 2, atr: 14,
  bodyAtr: 0.8, bodyRatio: 0.6, stopAtr: 0.15, minRR: 2, expiryBars: 12, holdBars: 48 });
export const DURATIONS = Object.freeze({ M1: 60, M5: 300, M15: 900, H1: 3600 });
export function timestamp(value) {
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
    const n = Number(value); return n > 1e11 ? n / 1000 : n;
  }
  const s = String(value || '').replace(' ', 'T');
  return Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`) / 1000;
}
export function normalize(input, tf, now) {
  const duration = DURATIONS[tf];
  if (!duration || !Number.isFinite(now)) throw new Error('Timeframe/waktu tidak valid');
  const seen = new Map(); let rejected = 0;
  for (const raw of input || []) {
    const c = { time: timestamp(raw.time ?? raw.datetime ?? raw.open_time),
      open: Number(raw.open), high: Number(raw.high), low: Number(raw.low), close: Number(raw.close) };
    if (raw.isClosed === false || raw.closed === false || raw.synthetic || raw.amyfxSyntheticCurrent ||
        !Object.values(c).every(Number.isFinite) || c.time <= 0 || c.low <= 0 ||
        c.high < Math.max(c.open, c.close, c.low) || c.low > Math.min(c.open, c.close) ||
        c.time + duration > now - 10) { rejected++; continue; }
    if (seen.has(c.time) && JSON.stringify(seen.get(c.time)) !== JSON.stringify(c)) {
      throw new Error('Candle duplikat memiliki OHLC berbeda');
    }
    seen.set(c.time, c);
  }
  return { candles: [...seen.values()].sort((a,b) => a.time-b.time), rejected };
}
export function session(time) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23',
    hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(new Date(time * 1000));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  const minute = Number(p.hour)*60 + Number(p.minute);
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return 'CLOSED';
  return minute >= 120 && minute < 300 ? 'LONDON' : minute >= 420 && minute < 600 ? 'NEW_YORK' : 'OUTSIDE';
}
function atrAt(cs, i) {
  if (i < MODEL.atr) return null;
  let total = 0;
  for (let j=i-MODEL.atr; j<i; j++) total += Math.max(cs[j].high-cs[j].low,
    j ? Math.abs(cs[j].high-cs[j-1].close) : 0, j ? Math.abs(cs[j].low-cs[j-1].close) : 0);
  return total / MODEL.atr;
}
function pivots(cs, i, duration=3600) {
  const p = i-MODEL.pivot;
  if (p < MODEL.pivot) return [];
  const window = cs.slice(p-MODEL.pivot, i+1);
  if (window.some((c,j)=>j && c.time-window[j-1].time!==duration)) return [];
  return ['high','low'].filter(kind => window.every((c,j) => j===MODEL.pivot ||
    (kind==='high' ? cs[p][kind]>c[kind] : cs[p][kind]<c[kind])))
    .map(kind => ({ kind, level: cs[p][kind], time: cs[p].time, confirmed: cs[i].time, used: false }));
}
export function structure(cs) {
  const levels = []; let direction='WAIT', lastBreak=null;
  for (let i=0; i<cs.length; i++) {
    const c=cs[i];
    if (i && c.time-cs[i-1].time!==3600) { levels.length=0; direction='WAIT'; lastBreak=null; }
    const high=levels.filter(x=>x.kind==='high'&&!x.used).at(-1);
    const low=levels.filter(x=>x.kind==='low'&&!x.used).at(-1);
    if (high && c.close>high.level) { direction='BUY'; lastBreak={ ...high, brokenAt:c.time }; }
    if (low && c.close<low.level) { direction='SELL'; lastBreak={ ...low, brokenAt:c.time }; }
    for (const l of levels) if (l.kind==='high' ? c.close>l.level : c.close<l.level) l.used=true;
    levels.push(...pivots(cs,i));
  }
  const high=levels.filter(x=>x.kind==='high').at(-1), low=levels.filter(x=>x.kind==='low').at(-1);
  return { direction, lastBreak, high:high?.level??null, low:low?.level??null,
    midpoint: high && low && high.level>low.level ? (high.level+low.level)/2 : null };
}
export function advance(plan, candle, index, duration) {
  if (!['PENDING','ACTIVE'].includes(plan.status)) return plan;
  const p={...plan}; const buy=p.direction==='BUY';
  const stop=buy ? candle.low<=p.sl : candle.high>=p.sl;
  const target=buy ? candle.high>=p.tp : candle.low<=p.tp;
  if (p.status==='PENDING') {
    if (candle.time<=p.createdAt) return p;
    if (index-p.createdIndex>MODEL.expiryBars || ['OUTSIDE','CLOSED'].includes(session(candle.time))) {
      return {...p,status:'EXPIRED',endedAt:candle.time};
    }
    // A gap through the stop/target cannot be interpreted as a normal limit fill.
    if (buy ? candle.open<=p.sl || candle.open>=p.tp : candle.open>=p.sl || candle.open<=p.tp) {
      return {...p,status:'INVALIDATED',endedAt:candle.time};
    }
    const touch=candle.low<=p.entry && candle.high>=p.entry;
    if (!touch) return stop||target ? {...p,status:'INVALIDATED',endedAt:candle.time} : p;
    p.status='ACTIVE'; p.filledAt=candle.time; p.fillIndex=index;
    // OHLC cannot reveal intrabar ordering. Stop wins; target on fill bar is unknown.
    if (stop) return {...p,status:'SL',endedAt:candle.time,r:-1,ambiguous:true};
    if (target) return {...p,status:'AMBIGUOUS',endedAt:candle.time,ambiguous:true,r:null};
    return p;
  }
  if (candle.time<=p.filledAt) return p;
  if (stop) {
    const exit=buy?Math.min(candle.open,p.sl):Math.max(candle.open,p.sl);
    return {...p,status:'SL',endedAt:candle.time,r:(buy?exit-p.entry:p.entry-exit)/p.risk,ambiguous:target};
  }
  if (target) return {...p,status:'TP',endedAt:candle.time,r:p.rr};
  if (index-p.fillIndex>=MODEL.holdBars) return {...p,status:'TIME_EXIT',endedAt:candle.time,
    r:(buy?candle.close-p.entry:p.entry-candle.close)/p.risk};
  return p;
}
export function analyze({ candles, context, tf='M15', now=Date.now()/1000, degraded=false }) {
  if (!['M5','M15'].includes(tf)) throw new Error('Entry hanya M5 atau M15');
  const duration=DURATIONS[tf]; const ltf=normalize(candles,tf,now), htf=normalize(context,'H1',now);
  const cs=ltf.candles, hs=htf.candles, latest=cs.at(-1);
  const base={ model:MODEL.id, tf, candles:cs, context:structure(hs), rejected:ltf.rejected+htf.rejected,
    sourceTime:latest?.time??null, session:session(now), history:[], plan:null, signal:'WAIT', stage:'DATA',
    reason:'Menunggu setidaknya 40 candle entry dan 30 candle H1.', fresh:false, levels:[] };
  if (cs.length<40 || hs.length<30) return base;
  const levels=[], history=[]; let sweep=null, plan=null, reason='Menunggu sweep likuiditas searah struktur H1.';
  let previousContextCount=-1, bias=null;
  for (let i=0;i<cs.length;i++) {
    const c=cs[i], a=atrAt(cs,i);
    const closedContext=hs.filter(x=>x.time+3600<=c.time+duration);
    if (closedContext.length!==previousContextCount) { bias=structure(closedContext); previousContextCount=closedContext.length; }
    const contiguous=i===0 || c.time-cs[i-1].time===duration;
    if (!contiguous) {
      levels.length=0; sweep=null;
      if (plan && ['PENDING','ACTIVE'].includes(plan.status)) {
        plan={...plan,status:'DATA_GAP',endedAt:c.time,r:null}; history.push(plan); plan=null;
      }
    }
    if (plan?.status==='PENDING' && bias.direction!==plan.direction) {
      history.push({...plan,status:'INVALIDATED',endedAt:c.time}); plan=null; sweep=null;
    }
    if (plan) {
      plan=advance(plan,c,i,duration);
      if (!['PENDING','ACTIVE'].includes(plan.status)) { history.push(plan); plan=null; sweep=null; }
    }
    const active=levels.filter(l=>!l.used);
    const raids=active.filter(l=>l.kind==='low' ? c.low<l.level&&c.close>l.level : c.high>l.level&&c.close<l.level);
    // Mark first interaction forever, including close-through. No revived liquidity.
    for (const l of levels) if (l.kind==='low'?c.low<=l.level:c.high>=l.level) l.used=true;
    if (!plan && sweep) {
      const buy=sweep.direction==='BUY';
      if (i-sweep.index>MODEL.expiryBars || bias.direction!==sweep.direction ||
          (buy?c.low<sweep.extreme:c.high>sweep.extreme) || !contiguous) {
        sweep=null; reason='Setup batal: struktur berubah, sweep ditembus, atau waktu habis.';
      } else if (i>sweep.index && a>0) {
        const body=Math.abs(c.close-c.open), range=c.high-c.low;
        if (!sweep.mss && (buy?c.close>sweep.breakLevel:c.close<sweep.breakLevel) &&
            (buy?c.close>c.open:c.close<c.open) && body>=a*MODEL.bodyAtr && body/range>=MODEL.bodyRatio) {
          sweep={...sweep,mss:i,mssTime:c.time}; reason='MSS terkonfirmasi; menunggu FVG pada displacement.';
        }
        // FVG must be the imbalance surrounding the displaced MSS candle.
        if (sweep.mss!=null && i===sweep.mss+1 && i>=2 && cs[i-1].time-cs[i-2].time===duration) {
          const left=cs[i-2]; const lo=buy?left.high:c.high, hi=buy?c.low:left.low;
          if (hi>lo) {
            const entry=(hi+lo)/2, sl=sweep.extreme+(buy?-1:1)*a*MODEL.stopAtr;
            const risk=buy?entry-sl:sl-entry;
            const targets=levels.filter(l=>!l.used && l.kind===(buy?'high':'low') && (buy?l.level>entry:l.level<entry))
              .sort((x,y)=>Math.abs(x.level-entry)-Math.abs(y.level-entry));
            const tp=targets[0]?.level, rr=(buy?tp-entry:entry-tp)/risk;
            const location=bias.midpoint!=null && entry>=bias.low && entry<=bias.high && (buy?entry<=bias.midpoint:entry>=bias.midpoint);
            const contextFresh=closedContext.length>=30 && c.time+duration-(closedContext.at(-1)?.time+3600)<=3600+120;
            if (risk>0 && Number.isFinite(rr) && rr>=MODEL.minRR && location && contextFresh &&
                !['OUTSIDE','CLOSED'].includes(session(c.time+duration))) {
              plan={ id:`${MODEL.id}:${tf}:${sweep.time}:${c.time}`, direction:sweep.direction,status:'PENDING',
                createdAt:c.time,createdIndex:i,entry,sl,tp,risk,rr,fvg:{low:lo,high:hi},
                sweep:{time:sweep.time,level:sweep.level,extreme:sweep.extreme},
                mss:{time:sweep.mssTime,level:sweep.breakLevel}, contextBreak:bias.lastBreak };
              reason='FVG valid. Menunggu retest candle berikutnya; belum ada fill.';
            } else reason=!contextFresh?'Konteks H1 belum lengkap atau terlambat.':!location?'FVG berada di sisi dealing range yang tidak sesuai.':
              !Number.isFinite(rr)?'Tidak ada target likuiditas yang belum tersentuh.':rr<MODEL.minRR?'Target likuiditas terdekat kurang dari 2R.':'Di luar jendela entry.';
          } else reason='Displacement tidak membentuk FVG tiga candle.';
          sweep=null;
        }
      }
    }
    if (!plan && !sweep && i>=39 && a>0 && contiguous && closedContext.length>=30 && bias.direction!=='WAIT') {
      const buy=bias.direction==='BUY';
      const raid=raids.filter(l=>l.kind===(buy?'low':'high')).at(-1);
      const opposite=active.filter(l=>l.kind===(buy?'high':'low') && (buy?l.level>c.close:l.level<c.close)).at(-1);
      if (raid && opposite && !['OUTSIDE','CLOSED'].includes(session(c.time+duration))) {
        sweep={direction:bias.direction,index:i,time:c.time,level:raid.level,extreme:buy?c.low:c.high,breakLevel:opposite.level};
        reason='Sweep dan reclaim terkonfirmasi. Menunggu displacement yang menutup melewati swing lawan.';
      }
    }
    levels.push(...pivots(cs,i,duration));
  }
  const fresh=!degraded && now-(latest.time+duration)<=duration+120 && now-(hs.at(-1).time+3600)<=3720;
  const signal=fresh && plan?.status==='PENDING' && !['OUTSIDE','CLOSED'].includes(session(now)) ? plan.direction:'WAIT';
  return {...base, fresh, plan, history, levels:levels.filter(l=>!l.used).slice(-12), signal,
    stage:plan?.status || (sweep?.mss!=null?'FVG':sweep?'MSS':'SWEEP'),
    reason:!fresh?'Data terlambat/tidak tersedia. Analisis terakhir hanya untuk referensi.':plan?.status==='ACTIVE'?
      'Retest tercatat pada candle tertutup. Pantau posisi simulasi; jangan mengejar entry lama.':reason };
}
