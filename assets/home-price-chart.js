import {analyze} from './apps/mapping/js/ict-workspace/engine.js';
import {loadCandles} from './apps/mapping/js/ict-workspace/data.js';
import {createPriceChart} from './apps/mapping/js/ict-workspace/chart-view.js';

export function mountHomeChart(root) {
  const $=id=>root.querySelector('#'+id);
  let view=null,raw=null,controller=null,timer=null,generation=0,disposed=false;
  try { view=createPriceChart($('home-price-chart')); }
  catch { $('home-price-chart').textContent='Chart tidak tersedia. Coba muat ulang aplikasi.';return ()=>{}; }
  function render(degraded=false){
    const tf=$('home-chart-tf').value;
    const result=analyze({...raw,candles:raw?.candles||[],context:raw?.context||[],tf,now:Date.now()/1000,degraded:degraded||raw?.degraded||false});
    view.draw(result);
    const last=result.candles.at(-1);
    $('home-chart-price').textContent=last?last.close.toFixed(2):'—';
    $('home-chart-source').textContent=last?`${tf} · Candle ${new Date(result.sourceTime*1000).toLocaleString('id-ID',{timeZone:'Asia/Makassar',hour12:false})} WITA · ${result.fresh?'Candle terkini':'Referensi lama / data terlambat'}`:'Belum ada candle. Periksa koneksi lalu tekan Perbarui.';
    if($('home-chart-note'))$('home-chart-note').textContent=result.plan?'Level entry, SL dan target: model ICT lokal, bukan setup Scalper server.':'';
  }
  function stop(){generation++;controller?.abort();clearTimeout(timer);}
  async function refresh(){
    if(disposed||document.hidden)return;
    stop();const id=generation,tf=$('home-chart-tf').value;
    controller=new AbortController();const request=controller;
    const timeout=setTimeout(()=>request.abort(),20000);
    $('home-chart-refresh').disabled=true;$('home-chart-error').textContent='';
    if(raw)render();
    try {
      const [entry,context]=await Promise.all([loadCandles(tf,request.signal),loadCandles('H1',request.signal)]);
      if(disposed||id!==generation)return;
      const next={candles:entry.candles,context:context.candles,tf,degraded:entry.degraded||context.degraded};
      const result=analyze({...next,now:Date.now()/1000});
      const previous=raw?analyze({...raw,now:Date.now()/1000}):null;
      if(!result.candles.length||(previous&&result.sourceTime<previous.sourceTime))throw Error('Candle tidak lengkap atau lebih lama');
      raw=next;render();
    } catch {
      if(disposed||id!==generation)return;
      if(raw)raw.degraded=true;
      render(true);$('home-chart-error').textContent='Pembaruan gagal. Data sebelumnya hanya referensi lama.';
    } finally {
      clearTimeout(timeout);
      if(!disposed&&id===generation){$('home-chart-refresh').disabled=false;if(!document.hidden)timer=setTimeout(refresh,60000);}
    }
  }
  function change(){stop();raw=null;view.reset();render();refresh();}
  function visibility(){if(document.hidden)stop();else refresh();}
  function pageshow(event){if(event.persisted)refresh();}
  $('home-chart-refresh').addEventListener('click',refresh);
  $('home-chart-tf').addEventListener('change',change);
  document.addEventListener('visibilitychange',visibility);
  window.addEventListener('online',refresh);window.addEventListener('pagehide',stop);window.addEventListener('pageshow',pageshow);
  refresh();
  return ()=>{disposed=true;stop();view.destroy();
    $('home-chart-refresh').removeEventListener('click',refresh);$('home-chart-tf').removeEventListener('change',change);
    document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',refresh);
    window.removeEventListener('pagehide',stop);window.removeEventListener('pageshow',pageshow);
  };
}
window.AmyHomeChart={mount:mountHomeChart};
