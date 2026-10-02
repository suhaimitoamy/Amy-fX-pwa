const HtmlIO = {
  importHtml(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    
    const metadata = {
      title: doc.querySelector('h1') ? doc.querySelector('h1').innerText : '',
      eyebrow: doc.querySelector('.eyebrow') ? doc.querySelector('.eyebrow').innerText : '',
      sourceNote: doc.querySelector('.source-note') ? doc.querySelector('.source-note').innerHTML : '',
      prevLink: '',
      nextLink: ''
    };
    
    // Extract prev/next links
    const pageNavLinks = doc.querySelectorAll('.page-nav a.btn');
    if (pageNavLinks.length >= 2) {
      if (!pageNavLinks[0].classList.contains('gold')) {
        metadata.prevLink = pageNavLinks[0].getAttribute('href');
      }
      metadata.nextLink = pageNavLinks[pageNavLinks.length - 1].getAttribute('href');
    }
    
    // Extract blocks from article
    const article = doc.querySelector('.article');
    const blocks = [];
    
    if (article) {
      // Remove metadata elements from article before parsing children
      const toRemove = article.querySelectorAll('.breadcrumb, .eyebrow, h1, .source-note, .page-nav');
      toRemove.forEach(el => el.remove());
      
      Array.from(article.children).forEach(child => {
        const id = 'block_' + Math.random().toString(36).substr(2, 9);
        
        if (child.tagName === 'P') {
          blocks.push({ id, type: 'paragraph', content: child.innerHTML });
        } else if (child.tagName === 'H2') {
          blocks.push({ id, type: 'heading2', content: child.innerHTML });
        } else if (child.tagName === 'H3') {
          blocks.push({ id, type: 'heading3', content: child.innerHTML });
        } else if (child.tagName === 'UL' || child.tagName === 'OL') {
          const listItems = Array.from(child.children).map(li => li.innerHTML);
          blocks.push({ id, type: 'list', listType: child.tagName.toLowerCase(), listItems });
        } else if (child.tagName === 'BLOCKQUOTE') {
          blocks.push({ id, type: 'blockquote', content: child.innerHTML });
        } else if (child.tagName === 'DIV' && child.classList.contains('warning')) {
          blocks.push({ id, type: 'warning', content: child.innerHTML });
        } else if (child.tagName === 'DIV' && child.classList.contains('note')) {
          blocks.push({ id, type: 'note', content: child.innerHTML });
        } else if (child.tagName === 'DIV' && child.classList.contains('image-slot')) {
          const img = child.querySelector('img');
          const captionEl = child.querySelector('.slot-caption');
          let imageUrl = '';
          if (img) imageUrl = img.getAttribute('src') || '';
          
          // Ignore base64
          if (imageUrl.startsWith('data:image')) {
            imageUrl = '';
          }
          
          let caption = '';
          if (captionEl) caption = captionEl.innerText;
          
          blocks.push({ 
            id, 
            type: 'image', 
            imageUrl, 
            imageCaption: caption,
            imageSize: child.style.maxWidth || '100%',
            imagePosition: child.style.textAlign || 'center'
          });
        }
      });
    }
    
    return { metadata, blocks };
  },
  
  exportHtml(metadata, blocks) {
    let blocksHtml = '';
    
    blocks.forEach(block => {
      switch (block.type) {
        case 'paragraph':
          blocksHtml += `<p>${block.content}</p>\n`;
          break;
        case 'heading2':
          blocksHtml += `<h2>${block.content}</h2>\n`;
          break;
        case 'heading3':
          blocksHtml += `<h3>${block.content}</h3>\n`;
          break;
        case 'list':
          const itemsHtml = block.listItems.map(item => `<li>${item}</li>`).join('');
          blocksHtml += `<${block.listType}>${itemsHtml}</${block.listType}>\n`;
          break;
        case 'blockquote':
          blocksHtml += `<blockquote>${block.content}</blockquote>\n`;
          break;
        case 'warning':
          blocksHtml += `<div class="warning">${block.content}</div>\n`;
          break;
        case 'note':
          blocksHtml += `<div class="note">${block.content}</div>\n`;
          break;
        case 'code':
          blocksHtml += `<pre><code>${block.content}</code></pre>\n`;
          break;
        case 'image':
          if (block.imageUrl && (block.imageUrl.startsWith('http') || block.imageUrl.startsWith('../images/'))) {
            blocksHtml += `<div class="image-slot" style="text-align:${block.imagePosition}; max-width:${block.imageSize}; margin: 28px auto;">\n`;
            blocksHtml += `  <img src="${block.imageUrl}" alt="${block.imageCaption || 'Gambar materi'}" style="width:100%; border-radius:8px;">\n`;
            if (block.imageCaption) {
              blocksHtml += `  <p class="slot-caption">${block.imageCaption}</p>\n`;
            }
            blocksHtml += `</div>\n`;
          } else {
            blocksHtml += `<div class="image-slot" style="text-align:center; max-width:100%; margin: 28px auto;">\n  <p class="slot-caption" style="color:#999;">[Slot Gambar Kosong]</p>\n</div>\n`;
          }
          break;
      }
    });
    
    let prevHtml = metadata.prevLink ? `<a class="btn" href="${metadata.prevLink}">← Sebelumnya</a>` : `<span></span>`;
    let nextHtml = metadata.nextLink ? `<a class="btn primary" href="${metadata.nextLink}">Selanjutnya →</a>` : `<span></span>`;
    
    return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${metadata.title} — Amy Trading Academy</title>
  <link rel="stylesheet" href="../assets/css/style.css">
  <link rel="stylesheet" href="../assets/css/glass.css">
  <script>const ROOT_PATH='../';</script>
  <script src="../assets/js/auth.js"></script>
  <script src="../assets/js/main.js" defer></script>
</head>
<body>
  <script>requireLogin();</script>
  <header class="topbar hide-until-auth">
    <nav class="nav">
      <a class="brand" href="../index.html"><span class="brand-mark">A</span><span>Amy Trading Academy</span></a>
      <button class="hamburger" id="hamburger" aria-label="Menu"><span></span><span></span><span></span></button>
      <div class="navlinks" id="navlinks">
        <a href="../index.html">Beranda</a>
        <a href="../daftar-materi.html">Daftar Materi</a>
        <a href="../tentang.html">Tentang</a>
        <a href="../glosarium/index.html">Glosarium</a>
        <button class="btn ghost" onclick="logout()">Keluar</button>
      </div>
    </nav>
  </header>
  <main class="container hide-until-auth">
    <div class="article-layout">
      <article class="article">
        <div class="breadcrumb"><a href="../index.html">Beranda</a> › <a href="index.html">${metadata.eyebrow}</a></div>
        <div class="eyebrow">${metadata.eyebrow}</div>
        <h1>${metadata.title}</h1>
        
${blocksHtml}
        
        <div class="source-note">${metadata.sourceNote || 'Materi ini disusun untuk Amy Trading Academy.'}</div>
        <nav class="page-nav">
          ${prevHtml}
          <a class="btn gold" href="../daftar-materi.html">Daftar Materi</a>
          ${nextHtml}
        </nav>
      </article>
      <aside class="toc-card">
        <h3>${metadata.eyebrow}</h3>
        <ul>
          <li><a class="active" href="#">${metadata.title}</a></li>
          <!-- TOC requires manual integration if full list is needed -->
        </ul>
      </aside>
    </div>
  </main>
  <footer class="footer hide-until-auth">© 2026 Amy Trading Academy. Belajar Trading dari Nol sampai Mandiri.</footer>
</body>
</html>`;
  }
};


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

