(function () {
  "use strict";

  if (window.__amyFxLoadingRuntime) return;
  window.__amyFxLoadingRuntime = true;

  let showTimer = 0;
  let timeoutTimer = 0;
  let overlay = null;

  function ensureOverlay() {
    if (overlay?.isConnected) return overlay;
    overlay = document.createElement("div");
    overlay.className = "amyfx-loading-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML = `
      <div class="amyfx-loading-mark" aria-hidden="true">
        <span class="amyfx-loading-ring"></span>
        <strong>AMY</strong>
      </div>
      <strong class="amyfx-loading-brand">AMY FX</strong>
      <p data-amyfx-loading-message>Menyiapkan aplikasi…</p>
      <button type="button" data-amyfx-loading-retry hidden>Coba Lagi</button>`;
    overlay.querySelector("[data-amyfx-loading-retry]")?.addEventListener("click", () => {
      const callback = overlay.__amyRetry;
      stop();
      if (typeof callback === "function") callback();
      else location.reload();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function setMessage(message) {
    const node = ensureOverlay().querySelector("[data-amyfx-loading-message]");
    if (node) node.textContent = String(message || "Menyiapkan aplikasi…");
  }

  function start(options = {}) {
    stop({ remove: false });
    const node = ensureOverlay();
    node.__amyRetry = options.retry;
    setMessage(options.message || "Menyiapkan aplikasi…");
    node.querySelector("[data-amyfx-loading-retry]").hidden = true;
    const delay = Number.isFinite(options.delay) ? Math.max(0, options.delay) : 350;
    const timeout = Number.isFinite(options.timeout) ? Math.max(2_000, options.timeout) : 12_000;
    showTimer = window.setTimeout(() => { node.hidden = false; }, delay);
    timeoutTimer = window.setTimeout(() => {
      node.hidden = false;
      setMessage(options.timeoutMessage || "Pemuatan membutuhkan waktu lebih lama.");
      node.querySelector("[data-amyfx-loading-retry]").hidden = false;
    }, timeout);
    return node;
  }

  function stop(options = {}) {
    window.clearTimeout(showTimer);
    window.clearTimeout(timeoutTimer);
    showTimer = 0;
    timeoutTimer = 0;
    if (!overlay) return;
    overlay.hidden = true;
    overlay.__amyRetry = null;
    if (options.remove) {
      overlay.remove();
      overlay = null;
    }
  }

  function fail(message, retry) {
    const node = ensureOverlay();
    window.clearTimeout(showTimer);
    window.clearTimeout(timeoutTimer);
    node.hidden = false;
    node.__amyRetry = retry;
    setMessage(message || "Data belum berhasil dimuat.");
    node.querySelector("[data-amyfx-loading-retry]").hidden = false;
  }

  function skeleton(kind = "card", count = 1) {
    const safeCount = Math.max(1, Math.min(12, Number(count) || 1));
    return Array.from({ length: safeCount }, () =>
      `<div class="amyfx-skeleton amyfx-skeleton--${String(kind).replace(/[^a-z-]/gi, "")}" aria-hidden="true"><span></span><span></span><span></span></div>`
    ).join("");
  }

  window.AmyFXLoading = Object.freeze({ start, stop, fail, setMessage, skeleton });
})();
