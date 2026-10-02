import {createIctCanvas} from './ict-canvas.js';
// Shared presentation only; candle/model ownership remains with each caller.
export function createPriceChart(element,{touchAxes=false}={}) {
  const chart=window.LightweightCharts.createChart(element,{autoSize:true,
    timeScale:{timeVisible:true},rightPriceScale:{minimumWidth:65},
    handleScale:{pinch:true,mouseWheel:true,axisPressedMouseMove:{time:true,price:true},axisDoubleClickReset:{time:true,price:true}},
    handleScroll:{vertTouchDrag:touchAxes,horzTouchDrag:true,pressedMouseMove:true,mouseWheel:true}});
  const series=chart.addCandlestickSeries({upColor:'#65d5b1',downColor:'#ff8f9b',borderVisible:false,wickUpColor:'#65d5b1',wickDownColor:'#ff8f9b'});
  let ict=null;
  let key='',lines=[],rightBars=null;
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
      if(presentation&&rightBars!==presentation.settings.rightBars){rightBars=presentation.settings.rightBars;chart.applyOptions({timeScale:{rightOffset:rightBars}});}
      ict?.update(presentation?{...presentation,candles:result.candles,tf:result.tf}:null);
      const signalMarkers=[];
      if(presentation?.amy&&presentation.settings.signals){const duration={M1:60,M5:300,M15:900}[result.tf]||900,times=new Set(result.candles.map(c=>c.time)),seen=new Set();
        for(const signal of presentation.amy.signals||[]){const time=Math.floor(signal.time/duration)*duration,id=time+':'+signal.winDir;if(!times.has(time)||seen.has(id))continue;seen.add(id);signalMarkers.push({time,position:signal.winDir===1?'belowBar':'aboveBar',color:signal.winDir===1?'#00c853':'#ef5350',shape:signal.winDir===1?'arrowUp':'arrowDown',text:`${signal.grade} ${signal.score}`});}
      }
      if(presentation?.settings.displacement&&presentation.amy){for(const marker of presentation.amy.visuals?.displacement||[])if(result.candles.some(c=>c.time===marker.time))signalMarkers.push({time:marker.time,position:marker.side==='BUY'?'belowBar':'aboveBar',color:'#f5c562',shape:'circle',text:'Disp'});}
      series.setMarkers?.(signalMarkers.sort((a,b)=>a.time-b.time));
      lines.forEach(line=>series.removePriceLine(line));lines=[];
      const markers=plan?.area?[['area.low','AREA BAWAH','#8bb9ff'],['area.high','AREA ATAS','#8bb9ff'],['area.ce','50% CE','#ffd166'],['invalidation','INVALIDASI','#ff8f9b'],['target','LIKUIDITAS','#65d5b1']]:[['entry','ENTRY','#8bb9ff'],['sl','SL','#ff8f9b'],['tp1','TP1','#65d5b1'],['tp','TARGET','#65d5b1']];
      if(plan)for(const [field,title,color] of markers){
        const value=field==='area.low'?plan.area.low:field==='area.high'?plan.area.high:field==='area.ce'?plan.area?.ce:plan[field];
        if(Number.isFinite(value)){
          const lineStyle=field==='area.ce'?2:0;
          lines.push(series.createPriceLine({price:value,title,color,lineWidth:1,lineStyle,axisLabelVisible:true}));
        }
      }
    },
    reset(){key='';rightBars=null;},
    autoPrice(){chart.priceScale('right').applyOptions({autoScale:true});ict?.invalidate();},
    resize(){chart.applyOptions({autoSize:true});ict?.invalidate();},
    setFullscreen(enabled){chart.applyOptions({layout:{fontSize:enabled?16:12},rightPriceScale:{minimumWidth:enabled?90:65}});ict?.invalidate();},
    destroy(){window.removeEventListener('amyfx:theme-change',theme);ict?.destroy();chart.remove();}
  };
}
