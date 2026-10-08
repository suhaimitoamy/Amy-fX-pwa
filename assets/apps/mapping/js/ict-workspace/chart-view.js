import {createIctCanvas} from './ict-canvas.js';
import {calculateNextGenIndicators} from './nextgen-indicators.js';
// Shared presentation only; candle/model ownership remains with each caller.
export function createPriceChart(element,{touchAxes=false}={}) {
  const chart=window.LightweightCharts.createChart(element,{autoSize:true,
    timeScale:{timeVisible:true},rightPriceScale:{minimumWidth:65,autoScale:true},
    handleScale:{pinch:true,mouseWheel:true,axisPressedMouseMove:{time:true,price:true},axisDoubleClickReset:{time:true,price:true}},
    handleScroll:{vertTouchDrag:touchAxes,horzTouchDrag:true,pressedMouseMove:true,mouseWheel:true}});
  const series=chart.addCandlestickSeries({upColor:'#65d5b1',downColor:'#ff8f9b',borderVisible:false,wickUpColor:'#65d5b1',wickDownColor:'#ff8f9b'});
  let ict=null;
  let key='',lines=[],indicatorLines=[],rightBars=null;
  function theme(){
    const light=document.documentElement.dataset.amyfxTheme==='light';
    chart.applyOptions({layout:{background:{color:light?'#edf1fc':'#293b60'},textColor:light?'#475977':'#ced9ed'},
      grid:{vertLines:{color:light?'#dce3f2':'#3c5176'},horzLines:{color:light?'#dce3f2':'#3c5176'}}});
    ict?.invalidate();
  }
  theme();window.addEventListener('amyfx:theme-change',theme);
  return {
    draw(result,plan=result.plan,presentation=null){
      const next=result.tf+JSON.stringify(result.candles);
      if(next!==key){const initial=!key;series.setData(result.candles);key=result.candles.length?next:'';if(initial&&result.candles.length)chart.timeScale().fitContent();}
      if(presentation&&!ict)ict=createIctCanvas(element,chart,series);
      if(presentation&&rightBars!==presentation.settings?.rightBars){rightBars=presentation.settings.rightBars;chart.applyOptions({timeScale:{rightOffset:rightBars}});}

      const getInd=typeof calculateNextGenIndicators==='function'?calculateNextGenIndicators:null;
      const indicators=presentation?(presentation.indicators||(getInd?getInd(result.candles,{context:presentation.context||(presentation.amy?{amy:presentation.amy}:null)}):null)):null;

      ict?.update(presentation?{...presentation,indicators,candles:result.candles,tf:result.tf}:null);
      const signalMarkers=[];
      if(presentation?.amy&&presentation.settings?.signals){const duration={M1:60,M5:300,M15:900}[result.tf]||900,times=new Set(result.candles.map(c=>c.time)),seen=new Set();
        for(const signal of presentation.amy.signals||[]){const time=Math.floor(signal.time/duration)*duration,id=time+':'+signal.winDir;if(!times.has(time)||seen.has(id))continue;seen.add(id);signalMarkers.push({time,position:signal.winDir===1?'belowBar':'aboveBar',color:signal.winDir===1?'#00c853':'#ef5350',shape:signal.winDir===1?'arrowUp':'arrowDown',text:`${signal.grade} ${signal.score}`});}
      }
      if(presentation?.settings?.displacement&&presentation.amy){for(const marker of presentation.amy.visuals?.displacement||[])if(result.candles.some(c=>c.time===marker.time))signalMarkers.push({time:marker.time,position:marker.side==='BUY'?'belowBar':'aboveBar',color:'#f5c562',shape:'circle',text:'Disp'});}
      series.setMarkers?.(signalMarkers.sort((a,b)=>a.time-b.time));

      lines.forEach(line=>series.removePriceLine(line));lines=[];
      if(plan){
        if(plan.area){
          const markers=[['area.low','AREA BAWAH','#8bb9ff',0],['area.high','AREA ATAS','#8bb9ff',0],['area.ce','50% CE','#ffd166',2],['invalidation','INVALIDASI','#ef4444',1],['target','LIKUIDITAS','#22c55e',0]];
          for(const [field,title,color,lineStyle] of markers){
            const value=field==='area.low'?plan.area.low:field==='area.high'?plan.area.high:field==='area.ce'?plan.area?.ce:plan[field];
            if(Number.isFinite(value)){
              const lastPrice=result.candles?.at(-1)?.close;
              if(lastPrice&&Math.abs(value-lastPrice)>lastPrice*0.25)continue;
              lines.push(series.createPriceLine({price:value,title,color,lineWidth:1,lineStyle,axisLabelVisible:true}));
            }
          }
        }else{
          const entryVal=plan.entry;
          const slVal=plan.stopLoss??plan.sl;
          const tp1Val=plan.target1??plan.tp1;
          const tp2Val=plan.target2??plan.target??plan.tp;
          const items=[
            {value:entryVal,title:'ENTRY',color:'#38bdf8',lineStyle:0},
            {value:slVal,title:'SL',color:'#ef4444',lineStyle:0},
            {value:tp1Val,title:'TP1',color:'#eab308',lineStyle:0},
            {value:tp2Val,title:tp1Val?'TP2':'TARGET',color:'#22c55e',lineStyle:0}
          ];
          const lastPrice=result.candles?.at(-1)?.close;
          for(const it of items){
            if(Number.isFinite(it.value)){
              if(lastPrice&&Math.abs(it.value-lastPrice)>lastPrice*0.25)continue;
              lines.push(series.createPriceLine({price:it.value,title:it.title,color:it.color,lineWidth:1,lineStyle:it.lineStyle,axisLabelVisible:true}));
            }
          }
        }
      }

      indicatorLines.forEach(line=>{try{series.removePriceLine(line);}catch(_){}});indicatorLines=[];
      if(presentation&&typeof series.createPriceLine==='function'&&indicators?.keyLevels){
        const kl=indicators.keyLevels,lastPrice=result.candles?.at(-1)?.close;
        const valid=v=>Number.isFinite(v)&&(!lastPrice||Math.abs(v-lastPrice)<=lastPrice*0.25);
        if(valid(kl.pdh))indicatorLines.push(series.createPriceLine({price:kl.pdh,title:'PDH',color:'#f97316',lineWidth:1,lineStyle:2,axisLabelVisible:true}));
        if(valid(kl.pdl))indicatorLines.push(series.createPriceLine({price:kl.pdl,title:'PDL',color:'#3b82f6',lineWidth:1,lineStyle:2,axisLabelVisible:true}));
        if(valid(kl.pwh))indicatorLines.push(series.createPriceLine({price:kl.pwh,title:'PWH',color:'#d946ef',lineWidth:1,lineStyle:1,axisLabelVisible:true}));
        if(valid(kl.pwl))indicatorLines.push(series.createPriceLine({price:kl.pwl,title:'PWL',color:'#06b6d4',lineWidth:1,lineStyle:1,axisLabelVisible:true}));
        if(valid(kl.pdEq))indicatorLines.push(series.createPriceLine({price:kl.pdEq,title:'PD EQ',color:'#94a3b8',lineWidth:1,lineStyle:2,axisLabelVisible:true}));
        if(indicators.structure?.invalidation&&valid(indicators.structure.invalidation.level)){
          const inv=indicators.structure.invalidation;
          indicatorLines.push(series.createPriceLine({price:inv.level,title:inv.text||'INVALID',color:inv.color||'#ef4444',lineWidth:1,lineStyle:1,axisLabelVisible:true}));
        }
      }
    },
    reset(){key='';rightBars=null;indicatorLines.forEach(line=>{try{series.removePriceLine(line);}catch(_){}});indicatorLines=[];},
    autoPrice(){chart.priceScale('right').applyOptions({autoScale:true});ict?.invalidate();},
    resize(){chart.applyOptions({autoSize:true});if(element?.clientWidth&&chart.resize)chart.resize(element.clientWidth,element.clientHeight||460);ict?.invalidate();},
    setFullscreen(enabled){
      chart.applyOptions({
        layout:{fontSize:enabled?16:12},
        rightPriceScale:{minimumWidth:enabled?90:65},
        handleScroll:{vertTouchDrag:enabled?true:Boolean(touchAxes),horzTouchDrag:true,pressedMouseMove:true,mouseWheel:true},
        handleScale:{pinch:true,mouseWheel:true,axisPressedMouseMove:{time:true,price:true},axisDoubleClickReset:{time:true,price:true}}
      });
      ict?.invalidate();
    },
    destroy(){window.removeEventListener('amyfx:theme-change',theme);ict?.destroy();indicatorLines.forEach(line=>{try{series.removePriceLine(line);}catch(_){}});chart.remove();}
  };
}
