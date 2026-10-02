// Move the existing chart, preserving its candles, viewport and touch listeners.
export function mountChartFullscreen(view){
  const workspace=document.getElementById('gold-chart-workspace');
  const button=document.getElementById('chart-fullscreen');
  if(!workspace||!button)return null;
  const placeholder=document.createComment('Gold chart position');
  const token='gold-'+Date.now();
  let active=false,scrollY=0,baseState=null,pendingBack=false,nativeActive=false;
  const ownsHistory=()=>history.state?.amyfxGoldFullscreen===token;
  const resize=()=>requestAnimationFrame(()=>{view?.resize();});
  function layout(enabled,restore=true){
    if(active===enabled)return;
    active=enabled;
    if(enabled){
      scrollY=window.scrollY;
      workspace.parentNode.insertBefore(placeholder,workspace);
      document.body.appendChild(workspace);
      workspace.setAttribute('role','dialog');workspace.setAttribute('aria-modal','true');
    }else{
      if(placeholder.parentNode)placeholder.parentNode.replaceChild(workspace,placeholder);
      workspace.removeAttribute('role');workspace.removeAttribute('aria-modal');
    }
    document.body.classList.toggle('mapping-chart-fullscreen',enabled);
    workspace.classList.toggle('is-fullscreen',enabled);
    button.textContent=enabled?'× Keluar':'⛶ Fullscreen';
    button.setAttribute('aria-label',enabled?'Keluar fullscreen Chart Gold':'Buka fullscreen Chart Gold');
    button.setAttribute('aria-pressed',String(enabled));
    view?.setFullscreen(enabled);
    requestAnimationFrame(()=>{
      view?.resize();
      if(restore&&!enabled)window.scrollTo(0,scrollY);
      if(restore)button.focus({preventScroll:true});
    });
  }
  function exitNative(){
    nativeActive=false;
    if(document.fullscreenElement===workspace&&document.exitFullscreen){
      try{Promise.resolve(document.exitFullscreen()).catch(()=>{});}catch{}
    }
  }
  function close(){
    if(!active)return;
    exitNative();layout(false);
    if(ownsHistory()){pendingBack=true;history.back();}
  }
  button.addEventListener('click',()=>{
    if(pendingBack)return;
    if(active){close();return;}
    baseState=history.state;
    // A same-document history entry lets Android's existing Back handler exit first.
    try{history.pushState({...baseState,amyfxGoldFullscreen:token},'',location.href);}catch{}
    layout(true);
    // Android WebView uses the viewport portal, just like Candle Replay.
    if(!window.Android&&workspace.requestFullscreen){
      try{Promise.resolve(workspace.requestFullscreen()).then(()=>{
        if(!active)exitNative();
      }).catch(()=>{});}catch{}
    }
  });
  window.addEventListener('popstate',()=>{pendingBack=false;if(active){exitNative();layout(false);}});
  document.addEventListener('fullscreenchange',()=>{
    if(document.fullscreenElement===workspace)nativeActive=true;
    else if(nativeActive)close();
  });
  document.addEventListener('keydown',event=>{if(active&&event.key==='Escape'){event.preventDefault();close();}});
  window.addEventListener('resize',resize);
  window.visualViewport?.addEventListener('resize',resize);
  window.addEventListener('pagehide',()=>{
    exitNative();layout(false,false);
    if(ownsHistory())try{history.replaceState(baseState,'',location.href);}catch{}
    pendingBack=false;
  });
  return {close};
}
