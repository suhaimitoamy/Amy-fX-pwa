// AMY ICT engine: portable, deterministic, closed candles only. Browser copy is byte-checked.
// Dashboard V2 owns decisions; ICT base objects are separately named visual references.
export const AMY_POLICY = 'amy-ict-complete-pro376';
export const DEFAULTS = Object.freeze({
  swingLen:3,freshBars:8,nearAtr:.35,dispMult:1.2,minSweepTicks:1,tick:.01,triggerSwing:3,triggerDisp:1,rejectWick:1.20,baseLen:5,obLength:10,useBody:true,visible:2,
  retestAtr:.30,validBars:12,slBufferAtr:.20,tp1R:1.0,tp2R:2.0,fibShallow:.618,fibDeep:.786,zoneAtr:.35,maxChaseAtr:.75
});
const last=a=>a.at(-1), finite=Number.isFinite;
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const body=c=>Math.abs(c.close-c.open);
const overlaps=(c,z)=>c.low<=z.high&&c.high>=z.low;
const distance=(p,z)=>z?Math.max(0,z.low-p,p-z.high):null;
export function isWeekendGap(t1, t2) {
  if (!t1 || !t2 || t2 <= t1) return false;
  const gap = t2 - t1;
  if (gap < 44 * 3600 || gap > 56 * 3600) return false;
  if (gap === 172800) return true;
  try {
    const parts1 = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23'
    }).formatToParts(new Date(t1 * 1000));
    const parts2 = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23'
    }).formatToParts(new Date(t2 * 1000));
    const w1 = parts1.find(p => p.type === 'weekday')?.value;
    const h1 = Number(parts1.find(p => p.type === 'hour')?.value);
    const w2 = parts2.find(p => p.type === 'weekday')?.value;
    const h2 = Number(parts2.find(p => p.type === 'hour')?.value);
    return (w1 === 'Fri' && h1 >= 15 && h1 <= 18) && (w2 === 'Sun' && h2 >= 17 && h2 <= 23);
  } catch {
    return gap >= 46 * 3600 && gap <= 52 * 3600;
  }
}
export const pair=(a,b)=>Boolean(a&&b&&(a.close_time===b.open_time||isWeekendGap(a.close_time,b.open_time)));
const consecutive=rows=>rows.every((c,i)=>!i||pair(rows[i-1],c));
const number=(x)=>finite(x)?x.toFixed(2):'—';
const round=(x)=>finite(x)?Math.round(x*100)/100:null;
export function clean(rows,now=Infinity,duration=null){
  const out=new Map();
  for(const r of rows||[]){const c={open_time:+r.open_time,close_time:+r.close_time,open:+r.open,high:+r.high,low:+r.low,close:+r.close};
    if(r.is_closed===false||!Object.values(c).every(finite)||c.open_time<=0||c.close_time>now||c.close_time<=c.open_time||
      duration&&c.close_time-c.open_time!==duration||c.low<=0||c.low>Math.min(c.open,c.close)||c.high<Math.max(c.open,c.close))continue;
    out.set(c.open_time,c);
  }return [...out.values()].sort((a,b)=>a.open_time-b.open_time);
}
export function wilderAtr(candles,period=14){
  let value=null,seed=[];return candles.map((c,i)=>{
    if(i&&!pair(candles[i-1],c)){value=null;seed=[];}
    const prev=i&&pair(candles[i-1],c)?candles[i-1].close:c.open;
    const tr=Math.max(c.high-c.low,Math.abs(c.high-prev),Math.abs(c.low-prev));
    if(value==null){seed.push(tr);if(seed.length===period)value=mean(seed);}else value=(value*(period-1)+tr)/period;
    return value;
  });
}
// Pine pivot tie rule: newer equal extreme wins; never publish before right-hand bars close.
export function pivotAt(candles,end,left=3,right=left){
  const idx=end-right;if(idx<left)return {high:null,low:null};
  const window=candles.slice(idx-left,end+1),c=candles[idx];
  if(window.some((x,i)=>i&&!pair(window[i-1],x)))return {high:null,low:null};
  const high=window.every((x,i)=>i===left||i<left?x.high<=c.high:x.high<c.high);
  const low=window.every((x,i)=>i===left||i<left?x.low>=c.low:x.low>c.low);
  const p={index:idx,time:c.open_time,confirmedAt:candles[end].close_time};
  return {high:high?{...p,level:c.high}:null,low:low?{...p,level:c.low}:null};
}
function zone(kind,side,low,high,c,index){return {id:`${kind}:${side}:${c.open_time}`,kind,side,low,high,ce:(low+high)/2,formedAt:c.close_time,time:c.open_time,formedIndex:index,status:1,lifecycle:'FRESH'};}
function advanceZone(z,c,newThisBar=false){
  if(!z||z.status===4||newThisBar)return;
  if(z.side==='BUY'?c.close<z.low:c.close>z.high)z.status=4;
  else if(overlaps(c,z))z.status=2;
  else if(z.status===2)z.status=3;
  z.lifecycle=['NONE','FRESH','ACTIVE','MITIGATED','FAILED'][z.status];
}
export function dashboardEngine(candles,options={}){
  const s={...DEFAULTS,...options},atr=wilderAtr(candles),history=[],events=[];
  let ph=null,pl=null,bias=0,mss=0,invalid=null,rh=null,rl=null,sweep=null,bullFvg=null,bearFvg=null,bullOb=null,bearOb=null,dolMemory=null;
  for(let i=0;i<candles.length;i++){
    const c=candles[i],prev=candles[i-1],p=pivotAt(candles,i,s.swingLen);
    if(p.high)ph=p.high;if(p.low)pl=p.low;
    const contiguous=pair(prev,c),bull=contiguous&&ph&&pl&&c.close>ph.level&&prev.close<=ph.level,
      bear=contiguous&&ph&&pl&&c.close<pl.level&&prev.close>=pl.level;
    let invalidNow=false,changed=false;
    const oldBias=bias;
    if(bias===1&&invalid!=null&&c.close<invalid||bias===-1&&invalid!=null&&c.close>invalid){
      invalidNow=true;changed=true;bias=bias===1?(bear?-1:0):(bull?1:0);mss=bias;
      if(bias){invalid=bias===1?pl.level:ph.level;rh=bias===1?Math.max(ph.level,c.high):ph.level;rl=bias===-1?Math.min(pl.level,c.low):pl.level;}
    }else if(bull&&bias!==1||bear&&bias!==-1){bias=bull?1:-1;mss=bias;invalid=bull?pl.level:ph.level;rh=bull?Math.max(ph.level,c.high):ph.level;rl=bear?Math.min(pl.level,c.low):pl.level;changed=true;}
    else if(bull&&bias===1){mss=1;rh=Math.max(rh??ph.level,c.high);}
    else if(bear&&bias===-1){mss=-1;rl=Math.min(rl??pl.level,c.low);}
    if(bull||bear)events.push({kind:oldBias===(bull?1:-1)?'BOS':'MSS',side:bull?'BUY':'SELL',level:bull?ph.level:pl.level,time:c.close_time,from:bull?ph.time:pl.time});
    if(changed)sweep=null;
    const min=s.tick*s.minSweepTicks;
    const bslSweep=ph&&c.high>ph.level&&c.close<ph.level&&c.high-ph.level>=min;
    const sslSweep=pl&&c.low<pl.level&&c.close>pl.level&&pl.level-c.low>=min;
    if(sslSweep&&!bslSweep)sweep={dir:1,index:i,time:c.close_time,price:pl.level,extreme:c.low};
    if(bslSweep&&!sslSweep)sweep={dir:-1,index:i,time:c.close_time,price:ph.level,extreme:c.high};
    const sweepInvalid=sweep&&(sweep.dir===1?c.close<sweep.price:c.close>sweep.price);
    const invalidSweep=sweepInvalid?{...sweep}:null;if(sweepInvalid)sweep=null;
    const sweepStatus=sweep?(i-sweep.index<=s.freshBars?1:2):sweepInvalid?3:0;
    const dolDir=sweepStatus===1?sweep.dir:0,dolTarget=dolDir===1?ph?.level:dolDir===-1?pl?.level:null;
    const dolKey=sweep&&dolTarget!=null?`${sweep.time}:${dolTarget}`:null;
    if(dolKey!==dolMemory?.key)dolMemory=dolKey?{key:dolKey,reached:false}:null;
    if(dolMemory&&(dolDir===1?c.high>=dolTarget:c.low<=dolTarget))dolMemory.reached=true;
    const dolReached=Boolean(dolMemory?.reached);
    const dolStatus=!dolDir||dolTarget==null?0:dolReached?2:1,dolAlign=!dolDir||!bias?0:dolDir===bias?1:-1;
    const a=candles[i-2],three=a&&pair(a,prev)&&contiguous;
    const newBull=three&&c.low>a.high,newBear=three&&c.high<a.low;
    if(newBull)bullFvg=zone('FVG','BUY',a.high,c.low,c,i);
    if(newBear)bearFvg=zone('FVG','SELL',c.high,a.low,c,i);
    const bodies=candles.slice(Math.max(0,i-19),i+1),avg=bodies.length===20&&consecutive(bodies)?mean(bodies.map(body)):null;
    const bullDisp=contiguous&&avg!=null&&c.close>c.open&&body(c)>avg*s.dispMult&&c.close>prev.high;
    const bearDisp=contiguous&&avg!=null&&c.close<c.open&&body(c)>avg*s.dispMult&&c.close<prev.low;
    if(bullDisp)bullOb=zone('OB','BUY',prev.close<prev.open?prev.low:c.low,prev.close<prev.open?prev.open:c.open,c,i);
    if(bearDisp)bearOb=zone('OB','SELL',prev.close>prev.open?prev.open:c.open,prev.close>prev.open?prev.high:c.high,c,i);
    // Deliberate correctness fix: a zone's formation candle is not a subsequent retest.
    advanceZone(bullFvg,c,newBull);advanceZone(bearFvg,c,newBear);advanceZone(bullOb,c,bullDisp);advanceZone(bearOb,c,bearDisp);
    const candidates=(bias===1?[bullOb,bullFvg]:bias===-1?[bearOb,bearFvg]:[]).filter(z=>z&&z.status<4);
    const poi=candidates.sort((a,b)=>distance(c.close,a)-distance(c.close,b))[0]||null;
    const high=rh!=null&&rl!=null?Math.max(rh,rl):null,low=rh!=null&&rl!=null?Math.min(rh,rl):null;
    const span=high!=null?Math.max(high-low,s.tick):null,eq=span!=null?low+span*.5:null,eqLow=span!=null?low+span*.48:null,eqHigh=span!=null?low+span*.52:null;
    const priceZone=eqLow==null?0:c.close>eqHigh?1:c.close<eqLow?-1:0;
    const poiLoc=poi&&eqLow!=null?(poi.ce>eqHigh?1:poi.ce<eqLow?-1:0):0;
    const near=invalid!=null&&atr[i]!=null&&bias?(bias===1?c.close<=invalid+atr[i]*s.nearAtr:c.close>=invalid-atr[i]*s.nearAtr):false;
    const invalidStatus=!bias&&invalidNow?2:near?1:bias?0:3;
    const priority=poi?(poiLoc===-bias&&dolAlign===1?2:1):0;
    const coreReason=[
      bias===1?'Bias M15 Bullish':bias===-1?'Bias M15 Bearish':'Bias M15 Netral',
      priceZone===1?'Lokasi Premium':priceZone===-1?'Lokasi Diskon':'Lokasi Equilibrium',
      sweepStatus===1?`${sweep?.dir===1?'SSL':'BSL'} Swept (Fresh)`:null,
      dolStatus===1?`Target DOL: ${number(dolTarget)}`:dolStatus===2?'DOL Reached':null,
      poi?`POI: ${poi.side} ${poi.kind} (${poi.lifecycle})`:null
    ].filter(Boolean).join(' · ');
    const item={time:c.close_time,candle:{...c},atr:atr[i],biasDir:bias,mssDir:mss,bullMss:Boolean(bull),bearMss:Boolean(bear),bullDisp:Boolean(bullDisp),bearDisp:Boolean(bearDisp),protectedHigh:ph?.level??null,protectedLow:pl?.level??null,
      invalidLevel:invalid,invalidStatus,rangeHigh:high,rangeLow:low,eq,eqLow,eqHigh,priceZone,locationStatus:bias&&priceZone?-bias*priceZone:0,
      bsl:ph?.level??null,ssl:pl?.level??null,sweep:sweep?{...sweep}:invalidSweep,sweepDir:sweep?.dir||0,sweepStatus,dolDir,dolTarget,dolStatus,dolAlign,dolDistance:dolTarget==null?null:Math.abs(dolTarget-c.close),
      poi:poi?{...poi}:null,poiPriority:priority,poiLocation:poiLoc,poiDistance:distance(c.close,poi),alasanInti:coreReason,coreReason};
    history.push(item);
  }
  return {current:last(history)||null,history,events:events.slice(-200),zones:{bullFvg,bearFvg,bullOb,bearOb}};
}
export function triggerEngine(candles,options={}){
  const s={...DEFAULTS,...options};let high=null,low=null;
  return candles.map((c,i)=>{
    const p=pivotAt(candles,i,s.triggerSwing);if(p.high)high=p.high.level;if(p.low)low=p.low.level;
    const prev=candles[i-1],ok=pair(prev,c),avg=i>=19&&consecutive(candles.slice(i-19,i+1))?mean(candles.slice(i-19,i+1).map(body)):null;
    const ssl=low!=null&&c.low<low&&c.close>low,bsl=high!=null&&c.high>high&&c.close<high;
    const dir=ssl&&!bsl?1:bsl&&!ssl?-1:0,safe=Math.max(body(c),s.tick);
    return {time:c.close_time,candle:{...c},high,low,sweepDir:dir,sweptPrice:dir===1?low:dir===-1?high:null,sweepExtreme:dir===1?c.low:dir===-1?c.high:null,
      bullBreak:high!=null&&c.close>high,bearBreak:low!=null&&c.close<low,
      bullDisp:Boolean(ok&&avg!=null&&c.close>c.open&&body(c)>avg*s.triggerDisp&&c.close>prev.high),
      bearDisp:Boolean(ok&&avg!=null&&c.close<c.open&&body(c)>avg*s.triggerDisp&&c.close<prev.low),
      bullReject:c.close>c.open&&Math.min(c.open,c.close)-c.low>=safe*s.rejectWick,
      bearReject:c.close<c.open&&c.high-Math.max(c.open,c.close)>=safe*s.rejectWick};
  });
}
const formatters=new Map();
export function localParts(seconds,tz='America/New_York'){
  if(!formatters.has(tz))formatters.set(tz,new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
  const p=Object.fromEntries(formatters.get(tz).formatToParts(new Date(seconds*1000)).map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,year:+p.year,month:+p.month,day:+p.day,minute:+p.hour*60+(+p.minute)};
}
export function sessions(seconds){
  const ny=localParts(seconds),ld=localParts(seconds,'Europe/London'),jp=localParts(seconds,'Asia/Tokyo');
  return [ny.minute>=420&&ny.minute<540?'NY':null,ld.minute>=420&&ld.minute<600?'LONDON_OPEN':null,
    ld.minute>=900&&ld.minute<1020?'LONDON_CLOSE':null,jp.minute>=600&&jp.minute<840?'ASIA':null].filter(Boolean);
}
// M1 key levels are only published after observed session/day start and complete coverage.
export function keyLevelHistory(m1=[]){
  const history=[];let mo=null,moTime=null,day=null,asia=null,working=null;
  for(let i=0;i<m1.length;i++){
    const c=m1[i],p=localParts(c.open_time),previous=m1[i-1],prev=previous?localParts(previous.open_time):null;
    if(p.date!==day){day=p.date;mo=null;moTime=null;}
    if(p.minute===0){mo=c.open;moTime=c.open_time;}
    const inAsia=p.minute>=1200,wasAsia=prev&&prev.minute>=1200;
    if(inAsia&&!wasAsia)working=p.minute===1200?{high:c.high,low:c.low,time:c.open_time,last:c.open_time,complete:true}:null;
    if(inAsia&&working){if(working.last!==c.open_time)working.complete=false;working.high=Math.max(working.high,c.high);working.low=Math.min(working.low,c.low);working.last=c.close_time;}
    if(!inAsia&&wasAsia&&working){if(working.last!==c.open_time)working.complete=false;if(working.complete)asia={...working,locked:true};working=null;}
    const current=inAsia?(working?.complete?{...working,locked:false}:null):asia;
    const valid=current&&c.close_time-current.last<=36*3600?current:null;
    history.push({time:c.close_time,date:day,midnightOpen:mo,midnightTime:moTime,midnightStatus:mo==null?'UNAVAILABLE':'FIXED',
      asiaHigh:valid?.high??null,asiaLow:valid?.low??null,asiaTime:valid?.time??null,asiaStatus:valid?(valid.locked?'LOCKED':'TRACKING'):'UNAVAILABLE'});
  }return history;
}
export function keyLevels({m1=[],d1=[],m15=[],nowSeconds,options={}}){
  const current=last(keyLevelHistory(m1)),ny=localParts(nowSeconds),daily=last(d1),p=pivotList(m15,options.swingLen||5);
  const snapshot=current&&nowSeconds-current.time<=900?current:{};
  return {...snapshot,midnightOpen:current?.date===ny.date?snapshot.midnightOpen??null:null,midnightStatus:current?.date===ny.date?snapshot.midnightStatus||'UNAVAILABLE':'UNAVAILABLE',
    asiaHigh:snapshot.asiaHigh??null,asiaLow:snapshot.asiaLow??null,asiaStatus:snapshot.asiaStatus||'UNAVAILABLE',pdh:daily?.high??null,pdl:daily?.low??null,bsl:last(p.highs)?.level??null,ssl:last(p.lows)?.level??null};
}
export function pivotList(candles,len=3,right=len){const highs=[],lows=[];for(let i=0;i<candles.length;i++){const p=pivotAt(candles,i,len,right);if(p.high)highs.push(p.high);if(p.low)lows.push(p.low);}return {highs,lows};}
export function classicPivot(c){if(!c)return null;const p=(c.high+c.low+c.close)/3,r=c.high-c.low,r3=c.high+2*(p-c.low),s3=c.low-2*(c.high-p);
  return {PIVOT:p,R1:2*p-c.low,S1:2*p-c.high,R2:p+r,S2:p-r,R3:r3,S3:s3,R4:r3+r,S4:s3-r};}
// Completed exchange-day records are grouped without ever importing the current week/month.
export function pivotSources(d1,nowSeconds){
  const date=localParts(nowSeconds,'UTC'),utc=new Date(Date.UTC(date.year,date.month-1,date.day)),day=utc.getUTCDay(),weekStart=+utc/1000-((day+6)%7)*86400;
  const monthStart=Date.UTC(date.year,date.month-1,1)/1000;
  const aggregate=rows=>rows.length?{open:rows[0].open,high:Math.max(...rows.map(c=>c.high)),low:Math.min(...rows.map(c=>c.low)),close:last(rows).close}:null;
  const priorWeek=d1.filter(c=>c.open_time>=weekStart-7*86400&&c.open_time<weekStart),priorMonth=d1.filter(c=>c.open_time>=Date.UTC(date.year,date.month-2,1)/1000&&c.open_time<monthStart);
  return {D:classicPivot(last(d1)),W:priorWeek.length>=4?classicPivot(aggregate(priorWeek)):null,M:priorMonth.length>=15?classicPivot(aggregate(priorMonth)):null};
}
export function m15Confirmation(d, levels={}){
  if(!d||!d.candle||!d.biasDir||d.invalidStatus===2) {
    return {confirmed:false,type:null,reason:null,wickReject:false,displacementBreak:false,ceBounce:false,dir:0,side:null};
  }
  const c=d.candle,s=DEFAULTS,cBody=body(c),safeBody=Math.max(cBody,s.tick);
  const upperWick=c.high-Math.max(c.open,c.close),lowerWick=Math.min(c.open,c.close)-c.low;
  const poi=d.poi,inPoi=Boolean(poi&&overlaps(c,poi));

  // a) M15 Wick Rejection >= 1.2x body di POI atau likuiditas (SSL/BSL/Asia/PDH/PDL)
  const ssl=levels?.ssl??d.ssl,bsl=levels?.bsl??d.bsl;
  const asiaLow=levels?.asiaLow??null,asiaHigh=levels?.asiaHigh??null;
  const pdl=levels?.pdl??null,pdh=levels?.pdh??null;

  const sslHit=ssl!=null&&c.low<=ssl&&c.close>ssl;
  const bslHit=bsl!=null&&c.high>=bsl&&c.close<bsl;
  const asiaLowHit=asiaLow!=null&&c.low<=asiaLow&&c.close>asiaLow;
  const asiaHighHit=asiaHigh!=null&&c.high>=asiaHigh&&c.close<asiaHigh;
  const pdlHit=pdl!=null&&c.low<=pdl&&c.close>pdl;
  const pdhHit=pdh!=null&&c.high>=pdh&&c.close<pdh;

  const buyTargetLiq=inPoi||sslHit||asiaLowHit||pdlHit;
  const sellTargetLiq=inPoi||bslHit||asiaHighHit||pdhHit;

  const buyWickReject=d.biasDir===1&&buyTargetLiq&&lowerWick>=safeBody*s.rejectWick;
  const sellWickReject=d.biasDir===-1&&sellTargetLiq&&upperWick>=safeBody*s.rejectWick;
  const wickReject=buyWickReject||sellWickReject;

  // b) M15 Displacement Break (BOS / MSS) searah bias dengan body tebal
  const buyDispBreak=d.biasDir===1&&(d.bullMss||d.mssDir===1)&&Boolean(d.bullDisp);
  const sellDispBreak=d.biasDir===-1&&(d.bearMss||d.mssDir===-1)&&Boolean(d.bearDisp);
  const displacementBreak=buyDispBreak||sellDispBreak;

  // c) M15 50% CE Bounce di Dealing Range yang sehat (Diskon untuk BUY, Premium untuk SELL)
  const buyHealthyDr=d.priceZone===-1||d.locationStatus===1;
  const sellHealthyDr=d.priceZone===1||d.locationStatus===1;

  const buyEqBounce=d.eq!=null&&c.low<=d.eq&&c.close>=d.eq;
  const buyPoiCeBounce=poi?.ce!=null&&c.low<=poi.ce&&c.close>=poi.ce;
  const buyCeBounce=d.biasDir===1&&buyHealthyDr&&(buyEqBounce||buyPoiCeBounce)&&c.close>=c.open;

  const sellEqBounce=d.eq!=null&&c.high>=d.eq&&c.close<=d.eq;
  const sellPoiCeBounce=poi?.ce!=null&&c.high>=poi.ce&&c.close<=poi.ce;
  const sellCeBounce=d.biasDir===-1&&sellHealthyDr&&(sellEqBounce||sellPoiCeBounce)&&c.close<=c.open;
  const ceBounce=buyCeBounce||sellCeBounce;

  const confirmed=Boolean(wickReject||displacementBreak||ceBounce);
  const type=wickReject?'WICK_REJECTION':displacementBreak?'DISPLACEMENT_BREAK':ceBounce?'CE_BOUNCE':null;
  const where=inPoi?`${poi.side} ${poi.kind}`:sslHit?'SSL':bslHit?'BSL':asiaLowHit?'Asia Low':asiaHighHit?'Asia High':pdlHit?'PDL':pdhHit?'PDH':'likuiditas';
  const reason=wickReject
    ? `M15 Wick Rejection >= 1.2x body di ${where}`
    : displacementBreak
    ? `M15 Displacement Break (${d.biasDir===1?'Bullish':'Bearish'}) searah bias`
    : ceBounce
    ? `M15 50% CE Bounce di Dealing Range ${d.biasDir===1?'Diskon':'Premium'}`
    : null;

  return {
    confirmed,
    type,
    reason,
    wickReject:Boolean(wickReject),
    displacementBreak:Boolean(displacementBreak),
    ceBounce:Boolean(ceBounce),
    dir:d.biasDir,
    side:d.biasDir===1?'BUY':d.biasDir===-1?'SELL':null
  };
}
export function entryScore(d,t,levels={},options={}){
  const s={...DEFAULTS,...options};if(!d||!t)return {buy:0,sell:0,winDir:0,score:0,grade:'NO_SETUP',breakdown:{},text:'Menunggu candle tertutup.'};
  const c=t.candle,poi=d.poi,inPoi=Boolean(poi&&overlaps(c,poi)),safe=Math.max(body(c),s.tick);
  const rejectBuy=d.biasDir===1&&inPoi&&c.close>c.open&&Math.min(c.open,c.close)-c.low>=safe*s.rejectWick;
  const rejectSell=d.biasDir===-1&&inPoi&&c.close<c.open&&c.high-Math.max(c.open,c.close)>=safe*s.rejectWick;
  const m15Conf=m15Confirmation(d,levels);
  const m15BuyDisp=m15Conf.confirmed&&d.biasDir===1&&m15Conf.displacementBreak;
  const m15SellDisp=m15Conf.confirmed&&d.biasDir===-1&&m15Conf.displacementBreak;
  const m15BuyStruct=m15Conf.confirmed&&d.biasDir===1&&(d.bullMss||m15Conf.displacementBreak);
  const m15SellStruct=m15Conf.confirmed&&d.biasDir===-1&&(d.bearMss||m15Conf.displacementBreak);
  const m15BuyReject=m15Conf.confirmed&&d.biasDir===1&&(m15Conf.wickReject||m15Conf.ceBounce);
  const m15SellReject=m15Conf.confirmed&&d.biasDir===-1&&(m15Conf.wickReject||m15Conf.ceBounce);
  const layer=dir=>({bias:d.biasDir===dir?20:0,sweep:d.sweepStatus===1&&d.sweepDir===dir?20:d.sweepStatus===2&&d.sweepDir===dir?8:t.sweepDir===dir?12:0,
    poi:poi&&d.biasDir===dir?(d.poiLocation===-dir?15:8):0,poiBonus:dir===1&&(rejectBuy||m15BuyReject)||dir===-1&&(rejectSell||m15SellReject)?5:inPoi&&d.biasDir===dir?3:0,
    dol:d.dolDir===dir?(d.dolStatus===1?10:d.dolStatus===2?5:0):0,location:d.priceZone===-dir?10:d.priceZone===0?3:0,
    displacement:(dir===1?(t.bullDisp||m15BuyDisp):(t.bearDisp||m15SellDisp))?15:0,structure:(dir===1?(t.bullBreak||m15BuyStruct):(t.bearBreak||m15SellStruct))?10:0,
    asia:dir===1?(levels.asiaLow!=null&&c.low<=levels.asiaLow&&c.close>levels.asiaLow?5:levels.asiaHigh!=null&&c.close>levels.asiaHigh?3:0):
      (levels.asiaHigh!=null&&c.high>=levels.asiaHigh&&c.close<levels.asiaHigh?5:levels.asiaLow!=null&&c.close<levels.asiaLow?3:0)});
  const buyLayers=layer(1),sellLayers=layer(-1),total=x=>Math.min(100,Object.values(x).reduce((a,b)=>a+b,0));
  const penalty=x=>d.invalidStatus===2?0:d.invalidStatus===1?Math.round(x*.7):x;
  const buy=penalty(total(buyLayers)),sell=penalty(total(sellLayers)),winDir=buy>sell?1:sell>buy?-1:0,score=winDir===1?buy:winDir===-1?sell:0;
  const grade=score>=75?'STRONG':score>=60?'READY':score>=40?'WATCH':'NO_SETUP';
  const dir=winDir||d.biasDir,target=d.dolTarget,nearPoi=poi&&distance(c.close,poi)>0&&distance(c.close,poi)<=(d.atr||0)*1.5;
  const nearDol=target!=null&&d.dolStatus===1&&Math.abs(c.close-target)<=(d.atr||0);
  const lines=[];let importance=0;
  const m5Invalid=d.biasDir&&d.invalidLevel!=null&&(d.biasDir===1?c.close<d.invalidLevel:c.close>d.invalidLevel);
  if(m5Invalid&&d.invalidStatus!==2){lines.push('⚠ Close M5 melewati invalid M15','Eksekusi ditahan; tunggu konfirmasi close M15');importance=5;}
  else if(d.invalidStatus===2){lines.push('⚠ Setup batal',`Close melewati invalid ${number(d.invalidLevel)}`,'Tunggu struktur baru');importance=5;}
  else {
    if(m15Conf.confirmed){lines.push(`Konfirmasi M15: ${m15Conf.reason}`,`Otoritas penuh M15 · status CONFIRMED (${m15Conf.side})`);importance=5;}
    else if(rejectBuy||rejectSell){lines.push(`Rejection kuat dari ${poi.side} ${poi.kind}`,`Wick ${rejectBuy?'bawah':'atas'} panjang · konfirmasi ${rejectBuy?'BUY':'SELL'}`);importance=5;}
    else if(d.biasDir===1&&t.bullBreak&&t.bullDisp||d.biasDir===-1&&t.bearBreak&&t.bearDisp){lines.push(`Valid break ${d.biasDir===1?'bullish':'bearish'} dengan displacement`,'Struktur M5 terkonfirmasi');importance=4;}
    else if(inPoi){lines.push(`${poi.side} ${poi.kind} tersentuh`,'Pantau rejection di zona ini');importance=3;}
    else if(nearPoi){lines.push(`Harga mendekati ${poi.side} ${poi.kind}`,'Siapkan pengamatan reaksi');importance=2;}
    else if(t.sweepDir===d.biasDir&&d.biasDir){lines.push(`${t.sweepDir===1?'SSL':'BSL'} swept di M5`,'Cari konfirmasi berikutnya');importance=3;}
    else if(d.sweepStatus===1){lines.push(`${d.sweepDir===1?'SSL':'BSL'} swept · Fresh`,'Cari konfirmasi dari OB/FVG');importance=2;}
    else if(d.biasDir===1&&t.bullDisp||d.biasDir===-1&&t.bearDisp){lines.push('Displacement searah bias terdeteksi');importance=2;}
    else if(d.dolStatus===2){lines.push('Target likuiditas tercapai','Pantau reaksi baru, jangan mengejar harga');importance=2;}
    else if(nearDol){lines.push(`Mendekati target ${number(target)}`);importance=2;}
    else if(d.dolStatus===1){lines.push(`Draw to ${d.dolDir===1?'BSL':'SSL'} ${number(target)}`);importance=1;}
    else if(d.biasDir){lines.push(`Bias M15 ${d.biasDir===1?'Bullish':'Bearish'}`,`Tunggu zona ${d.biasDir===1?'discount':'premium'}`);importance=1;}
    else lines.push('Belum ada bias M15 yang jelas');
    if(d.invalidStatus===1)lines.push(`⚠ Near invalid ${number(d.invalidLevel)}`);
    if(levels.asiaHigh!=null&&c.high>=levels.asiaHigh&&c.low<=levels.asiaHigh)lines.push('Harga menyentuh Asia High');
    else if(levels.asiaLow!=null&&c.high>=levels.asiaLow&&c.low<=levels.asiaLow)lines.push('Harga menyentuh Asia Low');
    else if(levels.asiaHigh!=null&&c.close>levels.asiaHigh)lines.push('Harga di atas Asia High');
    else if(levels.asiaLow!=null&&c.close<levels.asiaLow)lines.push('Harga di bawah Asia Low');
    lines.push(`Posisi ${d.priceZone===1?'Premium':d.priceZone===-1?'Discount':'EQ Zone'}`);
    if(d.dolStatus===1&&importance>=2&&!nearDol)lines.push(`Target → ${number(target)}`);
    if(d.invalidLevel!=null&&importance>=3)lines.push(`Invalid jika close M15 ${d.biasDir===1?'di bawah':'di atas'} ${number(d.invalidLevel)}`);
    if(score>=40)lines.push(`Confluence ${score}/100 poin`);
  }
  if(winDir&&d.biasDir&&winDir!==d.biasDir)lines.push(`Skor dominan ${winDir===1?'BUY':'SELL'} ${score}/100 berlawanan bias M15; tunggu struktur baru.`);
  return {m5Invalid:Boolean(m5Invalid),time:t.time,buy,sell,rawBuy:total(buyLayers),rawSell:total(sellLayers),winDir,score,grade,breakdown:{buy:buyLayers,sell:sellLayers},inPoi,rejectBuy,rejectSell,m15Confirmation:m15Conf,importance,dir,text:lines.join('\n')};
}
export function entryAssistantV3(d, candlesLTF=[], levels={}, pivots={}, options={}){
  const s = { ...DEFAULTS, ...options };
  if (!d || !candlesLTF || !candlesLTF.length) {
    return {
      signalType: 0,
      rawSignalType: 0,
      signalName: 'NO ENTRY',
      status: 'NO ENTRY',
      dir: 0,
      side: null,
      isBreak: false,
      isPullback: false,
      fresh: false,
      mathZone: 'NO ENTRY',
      inFiboOte: false,
      nearSnr: false,
      touchPoi: false,
      plan: null,
      reason: 'Belum ada data candle LTF valid.',
      reasons: ['Belum ada data candle LTF valid.']
    };
  }

  const atr14 = wilderAtr(candlesLTF, 14);
  let lastHigh = null, lastLow = null;
  let bullBreakLevel = null, bearBreakLevel = null;
  let bullAge = 0, bearAge = 0;
  let bullActive = false, bearActive = false;
  let lastSignalDir = 0, lastSignalLevel = null;

  for (let i = 0; i < candlesLTF.length; i++) {
    const p = pivotAt(candlesLTF, i, s.triggerSwing || s.swingLen);
    if (p.high) lastHigh = p.high.level;
    if (p.low) lastLow = p.low.level;

    const c = candlesLTF[i];
    const prev = candlesLTF[i - 1];
    const ok = pair(prev, c);
    const barAtr = atr14[i] || s.tick;
    const tol = barAtr * s.retestAtr;
    const cBody = body(c);
    const bodies = candlesLTF.slice(Math.max(0, i - 19), i + 1);
    const meanBody = bodies.length === 20 && consecutive(bodies) ? mean(bodies.map(body)) : null;
    const safeBody = Math.max(cBody, s.tick);
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;

    const bullDisp = ok && meanBody != null && c.close > c.open && cBody > meanBody * s.triggerDisp && c.close > prev.high;
    const bearDisp = ok && meanBody != null && c.close < c.open && cBody > meanBody * s.triggerDisp && c.close < prev.low;

    const bullBreak = ok && lastHigh != null && c.close > lastHigh && prev.close <= lastHigh && bullDisp;
    const bearBreak = ok && lastLow != null && c.close < lastLow && prev.close >= lastLow && bearDisp;

    if (bullBreak) {
      bullBreakLevel = lastHigh;
      bullAge = 0;
      bullActive = true;
      bearActive = false;
    }
    if (bearBreak) {
      bearBreakLevel = lastLow;
      bearAge = 0;
      bearActive = true;
      bullActive = false;
    }

    if (bullActive) {
      bullAge++;
      if (c.close < bullBreakLevel - tol || bullAge > s.validBars) bullActive = false;
    }
    if (bearActive) {
      bearAge++;
      if (c.close > bearBreakLevel + tol || bearAge > s.validBars) bearActive = false;
    }

    const bullRetest = bullActive && bullAge > 0 && c.low <= bullBreakLevel + tol && c.close >= bullBreakLevel - tol;
    const bearRetest = bearActive && bearAge > 0 && c.high >= bearBreakLevel - tol && c.close <= bearBreakLevel + tol;

    const bullReject = c.close > c.open && lowerWick >= safeBody * s.rejectWick;
    const bearReject = c.close < c.open && upperWick >= safeBody * s.rejectWick;

    const bullSignal = bullRetest && bullReject;
    const bearSignal = bearRetest && bearReject;

    if (bullSignal && !bearSignal) {
      lastSignalDir = 1;
      lastSignalLevel = bullBreakLevel;
      bullActive = false;
    } else if (bearSignal && !bullSignal) {
      lastSignalDir = -1;
      lastSignalLevel = bearBreakLevel;
      bearActive = false;
    }
  }

  const c = last(candlesLTF);
  const curAtr = last(atr14) || d.atr || 1.0;
  const cBody = body(c);
  const safeBody = Math.max(cBody, s.tick);
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const bullRejectNow = c.close > c.open && lowerWick >= safeBody * s.rejectWick;
  const bearRejectNow = c.close < c.open && upperWick >= safeBody * s.rejectWick;

  const zoneTol = curAtr * s.zoneAtr;
  const chaseTol = curAtr * s.maxChaseAtr;
  const contextOk = d.biasDir !== 0 && d.invalidStatus !== 2;

  const pD = pivots?.D || null;
  const belowCandidates = [
    d.ssl, levels?.ssl, levels?.pdl, levels?.asiaLow,
    pD?.S1, pD?.S2, pD?.S3, pD?.S4,
    d.rangeLow, d.poi?.low, levels?.midnightOpen,
    pD?.PIVOT, d.eq, d.invalidLevel
  ].filter(x => finite(x) && x < c.close);
  const support = belowCandidates.length ? Math.max(...belowCandidates) : null;

  const aboveCandidates = [
    d.bsl, levels?.bsl, levels?.pdh, levels?.asiaHigh,
    pD?.R1, pD?.R2, pD?.R3, pD?.R4,
    d.rangeHigh, d.poi?.high, levels?.midnightOpen,
    pD?.PIVOT, d.eq, d.invalidLevel
  ].filter(x => finite(x) && x > c.close);
  const resistance = aboveCandidates.length ? Math.min(...aboveCandidates) : null;

  const dashRangeHigh = (finite(d.rangeHigh) && finite(d.rangeLow)) ? Math.max(d.rangeHigh, d.rangeLow) : null;
  const dashRangeLow = (finite(d.rangeHigh) && finite(d.rangeLow)) ? Math.min(d.rangeHigh, d.rangeLow) : null;
  const autoRangeHigh = dashRangeHigh ?? resistance;
  const autoRangeLow = dashRangeLow ?? support;
  const autoRangeSize = (autoRangeHigh != null && autoRangeLow != null) ? Math.max(autoRangeHigh - autoRangeLow, s.tick) : null;

  const fibA = Math.min(s.fibShallow, s.fibDeep);
  const fibB = Math.max(s.fibShallow, s.fibDeep);

  const buyFibHigh = autoRangeSize != null ? autoRangeHigh - autoRangeSize * fibA : null;
  const buyFibLow = autoRangeSize != null ? autoRangeHigh - autoRangeSize * fibB : null;
  const sellFibLow = autoRangeSize != null ? autoRangeLow + autoRangeSize * fibA : null;
  const sellFibHigh = autoRangeSize != null ? autoRangeLow + autoRangeSize * fibB : null;

  const inBuyFibZone = buyFibHigh != null && buyFibLow != null &&
    c.close >= buyFibLow - zoneTol && c.close <= buyFibHigh + zoneTol &&
    c.low <= buyFibHigh + zoneTol && c.high >= buyFibLow - zoneTol;

  const inSellFibZone = sellFibHigh != null && sellFibLow != null &&
    c.close >= sellFibLow - zoneTol && c.close <= sellFibHigh + zoneTol &&
    c.high >= sellFibLow - zoneTol && c.low <= sellFibHigh + zoneTol;

  const nearSupport = support != null &&
    c.low <= support + zoneTol && c.close >= support - zoneTol && c.close <= support + chaseTol;

  const nearResistance = resistance != null &&
    c.high >= resistance - zoneTol && c.close <= resistance + zoneTol && c.close >= resistance - chaseTol;

  const inPoi = Boolean(d.poi && overlaps(c, d.poi));
  const touchBullPoi = inPoi && (d.poi.side === 'BUY' || d.poi.type > 0);
  const touchBearPoi = inPoi && (d.poi.side === 'SELL' || d.poi.type < 0);

  const sslReject = finite(d.ssl) && c.low <= d.ssl && c.close > d.ssl;
  const bslReject = finite(d.bsl) && c.high >= d.bsl && c.close < d.bsl;
  const asiaLowReject = finite(levels?.asiaLow) && c.low <= levels.asiaLow && c.close > levels.asiaLow;
  const asiaHighReject = finite(levels?.asiaHigh) && c.high >= levels.asiaHigh && c.close < levels.asiaHigh;

  const breakBuy = lastSignalDir === 1;
  const breakSell = lastSignalDir === -1;
  const breakBuyFresh = breakBuy && lastSignalLevel != null &&
    c.close >= lastSignalLevel - zoneTol && c.close <= lastSignalLevel + chaseTol;
  const breakSellFresh = breakSell && lastSignalLevel != null &&
    c.close <= lastSignalLevel + zoneTol && c.close >= lastSignalLevel - chaseTol;

  const mathBuyZone = inBuyFibZone || nearSupport || touchBullPoi || sslReject || asiaLowReject || breakBuyFresh;
  const mathSellZone = inSellFibZone || nearResistance || touchBearPoi || bslReject || asiaHighReject || breakSellFresh;

  const baseTrendBuyZone = d.priceZone === -1 || touchBullPoi || sslReject || asiaLowReject || inBuyFibZone || nearSupport;
  const baseTrendSellZone = d.priceZone === 1 || touchBearPoi || bslReject || asiaHighReject || inSellFibZone || nearResistance;
  const basePullbackSellZone = d.priceZone === 1 || bslReject || asiaHighReject || d.dolStatus === 2 || inSellFibZone || nearResistance;
  const basePullbackBuyZone = d.priceZone === -1 || sslReject || asiaLowReject || d.dolStatus === 2 || inBuyFibZone || nearSupport;

  const trendBuyZone = baseTrendBuyZone && mathBuyZone;
  const trendSellZone = baseTrendSellZone && mathSellZone;
  const pullbackSellZone = basePullbackSellZone && mathSellZone;
  const pullbackBuyZone = basePullbackBuyZone && mathBuyZone;

  const m15Conf = m15Confirmation(d, levels);
  const m15DirectConfirmed = Boolean(m15Conf.confirmed && contextOk && d.biasDir !== 0);
  const m15BuyTrend = m15DirectConfirmed && d.biasDir === 1;
  const m15SellTrend = m15DirectConfirmed && d.biasDir === -1;

  const trendBuyBreak = contextOk && d.biasDir === 1 && (trendBuyZone && breakBuyFresh || (m15BuyTrend && m15Conf.displacementBreak));
  const trendSellBreak = contextOk && d.biasDir === -1 && (trendSellZone && breakSellFresh || (m15SellTrend && m15Conf.displacementBreak));
  const pullbackSellBreak = contextOk && d.biasDir === 1 && pullbackSellZone && breakSellFresh;
  const pullbackBuyBreak = contextOk && d.biasDir === -1 && pullbackBuyZone && breakBuyFresh;

  const trendBuyReject = contextOk && d.biasDir === 1 && (trendBuyZone && bullRejectNow || (m15BuyTrend && (m15Conf.wickReject || m15Conf.ceBounce)));
  const trendSellReject = contextOk && d.biasDir === -1 && (trendSellZone && bearRejectNow || (m15SellTrend && (m15Conf.wickReject || m15Conf.ceBounce)));
  const pullbackSellReject = contextOk && d.biasDir === 1 && pullbackSellZone && bearRejectNow;
  const pullbackBuyReject = contextOk && d.biasDir === -1 && pullbackBuyZone && bullRejectNow;

  let rawSignalType = 0;
  if (pullbackSellBreak || pullbackSellReject) rawSignalType = -2;
  else if (pullbackBuyBreak || pullbackBuyReject) rawSignalType = 2;
  else if (trendBuyBreak || trendBuyReject || m15BuyTrend) rawSignalType = 1;
  else if (trendSellBreak || trendSellReject || m15SellTrend) rawSignalType = -1;

  const rawSignalDir = (rawSignalType === 1 || rawSignalType === 2) ? 1 : (rawSignalType === -1 || rawSignalType === -2) ? -1 : 0;
  const rawSignalIsBreak = rawSignalType === 1 ? (trendBuyBreak || (m15BuyTrend && m15Conf.displacementBreak)) :
    rawSignalType === -1 ? (trendSellBreak || (m15SellTrend && m15Conf.displacementBreak)) :
    rawSignalType === -2 ? pullbackSellBreak :
    rawSignalType === 2 ? pullbackBuyBreak : false;

  const buyZoneEntry = inBuyFibZone && buyFibLow != null && buyFibHigh != null
    ? Math.max(buyFibLow, Math.min(c.close, buyFibHigh))
    : nearSupport ? support
    : (touchBullPoi && d.poi?.low != null ? d.poi.low
    : (sslReject && d.ssl != null ? d.ssl
    : (support != null && c.low <= support + zoneTol ? support : c.close)));
  const sellZoneEntry = inSellFibZone && sellFibLow != null && sellFibHigh != null
    ? Math.min(sellFibHigh, Math.max(c.close, sellFibLow))
    : nearResistance ? resistance
    : (touchBearPoi && d.poi?.high != null ? d.poi.high
    : (bslReject && d.bsl != null ? d.bsl
    : (resistance != null && c.high >= resistance - zoneTol ? resistance : c.close)));

  const rawEntryCandidate = rawSignalIsBreak && lastSignalLevel != null
    ? lastSignalLevel
    : rawSignalDir === 1 ? buyZoneEntry : rawSignalDir === -1 ? sellZoneEntry : null;

  const buyFresh = rawSignalDir === 1 && rawEntryCandidate != null &&
    c.close >= rawEntryCandidate - zoneTol && c.close <= rawEntryCandidate + chaseTol;
  const sellFresh = rawSignalDir === -1 && rawEntryCandidate != null &&
    c.close <= rawEntryCandidate + zoneTol && c.close >= rawEntryCandidate - chaseTol;

  const m15Fresh = m15DirectConfirmed;
  const entryFresh = rawSignalType === 0 ? true : (m15Fresh || (rawSignalDir === 1 ? buyFresh : sellFresh));
  const signalType = (rawSignalType !== 0 && entryFresh) ? rawSignalType : 0;
  const missedSignal = (rawSignalType !== 0 && !entryFresh);
  const status = missedSignal && !m15Fresh ? 'MISSED' : signalType !== 0 ? 'READY' : 'NO ENTRY';

  let entry = rawEntryCandidate ?? c.close;
  let sl = null, tp1 = null, tp2 = null, risk = null, rr1 = null, rr2 = null;

  if (rawSignalDir === 1) {
    const buyBaseSl = Math.min(
      c.low,
      lastLow ?? c.low,
      d.poi?.low ?? c.low,
      support ?? c.low,
      autoRangeLow ?? c.low
    );
    sl = buyBaseSl - curAtr * s.slBufferAtr;
    risk = Math.max(entry - sl, s.tick);

    const tp1Cands = [
      d.dolDir === 1 ? d.dolTarget : null,
      resistance, autoRangeHigh, d.bsl, levels?.pdh, pD?.R1, d.eq
    ].filter(x => finite(x) && x > entry);
    tp1 = tp1Cands.length ? Math.min(...tp1Cands) : (entry + risk * s.tp1R);

    const tp2Cands = [
      d.dolDir === 1 ? d.dolTarget : null,
      resistance, levels?.pdh, levels?.asiaHigh, pD?.R2, pD?.R3, pD?.R4
    ].filter(x => finite(x) && x > tp1);
    tp2 = tp2Cands.length ? Math.min(...tp2Cands) : (entry + risk * s.tp2R);

    rr1 = risk > 0 ? (tp1 - entry) / risk : null;
    rr2 = risk > 0 ? (tp2 - entry) / risk : null;
  } else if (rawSignalDir === -1) {
    const sellBaseSl = Math.max(
      c.high,
      lastHigh ?? c.high,
      d.poi?.high ?? c.high,
      resistance ?? c.high,
      autoRangeHigh ?? c.high
    );
    sl = sellBaseSl + curAtr * s.slBufferAtr;
    risk = Math.max(sl - entry, s.tick);

    const tp1Cands = [
      d.dolDir === -1 ? d.dolTarget : null,
      support, autoRangeLow, d.ssl, levels?.pdl, pD?.S1, d.eq
    ].filter(x => finite(x) && x < entry);
    tp1 = tp1Cands.length ? Math.max(...tp1Cands) : (entry - risk * s.tp1R);

    const tp2Cands = [
      d.dolDir === -1 ? d.dolTarget : null,
      support, levels?.pdl, levels?.asiaLow, pD?.S2, pD?.S3, pD?.S4
    ].filter(x => finite(x) && x < tp1);
    tp2 = tp2Cands.length ? Math.max(...tp2Cands) : (entry - risk * s.tp2R);

    rr1 = risk > 0 ? (entry - tp1) / risk : null;
    rr2 = risk > 0 ? (entry - tp2) / risk : null;
  }

  let zoneText = 'NO ENTRY';
  if (rawSignalDir === 1) {
    zoneText = inBuyFibZone ? 'Fibo discount zone (OTE 61.8-78.6%)' :
      nearSupport ? 'SNR support zone' :
      touchBullPoi ? 'Bullish POI zone' :
      sslReject ? 'SSL reject zone' :
      asiaLowReject ? 'Asia Low reject zone' :
      breakBuyFresh ? 'Break-retest zone' : 'Math zone';
  } else if (rawSignalDir === -1) {
    zoneText = inSellFibZone ? 'Fibo premium zone (OTE 61.8-78.6%)' :
      nearResistance ? 'SNR resistance zone' :
      touchBearPoi ? 'Bearish POI zone' :
      bslReject ? 'BSL reject zone' :
      asiaHighReject ? 'Asia High reject zone' :
      breakSellFresh ? 'Break-retest zone' : 'Math zone';
  } else if (missedSignal) {
    zoneText = 'MISSED: harga sudah menjauh dari entry';
  }

  const signalNames = {
    1: 'BUY ENTRY (Trend Buy)',
    '-1': 'SELL ENTRY (Trend Sell)',
    '-2': 'PULLBACK SELL (Pullback di Pucuk Premium)',
    2: 'PULLBACK BUY (Pullback di Dasar Diskon)',
    0: 'NO ENTRY'
  };

  const reasons = [
    `Bias utama: ${d.biasDir === 1 ? 'Bullish' : d.biasDir === -1 ? 'Bearish' : 'Neutral'}`,
    m15DirectConfirmed ? `Pemicu M15: ${m15Conf.reason} (Otoritas M15 Close)` :
      rawSignalIsBreak ? 'Pemicu: Break + Retest + Rejection (wick 1.2x)' :
      rawSignalType !== 0 ? 'Pemicu: Rejection area (wick 1.2x)' :
      missedSignal ? 'Status: Missed entry' : 'Status: No entry',
    `Math zone: ${zoneText}`,
    `Lokasi: ${d.priceZone === 1 ? 'Premium' : d.priceZone === -1 ? 'Discount' : 'EQ Zone'}`
  ];
  if (rawSignalType === -2) reasons.push('Catatan: sell ini pullback korektif, bukan ubah bias utama');
  if (rawSignalType === 2) reasons.push('Catatan: buy ini pullback korektif, bukan ubah bias utama');
  if (touchBullPoi || touchBearPoi) reasons.push(`POI tersentuh: ${d.poi ? `${d.poi.side} ${d.poi.kind}` : 'None'}`);
  if (sslReject) reasons.push('SSL reject terkonfirmasi');
  if (bslReject) reasons.push('BSL reject terkonfirmasi');
  if (status === 'READY') reasons.push(`Anti chase: READY (jarak ≤ ${s.maxChaseAtr} ATR)`);
  else if (missedSignal) reasons.push(`Anti chase: MISSED (jarak > ${s.maxChaseAtr} ATR)`);

  const plan = (rawSignalType !== 0) ? {
    entry: round(entry),
    sl: round(sl),
    tp1: round(tp1),
    tp2: round(tp2),
    risk: round(risk),
    rr1: round(rr1),
    rr2: round(rr2),
    status,
    side: (rawSignalDir === 1) ? 'BUY' : 'SELL',
    signalType: rawSignalType,
    signalName: signalNames[rawSignalType] || 'ENTRY',
    reason: reasons.join('\n')
  } : null;

  return {
    signalType,
    rawSignalType,
    signalName: signalNames[signalType] || 'NO ENTRY',
    status,
    dir: (signalType === 1 || signalType === 2) ? 1 : (signalType === -1 || signalType === -2) ? -1 : 0,
    side: (signalType === 1 || signalType === 2) ? 'BUY' : (signalType === -1 || signalType === -2) ? 'SELL' : null,
    isBreak: rawSignalIsBreak,
    isPullback: Math.abs(signalType) === 2,
    fresh: entryFresh,
    mathZone: zoneText,
    inFiboOte: inBuyFibZone || inSellFibZone,
    nearSnr: nearSupport || nearResistance,
    touchPoi: inPoi,
    m15Confirmation: m15Conf,
    directConfirmed: m15DirectConfirmed,
    plan,
    reason: reasons.join('\n'),
    reasons
  };
}

export function analyzeAmy({h1=[],m15=[],m5=[],m1=[],d1=[],nowSeconds,settings={}}){
  const H=clean(h1,nowSeconds,3600),M=clean(m15,nowSeconds,900),T=clean(m5,nowSeconds,300),I=clean(m1,nowSeconds,60),D=clean(d1,nowSeconds);
  const dashboard=dashboardEngine(M,settings),trigger=triggerEngine(T,settings),levels=keyLevels({m1:I,d1:D,m15:M,nowSeconds});
  const pivots=pivotSources(D,nowSeconds);
  const signals=[],keyHistory=keyLevelHistory(I);let cursor=0,keyCursor=0;
  for(const t of trigger){while(cursor+1<dashboard.history.length&&dashboard.history[cursor+1].time<=t.time)cursor++;
    const d=dashboard.history[cursor];if(!d||d.time>t.time)continue;
    // Key levels must be evaluated as of this candle, never with today's final Asia range.
    while(keyCursor+1<keyHistory.length&&keyHistory[keyCursor+1].time<=t.time)keyCursor++;
    const historicLevels=keyHistory[keyCursor]?.time<=t.time&&t.time-keyHistory[keyCursor].time<=900?keyHistory[keyCursor]:{};
    const entry=entryScore(d,t,historicLevels,settings);if(entry.score>=60&&d.biasDir&&entry.winDir===d.biasDir&&d.invalidStatus<2)signals.push({...entry,time:t.candle.open_time});
  }
  const current=dashboard.current,latestTrigger=last(trigger)||null,entry=entryScore(current,latestTrigger,levels,settings);
  const m15Conf=m15Confirmation(current,levels);
  const assistant=entryAssistantV3(current,T,levels,pivots,settings);
  const visuals=baseVisuals(M,settings);
  return {
    chartCandles:{M15:M.slice(-500),M5:T.slice(-500),M1:I.slice(-500)},
    policy:AMY_POLICY,
    dashboard:current,
    entry,
    assistant,
    plan:assistant.plan,
    trigger:latestTrigger,
    levels,
    pivots,
    m15Confirmation:m15Conf,
    events:dashboard.events,
    signals:signals.slice(-100),
    h1:dashboardEngine(H,settings).current,
    visuals,
    bpr:visuals.bpr,
    vi:visuals.vi,
    gaps:visuals.gaps,
    session:sessions(nowSeconds),
    source:{H1:last(H)?.close_time??null,M15:last(M)?.close_time??null,M5:last(T)?.close_time??null,M1:last(I)?.close_time??null,D1:last(D)?.close_time??null}
  };
}

// ICT base visuals are independent references, not an alternative entry engine.
export function baseVisuals(candles,options={}){
  const s={...DEFAULTS,...options},atr10=wilderAtr(candles,10),fvg=[],implied=[],vi=[],ob=[],gaps=[],events=[],zig=[],liquidity=[];
  let direction=0,os=0,top=null,btm=null,friday=null,lastBull=null,lastBear=null;
  const max=c=>s.useBody?Math.max(c.open,c.close):c.high,min=c=>s.useBody?Math.min(c.open,c.close):c.low;
  for(let i=0;i<candles.length;i++){
    const c=candles[i],b=candles[i-1],a=candles[i-2];
    const p=pivotAt(candles,i,s.baseLen,1);
    for(const [point,dir] of [[p.high,1],[p.low,-1]])if(point){
      if(last(zig)?.dir===dir){if(dir===1?point.level>last(zig).level:point.level<last(zig).level)zig[zig.length-1]={...point,dir};}
      else zig.push({...point,dir});
      const margin=atr10[i]!=null?atr10[i]/2.5:null;
      if(margin){const matches=[];for(const x of zig.slice(-50).reverse()){if(x.dir!==dir)continue;if(dir===1?x.level>point.level+margin:x.level<point.level-margin)break;if(Math.abs(x.level-point.level)<margin)matches.push(x);}
        if(matches.length>2){const from=last(matches),center=(Math.max(...matches.map(x=>x.level))+Math.min(...matches.map(x=>x.level)))/2,id=`LIQ:${dir}:${from.time}`;
          const existing=liquidity.find(x=>x.id===id),item={id,kind:'LIQ',side:dir===1?'BUY':'SELL',low:center-margin,high:center+margin,level:from.level,time:from.time,formedAt:c.close_time,status:'ACTIVE'};
          if(existing)Object.assign(existing,item);else liquidity.push(item);}
      }
    }
    const rev=zig.slice(-3).reverse(),hi=rev[2]?.dir===1?rev[2]:rev[1],lo=rev[2]?.dir===-1?rev[2]:rev[1];
    if(hi?.dir===1&&c.close>hi.level){if(direction!==1){direction=1;events.push({kind:'MSS',side:'BUY',level:hi.level,from:hi.time,time:c.close_time});lastBull=hi.level;}
      else if(lastBull!==hi.level){events.push({kind:'BOS',side:'BUY',level:hi.level,from:hi.time,time:c.close_time});lastBull=hi.level;}}
    else if(lo?.dir===-1&&c.close<lo.level){if(direction!==-1){direction=-1;events.push({kind:'MSS',side:'SELL',level:lo.level,from:lo.time,time:c.close_time});lastBear=lo.level;}
      else if(lastBear!==lo.level){events.push({kind:'BOS',side:'SELL',level:lo.level,from:lo.time,time:c.close_time});lastBear=lo.level;}}
    const three=a&&pair(a,b)&&pair(b,c);
    if(three){
      const meanBody=i>=s.baseLen&&consecutive(candles.slice(i-s.baseLen,i))?mean(candles.slice(i-s.baseLen,i).map(body)):null;
      const displacement=meanBody!=null&&body(b)>meanBody&&b.high-Math.max(b.open,b.close)<body(b)*.36&&Math.min(b.open,b.close)-b.low<body(b)*.36;
      if(displacement&&b.close>b.open){if(c.low>a.high)fvg.push(zone('FVG','BUY',a.high,c.low,c,i));else if(c.low<a.high)implied.push(zone('IFVG','BUY',c.low,a.high,c,i));}
      if(displacement&&b.close<b.open){if(c.high<a.low)fvg.push(zone('FVG','SELL',c.high,a.low,c,i));else if(c.high>a.low)implied.push(zone('IFVG','SELL',a.low,c.high,c,i));}
    }
    if(pair(b,c)){
      const bl=c.open>b.close&&b.high>c.low&&c.close>b.close&&c.open>b.open&&b.high<Math.min(c.open,c.close);
      const br=c.open<b.close&&b.low<c.high&&c.close<b.close&&c.open<b.open&&b.low>Math.max(c.open,c.close);
      if(bl||br)vi.push(zone('VI',bl?'BUY':'SELL',bl?Math.max(b.open,b.close):Math.max(c.open,c.close),bl?Math.min(c.open,c.close):Math.min(b.open,b.close),c,i));
    }
    // Original OB swing lookback oscillator, then extreme body/wick since its break.
    if(i>=s.obLength){const point=candles[i-s.obLength],window=candles.slice(i-s.obLength+1,i+1),prevOs=os;
      if(window.every(x=>point.high>x.high))os=0;else if(window.every(x=>point.low<x.low))os=1;
      if(os!==prevOs){if(os===0)top={level:point.high,index:i-s.obLength,crossed:false};else btm={level:point.low,index:i-s.obLength,crossed:false};}
    }
    for(const [swing,dir] of [[top,1],[btm,-1]])if(swing&&!swing.crossed&&(dir===1?c.close>swing.level:c.close<swing.level)){
      swing.crossed=true;const search=candles.slice(swing.index+1,i);if(search.length){const origin=search.reduce((x,y)=>dir===1?(min(y)<=min(x)?y:x):(max(y)>=max(x)?y:x));
        const z=zone('OB',dir===1?'BUY':'SELL',min(origin),max(origin),c,i);z.time=origin.open_time;z.breaker=false;ob.push(z);}}
    for(const z of ob){if(z.formedIndex>=i||z.removed)continue;if(!z.breaker&&(z.side==='BUY'?Math.min(c.open,c.close)<z.low:Math.max(c.open,c.close)>z.high)){z.breaker=true;z.breakTime=c.close_time;}
      else if(z.breaker&&(z.side==='BUY'?c.close>z.high:c.close<z.low))z.removed=true;}
    for(const z of [...fvg,...implied,...vi])if(z.formedIndex<i&&z.status!==4){if(z.side==='BUY'?c.low<z.low:c.high>z.high){z.status=4;z.lifecycle='BROKEN';z.end=c.close_time;}else if(overlaps(c,z)){z.status=2;z.lifecycle='TOUCHED';}}
    for(const z of gaps)if(z.formedIndex<i&&z.status!==4){if(z.side==='BUY'?c.low<z.low:c.high>z.high){z.status=4;z.lifecycle='BROKEN';z.end=c.close_time;}else if(overlaps(c,z)){z.status=2;z.lifecycle='TOUCHED';}}
    for(const z of liquidity)if(z.status==='ACTIVE'&&z.formedAt<c.close_time){if(z.side==='BUY'?c.close>z.high:c.close<z.low){z.status='TAKEN';z.end=c.close_time;}}
    const date=new Date(c.open_time*1000),weekday=date.getUTCDay(),previous=b?new Date(b.open_time*1000):null;
    if(weekday===5)friday=c;
    if(b&&date.toISOString().slice(0,10)!==previous.toISOString().slice(0,10)){
      gaps.push({kind:'NDOG',side:c.open>=b.close?'BUY':'SELL',time:b.open_time,formedAt:c.open_time,low:Math.min(c.open,b.close),high:Math.max(c.open,b.close),ce:(c.open+b.close)/2,formedIndex:i,status:1,lifecycle:'FRESH'});
      if(weekday===1&&friday)gaps.push({kind:'NWOG',side:c.open>=friday.close?'BUY':'SELL',time:friday.open_time,formedAt:c.open_time,low:Math.min(c.open,friday.close),high:Math.max(c.open,friday.close),ce:(c.open+friday.close)/2,formedIndex:i,status:1,lifecycle:'FRESH'});
    }
  }
  const bpr=[]; // causal overlap of the latest opposing FVGs at each formation event
  let up=null,dn=null;for(const z of fvg){if(z.side==='BUY')up=z;else dn=z;if(!up||!dn)continue;
    const low=Math.max(up.low,dn.low),high=Math.min(up.high,dn.high);if(low<high)bpr.push({...zone('BPR',z.side,low,high,{open_time:z.time,close_time:z.formedAt},z.formedIndex),time:Math.min(up.time,dn.time)});}
  for(const z of bpr)for(let i=z.formedIndex+1;i<candles.length&&z.status!==4;i++){const c=candles[i];if(z.side==='BUY'?c.low<z.low:c.high>z.high){z.status=4;z.lifecycle='BROKEN';z.end=c.close_time;}else if(overlaps(c,z)){z.status=2;z.lifecycle='TOUCHED';}}
  const displacement=candles.filter((c,i)=>{const m=i>=s.baseLen-1?mean(candles.slice(i-s.baseLen+1,i+1).map(body)):null;return m!=null&&body(c)>m&&c.high-Math.max(c.open,c.close)<body(c)*.36&&Math.min(c.open,c.close)-c.low<body(c)*.36;}).map(c=>({time:c.open_time,side:c.close>c.open?'BUY':'SELL'}));
  return {fvg:fvg.slice(-100),implied:implied.slice(-100),bpr:bpr.slice(-60),ob:ob.filter(z=>!z.removed).slice(-60),vi:vi.slice(-100),liquidity:liquidity.slice(-60),gaps:gaps.slice(-60),events:events.slice(-200),displacement:displacement.slice(-100)};
}
export function fibonacci(items){if(items.length<2)return [];const [a,b]=items.slice(-2),first=a.time<=b.time?a:b,second=first===a?b:a;
  const rising=second.ce>first.ce,start=rising?second.high:second.low,end=rising?first.low:first.high;
  return [0,.236,.382,.5,.618,.786,1,1.618].map(ratio=>({ratio,price:start+(end-start)*ratio,time:second.time}));}
