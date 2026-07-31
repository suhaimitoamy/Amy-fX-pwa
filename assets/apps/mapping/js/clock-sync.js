const WITA_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Makassar',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

let timer = 0;
let observer = null;
let lastSecond = '';

export function witaClockText(timestamp = Date.now()) {
  return WITA_FORMATTER.format(new Date(timestamp));
}

function setText(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

function hideLegacyTopStatus() {
  const top = document.getElementById('top-wib') || document.getElementById('top-wita');
  if (!top) return;
  setText(top, '');
  top.style.display = 'none';
  top.setAttribute('aria-hidden', 'true');
}

function paint(timestamp = Date.now(), force = false) {
  const time = witaClockText(timestamp);
  if (!force && time === lastSecond) return;
  lastSecond = time;

  hideLegacyTopStatus();
  setText(document.getElementById('kz-wita'), `WITA ${time}`);
  document.querySelectorAll('[data-wita-clock]').forEach(element => {
    setText(element, `WITA ${time}`);
  });
}

function boot() {
  paint(Date.now(), true);
  clearInterval(timer);
  timer = setInterval(() => paint(Date.now()), 1000);

  const app = document.getElementById('app');
  if (app) {
    observer?.disconnect();
    observer = new MutationObserver(() => paint(Date.now(), true));
    observer.observe(app, { childList: true, subtree: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) paint(Date.now(), true);
  });
}

window.AmyWibClock = {
  now: witaClockText,
  refresh: () => paint(Date.now(), true)
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
