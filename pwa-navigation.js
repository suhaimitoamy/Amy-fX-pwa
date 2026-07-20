/* Amy FX PWA persistent dashboard navigation */
(function () {
  'use strict';

  if (window.__amyfxPwaNavigationLoaded) return;
  window.__amyfxPwaNavigationLoaded = true;

  const scriptUrl = new URL(document.currentScript?.src || 'pwa-navigation.js', location.href);
  const appRootUrl = new URL('./', scriptUrl);
  const appRootPath = appRootUrl.pathname.endsWith('/') ? appRootUrl.pathname : `${appRootUrl.pathname}/`;
  const currentPath = location.pathname.replace(/index\.html$/, '');
  const isRoot = currentPath === appRootPath || currentPath === appRootPath.replace(/\/$/, '');

  if (isRoot || document.querySelector('.amy-pwa-home-button')) return;

  const style = document.createElement('style');
  style.id = 'amy-pwa-home-button-style';
  style.textContent = `
    .amy-pwa-home-button{
      position:fixed;
      left:14px;
      bottom:calc(18px + env(safe-area-inset-bottom));
      z-index:2147481800;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:7px;
      min-height:44px;
      padding:0 14px;
      border:1px solid rgba(212,175,55,.55);
      border-radius:999px;
      background:rgba(8,8,8,.94);
      box-shadow:0 10px 28px rgba(0,0,0,.5);
      color:#f3d567;
      font:800 12px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      text-decoration:none;
      backdrop-filter:blur(12px);
      -webkit-backdrop-filter:blur(12px);
      -webkit-tap-highlight-color:transparent;
    }
    .amy-pwa-home-button:active{transform:scale(.96)}
    .amy-pwa-home-button svg{width:18px;height:18px;fill:currentColor;flex:none}
  `;
  document.head.appendChild(style);

  const home = document.createElement('a');
  home.className = 'amy-pwa-home-button';
  home.href = appRootUrl.href;
  home.setAttribute('aria-label', 'Kembali ke Dashboard Amy FX');
  home.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 2.5 11v10h6.2v-6.1h6.6V21h6.2V11L12 3.2Zm7.5 15.8h-2.2v-6.1H6.7V19H4.5v-7.1L12 5.7l7.5 6.2V19Z"/></svg><span>Dashboard</span>';
  document.body.appendChild(home);
})();
