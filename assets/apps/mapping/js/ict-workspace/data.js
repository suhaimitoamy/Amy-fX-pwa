export const PROXY='https://amy-fx.vercel.app/api/twelvedata';
export async function loadCandles(tf, signal, fetcher=fetch) {
  const interval={M1:'1min',M5:'5min',M15:'15min',H1:'1h'}[tf];
  if (!interval) throw new Error('Timeframe tidak didukung');
  const query=new URLSearchParams({symbol:'XAU/USD',interval,outputsize:'300'});
  const cacheKey=`amyfx.mapping.candles.${tf}`;

  if(fetcher!==fetch){
    const response=await fetcher(`${PROXY}?${query}`,{signal,cache:'no-store'});
    if (!response.ok) throw new Error(`Sumber candle ${tf}: HTTP ${response.status}`);
    const data=await response.json();
    if(data.status==='error'||!Array.isArray(data.values)||!data.values.length) throw new Error(`Candle ${tf} tidak tersedia`);
    return {candles:data.values,degraded:/stale|degraded/i.test(`${data.source||''} ${data.amyfxCacheState||''}`)};
  }

  const endpoints=[];
  if(typeof location!=='undefined'&&location.origin&&!location.origin.startsWith('file:')){
    endpoints.push(`/api/twelvedata?${query}`);
  }
  endpoints.push(`${PROXY}?${query}`);

  let lastError=null;
  for(const url of endpoints){
    try{
      const response=await fetcher(url,{signal,cache:'no-store'});
      if(!response.ok)continue;
      const data=await response.json();
      if(data.status==='error'||!Array.isArray(data.values)||!data.values.length)continue;
      try{
        if(typeof localStorage!=='undefined'){
          localStorage.setItem(cacheKey,JSON.stringify({time:Date.now(),values:data.values}));
        }
      }catch(_){}
      return {candles:data.values,degraded:/stale|degraded/i.test(`${data.source||''} ${data.amyfxCacheState||''}`)};
    }catch(e){
      if(e.name==='AbortError')throw e;
      lastError=e;
    }
  }

  try{
    if(typeof localStorage!=='undefined'){
      const cached=localStorage.getItem(cacheKey);
      if(cached){
        const parsed=JSON.parse(cached);
        if(Array.isArray(parsed.values)&&parsed.values.length>0){
          return {candles:parsed.values,degraded:true};
        }
      }
    }
  }catch(_){}

  try{
    if(typeof window!=='undefined'&&window.AmyMarketContext?.amy?.chartCandles?.[tf]){
      const sc=window.AmyMarketContext.amy.chartCandles[tf];
      if(sc&&sc.length>0){
        const converted=sc.map(c=>({
          datetime:new Date(c.open_time*1000).toISOString(),
          open:c.open,high:c.high,low:c.low,close:c.close
        }));
        return {candles:converted,degraded:true};
      }
    }
  }catch(_){}

  throw lastError||new Error(`Candle ${tf} tidak tersedia`);
}
