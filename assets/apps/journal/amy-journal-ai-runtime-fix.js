"use strict";

(function () {
  if (window.__amyJournalAiFix159) return;
  window.__amyJournalAiFix159 = true;

  const JOURNAL_KEY = "tradingLibraryManager.journals.v1";
  const SETTINGS_KEY = "tradingLibraryManager.assistantSettings.v1";
  const FREE = new Set(["gemini", "openrouter"]);
  const cooldowns = new Map();
  let cursor = 0;
  let ready = false;
  let poolUiScheduled = false;

  const parseJson = (value, fallback) => {
    try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
  };
  const settings = () => parseJson(localStorage.getItem(SETTINGS_KEY) || "{}", {});
  const normalizeProvider = value => {
    const provider = String(value || "").trim().toLowerCase();
    return provider === "google" ? "gemini" : provider === "open_router" ? "openrouter" : provider;
  };
  const defaultModel = provider => ({
    gemini: "gemini-2.0-flash",
    openrouter: "google/gemini-2.0-flash-001",
    deepseek: "deepseek-chat"
  }[provider] || "");
  const label = provider => ({ gemini: "Gemini", openrouter: "OpenRouter", deepseek: "DeepSeek" }[provider] || provider);
  const idFor = item => {
    let hash = 0;
    const value = `${item.provider}:${item.key}`;
    for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    return `${item.provider}:${hash}`;
  };

  function parseLine(line, fallbackProvider, fallbackModel) {
    const raw = String(line || "").trim();
    if (!raw || raw.startsWith("#")) return null;
    let provider = fallbackProvider;
    let key = raw;
    let model = "";
    if (raw.includes("|")) {
      const parts = raw.split("|").map(part => part.trim());
      provider = normalizeProvider(parts[0]);
      key = parts[1] || "";
      model = parts.slice(2).join("|");
    } else {
      const split = raw.indexOf(":");
      const candidate = normalizeProvider(split > 0 ? raw.slice(0, split) : "");
      if (["gemini", "openrouter", "deepseek"].includes(candidate)) {
        provider = candidate;
        key = raw.slice(split + 1);
      }
    }
    key = key.trim().replace(/^Bearer\s+/i, "");
    if (!key) return null;
    model = model || (provider === fallbackProvider ? fallbackModel : defaultModel(provider));
    if (provider === "gemini" && model.includes("/")) model = defaultModel(provider);
    if (provider === "openrouter" && !model.includes("/")) model = defaultModel(provider);
    const item = { provider, key, model };
    item.id = idFor(item);
    return item;
  }

  function credentials() {
    const saved = settings();
    const provider = normalizeProvider(state.aiProvider || saved.provider || "gemini");
    const model = state.geminiModel || saved.model || defaultModel(provider);
    const poolText = document.querySelector("#amyAiKeyPoolInput")?.value ?? saved.apiPoolText ?? "";
    const paidFallback = document.querySelector("#amyAiPaidFallbackInput")?.checked ?? Boolean(saved.paidFallback);
    const rows = String(poolText).split(/\r?\n/);
    const legacy = String(state.geminiApiKey || saved.apiKey || "").trim();
    if (legacy) rows.unshift(`${provider}:${legacy}`);
    const seen = new Set();
    const parsed = rows.map(row => parseLine(row, provider, model)).filter(item => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    const free = parsed.filter(item => FREE.has(item.provider));
    free.sort((a, b) => Number(b.provider === provider) - Number(a.provider === provider));
    const rotated = free.length ? [...free.slice(cursor % free.length), ...free.slice(0, cursor % free.length)] : [];
    const paid = paidFallback ? parsed.filter(item => item.provider === "deepseek") : [];
    return [...rotated, ...paid];
  }

  function updateSummary(text = "") {
    const target = document.querySelector("#assistantApiSummary");
    if (!target) return;
    const list = credentials();
    const free = list.filter(item => FREE.has(item.provider)).length;
    const paid = list.filter(item => item.provider === "deepseek").length;
    const next = text || `${free} API gratis${paid ? ` • ${paid} fallback berbayar` : ""} • Rotasi otomatis`;
    if (target.textContent !== next) target.textContent = next;
  }

  function savePool() {
    const saved = settings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      ...saved,
      apiPoolText: document.querySelector("#amyAiKeyPoolInput")?.value || "",
      paidFallback: Boolean(document.querySelector("#amyAiPaidFallbackInput")?.checked)
    }));
    updateSummary();
  }

  function ensurePoolUi() {
    const keyInput = document.querySelector("#geminiApiKeyInput");
    if (!keyInput) return;
    const oldPanel = document.querySelector("#amyAiKeyPanel");
    if (oldPanel && !oldPanel.hidden) oldPanel.hidden = true;
    if (!document.querySelector("#amyAiKeyPoolInput")) {
      const saved = settings();
      const field = document.createElement("label");
      field.className = "field";
      field.innerHTML = `<span>Pool API Keys</span><textarea id="amyAiKeyPoolInput" rows="7" autocomplete="off" spellcheck="false" placeholder="gemini:API_KEY_1\ngemini:API_KEY_2\nopenrouter:API_KEY\ndeepseek:API_KEY"></textarea><small>Satu key per baris. Format provider:key. Gemini dan OpenRouter dipakai lebih dahulu.</small>`;
      keyInput.closest("label")?.insertAdjacentElement("afterend", field);
      const paid = document.createElement("label");
      paid.className = "toggle-field form-toggle";
      paid.innerHTML = `<input id="amyAiPaidFallbackInput" type="checkbox"><span>Gunakan DeepSeek sebagai fallback berbayar terakhir</span>`;
      field.insertAdjacentElement("afterend", paid);
      field.querySelector("textarea").value = saved.apiPoolText || "";
      paid.querySelector("input").checked = Boolean(saved.paidFallback);
      field.querySelector("textarea").addEventListener("input", updateSummary);
      paid.querySelector("input").addEventListener("change", savePool);
    }
    const save = document.querySelector("#saveGeminiKeyBtn");
    if (save && !save.dataset.amyPool) {
      save.dataset.amyPool = "1";
      save.addEventListener("click", () => {
        savePool();
        const message = document.querySelector("#assistantMessage");
        const next = `${credentials().length} API tersimpan. Rotasi otomatis aktif.`;
        if (message && message.textContent !== next) message.textContent = next;
      });
    }
    const clear = document.querySelector("#clearGeminiKeyBtn");
    if (clear && !clear.dataset.amyPool) {
      clear.dataset.amyPool = "1";
      clear.addEventListener("click", () => {
        const saved = settings();
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...saved, apiPoolText: "", paidFallback: false }));
        const pool = document.querySelector("#amyAiKeyPoolInput");
        const paid = document.querySelector("#amyAiPaidFallbackInput");
        if (pool) pool.value = "";
        if (paid) paid.checked = false;
        updateSummary();
      });
    }
    updateSummary();
  }

  function schedulePoolUi() {
    if (poolUiScheduled) return;
    poolUiScheduled = true;
    const run = () => {
      poolUiScheduled = false;
      ensurePoolUi();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function bindPoolUiNavigation() {
    document.addEventListener("click", event => {
      const nav = event.target.closest?.(".bottom-nav .nav-button, .side-nav-button");
      if (!nav) return;
      const view = nav.dataset?.view || nav.dataset?.target || nav.getAttribute?.("data-view") || "";
      if (view === "assistant" || nav.matches?.('[data-view="assistant"]')) setTimeout(schedulePoolUi, 0);
    }, true);
    window.addEventListener("focus", schedulePoolUi);
  }

  function bridgeIndexedDbJournals() {
    if (window.__amyJournalStorageBridge159) return;
    window.__amyJournalStorageBridge159 = true;
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (this === localStorage && key === JOURNAL_KEY && Array.isArray(state.journals)) {
        try { return JSON.stringify(state.journals); } catch { return "[]"; }
      }
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === JOURNAL_KEY && Array.isArray(state.journals)) {
        const journals = parseJson(value, null);
        if (Array.isArray(journals)) {
          state.journals = typeof normalizeJournals === "function" ? normalizeJournals(journals) : journals;
          if (typeof saveJournals === "function") saveJournals(state.journals).catch(() => {});
          if (typeof render === "function") queueMicrotask(render);
          return;
        }
      }
      return setItem.call(this, key, value);
    };
  }

  function patchCalendar() {
    window.makeCalendarCell = function (cell) {
      if (cell.empty) return `<div class="cal-cell is-empty"></div>`;
      const journals = cell.journals || [];
      if (!journals.length) return `<div class="cal-cell"><strong>${cell.day}</strong><span>No Trade</span></div>`;
      const net = journals.reduce((sum, journal) => sum + parseTradeAmount(journal.profit) - parseTradeAmount(journal.loss), 0);
      const hasWin = journals.some(journal => journal.result === "Win");
      const hasLoss = journals.some(journal => journal.result === "Loss");
      const hasBe = journals.some(journal => journal.result === "BE");
      const cls = net > 0 || (!net && hasWin && !hasLoss) ? "is-win" : net < 0 || (!net && hasLoss && !hasWin) ? "is-loss" : hasBe ? "is-be" : "";
      const result = journals.length > 1 ? `${journals.length} jurnal` : journals[0].result || "Jurnal";
      const amount = net > 0 ? `+${formatTradeAmount(net)}` : net < 0 ? formatTradeAmount(net) : "";
      return `<button type="button" class="cal-cell ${cls} is-clickable" data-journal-date="${cell.date}"><strong>${cell.day}</strong><span>${amount ? `${result} ${amount}` : result}</span></button>`;
    };
  }

  function fetchTimed(url, options, timeout = 18000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
  }

  async function apiError(response) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = data?.error?.message || data?.message || message;
    } catch {}
    const error = new Error(message);
    error.status = response.status;
    return error;
  }

  async function callOne(item, parts, options) {
    if (item.provider === "gemini") {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(item.model)}:generateContent?key=${encodeURIComponent(item.key)}`;
      const generationConfig = { temperature: 0.35, topP: 0.9, maxOutputTokens: 1400 };
      if (options.json) generationConfig.responseMimeType = "application/json";
      const response = await fetchTimed(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }) });
      if (!response.ok) throw await apiError(response);
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("\n").trim();
      if (!text) throw new Error("Respons kosong");
      return text;
    }
    const endpoint = item.provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.deepseek.com/chat/completions";
    const content = typeof partsToOpenAIContent === "function" ? partsToOpenAIContent(parts) : parts.map(part => part.text || "").join("\n");
    const payload = { model: item.model, messages: [{ role: "system", content: "Kamu adalah asisten jurnal trading pribadi. Jawab dalam bahasa Indonesia, ringkas, praktis, dan edukatif." }, { role: "user", content }], temperature: 0.35, max_tokens: 1400 };
    if (options.json) payload.response_format = { type: "json_object" };
    const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${item.key}` };
    if (item.provider === "openrouter") { headers["HTTP-Referer"] = location.href; headers["X-Title"] = "Amy FX"; }
    const response = await fetchTimed(endpoint, { method: "POST", mode: "cors", credentials: "omit", headers, body: JSON.stringify(payload) });
    if (!response.ok) throw await apiError(response);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || data.output_text || "";
    if (!String(text).trim()) throw new Error("Respons kosong");
    return String(text).trim();
  }

  async function callRotating(parts, options = {}) {
    const list = credentials();
    if (!list.length) throw new Error("Isi minimal satu API key di Pool API Keys.");
    const failures = [];
    const started = Date.now();
    let attempts = 0;
    for (const item of list) {
      if (Date.now() - started > 65000) break;
      if ((cooldowns.get(item.id) || 0) > Date.now()) continue;
      attempts += 1;
      updateSummary(`Mencoba ${label(item.provider)} • API ${attempts}/${list.length}`);
      try {
        const answer = await callOne(item, parts, options);
        const freeCount = list.filter(entry => FREE.has(entry.provider)).length;
        if (freeCount) cursor = (cursor + 1) % freeCount;
        cooldowns.delete(item.id);
        updateSummary(`${label(item.provider)} terhubung • Rotasi otomatis aktif`);
        return answer;
      } catch (error) {
        failures.push(`${label(item.provider)}: ${error.message || "gagal"}`);
        cooldowns.set(item.id, Date.now() + (error.status === 401 || error.status === 403 ? 600000 : error.status === 429 ? 90000 : 30000));
      }
    }
    updateSummary("Semua API gagal atau sedang cooldown");
    throw new Error(attempts ? failures.slice(-3).join(" | ") : "Semua API sedang cooldown. Coba lagi sebentar.");
  }

  function patchAssistant() {
    window.callAI = callRotating;
    const originalSave = window.saveGeminiSettings;
    window.saveGeminiSettings = function (showMessage = true) {
      if (typeof originalSave === "function") originalSave(false);
      const saved = settings();
      const list = credentials();
      if (!state.geminiApiKey && list.length) state.geminiApiKey = list[0].key;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...saved, apiPoolText: document.querySelector("#amyAiKeyPoolInput")?.value ?? saved.apiPoolText ?? "", paidFallback: document.querySelector("#amyAiPaidFallbackInput")?.checked ?? Boolean(saved.paidFallback) }));
      if (showMessage) {
        const message = document.querySelector("#assistantMessage");
        const next = list.length ? `${list.length} API tersimpan. Rotasi otomatis aktif.` : "API key kosong.";
        if (message && message.textContent !== next) message.textContent = next;
      }
    };

    window.processAssistantInput = async function (question, surface = "assistant") {
      const assistant = surface === "assistant";
      let loadingId = "";
      if (assistant) {
        if (state.isAiProcessing) return;
        state.isAiProcessing = true;
        appendAssistantChat("user", question);
        const loading = appendAssistantChat("assistant", "Memproses perintah...", { transient: true });
        loadingId = loading?.id || "";
      } else renderAiPopupText("Memproses perintah...");
      const finish = (text, extra = {}) => {
        const safe = text || "Tidak ada jawaban.";
        state.aiPopupLastQuestion = question;
        state.aiPopupLastAnswer = safe;
        if (assistant && loadingId) updateAssistantChatMessage(loadingId, safe, { ...extra, transient: false });
        if (!assistant) renderAiPopupText(safe);
        return safe;
      };
      try {
        await hydrateMaterialContentsForQuery(question, { maxItems: 80 });
        const action = await handleAiActionCommand(question, { surface });
        if (action) return finish(action.text || "Selesai.", action.extra || {});
        const quick = await buildLocalAssistantQuickAnswer(question);
        if (quick) return typeof quick === "object" ? finish(quick.text, quick.extra || {}) : finish(quick);
        const list = credentials();
        if (!state.geminiApiKey && list.length) state.geminiApiKey = list[0].key;
        const answer = await runAssistantQuestion(question, null, { mode: state.assistantMode });
        return finish(answer || "Tidak ada jawaban.");
      } catch (error) {
        return finish(`Asisten berhenti karena error: ${error.message || "proses gagal"}`);
      } finally {
        if (assistant) state.isAiProcessing = false;
      }
    };
  }

  function apply() {
    if (ready || typeof state === "undefined" || typeof renderJournals !== "function" || typeof processAssistantInput !== "function") return false;
    bridgeIndexedDbJournals();
    patchCalendar();
    patchAssistant();
    ensurePoolUi();
    bindPoolUiNavigation();
    ready = true;
    if (typeof render === "function") render();
    setTimeout(() => {
      ensurePoolUi();
      if (typeof renderJournals === "function") renderJournals();
      if (typeof renderStatistics === "function" && typeof getFilteredItems === "function") renderStatistics(getFilteredItems(state.items));
    }, 120);
    return true;
  }

  function boot() {
    const timer = setInterval(() => { if (apply()) clearInterval(timer); }, 80);
    setTimeout(() => clearInterval(timer), 15000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
