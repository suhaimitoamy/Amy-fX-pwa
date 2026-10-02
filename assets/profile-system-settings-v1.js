(function () {
  'use strict';

  if (window.__amyFxProfileSystemSettingsInstalled) return;
  window.__amyFxProfileSystemSettingsInstalled = true;

  const DARK_GLASS_PRESETS = [
    { id: 'sapphire', name: 'Safir Cobalt', background: '#070e1b', surface: '#10213d', text: '#f0f6ff', accent: '#38bdf8', opacity: 60 },
    { id: 'crystal', name: 'Kristal Es', background: '#08101a', surface: '#1a2c42', text: '#ffffff', accent: '#5de6ff', opacity: 40 },
    { id: 'obsidian', name: 'Obsidian Kaca', background: '#070b12', surface: '#111c29', text: '#f5f8fc', accent: '#69b7ff', opacity: 72 },
    { id: 'emerald', name: 'Zamrud Hutan', background: '#05130d', surface: '#0d2719', text: '#eafaf1', accent: '#34d399', opacity: 58 },
    { id: 'amethyst', name: 'Royal Amethyst', background: '#0d0718', surface: '#1f0f35', text: '#f8f0ff', accent: '#c084fc', opacity: 58 },
    { id: 'amber', name: 'Amber Gold', background: '#110b05', surface: '#2c1e0e', text: '#fff9ed', accent: '#fbbf24', opacity: 62 }
  ];

  const LIGHT_GLASS_PRESETS = [
    { id: 'frosted-light', name: 'Kristal Terang', background: '#eef4fa', surface: '#ffffff', text: '#111a25', accent: '#216bdb', opacity: 75 },
    { id: 'aqua-light', name: 'Aquamarine', background: '#e8f5f8', surface: '#cbe7ee', text: '#0d252b', accent: '#0284c7', opacity: 70 },
    { id: 'rose-light', name: 'Rose Quartz', background: '#faeff3', surface: '#f7dce5', text: '#291018', accent: '#e11d48', opacity: 70 }
  ];

  function getActivePresets() {
    return window.AmyFXTheme?.resolved === 'light' ? LIGHT_GLASS_PRESETS : DARK_GLASS_PRESETS;
  }

  function getThemeDefaults() {
    return window.AmyFXTheme?.resolved === 'light'
      ? { background: '#eef4fa', surface: '#ffffff', text: '#111a25', accent: '#216bdb', opacity: 80 }
      : { background: '#070b12', surface: '#111c29', text: '#f5f8fc', accent: '#69b7ff', opacity: 68 };
  }

  function updatePreviewCard(panel) {
    if (!panel) return;
    const colors = window.AmyFXTheme?.colors || {};
    const defaults = getThemeDefaults();
    const opacity = colors.opacity !== undefined ? Number(colors.opacity) : defaults.opacity;
    const badge = panel.querySelector('#glass-opacity-val');
    if (badge) badge.textContent = `${opacity}% Transparan`;

    const preview = panel.querySelector('#glass-preview-card');
    if (preview && colors.accent) {
      preview.style.borderColor = colors.accent;
    }
  }

  function injectSettings() {
    const selector = document.querySelector('#main-content .theme-selector');
    if (!selector || document.querySelector('[data-amyfx-color-settings]')) return;

    const colors = window.AmyFXTheme?.colors || {};
    const defaults = getThemeDefaults();
    const opacityVal = colors.opacity !== undefined ? Number(colors.opacity) : defaults.opacity;
    const presets = getActivePresets();
    const currentPreset = colors.preset || '';

    const prevTitle = selector.previousElementSibling;
    if (prevTitle && prevTitle.classList.contains('profile-section-title')) {
      prevTitle.textContent = 'Tampilan & Gaya Kaca';
    }

    const section = document.createElement('section');
    section.className = 'color-customizer profile-glass-panel';
    section.dataset.amyfxColorSettings = 'true';

    section.innerHTML = `
      <div class="color-customizer-head">
        <div>
          <strong>Personalisasi warna &amp; Kaca</strong>
          <small>Satu panel terpadu untuk tema, warna kustom, dan transparansi kaca.</small>
        </div>
        <button type="button" data-theme-colors-reset aria-label="Kembalikan warna bawaan">Reset</button>
      </div>

      <div class="glass-setting-group">
        <span class="glass-group-label">Mode Tampilan</span>
        <div class="theme-selector" aria-label="Pilih tema aplikasi">
          <button class="theme-choice" type="button" data-amyfx-theme-choice="system">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4"></path></svg>
            <span>Sistem</span>
          </button>
          <button class="theme-choice" type="button" data-amyfx-theme-choice="light">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>
            <span>Terang</span>
          </button>
          <button class="theme-choice" type="button" data-amyfx-theme-choice="dark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2z"></path></svg>
            <span>Gelap</span>
          </button>
        </div>
      </div>

      <div class="glass-setting-group">
        <span class="glass-group-label">Koleksi Kaca Berwarna</span>
        <div class="glass-presets-grid">
          ${presets.map(p => `
            <button type="button" class="glass-preset-btn ${currentPreset === p.id ? 'is-active' : ''}" data-glass-preset="${p.id}" title="${p.name}">
              <span class="glass-preset-swatch" style="background:${p.surface}; box-shadow: 0 0 8px ${p.accent};"></span>
              <span>${p.name}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="glass-setting-group">
        <span class="glass-group-label">Palet Warna Utama</span>
        <div class="color-customizer-grid">
          ${[
            ['background', 'Latar'], ['surface', 'Kaca'], ['text', 'Teks'], ['accent', 'Aksen']
          ].map(([key, label]) => {
            const val = colors[key] || defaults[key];
            return `
            <div class="color-pick-item" data-color-cell="${key}">
              <span>${label}</span>
              <input type="color" data-theme-color="${key}" value="${val}" aria-label="Warna ${label.toLowerCase()}">
              <span class="color-hex-val" data-hex-for="${key}">${val.toUpperCase()}</span>
            </div>
          `;}).join('')}
        </div>
      </div>

      <div class="glass-setting-group">
        <div class="glass-slider-head">
          <span class="glass-group-label">Transparansi Kaca (Glassmorphism)</span>
          <span class="glass-opacity-badge" id="glass-opacity-val">${opacityVal}% Transparan</span>
        </div>
        <div class="glass-slider-wrap">
          <span class="glass-slider-hint">Bening</span>
          <input type="range" min="15" max="95" value="${opacityVal}" class="glass-opacity-slider" data-theme-glass-opacity aria-label="Tingkat transparansi kaca">
          <span class="glass-slider-hint">Pekat</span>
        </div>
        <div class="glass-chips-row">
          <button type="button" class="glass-quick-chip" data-quick-opacity="30">Bening (30%)</button>
          <button type="button" class="glass-quick-chip" data-quick-opacity="65">Seimbang (65%)</button>
          <button type="button" class="glass-quick-chip" data-quick-opacity="90">Pekat (90%)</button>
        </div>
      </div>

      <div class="glass-setting-group">
        <span class="glass-group-label">Preview Efek Kaca</span>
        <div class="glass-preview-tile" id="glass-preview-card">
          <div class="glass-sheen"></div>
          <div class="glass-preview-header">
            <span class="glass-preview-chip">✨ AMY FX MORPH GLASS</span>
            <span class="glass-preview-badge">Aktif</span>
          </div>
          <p class="glass-preview-desc">Kaca transparan dengan blur dinamis latar belakang, pantulan cahaya specular, dan kontras teks tajam.</p>
        </div>
      </div>
    `;

    selector.insertAdjacentElement('afterend', section);
    updatePreviewCard(section);
  }

  function browserNotification(title, body) {
    if (typeof Notification === 'undefined') return false;
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') new Notification(title, { body, tag: 'amyfx-profile-test' });
    });
    return true;
  }

  function testNotification() {
    const title = 'AMY FX — TES NOTIFIKASI';
    const body = 'Notifikasi Amy FX berfungsi pada perangkat ini.';
    const target = location.href.split('#')[0];

    if (window.Android?.showNotificationWithUrl) {
      window.Android.showNotificationWithUrl(title, body, target);
      window.showToast?.('Tes notifikasi dikirim.');
      return;
    }

    if (browserNotification(title, body)) {
      window.showToast?.('Tes notifikasi dikirim.');
      return;
    }

    window.showToast?.('Notifikasi belum tersedia pada perangkat ini.');
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-profile-action="test-notification"]')) testNotification();

    const colorCell = event.target.closest('[data-color-cell]');
    if (colorCell && event.target.tagName !== 'INPUT') {
      const input = colorCell.querySelector('input[type="color"]');
      input?.click?.();
      return;
    }

    const resetBtn = event.target.closest('[data-theme-colors-reset]');
    if (resetBtn) {
      window.AmyFXTheme?.resetColors?.();
      const panel = document.querySelector('[data-amyfx-color-settings]');
      if (panel) {
        const defaults = getThemeDefaults();
        panel.querySelectorAll('[data-theme-color]').forEach(input => {
          const key = input.dataset.themeColor;
          if (defaults[key]) {
            input.value = defaults[key];
            const hexSpan = panel.querySelector(`[data-hex-for="${key}"]`);
            if (hexSpan) hexSpan.textContent = defaults[key].toUpperCase();
          }
        });
        const slider = panel.querySelector('[data-theme-glass-opacity]');
        if (slider) slider.value = defaults.opacity;
        panel.querySelectorAll('.glass-preset-btn').forEach(btn => btn.classList.remove('is-active'));
        updatePreviewCard(panel);
      }
      window.showToast?.('Warna dan efek kaca dikembalikan ke tema bawaan.');
      return;
    }

    const presetBtn = event.target.closest('[data-glass-preset]');
    if (presetBtn) {
      const presetId = presetBtn.dataset.glassPreset;
      const presets = getActivePresets();
      const preset = presets.find(p => p.id === presetId);
      if (preset) {
        const newColors = {
          background: preset.background,
          surface: preset.surface,
          text: preset.text,
          accent: preset.accent,
          opacity: preset.opacity,
          preset: preset.id
        };
        window.AmyFXTheme?.setColors?.(newColors);

        const panel = document.querySelector('[data-amyfx-color-settings]');
        if (panel) {
          panel.querySelectorAll('[data-theme-color]').forEach(input => {
            const key = input.dataset.themeColor;
            if (preset[key]) {
              input.value = preset[key];
              const hexSpan = panel.querySelector(`[data-hex-for="${key}"]`);
              if (hexSpan) hexSpan.textContent = preset[key].toUpperCase();
            }
          });
          const slider = panel.querySelector('[data-theme-glass-opacity]');
          if (slider) slider.value = preset.opacity;
          panel.querySelectorAll('.glass-preset-btn').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.glassPreset === presetId);
          });
          updatePreviewCard(panel);
        }
        window.showToast?.(`Tema kaca ${preset.name} diterapkan.`);
      }
      return;
    }

    const chipBtn = event.target.closest('[data-quick-opacity]');
    if (chipBtn) {
      const op = parseInt(chipBtn.dataset.quickOpacity, 10);
      const current = window.AmyFXTheme?.colors || {};
      window.AmyFXTheme?.setColors?.({ ...current, opacity: op });
      const panel = document.querySelector('[data-amyfx-color-settings]');
      if (panel) {
        const slider = panel.querySelector('[data-theme-glass-opacity]');
        if (slider) slider.value = op;
        updatePreviewCard(panel);
      }
      window.showToast?.(`Transparansi kaca diatur ke ${op}%.`);
      return;
    }
  });

  function handleColorOrOpacity(event) {
    const colorInput = event.target.closest?.('[data-theme-color]');
    if (colorInput) {
      const key = colorInput.dataset.themeColor;
      const val = colorInput.value;
      const values = { ...(window.AmyFXTheme?.colors || {}), [key]: val };
      window.AmyFXTheme?.setColors?.(values);
      const panel = document.querySelector('[data-amyfx-color-settings]');
      const hexSpan = panel?.querySelector(`[data-hex-for="${key}"]`);
      if (hexSpan) hexSpan.textContent = val.toUpperCase();
      updatePreviewCard(panel);
      return;
    }

    const opacityInput = event.target.closest?.('[data-theme-glass-opacity]');
    if (opacityInput) {
      const op = parseInt(opacityInput.value, 10);
      const values = { ...(window.AmyFXTheme?.colors || {}), opacity: op };
      window.AmyFXTheme?.setColors?.(values);
      const panel = document.querySelector('[data-amyfx-color-settings]');
      updatePreviewCard(panel);
      return;
    }
  }

  document.addEventListener('input', handleColorOrOpacity);
  document.addEventListener('change', handleColorOrOpacity);

  window.addEventListener('amyfx:theme-change', event => {
    const panel = document.querySelector('[data-amyfx-color-settings]');
    if (!panel) return;

    // Update theme choice active classes without replacing the panel
    const activePref = window.AmyFXTheme?.preference || 'system';
    panel.querySelectorAll('[data-amyfx-theme-choice]').forEach(btn => {
      const isActive = btn.dataset.amyfxThemeChoice === activePref;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // Update presets grid in-place
    const presetsGrid = panel.querySelector('.glass-presets-grid');
    if (presetsGrid) {
      const presets = getActivePresets();
      const currentPreset = window.AmyFXTheme?.colors?.preset || '';
      presetsGrid.innerHTML = presets.map(p => `
        <button type="button" class="glass-preset-btn ${currentPreset === p.id ? 'is-active' : ''}" data-glass-preset="${p.id}" title="${p.name}">
          <span class="glass-preset-swatch" style="background:${p.surface}; box-shadow: 0 0 8px ${p.accent};"></span>
          <span>${p.name}</span>
        </button>
      `).join('');
    }

    updatePreviewCard(panel);
  });

  const main = document.getElementById('main-content');
  if (main) new MutationObserver(injectSettings).observe(main, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSettings, { once: true });
  } else {
    injectSettings();
  }
})();
