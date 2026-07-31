"use strict";

(function () {
  if (window.__amyFxMentorConversationV1) return;
  window.__amyFxMentorConversationV1 = true;

  const clean = value => String(value ?? "").trim();
  const normalizeQuestion = value => clean(value).toLowerCase().replace(/\s+/g, " ");

  function currentModule() {
    return document.querySelector(".amy-os-root")?.dataset?.amyModule
      || (location.pathname.toLowerCase().includes("/apps/mapping/") ? "mapping"
        : location.pathname.toLowerCase().includes("/apps/market-intel/") ? "intel"
          : location.pathname.toLowerCase().includes("/apps/journal/") ? "journal"
            : location.pathname.toLowerCase().includes("/apps/academy/") ? "academy"
              : "home");
  }

  function hasValidCapturedAt(context) {
    const value = context?.captured_at;
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) && timestamp > 86_400_000;
  }

  function hasNoLiveMarketData(context) {
    const source = clean(context?.source_module || currentModule()).toLowerCase();
    if (!["home", "mapping", "intel"].includes(source)) return false;
    const freshness = clean(context?.freshness?.state).toLowerCase();
    return !hasValidCapturedAt(context) || ["expired", "unknown", "invalid"].includes(freshness);
  }

  function conciseLocalAnswer(question, context) {
    const value = normalizeQuestion(question);
    if (!hasNoLiveMarketData(context)) return "";

    if (/apa yang perlu (saya|aku) kerjakan sekarang|apa langkah (saya|aku) sekarang|harus ngapain sekarang/.test(value)) {
      return "Data market live belum masuk. Buka Mapping atau Market Intel lalu muat ulang datanya; sebelum statusnya valid, jangan entry.";
    }

    if (/ringkas status semua modul|status semua modul/.test(value)) {
      return "Mapping dan Market Intel belum memiliki data live. Jurnal dan Academy tetap bisa dipakai, tetapi keputusan trading harus menunggu data market yang valid.";
    }

    if (/buka review jurnal|review jurnal/.test(value) && currentModule() === "home") {
      return "Buka menu Proyek lalu pilih Jurnal Trading. Di sana kamu bisa melanjutkan review tanpa menunggu data market live.";
    }

    return "";
  }

  function stylePrompt(question, context) {
    const noLive = hasNoLiveMarketData(context);
    return [
      "Instruksi gaya jawaban untuk Amy:",
      "Jawab langsung seperti asisten pribadi, bukan seperti laporan audit atau ceramah.",
      "Gunakan bahasa Indonesia yang natural dan maksimal 3 kalimat, kecuali pengguna meminta penjelasan detail.",
      "Jangan memakai judul atau label WAIT, Analisis, Fakta Pasar, Hipotesis Arah, Setup Eksekusi, Rekomendasi, Sumber, Timestamp, atau Keterbatasan kecuali diminta pengguna.",
      "Jangan menyebut Context Envelope, ageMs, schema, policy key, captured_at, nama error internal, atau metadata teknis.",
      "Berikan satu jawaban utama dan paling banyak satu tindakan berikutnya.",
      "Jangan mengulang pertanyaan pengguna.",
      noLive
        ? "Data market live sedang tidak valid. Katakan singkat bahwa data belum tersedia dan jangan membuat analisis arah atau sinyal trading."
        : "Gunakan konteks yang valid dan jangan menambah fakta di luar data aplikasi.",
      "",
      `Pertanyaan pengguna: ${clean(question)}`
    ].join("\n");
  }

  function cleanProviderReply(value, question, context) {
    let reply = clean(value);
    if (!reply) return "Saya belum mendapat jawaban dari provider.";

    if (hasNoLiveMarketData(context) && /context envelope|agems|captured_at|missing captured|policy key|schema/i.test(reply)) {
      return "Data market live belum tersedia. Muat ulang data di Mapping atau Market Intel, lalu tunggu statusnya valid sebelum mengambil keputusan trading.";
    }

    reply = reply
      .replace(/^\s*\*\*(?:WAIT|Analisis|Fakta Pasar|Hipotesis Arah|Setup Eksekusi|Rekomendasi|Sumber|Timestamp|Keterbatasan)\*\*\s*:?[ \t]*/gim, "")
      .replace(/^\s*(?:Analisis|Fakta Pasar|Hipotesis Arah|Setup Eksekusi|Rekomendasi|Sumber|Timestamp|Keterbatasan)\s*:?[ \t]*/gim, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const shortQuestion = clean(question).length <= 90;
    if (shortQuestion && reply.length > 700) {
      const sentences = reply.match(/[^.!?\n]+[.!?]+|[^.!?\n]+$/g) || [reply];
      reply = sentences.map(clean).filter(Boolean).slice(0, 3).join(" ");
    }
    return reply;
  }

  function ensureThinkingStyles() {
    if (document.getElementById("amy-mentor-thinking-style-v1")) return;
    const style = document.createElement("style");
    style.id = "amy-mentor-thinking-style-v1";
    style.textContent = `
      @keyframes amy-thinking-pulse-v1 {
        0%, 80%, 100% { opacity: .3; transform: translateY(0); }
        40% { opacity: 1; transform: translateY(-4px); }
      }
      .amy-os-message--loading .amy-thinking-v1 {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        color: #d8d8d8;
      }
      .amy-thinking-v1__dots {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .amy-thinking-v1__dots i {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: #d4af37;
        animation: amy-thinking-pulse-v1 1.15s infinite ease-in-out;
      }
      .amy-thinking-v1__dots i:nth-child(2) { animation-delay: .14s; }
      .amy-thinking-v1__dots i:nth-child(3) { animation-delay: .28s; }
      @media (prefers-reduced-motion: reduce) {
        .amy-thinking-v1__dots i { animation: none; opacity: .75; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function removeThinkingIndicator(row = null) {
    const target = row || document.querySelector("[data-amy-thinking='v1']");
    const messages = target?.closest?.(".amy-os-messages") || document.querySelector(".amy-os-messages");
    target?.remove();
    if (!document.querySelector("[data-amy-thinking='v1']")) messages?.setAttribute("aria-busy", "false");
  }

  function showThinkingIndicator() {
    const messages = document.querySelector(".amy-os-messages");
    if (!messages) return null;
    removeThinkingIndicator();
    ensureThinkingStyles();

    const row = document.createElement("div");
    row.className = "amy-os-message amy-os-message--amy amy-os-message--loading";
    row.dataset.amyThinking = "v1";
    row.setAttribute("role", "status");
    row.setAttribute("aria-live", "polite");
    row.innerHTML = `<div class="amy-thinking-v1"><span>Amy sedang berpikir</span><span class="amy-thinking-v1__dots" aria-hidden="true"><i></i><i></i><i></i></span></div>`;
    messages.setAttribute("aria-busy", "true");
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
    return row;
  }

  function installAskWrapper() {
    const originalOs = window.AmyFXOS;
    if (!originalOs?.ask || originalOs.__amyConciseRepliesV1) return Boolean(originalOs?.__amyConciseRepliesV1);

    const originalAsk = originalOs.ask.bind(originalOs);
    const wrappedAsk = async function (question, options = {}) {
      const context = options.context
        || await originalOs.buildContext?.(options.sourceModule || currentModule());
      const localAnswer = conciseLocalAnswer(question, context);
      if (localAnswer) {
        return {
          text: localAnswer,
          provider: "amy-local",
          model: "amy-concise-v1",
          source: `Dari ${clean(context?.source_module || currentModule())}`,
          context
        };
      }

      const thinkingRow = showThinkingIndicator();
      try {
        const result = await originalAsk(stylePrompt(question, context), { ...options, context });
        return {
          ...result,
          text: cleanProviderReply(result?.text, question, context)
        };
      } finally {
        removeThinkingIndicator(thinkingRow);
      }
    };

    window.AmyFXOS = Object.freeze({
      ...originalOs,
      ask: wrappedAsk,
      __amyConciseRepliesV1: true
    });
    return true;
  }

  function repairEpochUi() {
    const epochPattern = /(?:1|01)\s+Jan(?:uari)?\s+1970|01[\/.\-]01[\/.\-]1970|1970-01-01/i;
    document.querySelectorAll("[data-cc-time], [data-amy-health], [data-amy-module-status]").forEach(node => {
      const value = clean(node.textContent);
      if (!epochPattern.test(value)) return;
      if (node.matches("[data-cc-time]")) node.textContent = "Belum ada data";
      else node.textContent = value.replace(epochPattern, "Belum ada data");
    });
  }

  function boot() {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const installed = installAskWrapper();
      repairEpochUi();
      if (installed || attempts >= 200) clearInterval(timer);
    }, 50);

    const target = document.body || document.documentElement;
    if (target) new MutationObserver(repairEpochUi).observe(target, { childList: true, subtree: true, characterData: true });
    window.addEventListener("focus", repairEpochUi);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) repairEpochUi(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
