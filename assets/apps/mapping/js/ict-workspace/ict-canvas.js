import {compactChartNarration} from './ict-presentation.js';
import {baseVisuals,fibonacci,sessions} from './amy-ict.js';
const COLORS={BUY:'#00cfa0',SELL:'#ff606f',pivot:'#82a7ff',VI:'#37cde8',NWOG:'#e88eab',NDOG:'#ffc578',LIQ:'#d694ff',BPR:'#d9e68a'};
export function createIctCanvas(element,chart,series){
  const canvas=document.createElement('canvas');canvas.className='ict-overlay';canvas.setAttribute('aria-hidden','true');element.appendChild(canvas);
  const ctx=canvas.getContext('2d');let state=null,frame=null,visualKey='',visuals=null;
  const request=()=>{if(frame==null)frame=requestAnimationFrame(paint);};
  function paint(){frame=null;if(!ctx)return;const w=element.clientWidth,h=element.clientHeight,scale=window.devicePixelRatio||1;
    if(canvas.width!==Math.round(w*scale)||canvas.height!==Math.round(h*scale)){canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);canvas.style.width=w+'px';canvas.style.height=h+'px';}
    ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,w,h);if(!state?.amy||!state.candles.length)return;
    const {candles,amy,settings:s,tf}=state,seconds={M1:60,M5:300,M15:900}[tf]||900,fullscreen=Boolean(element.closest('#gold-chart-workspace.is-fullscreen')),fontSize=fullscreen?14:10,plotRight=w-chart.priceScale('right').width(),plotBottom=h-chart.timeScale().height();
    const key=tf+JSON.stringify(candles);if(key!==visualKey){visualKey=key;visuals=tf==='M15'?amy.visuals:baseVisuals(candles.map(c=>({...c,open_time:c.time,close_time:c.time+seconds})));}
    const x=t=>Number.isFinite(t)?chart.timeScale().timeToCoordinate(t):null,y=p=>series.priceToCoordinate(p);
    const logical=chart.timeScale().getVisibleLogicalRange(),first=logical?Math.max(0,Math.floor(logical.from)):0,last=Math.min(candles.length-1,logical?Math.ceil(logical.to):candles.length-1);
    const leftAt=t=>{const index=candles.findIndex(c=>c.time>=t);if(index<0)return null;const v=x(candles[index].time);return v==null?(index<first?0:null):v;};
    const light=document.documentElement.dataset.amyfxTheme==='light';
    const labelBounds=[];
    const label=(text,xx,yy,color)=>{if(!text||!s.labels||yy<fontSize||yy>plotBottom-6)return;ctx.font=fontSize+'px sans-serif';const width=Math.min(ctx.measureText(text).width+6,plotRight-xx),bounds={left:xx-2,right:xx+width,top:yy-fontSize-1,bottom:yy+3};if(labelBounds.some(b=>bounds.left<b.right&&bounds.right>b.left&&bounds.top<b.bottom&&bounds.bottom>b.top))return;labelBounds.push(bounds);ctx.fillStyle=light?'#eff4ffeb':'#07111deb';ctx.fillRect(xx-2,yy-fontSize-1,Math.min(ctx.measureText(text).width+6,plotRight-xx),fontSize+4);ctx.fillStyle=color;ctx.fillText(text,xx,yy,Math.max(0,plotRight-xx));};
    ctx.save();ctx.beginPath();ctx.rect(0,0,plotRight,plotBottom);ctx.clip();
    if(s.killzones)for(let i=first;i<=last;i++){const c=candles[i],names=sessions(c.time);const active=names.find(n=>({NY:s.ny,LONDON_OPEN:s.londonOpen,LONDON_CLOSE:s.londonClose,ASIA:s.asian})[n]);if(!active)continue;
      const xx=x(c.time),next=x(candles[i+1]?.time);if(xx==null)continue;ctx.fillStyle={NY:'#ff8c001a',LONDON_OPEN:'#00bcd41a',LONDON_CLOSE:'#2157f322',ASIA:'#e91e631a'}[active];ctx.fillRect(xx,0,(next??xx+8)-xx,plotBottom);}
    const selected=(rows,count=s.visible)=>{if(count<=0)return [];let candidates=rows||[];if(s.mode==='Present')candidates=candidates.filter(z=>!z.time||z.time>=candles.at(-1).time-500*seconds);return ['BUY','SELL'].flatMap(side=>candidates.filter(z=>z.side===side).slice(-count));};
    const box=(z,color,tag)=>{const xx=leftAt(z.time),top=y(z.high),bottom=y(z.low);if(xx==null||top==null||bottom==null||xx>plotRight)return;
      const end=z.end?leftAt(z.end):plotRight,right=Math.min(plotRight,end??plotRight);ctx.fillStyle=color+(z.status===4?'09':'17');ctx.fillRect(xx,top,right-xx,bottom-top);ctx.strokeStyle=color;ctx.lineWidth=s.lineWidth;ctx.setLineDash(z.status===4?[2,3]:z.status===2?[6,4]:[]);ctx.strokeRect(xx,top,right-xx,bottom-top);ctx.setLineDash([]);label(tag,Math.max(3,xx+4),top+12,color);
      if(z.ce!=null){const ce=y(z.ce);if(ce!=null){ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(xx,ce);ctx.lineTo(right,ce);ctx.stroke();ctx.setLineDash([]);}}};
    const lineRight=Math.min(plotRight,chart.timeScale().logicalToCoordinate(candles.length-1+s.rightBars)??plotRight);
    const line=(price,title,color,time=null,end=null)=>{const yy=y(price);if(yy==null)return;const origin=time!=null?leftAt(time):x(candles[Math.max(0,candles.length-s.backBars)]?.time);const xx=origin??0,right=end!=null?leftAt(end)??plotRight:lineRight;
      ctx.strokeStyle=color;ctx.lineWidth=s.lineWidth;ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(right,yy);ctx.stroke();label(title,Math.max(4,Math.min(xx+3,plotRight-90)),yy-3,color);};
    if(s.fvg&&!s.bpr)for(const z of selected(s.gapType==='IFVG'?visuals.implied:visuals.fvg))box(z,COLORS[z.side],`${s.gapType} · ICT`);
    if(s.bpr)for(const z of selected(visuals.bpr))box(z,COLORS.BPR,'BPR');
    if(s.ob)for(const z of [...selected((visuals.ob||[]).filter(x=>x.side==='BUY'),s.bullOb),...selected((visuals.ob||[]).filter(x=>x.side==='SELL'),s.bearOb)]){
      if(z.breaker&&!s.breaker)continue;box(z,z.breaker?'#ffc857':COLORS[z.side],`${z.side==='BUY'?'+':'−'}OB${z.breaker?' Breaker':''} · ICT`);
      if(s.polarity&&z.breaker)line(z.side==='BUY'?z.high:z.low,'Polarity change','#ffc857',z.breakTime,z.breakTime+seconds*2);}
    if(s.liquidity)for(const z of selected(visuals.liquidity))box(z,COLORS.LIQ,`${z.side==='BUY'?'Buyside':'Sellside'} Liquidity`);
    if(s.vi)for(const z of selected(visuals.vi))box({...z,end:z.time+seconds*3},COLORS.VI,'VI');
    for(const [kind,enabled,count]of [['NWOG',s.nwog,s.nwogCount],['NDOG',s.ndog,s.ndogCount]])if(enabled&&count>0)for(const z of (visuals.gaps||[]).filter(z=>z.kind===kind).slice(-count))box(z,COLORS[kind],kind);
    if(s.structure){const events=(visuals.events||[]).slice(s.mode==='Present'?-20:-150);for(const ev of events)if(ev.kind==='MSS'?s.mss:s.bos){const latest=events.findLast(item=>item.kind===ev.kind&&item.side===ev.side);line(ev.level,ev===latest?ev.kind+' · ICT':'',COLORS[ev.side],ev.from,ev.time);}}
    const d=amy.dashboard;if(d?.poi)box({...d.poi,time:d.poi.time},'#6c9eff',`AMY POI ${d.poi.kind} · ${d.poi.lifecycle}`);
    if(s.keyLevels){const k=amy.levels;for(const [name,value,on,color]of [['MO',k.midnightOpen,s.mo,'#ffdc68'],['PDH',k.pdh,s.pdh,COLORS.SELL],['PDL',k.pdl,s.pdl,COLORS.BUY],['BSL',k.bsl,s.bsl,'#d994ff'],['SSL',k.ssl,s.ssl,'#54d5ed'],['ASIA H',k.asiaHigh,s.asia,'#ffb05c'],['ASIA L',k.asiaLow,s.asia,'#50baff']])if(on&&Number.isFinite(value))line(value,`${name} ${value.toFixed(2)}`,color);}
    if(s.pivots){const p=amy.pivots?.[s.pivotTf],price=candles.at(-1).close,atr=d?.atr||0;
      for(const [name,value]of Object.entries(p||{})){const major=['PIVOT','R1','S1'].includes(name);if(s.pivotMode==='Major Only'&&!major||s.pivotMode==='Clean'&&!major&&Math.abs(price-value)>atr*s.nearAtr)continue;
        line(value,`${s.pivotTf} ${name} ${value.toFixed(2)}`,name==='PIVOT'?COLORS.pivot:name[0]==='R'?COLORS.SELL:COLORS.BUY);}}
    if(s.fib!=='NONE'){const items={FVG:visuals.fvg,BPR:visuals.bpr,OB:visuals.ob,Liq:visuals.liquidity,VI:visuals.vi,NWOG:visuals.gaps?.filter(x=>x.kind==='NWOG')}[s.fib]||[];
      const normalized=items.map(x=>({...x,ce:x.ce??(x.low+x.high)/2})),levels=fibonacci(normalized);if(levels.length){const anchors=normalized.slice(-2).sort((a,b)=>a.time-b.time),x1=leftAt(anchors[0].time),x2=leftAt(anchors[1].time),y1=y(levels[6].price),y2=y(levels[0].price);if([x1,x2,y1,y2].every(Number.isFinite)){ctx.strokeStyle='#b6c2db';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.moveTo(x2,y2);ctx.lineTo(x2,y(levels[7].price));ctx.stroke();ctx.setLineDash([]);}}for(const f of levels){const start=leftAt(f.time)??0,yy=y(f.price);if(yy==null)continue;
        ctx.strokeStyle='#ffda70';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(start,yy);ctx.lineTo(s.fibExtend?plotRight:Math.min(plotRight,start+150),yy);ctx.stroke();ctx.setLineDash([]);label(`Fib ${f.ratio} ${f.price.toFixed(2)}`,start+4,yy-3,'#ffda70');}}
    if(s.narration&&amy.entry){const lines=compactChartNarration(amy,state.news);ctx.font=(fullscreen?14:11)+'px sans-serif';const lineHeight=fullscreen?20:15,bw=Math.min(plotRight-16,fullscreen?440:300),bh=lines.length*lineHeight+12;
      ctx.fillStyle=light?'#f3f7fff0':'#07111def';ctx.fillRect(8,8,bw,bh);ctx.strokeStyle='#739bd2';ctx.strokeRect(8,8,bw,bh);ctx.fillStyle=light?'#263c60':'#e4eeff';lines.forEach((text,i)=>ctx.fillText(text,14,8+lineHeight+i*lineHeight,bw-12));}
    ctx.restore();
  }
  // Price-axis drags don't emit logical-range changes. Reproject on interaction,
  // including document-level moves when a finger/mouse leaves the chart bounds.
  let interacting=false;
  const begin=()=>{interacting=true;request();};
  const move=()=>{if(interacting)request();};
  const end=event=>{interacting=Boolean(event?.touches?.length);request();};
  const bindings=[[element,'touchstart',begin],[element,'mousedown',begin],[element,'dblclick',request],
    [document,'touchmove',move],[document,'mousemove',move],[document,'touchend',end],
    [document,'touchcancel',end],[document,'mouseup',end],[window,'blur',end]];
  for(const [target,name,handler]of bindings)target.addEventListener(name,handler,{passive:true});
  chart.timeScale().subscribeVisibleLogicalRangeChange(request);
  const observer=new ResizeObserver(request);observer.observe(element);
  return {update(next){state=next;request();},invalidate:request,destroy(){for(const [target,name,handler]of bindings)target.removeEventListener(name,handler);if(frame!=null)cancelAnimationFrame(frame);observer.disconnect();chart.timeScale().unsubscribeVisibleLogicalRangeChange(request);canvas.remove();}};
}
