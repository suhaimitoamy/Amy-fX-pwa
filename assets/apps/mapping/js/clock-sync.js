import { state } from './main.js';

const WIB_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

let timer = 0;
let observer = null;
let lastSecond = '';

export function wibClockText(timestamp = Date.now()) {
  return WIB_FORMATTER.format(new Date(timestamp));
}

function setText(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

function paint(timestamp = Date.now(), force = false) {
  const time = wibClockText(timestamp);
  if (!force && time === lastSecond) return;
  lastSecond = time;

  const top = document.getElementById('top-wib');
  if (top) {
    const connection = state.conn === 'Connected' ? '● Live Price' : `○ ${state.conn}`;
    setText(top, `${connection} • WIB ${time}`);
  }

  setText(document.getElementById('kz-wib'), `WIB ${time}`);
  document.querySelectorAll('[data-wib-clock]').forEach(element => {
    setText(element, `WIB ${time}`);
  });
}

function boot() {
  paint(Date.now(), true);
  clearInterval(timer);
  timer = setInterval(() => paint(Date.now()), 250);

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
  now: wibClockText,
  refresh: () => paint(Date.now(), true)
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
