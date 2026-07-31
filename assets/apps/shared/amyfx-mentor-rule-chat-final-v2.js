"use strict";

(function () {
  if (window.__amyFxMentorRuleChatFinalV2) return;
  window.__amyFxMentorRuleChatFinalV2 = true;

  const VERSION = "2.0.0";
  let scheduled = false;

  function clean(value) {
    return String(value ?? "").trim();
  }

  function ensureStyles() {
    if (document.getElementById("amy-rule-chat-final-style-v2")) return;
    const style = document.createElement("style");
    style.id = "amy-rule-chat-final-style-v2";
    style.textContent = `
      .amy-os-panel[data-amy-rule-chat-final="v2"] .amy-os-contexts { display: none !important; }
      .amy-os-panel[data-amy-rule-chat-final="v2"] .amy-os-health {
        display: block !important; color: #8fd6a8 !important; font-size: 12px !important;
        border-bottom: 0 !important; padding: 7px 20px 2px !important;
      }
      .amy-os-panel[data-amy-rule-chat-final="v2"] .amy-os-panel__header small { color: #aaa; }
      .amy-os-panel[data-amy-rule-chat-final="v2"] .amy-os-message--amy small:empty { display: none; }
      .amy-os-panel[data-amy-rule-chat-final="v2"] .amy-os-message--amy > div,
      .amy-os-panel[data-amy-rule-chat-final="v2"] .amy-os-message--user > div {
        white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5;
      }
      .amy-os-panel[data-amy-rule-chat-final="v2"] [data-amy-starters] button,
      .amy-os-panel[data-amy-rule-chat-final="v2"] .amy-rule-quick-replies button {
        cursor: pointer;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function cleanAssistantMessages() {
    document.querySelectorAll(".amy-os-message--amy small").forEach(meta => {
      const value = clean(meta.textContent);
      if (!value) {
        meta.remove();
        return;
      }
      if (/amy-bot|amy-local|deterministic|customer-service|semua provider|context envelope|connectivity|sync v\d/i.test(value)) {
        meta.remove();
        return;
      }
      meta.textContent = "Jawaban AI";
    });

    document.querySelectorAll(".amy-os-message--amy > div").forEach(body => {
      let text = clean(body.textContent);
      if (!text) return;
      text = text
        .replace(/^Sumber:\s*[^.]+\.\s*/i, "")
        .replace(/^Pertanyaan:\s*/i, "")
        .replace(/\bContext Envelope\b/gi, "konteks aplikasi")
        .replace(/\bageMs\b|\bcaptured_at\b|\bpolicy key\b|\bschema_version\b/gi, "data teknis")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (text !== clean(body.textContent)) body.textContent = text;
    });
  }

  function apply() {
    scheduled = false;
    ensureStyles();
    const panel = document.querySelector(".amy-os-panel");
    if (!panel) return;
    panel.dataset.amyRuleChatFinal = "v2";

    const header = panel.querySelector(".amy-os-panel__header > div:first-child");
    if (header) header.innerHTML = "<strong>Amy Assistant</strong><small>Customer Service Amy FX</small>";

    const health = panel.querySelector("[data-amy-health]");
    if (health) {
      health.dataset.amyRuleChatFinal = "v2";
      health.textContent = "● Amy online • siap membantu";
    }

    const contexts = panel.querySelector("[data-amy-contexts]");
    if (contexts) {
      contexts.hidden = true;
      contexts.setAttribute("aria-hidden", "true");
    }

    const input = panel.querySelector("[data-amy-input]");
    if (input) input.placeholder = "Tulis pesan ke Amy…";

    const settingsTitle = panel.querySelector("[data-amy-settings-panel] > strong");
    if (settingsTitle) settingsTitle.textContent = "Pengaturan AI";

    cleanAssistantMessages();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(apply, 0);
  }

  function boot() {
    apply();
    const target = document.body || document.documentElement;
    if (target) new MutationObserver(schedule).observe(target, {
      childList: true,
      subtree: true,
      characterData: true
    });
    window.addEventListener("focus", schedule);
    window.addEventListener("amyfx:open-mentor", schedule);
    window.addEventListener("amyfx:connectivity-final-ready", schedule);
    window.addEventListener("amyfx:customer-service-ready", schedule);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
    window.setInterval(() => {
      if (!document.hidden && document.querySelector(".amy-os-panel:not([hidden])")) apply();
    }, 1200);
  }

  window.AmyFXRuleChatFinal = Object.freeze({ version: VERSION, apply });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
