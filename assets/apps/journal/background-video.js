"use strict";

(function initAmyBackgroundVideo() {
  if (window.AmyBackgroundVideo) return;

  const CHUNK_SIZE = 512 * 1024;
  const controlsByVideo = new WeakMap();
  const preparedSources = new Map();
  const preparingSources = new Map();
  let activeVideo = null;
  let activeItem = null;
  let restoreInProgress = false;

  function bridgeAvailable() {
    return Boolean(
      window.Android &&
      typeof window.Android.beginBackgroundVideoTransfer === "function" &&
      typeof window.Android.playBackgroundVideo === "function" &&
      typeof window.Android.getBackgroundVideoState === "function"
    );
  }

  function toast(message) {
    try {
      if (typeof window.showToast === "function") window.showToast(message);
      else if (window.Android?.showAppToast) window.Android.showAppToast(message);
    } catch {}
  }

  function sourceKey(item) {
    return String(item?.id || item?.fileId || item?.nativeUri || item?.externalUri || item?.mediaUrl || item?.mediaName || "");
  }

  function findItemForVideo(video) {
    const panelId = video?.closest?.(".fullscreen-video-panel")?.dataset?.id || "";
    if (panelId) {
      const libraryItem = typeof state !== "undefined" ? state.items.find((entry) => entry.id === panelId) : null;
      if (libraryItem) return libraryItem;
      if (typeof state !== "undefined" && state.activeFullscreenItem?.id === panelId) return state.activeFullscreenItem;
    }
    return typeof state !== "undefined" ? state.activeFullscreenItem : null;
  }

  function directNativeSource(item) {
    const candidates = [item?.nativeUri, item?.externalUri, item?.mediaUrl];
    return candidates.find((value) => /^(content|file|https?):\/\//i.test(String(value || ""))) || "";
  }

  function formatTime(seconds) {
    const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    const minutes = Math.floor(safe / 60);
    const rest = Math.floor(safe % 60);
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }

  function readSliceAsBase64(slice) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || "");
        const comma = value.indexOf(",");
        resolve(comma >= 0 ? value.slice(comma + 1) : value);
      };
      reader.onerror = () => reject(reader.error || new Error("Chunk video gagal dibaca."));
      reader.onabort = () => reject(new Error("Transfer video dibatalkan."));
      reader.readAsDataURL(slice);
    });
  }

  function updateStatus(video, message) {
    const controls = controlsByVideo.get(video);
    if (controls?.status) controls.status.textContent = message || "";
  }

  async function prepareNativeSource(item, video) {
    if (!bridgeAvailable() || !item) return null;
    const key = sourceKey(item);
    if (!key) return null;

    const direct = directNativeSource(item);
    if (direct) return { source: direct, tempPath: "", key, temporary: false };

    const cached = preparedSources.get(key);
    if (cached) return cached;
    const pending = preparingSources.get(key);
    if (pending) return pending;
    if (!item.fileId || typeof getFileRecord !== "function") return null;

    const promise = (async () => {
      const record = await getFileRecord(item.fileId);
      const blob = record?.blob;
      if (!(blob instanceof Blob) || !blob.size) throw new Error("File video IndexedDB tidak ditemukan.");

      const transferId = `amy-video-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const fileName = record.name || item.mediaName || `${key}.mp4`;
      const mimeType = record.type || item.mediaType || blob.type || "video/mp4";
      const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);
      const started = window.Android.beginBackgroundVideoTransfer(
        transferId,
        fileName,
        mimeType,
        String(blob.size),
        item.title || item.mediaName || "Video Trading"
      );
      if (!started) throw new Error("Cache video native tidak dapat dibuat.");

      try {
        for (let index = 0; index < totalChunks; index += 1) {
          const start = index * CHUNK_SIZE;
          const slice = blob.slice(start, Math.min(blob.size, start + CHUNK_SIZE));
          let encoded = await readSliceAsBase64(slice);
          const appended = window.Android.appendBackgroundVideoChunk(transferId, index, encoded);
          encoded = "";
          if (!appended) throw new Error(`Potongan video ${index + 1} gagal disimpan.`);
          updateStatus(video, `Menyiapkan latar belakang ${Math.round(((index + 1) / totalChunks) * 100)}%`);
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }

        const path = String(window.Android.finishBackgroundVideoTransfer(transferId, totalChunks) || "");
        if (!path) throw new Error("File cache video native tidak valid.");
        const prepared = { source: path, tempPath: path, key, temporary: true };
        preparedSources.set(key, prepared);
        updateStatus(video, "Latar belakang siap");
        return prepared;
      } catch (error) {
        try { window.Android.abortBackgroundVideoTransfer(transferId); } catch {}
        throw error;
      }
    })();

    preparingSources.set(key, promise);
    try {
      return await promise;
    } finally {
      preparingSources.delete(key);
    }
  }

  function pauseOtherVideos(video) {
    document.querySelectorAll("video").forEach((candidate) => {
      if (candidate !== video && !candidate.paused) candidate.pause();
    });
  }

  function getNativeState() {
    if (!bridgeAvailable()) return null;
    try {
      return JSON.parse(window.Android.getBackgroundVideoState() || "{}");
    } catch {
      return null;
    }
  }

  async function handoffVideo(video, item, reason = "background") {
    if (!video || !item || !bridgeAvailable()) return false;
    const controls = controlsByVideo.get(video);
    if (controls && !controls.backgroundEnabled) return false;

    const positionMs = Math.max(0, Math.round((video.currentTime || 0) * 1000));
    const loop = controls ? controls.loopEnabled : true;
    const key = sourceKey(item);
    updateStatus(video, "Menyiapkan pemutaran latar belakang...");

    try {
      const prepared = await prepareNativeSource(item, video);
      if (!prepared) throw new Error("Sumber video belum dapat diputar oleh Android.");
      const started = window.Android.playBackgroundVideo(
        prepared.source,
        key,
        item.title || item.mediaName || "Video Trading",
        String(positionMs),
        loop,
        prepared.tempPath || ""
      );
      if (!started) throw new Error("Service pemutar latar belakang gagal dimulai.");
      video.pause();
      updateStatus(video, reason === "manual" ? "Diputar di latar belakang" : "Tetap diputar di latar belakang");
      return true;
    } catch (error) {
      updateStatus(video, error?.message || "Pemutaran latar belakang gagal.");
      return false;
    }
  }

  function findVideoForSourceKey(key) {
    if (!key) return null;
    return [...document.querySelectorAll("video")].find((video) => sourceKey(findItemForVideo(video)) === key) || null;
  }

  async function restoreHtmlPlayback() {
    if (restoreInProgress || !bridgeAvailable() || document.hidden) return;
    const nativeState = getNativeState();
    if (!nativeState?.active || !nativeState.sourceKey) return;
    const video = findVideoForSourceKey(nativeState.sourceKey);
    if (!video) return;

    restoreInProgress = true;
    try {
      window.Android.pauseBackgroundVideo();
      const targetSeconds = Math.max(0, Number(nativeState.positionMs || 0) / 1000);
      if (Number.isFinite(targetSeconds)) {
        try { video.currentTime = targetSeconds; } catch {}
      }
      pauseOtherVideos(video);
      let resumedInWebView = false;
      try {
        await video.play();
        resumedInWebView = true;
      } catch {
        try { window.Android.resumeBackgroundVideo(); } catch {}
        updateStatus(video, "Tetap diputar di latar belakang");
      }
      if (!resumedInWebView) return;
      window.Android.stopBackgroundVideo();
      preparedSources.delete(nativeState.sourceKey);
      activeVideo = video;
      activeItem = findItemForVideo(video);
      updateStatus(video, "Dilanjutkan di aplikasi");
    } finally {
      restoreInProgress = false;
    }
  }

  function makeButton(label, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    return button;
  }

  function enhanceVideo(video) {
    if (!video || controlsByVideo.has(video)) return;
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    video.loop = true;

    const bar = document.createElement("div");
    bar.className = "amy-background-video-controls";
    const playButton = makeButton("⏯", "Putar atau jeda");
    const seek = document.createElement("input");
    seek.type = "range";
    seek.min = "0";
    seek.max = "1000";
    seek.value = "0";
    seek.setAttribute("aria-label", "Posisi video");
    const time = document.createElement("span");
    time.textContent = "0:00 / 0:00";
    const loopButton = makeButton("🔁", "Ulang otomatis aktif");
    const backgroundButton = makeButton("📱", "Pemutaran latar belakang aktif");
    const stopButton = makeButton("■", "Hentikan video");
    const status = document.createElement("small");
    status.textContent = bridgeAvailable() ? "Latar belakang aktif" : "Pemutar web";

    bar.append(playButton, seek, time, loopButton, backgroundButton, stopButton, status);
    video.insertAdjacentElement("afterend", bar);

    const controlState = {
      bar,
      seek,
      time,
      status,
      loopButton,
      backgroundButton,
      loopEnabled: true,
      backgroundEnabled: true
    };
    controlsByVideo.set(video, controlState);

    playButton.addEventListener("click", () => {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    });

    loopButton.addEventListener("click", () => {
      controlState.loopEnabled = !controlState.loopEnabled;
      video.loop = controlState.loopEnabled;
      loopButton.classList.toggle("is-off", !controlState.loopEnabled);
      loopButton.title = controlState.loopEnabled ? "Ulang otomatis aktif" : "Ulang otomatis nonaktif";
      try { window.Android?.setBackgroundVideoLoop?.(controlState.loopEnabled); } catch {}
    });

    backgroundButton.addEventListener("click", () => {
      controlState.backgroundEnabled = !controlState.backgroundEnabled;
      backgroundButton.classList.toggle("is-off", !controlState.backgroundEnabled);
      backgroundButton.title = controlState.backgroundEnabled ? "Pemutaran latar belakang aktif" : "Pemutaran latar belakang nonaktif";
      if (controlState.backgroundEnabled && !video.paused) handoffVideo(video, findItemForVideo(video), "manual");
      if (!controlState.backgroundEnabled) {
        try { window.Android?.stopBackgroundVideo?.(); } catch {}
      }
    });

    stopButton.addEventListener("click", () => {
      video.pause();
      try { video.currentTime = 0; } catch {}
      try { window.Android?.stopBackgroundVideo?.(); } catch {}
      const key = sourceKey(findItemForVideo(video));
      preparedSources.delete(key);
      updateStatus(video, "Dihentikan");
    });

    seek.addEventListener("input", () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      video.currentTime = (Number(seek.value) / 1000) * video.duration;
    });

    video.addEventListener("play", () => {
      pauseOtherVideos(video);
      activeVideo = video;
      activeItem = findItemForVideo(video);
      const nativeState = getNativeState();
      if (nativeState?.active && nativeState.sourceKey !== sourceKey(activeItem)) {
        try { window.Android.stopBackgroundVideo(); } catch {}
      }
      prepareNativeSource(activeItem, video).catch((error) => updateStatus(video, error?.message || "Latar belakang belum siap"));
    });

    video.addEventListener("timeupdate", () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      seek.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : "0";
      time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    });

    video.addEventListener("ended", () => {
      if (!controlState.loopEnabled) return;
      try { video.currentTime = 0; } catch {}
      video.play().catch(() => {});
    });

    window.setTimeout(() => video.play().catch(() => {}), 80);
  }

  function enhanceExistingVideos() {
    document.querySelectorAll("video").forEach(enhanceVideo);
  }

  function injectStyles() {
    if (document.getElementById("amy-background-video-style")) return;
    const style = document.createElement("style");
    style.id = "amy-background-video-style";
    style.textContent = `
      .amy-background-video-controls{display:grid;grid-template-columns:auto minmax(90px,1fr) auto auto auto auto;gap:8px;align-items:center;width:min(100%,760px);margin:8px auto 16px;padding:9px;border:1px solid rgba(212,175,55,.28);border-radius:14px;background:rgba(7,12,9,.92);color:#f5f7f5}
      .amy-background-video-controls button{min-width:38px;height:38px;border:1px solid rgba(212,175,55,.35);border-radius:10px;background:#111813;color:#f2d467;font-size:16px}
      .amy-background-video-controls button.is-off{opacity:.45;filter:grayscale(1)}
      .amy-background-video-controls input[type=range]{width:100%;accent-color:#d4af37}
      .amy-background-video-controls span{font-size:12px;white-space:nowrap}
      .amy-background-video-controls small{grid-column:1/-1;color:#d5b94c;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      @media(max-width:560px){.amy-background-video-controls{grid-template-columns:auto minmax(70px,1fr) auto auto auto}.amy-background-video-controls span{grid-column:1/-1}.amy-background-video-controls small{grid-column:1/-1}}
    `;
    document.head.append(style);
  }

  const observer = new MutationObserver(() => enhanceExistingVideos());

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      const video = activeVideo || document.querySelector(".fullscreen-video-panel video");
      const item = video ? findItemForVideo(video) : activeItem;
      if (video && item && !video.paused) handoffVideo(video, item, "background");
    } else {
      window.setTimeout(restoreHtmlPlayback, 80);
    }
  });

  window.addEventListener("pageshow", () => window.setTimeout(restoreHtmlPlayback, 100));

  if (typeof closeFullscreenViewer === "function") {
    const originalCloseFullscreenViewer = closeFullscreenViewer;
    closeFullscreenViewer = function amyCloseFullscreenViewerWithBackground(...args) {
      const video = activeVideo || dom?.fullscreenStage?.querySelector?.("video");
      const item = video ? findItemForVideo(video) : activeItem;
      if (video && item && !video.paused) handoffVideo(video, item, "viewer-close");
      return originalCloseFullscreenViewer.apply(this, args);
    };
  }

  window.AmyBackgroundVideo = {
    handoffFromNativeLifecycle() {
      const video = activeVideo || document.querySelector(".fullscreen-video-panel video");
      const item = video ? findItemForVideo(video) : activeItem;
      if (video && item && !video.paused) handoffVideo(video, item, "lifecycle");
    },
    resumeFromNativeLifecycle() {
      window.setTimeout(restoreHtmlPlayback, 100);
    },
    stop() {
      try { window.Android?.stopBackgroundVideo?.(); } catch {}
      preparedSources.clear();
    },
    getState: getNativeState
  };

  injectStyles();
  observer.observe(document.documentElement, { childList: true, subtree: true });
  enhanceExistingVideos();
  window.setInterval(() => {
    if (!document.hidden) restoreHtmlPlayback();
  }, 1200);
})();
