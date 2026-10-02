import {SIX_ENGINE_VERSION} from '../engine/six-driver-definitions.js';
export function currentDriverEvaluation(payload,context,now=Date.now()/1000){
  const e=payload?.driverEvaluation;
  if(!context||e?.version!==SIX_ENGINE_VERSION||e.fresh!==true||!Array.isArray(e.drivers)||e.sourceTime!==context.source?.M5||now-e.generatedAt< -90||now-e.generatedAt>600)return null;
  return e;
}
export function driverSetupReady(setup,context,now=Date.now()/1000){
  if(!context||setup?.engineVersion!==SIX_ENGINE_VERSION||setup.recommendationStatus!=='VALID'||!['ACTIVE','BE_ACTIVE'].includes(setup.status)||!['SAFE','UPCOMING','MEDIUM_ALERT'].includes(context.news?.status))return false;
  const sign=setup.direction==='BUY'?1:setup.direction==='SELL'?-1:0;
  if(!sign||![setup.entry,setup.stopLoss,setup.target].every(x=>Number.isFinite(x)&&x>0)||(setup.target-setup.entry)*sign<=0||(setup.entry-setup.initialStopLoss)*sign<=0)return false;
  const source=Number(setup.lastEvaluatedOpenTime),hold=Number(setup.maxHoldSeconds),entryTime=Number(setup.entryCandleOpenTime);
  return source>0&&now-source>=0&&now-source<=900&&entryTime>0&&hold>0&&now<=entryTime+hold;
}
