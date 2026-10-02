export const PROXY='https://amy-fx.vercel.app/api/twelvedata';
export async function loadCandles(tf, signal, fetcher=fetch) {
  const interval={M1:'1min',M5:'5min',M15:'15min',H1:'1h'}[tf];
  if (!interval) throw new Error('Timeframe tidak didukung');
  const query=new URLSearchParams({symbol:'XAU/USD',interval,outputsize:'300'});
  const response=await fetcher(`${PROXY}?${query}`,{signal,cache:'no-store'});
  if (!response.ok) throw new Error(`Sumber candle ${tf}: HTTP ${response.status}`);
  const data=await response.json();
  if(data.status==='error'||!Array.isArray(data.values)||!data.values.length) throw new Error(`Candle ${tf} tidak tersedia`);
  return {candles:data.values,degraded:/stale|degraded/i.test(`${data.source||''} ${data.amyfxCacheState||''}`)};
}
