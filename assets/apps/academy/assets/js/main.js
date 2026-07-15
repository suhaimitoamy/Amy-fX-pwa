/* ===== AMY TRADING ACADEMY — MAIN.JS ===== */
/* Theme Switcher | Hamburger Menu | Image Slot System */

(function() {
  'use strict';

  // Apply Theme Early to prevent flash
  var earlySavedTheme = localStorage.getItem('amy_theme');
  if (earlySavedTheme) {
    document.documentElement.dataset.theme = earlySavedTheme;
  }

  // Apply Glass Alpha Early
  var earlySavedAlpha = localStorage.getItem('amy_glass_alpha');
  if (earlySavedAlpha) {
    document.documentElement.style.setProperty('--glass-alpha', earlySavedAlpha);
  } else {
    document.documentElement.style.setProperty('--glass-alpha', '0.66');
  }

  /* ==========================================
     SECTION 1: THEME SYSTEM (15 THEMES)
     ========================================== */

  const THEMES = [
    { id: '', name: 'Emerald Light', color: '#1a7a4a', bg: '#f4f6f1' },
    { id: 'gold-luxury', name: 'Gold Luxury', color: '#b8860b', bg: '#faf6ed' },
    { id: 'midnight-green', name: 'Midnight Green', color: '#4eca8b', bg: '#0d1f17' },
    { id: 'black-gold', name: 'Black Gold', color: '#d4a832', bg: '#08080a' },
    { id: 'soft-blue', name: 'Soft Blue', color: '#3574c4', bg: '#f0f4fa' },
    { id: 'cream-classic', name: 'Cream Classic', color: '#8b6914', bg: '#f5f0e6' },
    { id: 'forest-premium', name: 'Forest Premium', color: '#5dba7d', bg: '#0f1a12' },
    { id: 'ocean-clean', name: 'Ocean Clean', color: '#0e8a9e', bg: '#f0f6f8' },
    { id: 'coffee-editorial', name: 'Coffee Editorial', color: '#8b5e3c', bg: '#f2ece4' },
    { id: 'purple-focus', name: 'Purple Focus', color: '#9b7ae4', bg: '#12101a' },
    { id: 'rose-calm', name: 'Rose Calm', color: '#c46a7a', bg: '#faf4f5' },
    { id: 'slate-modern', name: 'Slate Modern', color: '#4a5a6a', bg: '#f2f3f5' },
    { id: 'white-minimal', name: 'White Minimal', color: '#222222', bg: '#ffffff' },
    { id: 'dark-academy', name: 'Dark Academy', color: '#c8a86e', bg: '#1a1510' },
    { id: 'trading-desk', name: 'Trading Desk', color: '#00e676', bg: '#0a0e14' }
  ];

  function getCurrentTheme() {
    return localStorage.getItem('amy_theme') || '';
  }

  function setTheme(themeId) {
    if (themeId) {
      document.documentElement.dataset.theme = themeId;
      localStorage.setItem('amy_theme', themeId);
    } else {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem('amy_theme');
    }
  }

  function createThemePanel() {
    // Overlay
    var overlay = document.createElement('div');
    overlay.className = 'theme-panel-overlay';
    overlay.id = 'themePanelOverlay';
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeThemePanel();
    });

    // Panel
    var panel = document.createElement('div');
    panel.className = 'theme-panel';
    panel.innerHTML = '<h3>🎨 Pilih Tema</h3>';

    // Grid
    var grid = document.createElement('div');
    grid.className = 'theme-grid';

    var current = getCurrentTheme();
    THEMES.forEach(function(theme) {
      var opt = document.createElement('button');
      opt.className = 'theme-option' + (theme.id === current ? ' active' : '');
      opt.dataset.themeId = theme.id;
      opt.innerHTML =
        '<span class="theme-swatch" style="background:linear-gradient(135deg,' + theme.bg + ',' + theme.color + ')"></span>' +
        '<span>' + theme.name + '</span>';
      opt.addEventListener('click', function() {
        setTheme(theme.id);
        grid.querySelectorAll('.theme-option').forEach(function(o) { o.classList.remove('active'); });
        opt.classList.add('active');
      });
      grid.appendChild(opt);
    });

    panel.appendChild(grid);

    // Glass Control
    var glassControl = document.createElement('div');
    glassControl.className = 'glass-control';
    
    var glassLabel = document.createElement('label');
    glassLabel.innerHTML = '<span>Transparansi Kaca</span><span id="glassValDisplay">66%</span>';
    
    var glassRange = document.createElement('input');
    glassRange.type = 'range';
    glassRange.min = '36';
    glassRange.max = '92';
    
    var savedAlpha = localStorage.getItem('amy_glass_alpha');
    var currentAlpha = savedAlpha ? parseFloat(savedAlpha) : 0.66;
    glassRange.value = Math.round(currentAlpha * 100);
    
    var displaySpan = glassLabel.querySelector('#glassValDisplay');
    displaySpan.textContent = glassRange.value + '%';
    
    glassRange.addEventListener('input', function() {
      var val = parseInt(this.value, 10);
      var alpha = val / 100;
      document.documentElement.style.setProperty('--glass-alpha', alpha);
      displaySpan.textContent = val + '%';
      localStorage.setItem('amy_glass_alpha', alpha);
    });
    
    var glassNote = document.createElement('small');
    glassNote.textContent = 'Sesuaikan efek tembus pandang (glass) sesuai selera Anda.';
    
    glassControl.appendChild(glassLabel);
    glassControl.appendChild(glassRange);
    glassControl.appendChild(glassNote);
    
    panel.appendChild(glassControl);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'theme-panel-close';
    closeBtn.textContent = 'Tutup';
    closeBtn.addEventListener('click', closeThemePanel);
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  function openThemePanel() {
    var overlay = document.getElementById('themePanelOverlay');
    if (overlay) overlay.classList.add('active');
  }

  function closeThemePanel() {
    var overlay = document.getElementById('themePanelOverlay');
    if (overlay) overlay.classList.remove('active');
  }

  function injectThemeToggle() {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    var navlinks = nav.querySelector('.navlinks');
    if (!navlinks) return;

    var btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.id = 'themeToggleBtn';
    btn.innerHTML = '🎨 Tema';
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      openThemePanel();
    });

    // Insert before hamburger or at end of nav
    var hamburger = nav.querySelector('.hamburger');
    if (hamburger) {
      nav.insertBefore(btn, hamburger);
    } else {
      nav.appendChild(btn);
    }
  }

  /* ==========================================
     SECTION 2: HAMBURGER MENU
     ========================================== */

  function initHamburger() {
    var hamburger = document.getElementById('hamburger');
    var navlinks = document.getElementById('navlinks');
    if (!hamburger || !navlinks) return;

    var overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    document.body.appendChild(overlay);

    var closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.className = 'drawer-close-btn';
    navlinks.insertBefore(closeBtn, navlinks.firstChild);

    function toggleMenu() {
      var isOpen = navlinks.classList.contains('open');
      if (isOpen) {
        hamburger.classList.remove('active');
        navlinks.classList.remove('open');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
      } else {
        hamburger.classList.add('active');
        navlinks.classList.add('open');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    }

    hamburger.addEventListener('click', toggleMenu);
    closeBtn.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', toggleMenu);

    navlinks.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', toggleMenu);
    });
  }

  /* ==========================================
     SECTION 3: IMAGE SLOT SYSTEM
     ========================================== */

  function initImageSlots() {
    // Logika gambar sudah dikelola sepenuhnya di Admin Editor.
    // Website materi publik hanya menampilkan <img src="..."> yang sudah ada di HTML statis.
    // IndexedDB dan tombol upload/kelola gambar tidak lagi digunakan di sini.
  }

  function escHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  /* ==========================================
     SECTION 4: MOBILE UX & INITIALIZATION
     ========================================== */

  function initLanjutBelajar() {
    var container = document.getElementById('lanjutBelajarContainer');
    if (!container) return;
    
    container.style.display = 'block';
    
    var titleEl = document.getElementById('lanjutBelajarTitle');
    var btnEl = document.getElementById('lanjutBelajarBtn');
    
    var lastTitle = localStorage.getItem('amy_last_opened_title');
    var lastUrl = localStorage.getItem('amy_last_opened_url');
    
    if (lastTitle && lastUrl) {
      titleEl.textContent = lastTitle;
      btnEl.href = lastUrl;
    }
  }

  function trackReadingProgress() {
    var article = document.querySelector('.article-layout .article, .article');
    if (article && !article.querySelector('.chapter-list')) {
      var h1 = article.querySelector('h1');
      if (h1) {
        localStorage.setItem('amy_last_opened_title', h1.textContent);
        localStorage.setItem('amy_last_opened_url', window.location.href);
      }
    }
  }

  function updateCourseProgress() {
    var lastUrl = localStorage.getItem('amy_last_opened_url') || '';
    var courseCards = document.querySelectorAll('.course-card');
    courseCards.forEach(function(card) {
      var link = card.querySelector('a');
      if (!link) return;
      var href = link.getAttribute('href');
      var folderMatch = href.match(/bagian-\d+[^/]+/);
      if (folderMatch) {
        var folder = folderMatch[0];
        var badge = document.createElement('span');
        badge.className = 'progress-badge';
        badge.style.fontSize = '12px';
        badge.style.fontWeight = '700';
        badge.style.padding = '4px 10px';
        badge.style.borderRadius = '99px';
        badge.style.marginBottom = '8px';
        badge.style.display = 'inline-block';
        badge.style.width = 'fit-content';
        
        if (lastUrl.indexOf(folder) !== -1) {
          badge.textContent = 'Sedang dipelajari';
          badge.style.background = 'var(--accent-soft)';
          badge.style.color = 'var(--accent)';
        } else {
          badge.textContent = 'Belum mulai';
          badge.style.background = 'var(--surface-soft)';
          badge.style.color = 'var(--muted)';
          badge.style.border = '1px solid var(--border)';
        }
        card.insertBefore(badge, card.firstChild);
      }
    });
  }

  function initFilters() {
    var filterBtns = document.querySelectorAll('.filter-btn');
    if (filterBtns.length === 0) return;
    
    filterBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        filterBtns.forEach(function(b) {
          b.classList.remove('active');
          b.classList.add('ghost');
        });
        btn.classList.add('active');
        btn.classList.remove('ghost');
        
        var filter = btn.dataset.filter;
        var panels = document.querySelectorAll('.panel');
        panels.forEach(function(panel) {
          if (filter === 'Semua' || panel.dataset.category === filter) {
            panel.style.display = 'block';
          } else {
            panel.style.display = 'none';
          }
        });
      });
    });
  }

  function initReaderMode() {
    var article = document.querySelector('.article-layout .article, .article');
    if (!article) return;
    
    var progressBar = document.createElement('div');
    progressBar.className = 'reading-progress-bar';
    document.body.appendChild(progressBar);
    
    var fab = document.createElement('button');
    fab.className = 'fab-to-top';
    fab.innerHTML = '↑';
    fab.onclick = function() { window.scrollTo({top: 0, behavior: 'smooth'}); };
    document.body.appendChild(fab);
    
    window.addEventListener('scroll', function() {
      var winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      var height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      var scrolled = (winScroll / height) * 100;
      progressBar.style.width = scrolled + '%';
      
      if (winScroll > 300) {
        fab.classList.add('visible');
      } else {
        fab.classList.remove('visible');
      }
    });
  }

  function injectGlassCSS() {
    if (!document.getElementById('amyGlassCss')) {
      var link = document.createElement('link');
      link.id = 'amyGlassCss';
      link.rel = 'stylesheet';
      var root = (typeof ROOT_PATH !== 'undefined') ? ROOT_PATH : '';
      link.href = root + 'assets/css/glass.css';
      document.head.appendChild(link);
    }
  }

  function init() {
    injectGlassCSS();
    createThemePanel();
    injectThemeToggle();
    initHamburger();
    initImageSlots();
    initLanjutBelajar();
    trackReadingProgress();
    updateCourseProgress();
    initFilters();
    initReaderMode();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();


// GLOBAL AMY FX JS SYSTEM
window.showToast = function(msg) {
  if ('vibrate' in navigator) navigator.vibrate(50);
  let container = document.getElementById('amy-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'amy-toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'amy-toast';
  toast.textContent = String(msg || "");
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3000);
};

window.triggerHaptic = function(pattern) {
  if ('vibrate' in navigator) navigator.vibrate(pattern || 20);
};

if (!window.amyHapticListenerAdded) {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button, a, .clickable, .nav-btn, .action-btn, .card');
      if (btn) window.triggerHaptic(20);
    });
    window.amyHapticListenerAdded = true;
}


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

