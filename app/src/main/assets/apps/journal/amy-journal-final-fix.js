(function(){
  function ensureMeta(name, content){
    if(document.head.querySelector(`meta[name="${name}"]`)) return;
    const meta=document.createElement('meta'); meta.name=name; meta.content=content; document.head.appendChild(meta);
  }
  function ensureLink(rel, href, attrs){
    if(document.head.querySelector(`link[rel="${rel}"]`)) return;
    const link=document.createElement('link'); link.rel=rel; link.href=href;
    Object.entries(attrs||{}).forEach(([k,v])=>link.setAttribute(k,v));
    document.head.appendChild(link);
  }
  function loadScript(src){
    if(document.querySelector(`script[src="${src}"]`)) return;
    const script=document.createElement('script'); script.src=src; script.async=false; document.head.appendChild(script);
  }
  ensureMeta('theme-color','#050505');
  ensureMeta('mobile-web-app-capable','yes');
  ensureMeta('apple-mobile-web-app-capable','yes');
  ensureMeta('apple-mobile-web-app-status-bar-style','black-translucent');
  ensureMeta('robots','noindex,nofollow');
  ensureLink('manifest','/manifest.webmanifest');
  ensureLink('icon','/icons/amy-fx-192.png',{type:'image/png'});
  ensureLink('apple-touch-icon','/icons/amy-fx-180.png',{sizes:'180x180'});
  loadScript('/platform-adapter.js');
  loadScript('/member-auth.js');
  loadScript('/pwa-bootstrap.js');
})();

(function(){
  function $(s,r=document){return r.querySelector(s)}
  function updateLibraryControls(){
    const countText = ($('#libraryCount')?.textContent || '').trim();
    const count = Number((countText.match(/\d+/)||['0'])[0]);
    const hasCards = !!document.querySelector('.library-card,.item-card,[data-item-id]');
    document.body.classList.toggle('has-library-items', count > 0 || hasCards);
    const q = ($('#searchInput')?.value || '').trim();
    const hasActive = q || document.querySelector('.pill-button.is-active:not(:first-child), .filter-chip.is-active:not(:first-child)');
    document.body.classList.toggle('has-active-filter', !!hasActive);
  }
  function ensureAiKeyPanel(){
    const view = document.getElementById('assistantView');
    if(!view || document.getElementById('amyAiKeyPanel')) return;
    const panel=document.createElement('section');
    panel.id='amyAiKeyPanel'; panel.className='amy-ai-key-panel';
    panel.innerHTML=`<h3>API Key AI</h3>
      <label>Provider</label><select id="amyAiProvider"><option value="openai">ChatGPT / OpenAI</option><option value="deepseek">DeepSeek</option><option value="gemini">Gemini</option></select>
      <label>API Key</label><input id="amyAiApiKey" type="password" placeholder="Masukkan API key sesuai provider">
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button id="amySaveAiKey" type="button">Simpan API Key</button><button id="amyClearAiKey" type="button">Hapus</button></div>
      <div class="amy-ai-status" id="amyAiStatus">Tersimpan lokal di HP.</div>`;
    const first = view.firstElementChild;
    view.insertBefore(panel, first ? first.nextSibling : null);
    const provider=$('#amyAiProvider'), key=$('#amyAiApiKey'), status=$('#amyAiStatus');
    const savedProvider=localStorage.getItem('amy_ai_provider')||'openai'; provider.value=savedProvider;
    key.value=localStorage.getItem('amy_ai_key_'+savedProvider)||'';
    provider.onchange=()=>{key.value=localStorage.getItem('amy_ai_key_'+provider.value)||''};
    $('#amySaveAiKey').onclick=()=>{localStorage.setItem('amy_ai_provider',provider.value);localStorage.setItem('amy_ai_key_'+provider.value,key.value.trim());status.textContent='API key '+provider.options[provider.selectedIndex].text+' tersimpan.'};
    $('#amyClearAiKey').onclick=()=>{localStorage.removeItem('amy_ai_key_'+provider.value);key.value='';status.textContent='API key dihapus.'};
  }
  function tick(){updateLibraryControls();ensureAiKeyPanel();}
  document.addEventListener('DOMContentLoaded',tick);
  document.addEventListener('click',()=>setTimeout(tick,60),true);
  document.addEventListener('input',()=>setTimeout(tick,60),true);
  setInterval(tick,1200);
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
