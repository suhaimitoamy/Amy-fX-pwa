(function(){
  if(window.__amyfxNotifyGuardLoaded)return;
  window.__amyfxNotifyGuardLoaded=true;

  const STORE='amyfx.notify.last.sent';
  const MAX_ITEMS=120;

  function now(){return Date.now()}
  function norm(x){
    return String(x||'').replace(/\d+([.,]\d+)?/g,'#').replace(/\s+/g,' ').trim().slice(0,180);
  }
  function kind(t,b){
    const x=(String(t||'')+' '+String(b||'')).toLowerCase();
    if(x.includes('scanner terhubung'))return 'scanner_connected';
    if(x.includes('amy fx aktif'))return 'scanner_alive';
    if(x.includes('liquidity sweep')||x.includes('order block')||x.includes('fair value gap')||x.includes('displacement'))return 'setup_alert';
    if(x.includes('ssl')||x.includes('bsl'))return 'bsl_ssl_touched';
    return 'amyfx_alert';
  }
  function cooldown(k){
    if(k==='scanner_connected')return 10*60*1000;
    if(k==='scanner_alive')return 10*60*1000;
    if(k==='setup_alert')return 2*60*1000;
    if(k==='bsl_ssl_touched')return 60*1000;
    return 90*1000;
  }
  function key(t,b){
    const k=kind(t,b);
    return k+'|'+norm(t)+'|'+norm(b);
  }
  function read(){
    try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){return{}}
  }
  function write(o){
    const arr=Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,MAX_ITEMS);
    localStorage.setItem(STORE,JSON.stringify(Object.fromEntries(arr)));
  }
  function route(t,b){
    const k=kind(t,b);
    if(k==='setup_alert'||k==='bsl_ssl_touched')return 'Analyze';
    if(k==='scanner_connected'||k==='scanner_alive')return 'Dashboard';
    return 'Analyze';
  }
  function openRoute(t,b){
    const r=route(t,b);
    try{localStorage.setItem('amyfx.notification.route',r)}catch(e){}
    try{if(typeof setTab==='function')setTab(r)}catch(e){}
    try{window.focus()}catch(e){}
  }
  function allow(t,b){
    const n=now(),knd=kind(t,b),kk=key(t,b),last=read(),prev=last[kk]||0;
    if(n-prev<cooldown(knd))return false;
    last[kk]=n;
    write(last);
    return true;
  }

  try{
    if('Notification' in window && !window.Notification.__amyfxWrapped){
      const OriginalNotification=window.Notification;
      const WrappedNotification=function(title,opts){
        opts=opts||{};
        const body=opts.body||'';
        if(!allow(title,body))return null;
        const n=new OriginalNotification(title,opts);
        n.onclick=function(){openRoute(title,body)};
        return n;
      };
      Object.getOwnPropertyNames(OriginalNotification).forEach(function(k){
        try{WrappedNotification[k]=OriginalNotification[k]}catch(e){}
      });
      WrappedNotification.prototype=OriginalNotification.prototype;
      WrappedNotification.__amyfxWrapped=true;
      window.Notification=WrappedNotification;
    }
  }catch(e){}

  function wrapBridge(obj){
    if(!obj||obj.__amyfxNotifyBridgeWrapped)return;
    Object.keys(obj).forEach(function(k){
      if(!/notify|notification|alert|push/i.test(k))return;
      if(typeof obj[k]!=='function')return;
      const old=obj[k];
      obj[k]=function(){
        const args=[].slice.call(arguments);
        const title=args[0]||'Amy FX';
        const body=args[1]||args[0]||'';
        if(!allow(title,body))return null;
        try{return old.apply(this,args)}catch(e){return null}
      };
    });
    obj.__amyfxNotifyBridgeWrapped=true;
  }
  function wrapAll(){
    ['Android','AndroidBridge','AmyFX','AmyFx','Native','NotificationBridge','AppBridge'].forEach(function(n){
      try{wrapBridge(window[n])}catch(e){}
    });
  }
  wrapAll();
  setInterval(wrapAll,1500);
  window.__amyfxNotifyAllow=allow;
  window.__amyfxNotifyOpenRoute=openRoute;
})();
