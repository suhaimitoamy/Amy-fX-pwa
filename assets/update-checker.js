(function () {
  const VERSION = window.AmyFXAppVersion || { name: '1.4.11', code: 34 };
  const CURRENT_VERSION_CODE = Number(VERSION.code) || 34;
  const CURRENT_VERSION_NAME = String(VERSION.name || '1.4.11');
  const UPDATE_URL = 'https://raw.githubusercontent.com/suhaimitoamy/Amy-fx/main/update.json';
  const CHECK_INTERVAL_MS = 15 * 60 * 1000;
  const RESUME_DELAY_MS = 900;

  let lastCheckAt = 0;
  let hiddenAt = 0;
  let popupOpen = false;
  let checkingPromise = null;
  let nativeUi = null;

  try {
    localStorage.removeItem('amy_fx_update_dismissed_version');
    localStorage.removeItem('amy_fx_update_last_check');
  } catch (_) {}

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

  function notify(message) {
    if (window.showToast) window.showToast(message);
    else console.log(message);
  }

  function humanBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function hasNativeUpdater() {
    return Boolean(window.Android && typeof window.Android.startAppUpdate === 'function');
  }

  function setNativeState(state, message) {
    const ui = nativeUi;
    if (!ui) return;
    ui.status.textContent = message || state || 'Memproses pembaruan...';

    if (state === 'starting' || state === 'downloading' || state === 'verifying') {
      ui.downloading = true;
      ui.progressWrap.style.display = 'block';
      ui.updateBtn.disabled = true;
      ui.updateBtn.textContent = state === 'verifying' ? 'Memverifikasi...' : 'Mengunduh...';
      ui.cancelBtn.textContent = 'Batalkan';
    } else if (state === 'permission') {
      ui.downloading = false;
      ui.updateBtn.disabled = true;
      ui.updateBtn.textContent = 'Menunggu izin...';
      ui.cancelBtn.textContent = 'Tutup';
    } else if (state === 'ready') {
      ui.downloading = false;
      ui.progressWrap.style.display = 'block';
      ui.bar.style.width = '100%';
      ui.percent.textContent = '100%';
      ui.updateBtn.disabled = true;
      ui.updateBtn.textContent = 'Membuka installer...';
      ui.cancelBtn.textContent = 'Tutup';
    } else if (state === 'cancelled') {
      ui.downloading = false;
      ui.updateBtn.disabled = false;
      ui.updateBtn.textContent = 'Coba Lagi';
      ui.cancelBtn.textContent = 'Tutup';
    }
  }

  window.AmyFXUpdateNative = {
    onProgress(percent, downloaded, total) {
      const ui = nativeUi;
      if (!ui) return;
      ui.progressWrap.style.display = 'block';
      const safePercent = Number(percent);
      if (Number.isFinite(safePercent) && safePercent >= 0) {
        const value = Math.max(0, Math.min(100, safePercent));
        ui.bar.style.width = `${value}%`;
        ui.percent.textContent = `${value}%`;
      } else {
        ui.bar.style.width = '22%';
        ui.percent.textContent = '...';
      }
      const received = humanBytes(downloaded);
      const expected = Number(total) > 0 ? humanBytes(total) : 'ukuran belum diketahui';
      ui.bytes.textContent = `${received} dari ${expected}`;
    },
    onState(state, message) {
      setNativeState(String(state || ''), String(message || ''));
    },
    onError(message) {
      const ui = nativeUi;
      if (!ui) {
        notify(String(message || 'Pembaruan gagal.'));
        return;
      }
      ui.downloading = false;
      ui.status.textContent = String(message || 'Pembaruan gagal.');
      ui.status.style.color = '#ff8f8f';
      ui.updateBtn.disabled = false;
      ui.updateBtn.textContent = 'Coba Lagi';
      ui.cancelBtn.textContent = 'Tutup';
    }
  };

  function showUpdatePopup(data, latestCode, latestName) {
    if (popupOpen) return;
    popupOpen = true;

    const forceUpdate = Boolean(data.force_update ?? data.mandatory);
    const overlay = document.createElement('div');
    overlay.id = 'amy-fx-update-overlay';
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
        Versi kamu: <b>${escapeHtml(CURRENT_VERSION_NAME)}</b> (${CURRENT_VERSION_CODE})<br>
        Versi terbaru: <b>${escapeHtml(latestName || latestCode)}</b> (${latestCode})
      </div>
      <div style="background:#171717;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px;margin-bottom:12px">
        <div style="font-weight:900;margin-bottom:6px">Perubahan:</div>
        ${notes.length ? '<ul style="margin:0;padding-left:18px;color:#ddd;line-height:1.5">' + notes.map(x => `<li>${escapeHtml(x)}</li>`).join('') + '</ul>' : '<div style="color:#aaa">Tidak ada catatan perubahan.</div>'}
      </div>`;

    const progressWrap = document.createElement('div');
    css(progressWrap, {
      display: 'none',
      background: '#171717',
      border: '1px solid rgba(212,175,55,.24)',
      borderRadius: '14px',
      padding: '12px',
      marginBottom: '12px'
    });
    const status = document.createElement('div');
    status.textContent = 'Menunggu unduhan...';
    css(status, { color: '#ddd', fontWeight: '800', marginBottom: '9px', lineHeight: '1.4' });
    const track = document.createElement('div');
    css(track, { height: '10px', background: '#2a2a2a', borderRadius: '999px', overflow: 'hidden' });
    const bar = document.createElement('div');
    css(bar, { width: '0%', height: '100%', background: '#d4af37', borderRadius: '999px', transition: 'width .18s ease' });
    track.appendChild(bar);
    const details = document.createElement('div');
    css(details, { display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '8px', color: '#aaa', fontSize: '12px' });
    const bytes = document.createElement('span');
    bytes.textContent = '0 MB';
    const percent = document.createElement('strong');
    percent.textContent = '0%';
    percent.style.color = '#d4af37';
    details.appendChild(bytes);
    details.appendChild(percent);
    progressWrap.appendChild(status);
    progressWrap.appendChild(track);
    progressWrap.appendChild(details);
    box.appendChild(progressWrap);

    const note = document.createElement('div');
    note.textContent = hasNativeUpdater()
      ? 'APK diunduh ke cache Amy FX, diverifikasi, lalu Android meminta konfirmasi instalasi. File tidak menumpuk di folder Download.'
      : 'Versi Amy FX ini masih memakai unduhan browser. Setelah versi 1.4.11 terpasang, update berikutnya akan berlangsung di dalam aplikasi.';
    css(note, { color: '#aaa', fontSize: '12px', lineHeight: '1.45', marginBottom: '16px' });
    box.appendChild(note);

    const row = document.createElement('div');
    css(row, { display: 'flex', gap: '10px' });

    const updateBtn = createButton('Unduh & Perbarui', true);
    const cancelBtn = createButton(forceUpdate ? 'Nanti' : 'Batal', false);

    function closePopup() {
      popupOpen = false;
      if (nativeUi?.overlay === overlay) nativeUi = null;
      overlay.remove();
    }

    function startDownload() {
      const downloadUrl = data.apk_url || data.downloadUrl || 'https://github.com/suhaimitoamy/Amy-fx/releases/latest';
      status.style.color = '#ddd';
      if (hasNativeUpdater()) {
        nativeUi = {
          overlay,
          progressWrap,
          status,
          bar,
          bytes,
          percent,
          updateBtn,
          cancelBtn,
          downloading: true
        };
        setNativeState('starting', `Menyiapkan unduhan Amy FX ${latestName}...`);
        try {
          window.Android.startAppUpdate(String(downloadUrl), String(latestName), Number(latestCode));
        } catch (error) {
          window.AmyFXUpdateNative.onError(error?.message || 'Updater native tidak dapat dijalankan.');
        }
        return;
      }

      updateBtn.disabled = true;
      updateBtn.textContent = 'Membuka unduhan...';
      window.location.href = downloadUrl;
      setTimeout(() => {
        updateBtn.disabled = false;
        updateBtn.textContent = 'Unduh & Perbarui';
      }, 4000);
    }

    updateBtn.onclick = startDownload;
    cancelBtn.onclick = function () {
      if (nativeUi?.overlay === overlay && nativeUi.downloading && window.Android?.cancelAppUpdate) {
        try { window.Android.cancelAppUpdate(); } catch (_) {}
      }
      closePopup();
    };
    row.appendChild(updateBtn);
    row.appendChild(cancelBtn);
    box.appendChild(row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  async function checkUpdate(options = {}) {
    const force = Boolean(options.force);
    const announce = Boolean(options.announce);
    const now = Date.now();

    if (checkingPromise) return checkingPromise;
    if (!force && now - lastCheckAt < CHECK_INTERVAL_MS) return { status: 'throttled' };
    lastCheckAt = now;

    checkingPromise = (async () => {
      try {
        const cacheKey = force ? now : Math.floor(now / CHECK_INTERVAL_MS);
        const res = await fetch(`${UPDATE_URL}?v=${cacheKey}`, {
          cache: force ? 'no-store' : 'default'
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const latestCode = Number(data.latest_version_code ?? data.versionCode ?? 0);
        const latestName = data.latest_version_name ?? data.version ?? latestCode;

        if (latestCode > CURRENT_VERSION_CODE) {
          showUpdatePopup(data, latestCode, latestName);
          return { status: 'update_available', latestCode, latestName };
        }

        if (announce) notify(`Amy FX v${CURRENT_VERSION_NAME} (${CURRENT_VERSION_CODE}) sudah versi terbaru.`);
        return { status: 'up_to_date', latestCode, latestName };
      } catch (error) {
        if (announce) notify('Gagal memeriksa pembaruan. Coba lagi saat koneksi stabil.');
        console.log('Update check skipped:', error?.message || error);
        return { status: 'error', error };
      } finally {
        checkingPromise = null;
      }
    })();

    return checkingPromise;
  }

  function scheduleCheck() {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => checkUpdate(), { timeout: 5000 });
    } else {
      setTimeout(() => checkUpdate(), 4000);
    }
  }

  window.AmyFXUpdate = {
    currentVersion: Object.freeze({ name: CURRENT_VERSION_NAME, code: CURRENT_VERSION_CODE }),
    nativeDownloadSupported: hasNativeUpdater,
    checkNow: options => checkUpdate({ force: true, announce: true, ...(options || {}) })
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    const wasAway = hiddenAt && Date.now() - hiddenAt > 1200;
    hiddenAt = 0;
    if (wasAway) setTimeout(() => checkUpdate({ force: true }), RESUME_DELAY_MS);
  });

  window.addEventListener('pageshow', event => {
    if (event.persisted) setTimeout(() => checkUpdate({ force: true }), RESUME_DELAY_MS);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleCheck, { once: true });
  } else {
    scheduleCheck();
  }
})();
