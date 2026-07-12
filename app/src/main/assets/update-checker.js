(function () {
  const CURRENT_VERSION_CODE = 14;
  const CURRENT_VERSION_NAME = '1.3.1';
  const UPDATE_URL = 'https://raw.githubusercontent.com/suhaimitoamy/Amy-fx/main/update.json';
  const DISMISS_KEY = 'amy_fx_update_dismissed_version';
  const LAST_CHECK_KEY = 'amy_fx_update_last_check';
  const CHECK_INTERVAL_MS = 15 * 60 * 1000;

  function css(el, styles) {
    Object.keys(styles).forEach(key => el.style[key] = styles[key]);
    return el;
  }

  function createButton(text, primary) {
    const btn = document.createElement('button');
    btn.textContent = text;
    css(btn, {
      flex: '1',
      border: primary ? '1px solid #d4af37' : '1px solid rgba(255,255,255,.18)',
      borderRadius: '14px',
      padding: '13px 10px',
      fontWeight: '900',
      background: primary ? '#d4af37' : 'rgba(255,255,255,.06)',
      color: primary ? '#111' : '#fff'
    });
    return btn;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function showUpdatePopup(data, latestCode, latestName) {
    const forceUpdate = Boolean(data.force_update ?? data.mandatory);
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!forceUpdate && dismissed === String(latestCode)) return;

    const overlay = document.createElement('div');
    css(overlay, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      background: 'rgba(0,0,0,.72)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
    });

    const box = document.createElement('div');
    css(box, {
      width: '100%',
      maxWidth: '420px',
      background: '#101010',
      color: '#fff',
      border: '1px solid rgba(212,175,55,.32)',
      borderRadius: '22px',
      padding: '20px',
      boxShadow: '0 20px 60px rgba(0,0,0,.55)'
    });

    const notes = Array.isArray(data.release_notes)
      ? data.release_notes
      : (Array.isArray(data.changelog) ? data.changelog : []);

    box.innerHTML = `
      <div style="color:#d4af37;font-weight:950;font-size:20px;margin-bottom:8px">Update Amy FX Tersedia</div>
      <div style="color:#ddd;line-height:1.5;margin-bottom:14px">
        Versi kamu: <b>${escapeHtml(CURRENT_VERSION_NAME)}</b><br>
        Versi terbaru: <b>${escapeHtml(latestName || latestCode)}</b>
      </div>
      <div style="background:#171717;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px;margin-bottom:12px">
        <div style="font-weight:900;margin-bottom:6px">Perubahan:</div>
        ${notes.length ? '<ul style="margin:0;padding-left:18px;color:#ddd;line-height:1.5">' + notes.map(x => `<li>${escapeHtml(x)}</li>`).join('') + '</ul>' : '<div style="color:#aaa">Tidak ada catatan perubahan.</div>'}
      </div>
      <div style="color:#aaa;font-size:12px;line-height:1.45;margin-bottom:16px">
        Tekan Perbarui, lalu Android akan meminta konfirmasi pemasangan. Data, jurnal, dan pengaturan tetap tersimpan.
      </div>
    `;

    const row = document.createElement('div');
    css(row, { display: 'flex', gap: '10px' });

    const updateBtn = createButton('Unduh & Perbarui', true);
    const cancelBtn = createButton(forceUpdate ? 'Nanti' : 'Batal', false);

    updateBtn.onclick = function () {
      const downloadUrl = data.apk_url || data.downloadUrl || 'https://github.com/suhaimitoamy/Amy-fx/releases/latest';
      updateBtn.disabled = true;
      updateBtn.textContent = 'Membuka unduhan...';
      window.location.href = downloadUrl;
      setTimeout(() => {
        updateBtn.disabled = false;
        updateBtn.textContent = 'Unduh & Perbarui';
      }, 4000);
    };

    cancelBtn.onclick = function () {
      if (!forceUpdate) localStorage.setItem(DISMISS_KEY, String(latestCode));
      overlay.remove();
    };

    row.appendChild(updateBtn);
    row.appendChild(cancelBtn);
    box.appendChild(row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  async function checkUpdate() {
    const now = Date.now();
    const lastCheck = Number(localStorage.getItem(LAST_CHECK_KEY) || 0);
    if (now - lastCheck < CHECK_INTERVAL_MS) return;
    localStorage.setItem(LAST_CHECK_KEY, String(now));

    try {
      const cacheSlot = Math.floor(now / CHECK_INTERVAL_MS);
      const res = await fetch(`${UPDATE_URL}?v=${cacheSlot}`, { cache: 'default' });
      if (!res.ok) return;
      const data = await res.json();
      const latestCode = Number(data.latest_version_code ?? data.versionCode ?? 0);
      const latestName = data.latest_version_name ?? data.version ?? latestCode;
      if (latestCode > CURRENT_VERSION_CODE) showUpdatePopup(data, latestCode, latestName);
    } catch (e) {
      console.log('Update check skipped:', e && e.message ? e.message : e);
    }
  }

  function scheduleCheck() {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(checkUpdate, { timeout: 5000 });
    } else {
      setTimeout(checkUpdate, 4000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleCheck, { once: true });
  } else {
    scheduleCheck();
  }
})();
