(function(){
  if(window.__amyfxSyncFixLoaded)return;
  window.__amyfxSyncFixLoaded=true;

  const TF_KEY='amyfx.selected.tf';
  const DEFAULT_TF_KEY='amyfx.default.tf';
  const SNAP_KEY='amyfx.mapping.last.state';
  const SETUP_DOM_KEY='amyfx.mapping.last.setup.dom';
  const TF_FALLBACK=['M1','M5','M15','M30','H1','H4','D1','W1'];

  function wibTime(){
    return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
  }

  try{
    if(typeof nowTime==='function'){
      nowTime=function(){return wibTime()};
    }
  }catch(e){}

  function getState(){
    try{return typeof window.state!=='undefined'&&window.state?window.state:null}catch(e){return null}
  }

  function getTFs(){
    try{
      if(typeof window.TF!=='undefined'&&window.TF)return Object.keys(window.TF);
    }catch(e){}
    return TF_FALLBACK;
  }

  function validTf(tf){
    return getTFs().includes(tf);
  }

  function savedTf(){
    const a=localStorage.getItem(TF_KEY);
    const b=localStorage.getItem(DEFAULT_TF_KEY);
    if(validTf(a))return a;
    if(validTf(b))return b;
    return null;
  }

  function setTf(tf,asDefault){
    if(!validTf(tf))return;
    localStorage.setItem(TF_KEY,tf);
    if(asDefault)localStorage.setItem(DEFAULT_TF_KEY,tf);
    const st=getState();
    if(st)st.tf=tf;
  }

  function emptyValue(v){
    return v===undefined||v===null||v===''||(Array.isArray(v)&&v.length===0)||(typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===0);
  }

  function cloneState(){
    const st=getState();
    if(!st||typeof st!=='object')return null;
    const out={};
    Object.keys(st).forEach(k=>{
      try{
        JSON.stringify(st[k]);
        out[k]=st[k];
      }catch(e){}
    });
    return out;
  }

  function usefulState(obj){
    try{
      const raw=JSON.stringify(obj||{});
      return /price|harga|setup|entry|score|xau|gold|tp|sl/i.test(raw);
    }catch(e){
      return false;
    }
  }

  function hasCache(){
    return !!localStorage.getItem(SNAP_KEY)||!!localStorage.getItem(SETUP_DOM_KEY);
  }

  function saveSnapshot(){
    const st=cloneState();
    if(!st||!usefulState(st))return;
    const tf=savedTf()||(st&&st.tf)||null;
    localStorage.setItem(SNAP_KEY,JSON.stringify({at:Date.now(),tf,state:st}));
  }

  function restoreSnapshot(){
    const st=getState();
    if(!st)return;

    const tf=savedTf();
    if(tf)st.tf=tf;

    let snap=null;
    try{snap=JSON.parse(localStorage.getItem(SNAP_KEY)||'null')}catch(e){}
    if(!snap||!snap.state)return;

    Object.keys(snap.state).forEach(k=>{
      if(k==='tf')return;
      if(emptyValue(st[k])&&!emptyValue(snap.state[k]))st[k]=snap.state[k];
    });

    st.__amyfxCacheAt=snap.at;
  }

  function stateConnected(){
    const st=getState();
    if(!st)return false;

    const boolKeys=['connected','isConnected','goldConnected','feedConnected','priceConnected','wsConnected','socketConnected'];
    for(const k of boolKeys){
      if(st[k]===true)return true;
    }

    const strKeys=['conn','status','connectionStatus','goldStatus','feedStatus','priceStatus','appStatus'];
    const raw=strKeys.map(k=>st[k]).filter(Boolean).join(' ');
    if(/\bconnected\b|\bonline\b/i.test(raw)&&!/\boffline\b|\bdisconnected\b/i.test(raw))return true;

    return false;
  }

  function goldConnectedFromUI(){
    const t=(document.body&&document.body.innerText)||'';
    return /Gold Price[\s\S]{0,160}\bConnected\b/i.test(t)||/XAUUSD[\s\S]{0,160}\bConnected\b/i.test(t);
  }

  function computedStatus(){
    const st=getState();
    const conn=String((st&&st.conn)||'');
    if(/\bconnected\b|\bonline\b/i.test(conn)&&!/\boffline\b|\bdisconnected\b|\bcache\b/i.test(conn))return 'Connected';
    if(stateConnected()||goldConnectedFromUI())return 'Connected';
    if(hasCache())return 'Cache';
    return 'Offline';
  }

  function forceCacheMode(){
    const st=getState();
    if(!st||!hasCache())return;

    ['offline','isOffline','feedOffline','appOffline'].forEach(k=>{
      if(k in st)st[k]=false;
    });

    ['status','connectionStatus','appStatus'].forEach(k=>{
      if(k in st&&/^offline$/i.test(String(st[k])))st[k]='Cache';
    });
  }

  function leaf(el){
    return el&&el.children&&el.children.length===0;
  }

  function syncHeader(){
    const status=computedStatus();
    const cls=status==='Connected'?'amyfx-status-connected':status==='Cache'?'amyfx-status-cache':'amyfx-status-offline';

    let targets=Array.from(document.querySelectorAll('#conn,[data-connection-status],header .status,.topbar .status'))
      .filter(el=>leaf(el)&&/^(Offline|Online|Connected|Cache)$/i.test(el.textContent.trim()));

    if(!targets.length){
      targets=Array.from(document.querySelectorAll('*')).filter(el=>{
        if(!leaf(el))return false;
        const r=el.getBoundingClientRect();
        return r.top>=0&&r.top<150&&r.left>window.innerWidth*0.45&&/^(Offline|Online|Connected|Cache)$/i.test(el.textContent.trim());
      });
    }

    targets.forEach(el=>{
      el.textContent=status;
      el.classList.remove('amyfx-status-connected','amyfx-status-cache','amyfx-status-offline');
      el.classList.add(cls);
    });
  }

  function syncScanner(){
    const status=computedStatus();
    const st=getState();
    const scannerStatus=st&&st.bg?'ON':'OFF';

    const direct=Array.from(document.querySelectorAll('[data-scanner-status]'));
    if(direct.length){
      direct.forEach(el=>{el.textContent=scannerStatus==='ON'?'📡 Background Scanner ON':'📴 Background Scanner OFF'});
      return;
    }

    Array.from(document.querySelectorAll('.settings,.scanner-card')).forEach(el=>{
      if(!/Background Scanner/i.test(el.textContent||''))return;

      const card=el.closest('section,.card,div')||el.parentElement;
      if(!card)return;

      Array.from(card.querySelectorAll('*')).forEach(x=>{
        if(!leaf(x))return;
        const tx=x.textContent.trim();
        if(/^(ON|OFF|CACHE|Offline|Connected)$/i.test(tx)){
          x.textContent=scannerStatus;
          x.classList.remove('amyfx-status-connected','amyfx-status-cache','amyfx-status-offline');
          x.classList.add(scannerStatus==='ON'?'amyfx-status-connected':scannerStatus==='CACHE'?'amyfx-status-cache':'amyfx-status-offline');
        }
      });
    });
  }

  function syncClock(){
    const tracked=Array.from(document.querySelectorAll('[data-amyfx-wib-clock]'));
    tracked.forEach(el=>{
      el.textContent='WIB '+wibTime();
    });
    if(tracked.length)return;

    Array.from(document.querySelectorAll('.muted,small,span,div')).forEach(el=>{
      if(!leaf(el))return;
      const tx=el.textContent.trim();
      if(/^WIB \d{2}:\d{2}(:\d{2})?$/.test(tx)){
        el.textContent='WIB '+wibTime();
        el.setAttribute('data-amyfx-wib-clock','1');
      }
    });
  }

  function findTfButtons(){
    return Array.from(document.querySelectorAll('button')).filter(b=>validTf(b.textContent.trim()));
  }

  function decorateTf(){
    const btns=findTfButtons();
    if(!btns.length)return;

    const grid=btns[0].closest('.tf-grid')||btns[0].parentElement;
    if(!grid)return;

    grid.classList.add('amyfx-tf-grid');

    const card=grid.closest('section,.card')||grid.parentElement;
    if(!card)return;

    card.classList.add('amyfx-tf-card');

    const cur=savedTf()||(getState()&&getState().tf)||'M5';

    btns.forEach(b=>{
      const tf=b.textContent.trim();
      b.classList.toggle('active',tf===cur);
    });

    let toolbar=card.querySelector('.amyfx-tf-toolbar');
    if(!toolbar){
      toolbar=document.createElement('div');
      toolbar.className='amyfx-tf-toolbar';
      toolbar.innerHTML=`<div><span class="amyfx-tf-title">Timeframe</span><span class="amyfx-tf-current">${cur}</span></div><button type="button" class="amyfx-tf-dots">⋮</button><div class="amyfx-tf-menu hidden"><div class="amyfx-tf-menu-title">Set default TF</div><div class="amyfx-tf-menu-grid"></div></div>`;
      card.insertBefore(toolbar,grid);

      const menu=toolbar.querySelector('.amyfx-tf-menu');
      const menuGrid=toolbar.querySelector('.amyfx-tf-menu-grid');

      getTFs().forEach(tf=>{
        const b=document.createElement('button');
        b.type='button';
        b.textContent=tf;
        b.onclick=()=>{
          setTf(tf,true);
          menu.classList.add('hidden');
          try{
            if(typeof window.runAnalysis==='function')window.runAnalysis(tf);
          }catch(e){}
          postRender();
        };
        menuGrid.appendChild(b);
      });

      toolbar.querySelector('.amyfx-tf-dots').onclick=()=>{
        menu.classList.toggle('hidden');
      };
    }else{
      const label=toolbar.querySelector('.amyfx-tf-current');
      if(label)label.textContent=cur;
    }
  }

  function findSetupCard(){
    const head=Array.from(document.querySelectorAll('h1,h2,h3,.title,.card-title'))
      .find(el=>/Setup Aktif/i.test(el.textContent||''));
    if(!head)return null;
    return head.closest('section,.card')||head.parentElement;
  }

  function setupHasData(card){
    if(!card)return false;
    const t=card.innerText||'';
    if(/tidak ada setup|no setup/i.test(t))return false;
    return /SETUP\s*\d|LIQUIDITY|ENTRY|Entry Area|Harga Sekarang|Score|TP1|TP2|SL/i.test(t);
  }

  function saveSetupDom(){
    const card=findSetupCard();
    if(!setupHasData(card))return false;
    localStorage.setItem(SETUP_DOM_KEY,card.outerHTML);
    return true;
  }

  function restoreSetupDom(){
    if(setupHasData(findSetupCard()))return;

    const st=getState();
    const hasFreshResult=!!(st&&st.result&&Array.isArray(st.result.setups));
    if(hasFreshResult){
      let active=[];
      try{
        active=typeof window.analyzeActiveSetups==='function'?window.analyzeActiveSetups(st.result.setups||[]):(st.result.setups||[]);
      }catch(e){
        active=st.result.setups||[];
      }
      if(!active||active.length===0)return;
    }

    const html=localStorage.getItem(SETUP_DOM_KEY);
    if(!html)return;

    const snapRaw = localStorage.getItem(SNAP_KEY);
    if(snapRaw) {
      try {
        const snap = JSON.parse(snapRaw);
        if(Date.now() - snap.at > 24 * 60 * 60 * 1000) return;
      } catch(e) {}
    }

    const card=findSetupCard();
    if(!card)return;

    card.outerHTML=html;

    const restored=findSetupCard();
    if(restored&&!restored.querySelector('.amyfx-cache-badge')){
      const h=Array.from(restored.querySelectorAll('h1,h2,h3')).find(x=>/Setup Aktif/i.test(x.textContent||''));
      if(h){
        const badge=document.createElement('span');
        badge.className='amyfx-cache-badge';
        badge.textContent='CACHE';
        h.appendChild(badge);
      }
    }
  }

  function postRender(){
    restoreSnapshot();
    forceCacheMode();
    syncHeader();
    syncScanner();
    syncClock();
    decorateTf();
    if(!saveSetupDom())restoreSetupDom();
  }

  document.addEventListener('click',function(e){
    const btn=e.target.closest('button');
    if(!btn)return;
    const tf=btn.textContent.trim();
    if(validTf(tf)){
      setTf(tf,false);
      setTimeout(function(){
        saveSnapshot();
        postRender();
      },80);
    }
  },true);

  try{
    if(typeof window.runAnalysis==='function'&&!window.runAnalysis.__amyfxSyncFix){
      const oldRunAnalysis=window.runAnalysis;
      window.runAnalysis=function(tf){
        if(validTf(tf))setTf(tf,false);
        restoreSnapshot();
        forceCacheMode();
        const out=oldRunAnalysis.apply(this,arguments);
        setTimeout(function(){
          saveSnapshot();
          postRender();
        },100);
        return out;
      };
      window.runAnalysis.__amyfxSyncFix=true;
    }
  }catch(e){}

  try{
    if(typeof window.render==='function'&&!window.render.__amyfxSyncFix){
      const oldRender=window.render;
      window.render=function(){
        restoreSnapshot();
        forceCacheMode();
        const out=oldRender.apply(this,arguments);
        setTimeout(postRender,0);
        return out;
      };
      window.render.__amyfxSyncFix=true;
    }
  }catch(e){}

  restoreSnapshot();
  forceCacheMode();

  setTimeout(function(){
    const tf=savedTf();
    if(tf){
      try{
        if(typeof window.runAnalysis==='function')window.runAnalysis(tf);
        else postRender();
      }catch(e){
        postRender();
      }
    }else{
      postRender();
    }
  },0);

  setInterval(function(){
    syncClock();
  },1000);

  window.addEventListener('online',postRender);
  window.addEventListener('offline',postRender);
})();
