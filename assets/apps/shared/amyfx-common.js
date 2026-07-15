(function(){
  const KEY_THEME = 'amyfx_theme';

  window.AmyFX = window.AmyFX || {};

  AmyFX.toast = function(message){
    let el = document.getElementById('amyfx-toast');
    if(!el){
      el = document.createElement('div');
      el.id = 'amyfx-toast';
      el.style.cssText = 'position:fixed;left:16px;right:16px;bottom:84px;z-index:999999;background:#111;color:#fff;border:1px solid rgba(212,175,55,.4);border-radius:14px;padding:13px;text-align:center;font-weight:800;opacity:0;transition:.2s';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = '1';
    clearTimeout(el._timer);
    el._timer = setTimeout(()=>el.style.opacity='0',1800);
    if(window.Android && Android.triggerHaptic) Android.triggerHaptic(18);
  };

  AmyFX.setTheme = function(theme){
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(KEY_THEME, theme);
  };

  AmyFX.toggleTheme = function(){
    const current = localStorage.getItem(KEY_THEME) || 'dark';
    AmyFX.setTheme(current === 'dark' ? 'light' : 'dark');
  };

  AmyFX.initTheme = function(){
    AmyFX.setTheme(localStorage.getItem(KEY_THEME) || 'dark');
  };

  AmyFX.copyText = async function(text){
    try{
      await navigator.clipboard.writeText(text);
      AmyFX.toast('Copied!');
      return true;
    }catch(e){
      AmyFX.toast('Gagal copy');
      return false;
    }
  };

  AmyFX.sessionInfo = function(date = new Date()){
    const fmt = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false});
    const [h,m] = fmt.format(date).split(':').map(Number);
    const minutes = h*60+m;
    if(minutes >= 6*60 && minutes < 12*60) return {id:'asia', label:'Asia Session'};
    if(minutes >= 13*60 && minutes < 17*60) return {id:'london', label:'London Session'};
    if(minutes >= 19*60+30 && minutes < 23*60) return {id:'ny', label:'NY Session'};
    return {id:'deadzone', label:'Dead Zone'};
  };

  AmyFX.safeJson = function(value, fallback){
    try{return JSON.parse(value)}catch(_){return fallback}
  };

  AmyFX.initTheme();
})();
