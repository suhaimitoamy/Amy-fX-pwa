import {MODEL} from './engine.js';
export const SNAPSHOT_KEY='amyfx.ict.mapping.v1';
export function makeSnapshot(result, now=Date.now()) {
  return {model:MODEL.id, signal:result.signal, tf:result.tf, fresh:result.fresh,
    sourceTime:result.sourceTime, capturedAt:now, close:result.candles.at(-1)?.close ?? null,
    context:result.context, stage:result.stage, session:result.session, levels:result.levels,
    reason:result.reason, plan:result.plan?JSON.parse(JSON.stringify(result.plan)):null};
}
export function validSnapshot(value) {
  return value?.model===MODEL.id && ['M5','M15'].includes(value.tf)
    && Number.isFinite(value.close) && value.close>0 && Number.isFinite(value.sourceTime)
    && Array.isArray(value.levels);
}
export function isFresh(value, now=Date.now()) {
  const duration=value?.tf==='M5'?300:900;
  const age=now/1000-Number(value?.sourceTime);
  return validSnapshot(value) && value.fresh===true && age>=duration && age<=duration*2+120;
}
// Grouping is presentation only: at most $1 from the first pivot in each band.
// It never moves a Mapping level, changes its lifecycle, or infers order volume.
export function liquidityBands(snapshot) {
  if(!validSnapshot(snapshot))return [];
  const levels=snapshot.levels.filter(l=>!l.used && Number.isFinite(l.level) && l.level>0
    && ((l.kind==='high' && l.level>snapshot.close)||(l.kind==='low' && l.level<snapshot.close)));
  const bands=[];
  for(const kind of ['high','low']) {
    let band=null;
    for(const level of levels.filter(l=>l.kind===kind).sort((a,b)=>a.level-b.level)) {
      if(!band || level.level-band.low>1) {
        band={type:kind==='high'?'BSL':'SSL',low:level.level,high:level.level,levels:[]};bands.push(band);
      }
      band.high=level.level;band.levels.push(level);
    }
  }
  return bands.sort((a,b)=>b.high-a.high);
}
export function nearestLevels(snapshot) {
  const bands=liquidityBands(snapshot);
  const bsl=bands.filter(b=>b.type==='BSL').flatMap(b=>b.levels).sort((a,b)=>a.level-b.level)[0];
  const ssl=bands.filter(b=>b.type==='SSL').flatMap(b=>b.levels).sort((a,b)=>b.level-a.level)[0];
  return {bsl:bsl?.level??null,ssl:ssl?.level??null};
}
