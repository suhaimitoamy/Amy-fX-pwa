/* Amy FX Academy authentication bridge for the PWA. */
const ACADEMY_SESSION_KEY = 'amy_academy_session';
const academyAuthScriptUrl = new URL(document.currentScript?.src || 'auth.js', location.href);
const academyAppRootUrl = new URL('../../../../../', academyAuthScriptUrl);

function loadAmyPwaScript(filename) {
  const source = new URL(filename, academyAppRootUrl).href;
  const existing = Array.from(document.scripts).find(script => script.src === source);
  if (existing) {
    if (existing.dataset.loaded === '1') return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.async = false;
    script.addEventListener('load', () => {
      script.dataset.loaded = '1';
      resolve();
    }, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.appendChild(script);
  });
}

const academyPwaReady = (async () => {
  if (!window.AmyPlatform) await loadAmyPwaScript('platform-adapter.js');
  if (!window.AmyFXAuth) await loadAmyPwaScript('member-auth.js');
  if (!window.AmyPWA) await loadAmyPwaScript('pwa-bootstrap.js');
  await window.AmyFXAuth?.ready;
  return true;
})();

async function validateCode() {
  const ok = await requireLogin();
  return {
    ok,
    label: ok ? 'Akses member diterima.' : 'Silakan masuk menggunakan akun member Amy FX.'
  };
}

async function requireLogin() {
  try {
    await academyPwaReady;
    const ok = await window.AmyFXAuth.requireAuth();
    if (ok) {
      sessionStorage.setItem(ACADEMY_SESSION_KEY, 'true');
      document.documentElement.classList.add('is-authed');
    } else {
      sessionStorage.removeItem(ACADEMY_SESSION_KEY);
      document.documentElement.classList.remove('is-authed');
    }
    return ok;
  } catch (error) {
    console.error('Academy member authentication failed:', error);
    document.documentElement.classList.remove('is-authed');
    return false;
  }
}

async function logout() {
  try {
    await academyPwaReady;
    await window.AmyFXAuth?.signOut();
  } finally {
    sessionStorage.removeItem(ACADEMY_SESSION_KEY);
    document.documentElement.classList.remove('is-authed');
    location.href = new URL('index.html', academyAppRootUrl).href;
  }
}

/* Load the visible 31–36 Academy catalog on every Academy page. */
(function () {
  if (window.__amyAcademyCatalog36Loaded) return;
  window.__amyAcademyCatalog36Loaded = true;
  const script = document.createElement('script');
  const root = (typeof ROOT_PATH !== 'undefined') ? ROOT_PATH : '';
  script.src = root + 'assets/js/catalog-36.js';
  script.async = false;
  document.head.appendChild(script);
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { requireLogin(); }, { once: true });
} else {
  requireLogin();
}
