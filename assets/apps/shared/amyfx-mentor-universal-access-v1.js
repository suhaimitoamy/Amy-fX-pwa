"use strict";

(function () {
  if (window.__amyFxMentorUniversalAccessV1) return;
  window.__amyFxMentorUniversalAccessV1 = true;

  const VERSION = "1.0.0";
  const RUNTIME_URL = document.currentScript?.src || "";
  const ASSET_ROOT = RUNTIME_URL ? new URL("../../", RUNTIME_URL) : new URL("../../", location.href);
  const HISTORY_KEY = "amyfx.mentor.history.v2";
  const MAX_HISTORY = 30;
  const MAX_CONTEXT_CHARS = 90_000;
  const cache = new Map();

  const MODULES = Object.freeze([
    { id: "home", label: "Beranda & Profil", path: "index.html" },
    { id: "mapping", label: "Mapping", path: "apps/mapping/index.html" },
    { id: "intel", label: "Berita, Heatmap & Liquidity", path: "apps/market-intel/index.html" },
    { id: "journal", label: "Jurnal, Library & Catatan", path: "apps/journal/index.html" },
    { id: "academy", label: "Amy FX Academy", path: "apps/academy/index.html" },
    { id: "indicators", label: "Indikator TradingView", path: "apps/indikator/manifest.json" }
  ]);

  const SECRET_FIELD = /(?:^|[_\-.])(api.?key|secret|token|password|passphrase|credential|authorization|bearer|pin(?:hash)?|keystore|signing|private.?key|license)(?:$|[_\-.])/i;
  const SECRET_STORAGE = /assistantSettings|api.?key|secret|token|password|passphrase|credential|authorization|pin|keystore|signing|license/i;
  const SAFE_STORAGE_PREFIX = /^(amy_|amyfx\.|tradingLibraryManager\.)/i;
  const CODE_QUERY = /indikator|pine|script|tradingview|kode|source|logic|logika|compile/i;
  const ACADEMY_QUERY = /academy|belajar|materi|pelajaran|bias|liquidity|likuiditas|fvg|order block|risk|psikologi|backtest|ict|smc|chart|candlestick|entry|session|mapping/i;
  const JOURNAL_QUERY = /jurnal|journal|entry|trade|win|loss|profit|rugi|evaluasi|emosi|disiplin|kesalahan|review|catatan/i;
  const LIBRARY_QUERY = /library|file|dokumen|catatan|koleksi|media|gambar|video|pdf|word|excel|materi tersimpan/i;
  const MARKET_QUERY = /mapping|market|harga|xau|gold|setup|bsl|ssl|heatmap|news|berita|liquidity|likuiditas|arah|bias|skenario|forecast/i;

  function clean(value) {
    return String(value ?? "").trim();
  }

  function safeParse(value, fallback = null) {
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function clip(value, limit = 4_000) {
    const text = String(value ?? "");
    return text.length > limit ? `${text.slice(0, limit)}\n…[dipotong ${text.length - limit} karakter]` : text;
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
  }

  function safeKey(key) {
    const value = clean(key);
    return value === "masked_tail" || value === "provider" || value === "model" || value === "alias"
      || value === "status" || value === "priority" || value === "id" || value === "key_refs";
  }

  function sanitize(value, key = "", depth = 0) {
    if (depth > 7) return "[kedalaman dibatasi]";
    if (key && SECRET_FIELD.test(key) && !safeKey(key)) return undefined;
    if (value == null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") return clip(value, key === "code" || key === "content" || key === "passage" ? 16_000 : 4_000);
    if (Array.isArray(value)) {
      return value.slice(0, 80).map(item => sanitize(item, "", depth + 1)).filter(item => item !== undefined);
    }
    if (typeof value === "object") {
      const output = {};
      Object.entries(value).slice(0, 160).forEach(([childKey, childValue]) => {
        const next = sanitize(childValue, childKey, depth + 1);
        if (next !== undefined) output[childKey] = next;
      });
      return output;
    }
    return String(value);
  }

  function currentModule() {
    const path = location.pathname.toLowerCase();
    if (path.includes("/apps/mapping/")) return "mapping";
    if (path.includes("/apps/market-intel/")) return "intel";
    if (path.includes("/apps/journal/")) return "journal";
    if (path.includes("/apps/academy/")) return "academy";
    return "home";
  }

  function tokens(question) {
    return clean(question).toLowerCase().split(/[^a-z0-9_À-ÿ]+/i).filter(token => token.length >= 3).slice(0, 24);
  }

  function score(value, questionTokens) {
    const haystack = clean(value).toLowerCase();
    if (!haystack || !questionTokens.length) return 0;
    return questionTokens.reduce((total, token) => total + (haystack.includes(token) ? (token.length >= 6 ? 3 : 1) : 0), 0);
  }

  function newest(rows, limit = 20) {
    return [...rows].sort((a, b) => {
      const left = new Date(a?.updatedAt || a?.updated_at || a?.createdAt || a?.created_at || a?.date || 0).getTime() || 0;
      const right = new Date(b?.updatedAt || b?.updated_at || b?.createdAt || b?.created_at || b?.date || 0).getTime() || 0;
      return right - left;
    }).slice(0, limit);
  }

  function readLocalJson(key, fallback) {
    try { return safeParse(localStorage.getItem(key), fallback) ?? fallback; } catch { return fallback; }
  }

  function safeStorageSnapshot(question) {
    const queryTokens = tokens(question);
    const rows = [];
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index) || "";
        if (!SAFE_STORAGE_PREFIX.test(key) || SECRET_STORAGE.test(key)) continue;
        const raw = localStorage.getItem(key) || "";
        const relevance = score(`${key} ${raw.slice(0, 2_000)}`, queryTokens);
        if (raw.length > 20_000 && relevance === 0 && key !== "amyfx.market.intel.v1") {
          rows.push({ key, type: "large", size: raw.length });
          continue;
        }
        const parsed = safeParse(raw, raw);
        rows.push({ key, relevance, value: sanitize(parsed, key) });
      }
    } catch {}
    return rows.sort((a, b) => b.relevance - a.relevance).slice(0, 35);
  }

  function readMentorHistory() {
    const rows = readLocalJson(HISTORY_KEY, []);
    return Array.isArray(rows) ? rows.slice(-MAX_HISTORY).map(row => sanitize(row)) : [];
  }

  function writeMentorHistory(role, textValue, meta = "") {
    const rows = readMentorHistory();
    rows.push({ role, text: clip(textValue, 4_000), meta: clip(meta, 300), at: new Date().toISOString() });
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(rows.slice(-MAX_HISTORY))); } catch {}
  }

  function currentConversation() {
    return [...document.querySelectorAll(".amy-os-message")].slice(-12).map(row => ({
      role: row.classList.contains("amy-os-message--user") ? "user" : "amy",
      text: clip(row.innerText || row.textContent || "", 2_000)
    })).filter(row => row.text && !/Amy sedang berpikir/i.test(row.text));
  }

  function openDatabase(name, timeoutMs = 2_500) {
    return new Promise(resolve => {
      if (!window.indexedDB) return resolve(null);
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      try {
        const request = indexedDB.open(name);
        request.onsuccess = () => finish(request.result);
        request.onerror = () => finish(null);
        request.onblocked = () => finish(null);
        window.setTimeout(() => finish(null), timeoutMs);
      } catch {
        finish(null);
      }
    });
  }

  async function readStoreRecord(dbName, storeName, recordId) {
    const db = await openDatabase(dbName);
    if (!db) return null;
    if (!db.objectStoreNames.contains(storeName)) { db.close(); return null; }
    return new Promise(resolve => {
      try {
        const transaction = db.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).get(recordId);
        request.onsuccess = () => { const value = request.result || null; db.close(); resolve(value); };
        request.onerror = () => { db.close(); resolve(null); };
      } catch {
        db.close();
        resolve(null);
      }
    });
  }

  async function readStoreAll(dbName, storeName, limit = 30) {
    const db = await openDatabase(dbName);
    if (!db) return [];
    if (!db.objectStoreNames.contains(storeName)) { db.close(); return []; }
    return new Promise(resolve => {
      try {
        const transaction = db.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).getAll();
        request.onsuccess = () => {
          const rows = Array.isArray(request.result) ? request.result : [];
          db.close();
          resolve(newest(rows, limit));
        };
        request.onerror = () => { db.close(); resolve([]); };
      } catch {
        db.close();
        resolve([]);
      }
    });
  }

  async function readTradingMetadata(recordId, legacyKey) {
    const record = await readStoreRecord("tradingLibraryManager.files", "metadata", recordId);
    if (Array.isArray(record?.value)) return record.value;
    const legacy = readLocalJson(legacyKey, []);
    return Array.isArray(legacy) ? legacy : [];
  }

  function journalSummary(rows) {
    const normalized = Array.isArray(rows) ? rows : [];
    const result = value => clean(value).toLowerCase();
    const win = normalized.filter(row => result(row.result) === "win").length;
    const loss = normalized.filter(row => result(row.result) === "loss").length;
    const be = normalized.filter(row => ["be", "break even", "breakeven"].includes(result(row.result))).length;
    const profit = normalized.reduce((total, row) => total + (Number(row.profit) || 0), 0);
    const losses = normalized.reduce((total, row) => total + (Number(row.loss) || 0), 0);
    const completed = win + loss + be;
    return {
      total: normalized.length,
      win,
      loss,
      break_even: be,
      completed,
      win_rate: completed ? Math.round((win / completed) * 1_000) / 10 : null,
      total_profit: Math.round(profit * 100) / 100,
      total_loss: Math.round(losses * 100) / 100,
      net_result: Math.round((profit - losses) * 100) / 100
    };
  }

  function itemCatalog(rows) {
    const byCategory = {};
    const byType = {};
    const byStatus = {};
    rows.forEach(row => {
      const category = clean(row.category || "Tanpa kategori");
      const type = clean(row.type || row.mediaKind || "Lainnya");
      const status = clean(row.status || "Tanpa status");
      byCategory[category] = (byCategory[category] || 0) + 1;
      byType[type] = (byType[type] || 0) + 1;
      byStatus[status] = (byStatus[status] || 0) + 1;
    });
    return {
      total: rows.length,
      by_category: byCategory,
      by_type: byType,
      by_status: byStatus,
      titles: rows.slice(0, 120).map(row => ({ id: row.id, title: row.title, category: row.category, type: row.type, status: row.status }))
    };
  }

  function rankRows(rows, question, fields, limit = 12) {
    const queryTokens = tokens(question);
    if (!queryTokens.length) return newest(rows, limit);
    return rows.map(row => ({
      row,
      relevance: score(fields.map(field => row?.[field]).join(" "), queryTokens)
    })).sort((a, b) => b.relevance - a.relevance).filter(item => item.relevance > 0).slice(0, limit).map(item => item.row);
  }

  async function tradingWorkspace(question) {
    const [itemsRaw, journalsRaw] = await Promise.all([
      readTradingMetadata("items.v2", "tradingLibraryManager.items.v1"),
      readTradingMetadata("journals.v2", "tradingLibraryManager.journals.v1")
    ]);
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    const journals = Array.isArray(journalsRaw) ? journalsRaw : [];
    const relevantItems = rankRows(items, question, ["title", "category", "type", "status", "collection", "tags", "notes", "code"], 12)
      .map(row => {
        const output = sanitize(row) || {};
        if (!CODE_QUERY.test(question) && typeof output.code === "string") {
          output.code_size = output.code.length;
          delete output.code;
        }
        return output;
      });
    const relevantJournals = rankRows(journals, question, ["title", "market", "setup", "result", "evaluation", "mistakes", "lessons", "emotion", "notes", "content"], 24)
      .map(row => sanitize(row));
    const personalNotes = readLocalJson("tradingLibraryManager.notes.v1", []);
    return {
      journal: {
        summary: journalSummary(journals),
        recent: newest(journals, 15).map(row => sanitize(row)),
        relevant: relevantJournals
      },
      library: {
        catalog: itemCatalog(items),
        relevant: relevantItems,
        personal_notes: Array.isArray(personalNotes) ? rankRows(personalNotes, question, ["title", "content", "date"], 20).map(row => sanitize(row)) : []
      }
    };
  }

  function fetchText(url, timeoutMs = 5_000) {
    const key = String(url);
    if (cache.has(key)) return cache.get(key);
    const promise = new Promise(async resolve => {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = window.setTimeout(() => controller?.abort(), timeoutMs);
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller?.signal });
        if (response.ok || response.status === 0) {
          clearTimeout(timer);
          resolve(await response.text());
          return;
        }
      } catch {}
      clearTimeout(timer);
      try {
        const xhrText = await new Promise((done, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("GET", String(url), true);
          xhr.timeout = timeoutMs;
          xhr.onload = () => (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) ? done(xhr.responseText) : reject(new Error("HTTP"));
          xhr.onerror = reject;
          xhr.ontimeout = reject;
          xhr.send();
        });
        resolve(xhrText);
      } catch {
        resolve("");
      }
    });
    cache.set(key, promise);
    return promise;
  }

  function htmlDocument(html) {
    try { return new DOMParser().parseFromString(html, "text/html"); } catch { return null; }
  }

  function pageText(doc, limit = 14_000) {
    if (!doc) return "";
    doc.querySelectorAll("script, style, nav, footer").forEach(node => node.remove());
    return clip(clean(doc.querySelector("article, main, .article, .lesson-content")?.innerText || doc.body?.innerText || "").replace(/\s+/g, " "), limit);
  }

  async function academyWorkspace(question) {
    const progress = {
      read_topics: readLocalJson("amy_read_topics", []),
      last_title: localStorage.getItem("amy_last_opened_title") || "",
      last_url: localStorage.getItem("amy_last_opened_url") || "",
      total_sections: 36
    };
    const indexUrl = new URL("apps/academy/index.html", ASSET_ROOT);
    const indexHtml = await fetchText(indexUrl);
    const indexDoc = htmlDocument(indexHtml);
    const cards = indexDoc ? [...indexDoc.querySelectorAll(".course-card")].map(card => {
      const link = card.querySelector("a[href]");
      return {
        title: clean(card.querySelector("h3")?.textContent),
        section: clean(card.querySelector(".num")?.textContent),
        description: clean(card.querySelector("p")?.textContent),
        href: link ? new URL(link.getAttribute("href"), indexUrl).href : ""
      };
    }).filter(row => row.title) : [];

    const queryTokens = tokens(question);
    const ranked = cards.map(row => ({ ...row, relevance: score(`${row.title} ${row.description} ${row.section}`, queryTokens) }))
      .sort((a, b) => b.relevance - a.relevance);
    const shouldLoad = ACADEMY_QUERY.test(question) || ranked[0]?.relevance > 0;
    const selected = shouldLoad ? ranked.filter(row => row.relevance > 0).slice(0, 3) : [];
    const relevantLessons = [];

    for (const card of selected) {
      const html = await fetchText(card.href);
      const doc = htmlDocument(html);
      if (!doc) continue;
      const sectionText = pageText(doc, 12_000);
      const links = [...doc.querySelectorAll("a[href]")].map(link => ({
        title: clean(link.textContent),
        href: new URL(link.getAttribute("href"), card.href).href
      })).filter(row => row.title && row.href.includes("/apps/academy/") && !row.href.endsWith("#"));
      const child = links.map(row => ({ ...row, relevance: score(row.title, queryTokens) }))
        .sort((a, b) => b.relevance - a.relevance).find(row => row.relevance > 0 && row.href !== card.href);
      let childPassage = "";
      let childTitle = "";
      if (child) {
        const childHtml = await fetchText(child.href);
        const childDoc = htmlDocument(childHtml);
        childTitle = clean(childDoc?.querySelector("h1")?.textContent || child.title);
        childPassage = pageText(childDoc, 12_000);
      }
      relevantLessons.push({
        section: card.section,
        title: card.title,
        description: card.description,
        passage: sectionText,
        matched_topic: childTitle || null,
        matched_topic_passage: childPassage || null
      });
    }

    return {
      progress: {
        ...progress,
        read_count: Array.isArray(progress.read_topics) ? progress.read_topics.length : 0,
        percentage: Array.isArray(progress.read_topics) ? Math.min(100, Math.round((progress.read_topics.length / 36) * 100)) : 0
      },
      catalog: cards.map(({ title, section, description, href }) => ({ title, section, description, href })),
      relevant_lessons: relevantLessons,
      current_page: location.pathname.includes("/apps/academy/") ? {
        title: clean(document.querySelector("h1")?.textContent || document.title),
        passage: clip(clean(document.querySelector("article, main, .article")?.innerText || "").replace(/\s+/g, " "), 14_000)
      } : null
    };
  }

  async function indicatorWorkspace(question) {
    const manifestUrl = new URL("apps/indikator/manifest.json", ASSET_ROOT);
    const raw = await fetchText(manifestUrl);
    const manifest = safeParse(raw, []);
    const rows = Array.isArray(manifest) ? manifest : [];
    const queryTokens = tokens(question);
    const ranked = rows.map(row => ({
      ...row,
      relevance: score(`${row.name} ${row.category} ${row.desc} ${row.url}`, queryTokens)
    })).sort((a, b) => b.relevance - a.relevance);
    const shouldLoadCode = CODE_QUERY.test(question);
    const selected = shouldLoadCode ? ranked.filter(row => row.relevance > 0).slice(0, 3) : [];
    const relevant = [];
    for (const row of selected) {
      const source = row.url ? await fetchText(new URL(row.url, ASSET_ROOT), 7_000) : "";
      relevant.push({
        name: row.name,
        category: row.category,
        description: row.desc,
        source: clip(source, 18_000)
      });
    }
    return {
      total: rows.length,
      catalog: rows.map(row => ({ name: row.name, category: row.category, description: row.desc, url: row.url })),
      relevant
    };
  }

  function marketWorkspace() {
    const intel = window.AmyFXIntel?.read?.() || window.AmyFXIntelState || readLocalJson("amyfx.market.intel.v1", {});
    const mappingState = window.AmyFXMarketState || window.lastMappingResult || null;
    const analyses = readLocalJson("amy_mapping_analyses", []);
    const setups = readLocalJson("amy_mapping_setups", []);
    const logs = readLocalJson("amy_mapping_logs", []);
    const lifecycle = readLocalJson("amy_mapping_lifecycle_v4", {});
    const latestTimes = [
      mappingState?.capturedAt,
      mappingState?.updatedAt,
      intel?.mapping?.updated,
      intel?.heatmap?.updated,
      intel?.liquidity?.updated,
      intel?.news?.updated
    ].map(value => new Date(value || 0).getTime()).filter(value => Number.isFinite(value) && value > 86_400_000);
    const capturedAt = latestTimes.length ? new Date(Math.max(...latestTimes)).toISOString() : null;
    return sanitize({
      pair: "XAU/USD",
      captured_at: capturedAt,
      live_state: mappingState,
      shared_intelligence: intel,
      recent_analyses: Array.isArray(analyses) ? newest(analyses, 12) : [],
      active_and_recent_setups: Array.isArray(setups) ? newest(setups, 15) : [],
      recent_logs: Array.isArray(logs) ? logs.slice(0, 20) : [],
      lifecycle: lifecycle && typeof lifecycle === "object" ? Object.fromEntries(Object.entries(lifecycle).slice(-20)) : {},
      current_price: Number(mappingState?.price || intel?.mapping?.price || intel?.heatmap?.currentPrice || intel?.liquidity?.currentPrice || localStorage.getItem("last_price") || 0) || null
    });
  }

  async function systemWorkspace(question) {
    const settings = window.AmyFXOS?.getGlobalSettings?.() || readLocalJson("amyfx.globalAiSettings.v1", {});
    let nativeSecrets = [];
    try {
      const parsed = safeParse(window.AmyNativeAI?.listSecrets?.(), []);
      if (Array.isArray(parsed)) nativeSecrets = parsed;
    } catch {}
    const health = await readStoreAll("amyfx_os_v1", "health", 20);
    const recentContexts = await readStoreAll("amyfx_os_v1", "contexts", 10);
    let update = null;
    if (/versi|version|update|rilis|release|status aplikasi/i.test(question)) {
      update = safeParse(await fetchText(new URL("preview-update.json", ASSET_ROOT)), null);
    }
    return sanitize({
      app: {
        product: "Amy FX Preview",
        version: window.AmyFXAppVersion || null,
        online: navigator.onLine,
        active_module: currentModule(),
        route: location.pathname,
        modules: MODULES,
        update
      },
      ai: {
        secure_vault_available: Boolean(window.AmyNativeAI?.send && window.AmyNativeAI?.storeSecret),
        providers: Array.isArray(settings?.key_refs) ? settings.key_refs.map(ref => ({
          id: ref.id,
          alias: ref.alias,
          provider: ref.provider,
          model: ref.model,
          masked_tail: clean(ref.masked_tail).slice(-4),
          priority: ref.priority,
          status: ref.status
        })) : [],
        native_secret_count: nativeSecrets.length,
        native_secrets: nativeSecrets.map(row => ({ id: row.id, alias: row.alias, provider: row.provider, masked_tail: clean(row.masked_tail).slice(-4), status: row.status })),
        paid_fallback: Boolean(settings?.paid_fallback)
      },
      health,
      recent_contexts: recentContexts
    });
  }

  function trimWorkspace(workspace) {
    let output = workspace;
    let length = JSON.stringify(output).length;
    if (length <= MAX_CONTEXT_CHARS) return output;

    output = clone(output) || {};
    if (output.storage) output.storage = output.storage.slice(0, 12).map(row => ({ key: row.key, relevance: row.relevance, value: typeof row.value === "string" ? clip(row.value, 600) : sanitize(row.value) }));
    if (output.academy?.catalog) output.academy.catalog = output.academy.catalog.slice(0, 40);
    if (output.academy?.relevant_lessons) output.academy.relevant_lessons = output.academy.relevant_lessons.map(row => ({ ...row, passage: clip(row.passage, 5_000), matched_topic_passage: clip(row.matched_topic_passage, 5_000) }));
    if (output.indicators?.catalog) output.indicators.catalog = output.indicators.catalog.slice(0, 40);
    if (output.indicators?.relevant) output.indicators.relevant = output.indicators.relevant.map(row => ({ ...row, source: clip(row.source, 8_000) }));
    if (output.trading?.journal?.recent) output.trading.journal.recent = output.trading.journal.recent.slice(0, 8);
    if (output.trading?.journal?.relevant) output.trading.journal.relevant = output.trading.journal.relevant.slice(0, 12);
    if (output.trading?.library?.catalog?.titles) output.trading.library.catalog.titles = output.trading.library.catalog.titles.slice(0, 50);
    if (output.trading?.library?.relevant) output.trading.library.relevant = output.trading.library.relevant.slice(0, 8);
    if (output.mentor_history) output.mentor_history = output.mentor_history.slice(-12);
    length = JSON.stringify(output).length;
    output.context_size_chars = length;
    output.context_trimmed = true;
    return output;
  }

  async function collect(question = "") {
    const [trading, academy, indicators, system] = await Promise.all([
      tradingWorkspace(question),
      academyWorkspace(question),
      indicatorWorkspace(question),
      systemWorkspace(question)
    ]);
    const workspace = {
      schema: "AmyFXUniversalWorkspaceContext",
      schema_version: 1,
      generated_at: new Date().toISOString(),
      timezone: "Asia/Makassar",
      access: {
        mode: "all_modules_read_only",
        retrieval: "query_aware_full_catalog",
        secrets: "blocked",
        binary_media: "metadata_only_unless_text_is_available",
        modules: MODULES.map(row => row.id)
      },
      request_query: clean(question),
      market: marketWorkspace(),
      trading,
      academy,
      indicators,
      system,
      storage: safeStorageSnapshot(question),
      mentor_history: readMentorHistory(),
      current_conversation: currentConversation()
    };
    workspace.context_size_chars = JSON.stringify(workspace).length;
    return trimWorkspace(workspace);
  }

  function latestMarketTimestamp(workspace) {
    const value = workspace?.market?.captured_at;
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) && time > 86_400_000 ? new Date(time).toISOString() : null;
  }

  async function enrich(baseContext, options = {}) {
    const base = baseContext && typeof baseContext === "object" ? clone(baseContext) : {};
    const existing = base?.payload?.workspace;
    if (existing?.schema === "AmyFXUniversalWorkspaceContext" && clean(existing.request_query) === clean(options.question || existing.request_query)) return base;
    const workspace = await collect(options.question || "");
    const capturedAt = base.captured_at || latestMarketTimestamp(workspace);
    const sourceRefs = Array.isArray(base.source_refs) ? base.source_refs : [];
    const output = {
      ...base,
      source_module: base.source_module || options.sourceModule || currentModule(),
      captured_at: capturedAt,
      display_time: base.display_time || (capturedAt ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", dateStyle: "medium", timeStyle: "short", hour12: false }).format(new Date(capturedAt)) + " WITA" : "Belum ada data"),
      privacy_scope: "all_modules_read_only_no_secrets",
      access_scope: "all_amy_fx_modules",
      source_refs: [...sourceRefs, { module: "workspace", scope: "all_modules", captured_at: workspace.generated_at }],
      payload: { ...(base.payload || {}), workspace }
    };
    if (capturedAt && window.AmyFXOS?.Freshness?.assess && ["home", "mapping", "intel"].includes(output.source_module)) {
      output.freshness = window.AmyFXOS.Freshness.assess(capturedAt, output.payload?.timeframe || "M15");
    }
    return output;
  }

  function universalFallback(question, context, originalText = "") {
    const workspace = context?.payload?.workspace;
    if (!workspace) return originalText;
    const value = clean(question).toLowerCase();
    const journal = workspace.trading?.journal?.summary || {};
    const library = workspace.trading?.library?.catalog || {};
    const academy = workspace.academy?.progress || {};
    const market = workspace.market || {};
    if (/status semua modul|ringkas status semua|akses semua/.test(value)) {
      return `Amy sudah terhubung ke seluruh modul. Saat ini ada ${journal.total || 0} jurnal, ${library.total || 0} item Library, progres Academy ${academy.read_count || 0}/${academy.total_sections || 36}, dan data market ${market.captured_at ? "tersedia" : "belum tersedia"}.`;
    }
    if (/berapa.*jurnal|jumlah jurnal/.test(value)) return `Jumlah jurnal yang tersimpan saat ini ${journal.total || 0}.`;
    if (/progres.*academy|sampai mana.*belajar/.test(value)) return `Progres Academy saat ini ${academy.read_count || 0} dari ${academy.total_sections || 36} bagian (${academy.percentage || 0}%).`;
    if (/berapa.*library|jumlah.*file|jumlah.*materi/.test(value)) return `Library saat ini berisi ${library.total || 0} item.`;
    return originalText;
  }

  function installOsWrapper() {
    const os = window.AmyFXOS;
    if (!os?.ask || !os?.buildContext || os.__amyUniversalAccessV1) return Boolean(os?.__amyUniversalAccessV1);
    const originalBuild = os.buildContext.bind(os);
    const originalAsk = os.ask.bind(os);

    const buildContext = async function (sourceModule = currentModule(), options = {}) {
      const base = await originalBuild(sourceModule);
      return enrich(base, { ...options, sourceModule });
    };

    const ask = async function (question, options = {}) {
      const sourceModule = options.sourceModule || currentModule();
      const base = options.context || await originalBuild(sourceModule);
      const context = await enrich(base, { question, sourceModule });
      const result = await originalAsk(question, { ...options, context });
      if (["deterministic", "amy-local"].includes(result?.provider)) {
        return { ...result, text: universalFallback(question, context, result?.text || ""), context };
      }
      return { ...result, context };
    };

    window.AmyFXOS = Object.freeze({
      ...os,
      buildContext,
      ask,
      universalContext: Object.freeze({ collect, enrich }),
      __amyUniversalAccessV1: true
    });
    window.dispatchEvent(new CustomEvent("amyfx:universal-access-ready", { detail: { version: VERSION } }));
    return true;
  }

  function appendMessage(role, body, meta = "") {
    const messages = document.querySelector(".amy-os-messages");
    if (!messages) return null;
    const row = document.createElement("div");
    row.className = `amy-os-message amy-os-message--${role}`;
    const main = document.createElement("div");
    main.textContent = body;
    row.appendChild(main);
    if (meta) {
      const small = document.createElement("small");
      small.textContent = meta;
      row.appendChild(small);
    }
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
    return row;
  }

  function showThinking() {
    const row = appendMessage("amy", "Amy sedang membaca seluruh data Amy FX…");
    if (row) row.dataset.amyUniversalThinking = "v1";
    return row;
  }

  function updateAccessUi() {
    const input = document.querySelector("[data-amy-input]");
    if (input) input.placeholder = "Tanya seluruh data Amy FX";
    const contexts = document.querySelector("[data-amy-contexts]");
    if (contexts && !contexts.querySelector("[data-amy-all-access]")) {
      const chip = document.createElement("span");
      chip.className = "amy-os-chip";
      chip.dataset.amyAllAccess = "1";
      chip.textContent = "SEMUA MODUL";
      contexts.appendChild(chip);
    }
    const health = document.querySelector("[data-amy-health]");
    if (health && !health.dataset.amyAllAccess) {
      health.dataset.amyAllAccess = "1";
      health.textContent = `${health.textContent} • AKSES SEMUA DATA`;
    }
  }

  async function submitUniversal(questionOverride = "", options = {}) {
    const input = document.querySelector("[data-amy-input]");
    const send = document.querySelector("[data-amy-send]");
    const panel = document.querySelector(".amy-os-panel");
    const question = clean(questionOverride || input?.value);
    if (!question || !send || panel?.dataset.amyUniversalSending === "1") return;

    panel.dataset.amyUniversalSending = "1";
    send.disabled = true;
    if (input) input.value = "";
    appendMessage("user", question);
    writeMentorHistory("user", question);
    const thinking = showThinking();
    try {
      installOsWrapper();
      if (!window.AmyFXOS?.ask) throw new Error("Amy Mentor belum siap");
      const sourceModule = options.sourceModule || currentModule();
      const result = await window.AmyFXOS.ask(question, {
        ...options,
        sourceModule,
        context: options.context || undefined
      });
      thinking?.remove();
      const meta = `${result?.source || "Dari seluruh Amy FX"} • ${result?.provider || "Amy"}`;
      appendMessage("amy", result?.text || "Saya belum mendapat jawaban.", meta);
      writeMentorHistory("amy", result?.text || "", meta);
      updateAccessUi();
    } catch (error) {
      thinking?.remove();
      appendMessage("amy", `Amy belum bisa membaca data saat ini: ${clean(error?.message || error)}`);
    } finally {
      panel.dataset.amyUniversalSending = "0";
      send.disabled = false;
      input?.focus();
    }
  }

  function installUiInterception() {
    if (document.documentElement.dataset.amyUniversalUi === "1") return;
    document.documentElement.dataset.amyUniversalUi = "1";

    document.addEventListener("click", event => {
      const starter = event.target.closest?.("[data-starter]");
      if (starter) {
        event.preventDefault();
        event.stopImmediatePropagation();
        submitUniversal(starter.dataset.starter || starter.textContent || "");
        return;
      }
      if (event.target.closest?.("[data-amy-send]")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        submitUniversal();
      }
    }, true);

    document.addEventListener("keydown", event => {
      if (!event.target.matches?.("[data-amy-input]") || event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      submitUniversal();
    }, true);
  }

  function boot() {
    installUiInterception();
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      installOsWrapper();
      updateAccessUi();
      if ((window.AmyFXOS?.__amyUniversalAccessV1 && document.querySelector("[data-amy-input]")) || attempts >= 300) clearInterval(timer);
    }, 80);
    window.setTimeout(() => clearInterval(timer), 30_000);

    const target = document.body || document.documentElement;
    if (target) new MutationObserver(() => {
      installOsWrapper();
      updateAccessUi();
    }).observe(target, { childList: true, subtree: true });
    window.addEventListener("focus", () => { installOsWrapper(); updateAccessUi(); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { installOsWrapper(); updateAccessUi(); } });
  }

  window.AmyFXUniversalContext = Object.freeze({
    version: VERSION,
    collect,
    enrich,
    sanitize,
    submit: submitUniversal,
    modules: MODULES
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
