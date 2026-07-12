/* Amy FX Academy authentication and PWA bootstrap */
(function(){
  function ensureMeta(name,content){
    if(document.head.querySelector(`meta[name="${name}"]`)) return;
    const meta=document.createElement('meta'); meta.name=name; meta.content=content; document.head.appendChild(meta);
  }
  function ensureLink(rel,href,attrs){
    if(document.head.querySelector(`link[rel="${rel}"]`)) return;
    const link=document.createElement('link'); link.rel=rel; link.href=href;
    Object.entries(attrs||{}).forEach(([key,value])=>link.setAttribute(key,value));
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

function waitForAmyFXAuth(timeoutMs=8000){
  return new Promise((resolve,reject)=>{
    const started=Date.now();
    const timer=setInterval(()=>{
      if(window.AmyFXAuth){clearInterval(timer);resolve(window.AmyFXAuth);return;}
      if(Date.now()-started>timeoutMs){clearInterval(timer);reject(new Error('Layanan login belum siap.'));}
    },40);
  });
}

async function requireLogin(){
  try{
    const auth=await waitForAmyFXAuth();
    await auth.ready;
    const allowed=await auth.requireAuth();
    const required=Boolean(auth.getConfig().authRequired);
    if(allowed || !required) document.documentElement.classList.add('is-authed');
    else document.documentElement.classList.remove('is-authed');
    return allowed || !required;
  }catch(error){
    console.error('Academy auth',error);
    document.documentElement.classList.remove('is-authed');
    return false;
  }
}

async function logout(){
  try{
    const auth=await waitForAmyFXAuth();
    await auth.signOut();
  }catch(error){
    console.error(error);
  }
  document.documentElement.classList.remove('is-authed');
}

window.addEventListener('amyfx:auth-change',(event)=>{
  const config=window.AmyFXAuth?.getConfig?.()||{};
  if(event.detail?.authenticated || !config.authRequired){
    document.documentElement.classList.add('is-authed');
  }else{
    document.documentElement.classList.remove('is-authed');
  }
});

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
