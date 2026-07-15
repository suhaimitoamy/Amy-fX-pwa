const ACADEMY_ACCESS_KEY='amy_academy_access_hash';
const ACADEMY_SESSION_KEY='amy_academy_session';

async function sha256Hex(message){
    const value=String(message||'');
    if(window.crypto?.subtle){
        const bytes=new TextEncoder().encode(value);
        const hash=await window.crypto.subtle.digest('SHA-256',bytes);
        return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
    }
    let hash=2166136261;
    for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}
    return String(hash>>>0);
}

async function validateCode(code){
    const value=String(code||'').trim();
    if(value.length<4)return{ok:false,label:'Kode minimal 4 karakter.'};
    const stored=localStorage.getItem(ACADEMY_ACCESS_KEY);
    const hash=await sha256Hex(value);
    if(!stored){
        localStorage.setItem(ACADEMY_ACCESS_KEY,hash);
        return{ok:true,label:'Kode akses dibuat di perangkat ini.'};
    }
    return stored===hash?{ok:true,label:'Akses diterima.'}:{ok:false,label:'Kode akses salah.'};
}

async function requireLogin(){
    if(sessionStorage.getItem(ACADEMY_SESSION_KEY)==='true'){
        document.documentElement.classList.add('is-authed');
        return true;
    }
    const firstUse=!localStorage.getItem(ACADEMY_ACCESS_KEY);
    const promptText=firstUse?'Buat kode akses Amy FX Academy (minimal 4 karakter):':'Masukkan kode akses Amy FX Academy:';
    const result=await validateCode(window.prompt(promptText)||'');
    if(!result.ok){
        document.documentElement.classList.remove('is-authed');
        window.alert(result.label);
        location.href=typeof ROOT_PATH !== 'undefined' ? ROOT_PATH+'index.html' : 'index.html';
        return false;
    }
    sessionStorage.setItem(ACADEMY_SESSION_KEY,'true');
    document.documentElement.classList.add('is-authed');
    return true;
}

function logout(){
    sessionStorage.removeItem(ACADEMY_SESSION_KEY);
    location.href=typeof ROOT_PATH !== 'undefined' ? ROOT_PATH+'index.html' : 'index.html';
}

/* Load the visible 31–36 Academy catalog on every Academy page. */
(function(){
  if(window.__amyAcademyCatalog36Loaded)return;
  window.__amyAcademyCatalog36Loaded=true;
  const script=document.createElement('script');
  const root=(typeof ROOT_PATH!=='undefined')?ROOT_PATH:'';
  script.src=root+'assets/js/catalog-36.js';
  script.async=false;
  document.head.appendChild(script);
})();

/* AMYFX_NOTIFY_GUARD_START */
(function(){
  if(window.__amyfxNotifyGuardLoaded)return;
  window.__amyfxNotifyGuardLoaded=true;

  const STORE='amyfx.notify.last.sent';
  const COOLDOWN=5*60*1000;
  const RESUME_MUTE=9000;
  const MAX_ITEMS=80;
  let muteUntil=0;

  function now(){return Date.now()}
  function norm(x){
    return String(x||'')
      .replace(/\d+([.,]\d+)?/g,'#')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0,180);
  }
  function kind(t,b){
    const x=(String(t||'')+' '+String(b||'')).toLowerCase();
    if(x.includes('scanner terhubung'))return 'scanner_connected';
    if(x.includes('amy fx aktif'))return 'scanner_alive';
    if(x.includes('liquidity sweep'))return 'liquidity_sweep';
    if(x.includes('ssl')||x.includes('bsl'))return 'bsl_ssl_touched';
    return 'amyfx_alert';
  }
  function key(t,b){
    return kind(t,b)+'|'+norm(t)+'|'+norm(b);
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
    if(k==='liquidity_sweep')return 'Analyze';
    if(k==='bsl_ssl_touched')return 'Analyze';
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
    const n=now();
    const k=key(t,b);

    if(n<muteUntil && kind(t,b)!=='scanner_alive')return false;

    const last=read();
    const prev=last[k]||0;
    if(n-prev<COOLDOWN)return false;

    last[k]=n;
    write(last);
    return true;
  }

  document.addEventListener('visibilitychange',function(){
    if(!document.hidden){
      muteUntil=now()+RESUME_MUTE;
    }
  });

  window.addEventListener('pageshow',function(){
    muteUntil=now()+RESUME_MUTE;
  });

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
/* AMYFX_NOTIFY_GUARD_END */
