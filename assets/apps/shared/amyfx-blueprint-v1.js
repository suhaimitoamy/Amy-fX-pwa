"use strict";

(function () {
  if (window.__amyFxBlueprintPreviewV1) return;
  window.__amyFxBlueprintPreviewV1 = true;

  const CONFIG = Object.freeze({
    product: "Amy FX",
    blueprintVersion: "1.0.0",
    schemaVersion: 1,
    timezone: "Asia/Makassar",
    database: "amyfx_os_v1",
    legacyAssistantSettingsKey: "tradingLibraryManager.assistantSettings.v1",
    legacyJournalKey: "tradingLibraryManager.journals.v1",
    globalSettingsKey: "amyfx.globalAiSettings.v1",
    flagsKey: "amyfx.os.featureFlags.v1",
    migrationKey: "amyfx.os.migration.v1",
    notificationKey: "amyfx.os.notifications.v1"
  });

  const SETUP_STATES = Object.freeze([
    "DATA_INVALID", "WAIT", "WATCH", "ARMED", "TRIGGERED", "MANAGEMENT",
    "TP", "SL", "EXPIRED", "CANCELLED", "REPLACED"
  ]);

  const FEATURE_DEFAULTS = Object.freeze({
    snapshot_v2: true,
    setup_lifecycle_v2: true,
    global_mentor: true,
    journal_schema_v2: true,
    new_shell: true,
    command_center: true,
    secure_ai_vault: true,
    proactive_insights: true
  });

  const TTL = Object.freeze({
    quote: { soft: 30_000, hard: 120_000 },
    M1: { soft: 120_000, hard: 300_000 },
    M5: { soft: 360_000, hard: 900_000 },
    M15: { soft: 900_000, hard: 1_800_000 },
    H1: { soft: 4_500_000, hard: 10_800_000 },
    H4: { soft: 18_000_000, hard: 43_200_000 },
    D1: { soft: 108_000_000, hard: 259_200_000 },
    news: { soft: 900_000, hard: 3_600_000 },
    journal: { soft: Number.MAX_SAFE_INTEGER, hard: Number.MAX_SAFE_INTEGER },
    academy: { soft: Number.MAX_SAFE_INTEGER, hard: Number.MAX_SAFE_INTEGER }
  });

  const moduleName = (() => {
    const path = location.pathname.toLowerCase();
    if (path.includes("/apps/mapping/")) return "mapping";
    if (path.includes("/apps/market-intel/")) return "intel";
    if (path.includes("/apps/journal/")) return "journal";
    if (path.includes("/apps/academy/")) return "academy";
    return "home";
  })();

  const safeParse = (value, fallback = null) => {
    try { return JSON.parse(value); } catch { return fallback; }
  };
  const clone = value => safeParse(JSON.stringify(value), value);
  const nowIso = () => new Date().toISOString();
  const id = prefix => {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${random}`;
  };
  const text = value => String(value ?? "").trim();
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const nextFrame = callback => (globalThis.requestAnimationFrame || setTimeout)(callback, 16);

  function readJsonStorage(key, fallback) {
    try { return safeParse(localStorage.getItem(key), fallback) ?? fallback; } catch { return fallback; }
  }
  function writeJsonStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }

  class Repository {
    constructor() {
      this.db = null;
      this.memory = new Map();
    }
    async open() {
      if (this.db) return this.db;
      if (!globalThis.indexedDB) return null;
      this.db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(CONFIG.database, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          [
            "settings", "contexts", "threads", "messages", "usage", "notifications",
            "migrations", "journal", "setups", "health"
          ].forEach(name => {
            if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
          });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB unavailable"));
      }).catch(() => null);
      return this.db;
    }
    async put(store, value) {
      const row = { ...value, id: value.id || id(store) };
      const db = await this.open();
      if (!db) {
        this.memory.set(`${store}:${row.id}`, clone(row));
        return row;
      }
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(row);
        tx.oncomplete = () => resolve(row);
        tx.onerror = () => reject(tx.error);
      }).catch(() => row);
    }
    async get(store, rowId) {
      const db = await this.open();
      if (!db) return clone(this.memory.get(`${store}:${rowId}`) || null);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).get(rowId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      }).catch(() => null);
    }
    async all(store) {
      const db = await this.open();
      if (!db) {
        return [...this.memory.entries()]
          .filter(([key]) => key.startsWith(`${store}:`))
          .map(([, value]) => clone(value));
      }
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }).catch(() => []);
    }
    async remove(store, rowId) {
      const db = await this.open();
      if (!db) return this.memory.delete(`${store}:${rowId}`);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(rowId);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      }).catch(() => false);
    }
  }

  const repository = new Repository();

  const Time = Object.freeze({
    utc(value = Date.now()) {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    },
    wita(value = Date.now(), options = {}) {
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return "Waktu tidak valid";
      return new Intl.DateTimeFormat("id-ID", {
        timeZone: CONFIG.timezone,
        dateStyle: options.dateStyle || "medium",
        timeStyle: options.timeStyle || "short",
        hour12: false
      }).format(date) + " WITA";
    },
    dayKey(value = Date.now()) {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: CONFIG.timezone, year: "numeric", month: "2-digit", day: "2-digit"
      }).format(new Date(value));
    }
  });

  const Freshness = Object.freeze({
    policy(key) { return TTL[key] || TTL.quote; },
    assess(capturedAt, key = "quote") {
      const timestamp = new Date(capturedAt || 0).getTime();
      const ageMs = Number.isFinite(timestamp) ? Math.max(0, Date.now() - timestamp) : Number.MAX_SAFE_INTEGER;
      const policy = TTL[key] || TTL.quote;
      const state = ageMs > policy.hard ? "expired" : ageMs > policy.soft ? "stale" : "fresh";
      return { state, ageMs, capturedAt: timestamp ? new Date(timestamp).toISOString() : null, policyKey: key, ...policy };
    }
  });

  const Schema = Object.freeze({
    catalog: Object.freeze({
      MarketSnapshot: { version: 1, required: ["id", "pair", "timeframe", "captured_at", "freshness", "quality"] },
      Decision: { version: 1, required: ["id", "snapshot_id", "facts", "hypothesis", "setup", "conflicts"] },
      SetupEvent: { version: 1, required: ["id", "setup_id", "state", "reason", "occurred_at"] },
      LiquiditySnapshot: { version: 1, required: ["id", "snapshot_id", "levels", "engine_version"] },
      JournalEntry: { version: 2, required: ["id", "plan", "execution", "outcome", "audit"] },
      ContextEnvelope: { version: 1, required: ["id", "source_module", "captured_at", "privacy_scope", "payload"] },
      Conversation: { version: 1, required: ["id", "title", "created_at", "updated_at"] },
      MigrationLedger: { version: 1, required: ["id", "state", "source_fingerprint", "updated_at"] }
    }),
    validate(name, payload) {
      const contract = this.catalog[name];
      if (!contract) return { valid: false, errors: [`Unknown schema ${name}`] };
      const errors = contract.required.filter(field => payload?.[field] === undefined || payload?.[field] === null)
        .map(field => `Missing ${field}`);
      return { valid: errors.length === 0, errors, version: contract.version };
    }
  });

  const flags = {
    ...FEATURE_DEFAULTS,
    ...readJsonStorage(CONFIG.flagsKey, {})
  };

  function setFlag(name, enabled) {
    if (!(name in FEATURE_DEFAULTS)) return false;
    flags[name] = Boolean(enabled);
    writeJsonStorage(CONFIG.flagsKey, flags);
    window.dispatchEvent(new CustomEvent("amyfx:flag-change", { detail: { name, enabled: flags[name] } }));
    return true;
  }

  function resolvePair() {
    return text(window.AmyFXMarketState?.pair || window.lastMappingResult?.symbol || document.body?.dataset?.pair || "XAU/USD");
  }

  function resolveTimeframe() {
    const raw = text(window.AmyFXMarketState?.timeframe || window.lastMappingResult?.timeframe || document.body?.dataset?.timeframe || "M15").toUpperCase();
    return TTL[raw] ? raw : "M15";
  }

  function resolveCapturedAt() {
    const values = [
      window.AmyFXMarketState?.capturedAt,
      window.AmyFXMarketState?.updatedAt,
      window.lastMappingResult?.capturedAt,
      window.lastMappingResult?.timestamp,
      window.AmyFXHeatmapState?.updatedAt,
      window.AmyFXIntelState?.updatedAt,
      window.AmyFXIntel?.read?.()?.mapping?.updated,
      window.AmyFXIntel?.read?.()?.heatmap?.updated,
      window.AmyFXIntel?.read?.()?.liquidity?.updated,
      window.AmyFXIntel?.read?.()?.news?.updated
    ];
    for (const value of values) {
      const date = new Date(value);
      if (value && !Number.isNaN(date.getTime())) return date.toISOString();
    }
    return null;
  }

  function visibleText(selector, limit = 900) {
    const value = document.querySelector(selector)?.innerText || "";
    return text(value).replace(/\s+/g, " ").slice(0, limit);
  }

  function journalRows() {
    const bridge = window.AmyFXJournalState;
    if (typeof bridge?.getJournals === "function") {
      const rows = bridge.getJournals();
      if (Array.isArray(rows)) return clone(rows);
    }
    if (Array.isArray(bridge?.journals)) return clone(bridge.journals);
    const value = readJsonStorage(CONFIG.legacyJournalKey, []);
    return Array.isArray(value) ? value : [];
  }

  function journalSummary() {
    const rows = journalRows();
    const win = rows.filter(row => text(row.result).toLowerCase() === "win").length;
    const loss = rows.filter(row => text(row.result).toLowerCase() === "loss").length;
    const be = rows.filter(row => ["be", "break even", "breakeven"].includes(text(row.result).toLowerCase())).length;
    const total = rows.length;
    return { total, win, loss, be, winRate: total ? Math.round((win / total) * 1000) / 10 : null };
  }

  function mappingPayload() {
    const globalState = window.AmyFXMarketState || window.lastMappingResult || {};
    const setup = globalState.bestSetup || globalState.setup || window.AmyFXEntryWatchState?.activeSetup || null;
    const state = SETUP_STATES.includes(text(setup?.state).toUpperCase())
      ? text(setup.state).toUpperCase()
      : visibleText("[data-setup-state], .setup-state, .status-badge", 40).toUpperCase() || "WAIT";
    return {
      pair: resolvePair(),
      timeframe: resolveTimeframe(),
      facts: clone(globalState.facts || {}),
      hypothesis: clone(globalState.hypothesis || null),
      setup: setup ? clone(setup) : { state },
      evidence: clone(globalState.evidence || []),
      conflicts: clone(globalState.conflicts || []),
      visible_summary: visibleText("main, #app, .mapping-container", 1000)
    };
  }

  function intelPayload() {
    const shared = window.AmyFXIntel?.read?.() || window.AmyFXIntelState || {};
    const heatmap = window.AmyFXHeatmapState || shared.heatmap || null;
    const news = shared.news || null;
    return {
      pair: resolvePair(),
      scheduled_event: clone(window.AmyFXIntel?.scheduledEvent || null),
      published_news: clone(window.AmyFXIntel?.selectedNews || news?.items?.[0] || null),
      news_items: clone(news?.items || []),
      heatmap: clone(heatmap),
      liquidity: clone(shared.liquidity || null),
      source_method: heatmap?.sourceMethod || heatmap?.source || "OHLC-derived/modelled liquidity",
      visible_summary: visibleText("main, #app, .intel-container", 1000)
    };
  }

  function academyPayload() {
    return {
      lesson_id: document.body?.dataset?.lessonId || location.pathname.split("/").pop()?.replace(/\.html$/i, "") || "academy",
      section_id: location.hash.replace(/^#/, "") || null,
      content_version: document.body?.dataset?.contentVersion || "legacy",
      title: visibleText("h1, .lesson-title", 180) || document.title,
      passage: visibleText("article, main, .lesson-content", 1200)
    };
  }

  function journalPayload() {
    const bridge = window.AmyFXJournalState || {};
    const selectedId = bridge.selectedJournalId || null;
    const selected = bridge.selectedJournal
      || journalRows().find(row => String(row?.id || "") === String(selectedId || ""))
      || null;
    return {
      summary: journalSummary(),
      selected_entry_id: selectedId,
      selected_entry: clone(selected),
      visible_summary: visibleText("main, #app, .journal-shell", 1000)
    };
  }

  async function buildContext(sourceModule = moduleName) {
    const capturedAt = resolveCapturedAt() || (["journal", "academy"].includes(sourceModule) ? nowIso() : null);
    const timeframe = resolveTimeframe();
    const freshnessKey = TTL[timeframe] ? timeframe : sourceModule === "intel" ? "news" : sourceModule === "journal" ? "journal" : sourceModule === "academy" ? "academy" : "quote";
    const payload = sourceModule === "mapping" ? mappingPayload()
      : sourceModule === "intel" ? intelPayload()
      : sourceModule === "journal" ? journalPayload()
      : sourceModule === "academy" ? academyPayload()
      : { journal: journalSummary(), route: location.pathname, title: document.title };
    const envelope = {
      id: id("ctx"),
      schema: "ContextEnvelope",
      schema_version: 1,
      source_module: sourceModule,
      captured_at: capturedAt,
      display_time: capturedAt ? Time.wita(capturedAt) : "Belum ada data",
      privacy_scope: sourceModule === "journal" ? "selected_or_aggregate_only" : "module_visible_state",
      freshness: Freshness.assess(capturedAt, freshnessKey),
      source_refs: [{ module: sourceModule, url: location.pathname, captured_at: capturedAt }],
      payload,
      errors: []
    };
    const validation = Schema.validate("ContextEnvelope", envelope);
    if (!validation.valid) envelope.errors.push(...validation.errors);
    await repository.put("contexts", envelope);
    return envelope;
  }

  class NotificationLedger {
    constructor() {
      this.rows = readJsonStorage(CONFIG.notificationKey, {});
    }
    shouldSend(event) {
      const eventId = text(event?.id);
      if (!eventId) return false;
      const now = Date.now();
      const expiry = new Date(event.expires_at || now + 86_400_000).getTime();
      if (expiry <= now) return false;
      const previous = this.rows[eventId];
      if (previous && previous.expires_at > now) return false;
      this.rows[eventId] = { sent_at: now, expires_at: expiry };
      Object.keys(this.rows).forEach(key => {
        if (this.rows[key].expires_at <= now) delete this.rows[key];
      });
      writeJsonStorage(CONFIG.notificationKey, this.rows);
      repository.put("notifications", { id: eventId, ...event, sent_at: nowIso() });
      return true;
    }
    notify(event) {
      if (!this.shouldSend(event)) return false;
      const title = text(event.title) || "Amy FX";
      const message = text(event.message);
      try {
        if (window.Android?.showNotificationWithUrl) {
          window.Android.showNotificationWithUrl(title, message, event.url || "");
        } else if (window.Android?.showNotification) {
          window.Android.showNotification(title, message);
        } else {
          window.dispatchEvent(new CustomEvent("amyfx:notice", { detail: { title, message } }));
        }
      } catch {
        window.dispatchEvent(new CustomEvent("amyfx:notice", { detail: { title, message } }));
      }
      return true;
    }
  }

  const notificationLedger = new NotificationLedger();

  const NativeVault = Object.freeze({
    available() {
      return Boolean(window.AmyNativeAI?.storeSecret && window.AmyNativeAI?.send);
    },
    store(ref, secret) {
      if (!this.available()) return false;
      try {
        return Boolean(window.AmyNativeAI.storeSecret(ref.id, ref.provider, ref.alias, secret));
      } catch { return false; }
    },
    list() {
      if (!this.available()) return [];
      try {
        const rows = safeParse(window.AmyNativeAI.listSecrets(), []);
        return Array.isArray(rows) ? rows : [];
      } catch { return []; }
    },
    remove(secretId) {
      if (!this.available()) return false;
      try { return Boolean(window.AmyNativeAI.deleteSecret(secretId)); } catch { return false; }
    }
  });

  function providerDefaultModel(provider) {
    return ({
      gemini: "gemini-2.0-flash",
      openrouter: "google/gemini-2.0-flash-001",
      deepseek: "deepseek-chat"
    })[provider] || "";
  }

  function parseLegacyPool(raw, fallbackProvider = "gemini", fallbackModel = "") {
    const rows = String(raw || "").split(/\r?\n/);
    const seen = new Set();
    return rows.map((line, index) => {
      const value = text(line);
      if (!value || value.startsWith("#")) return null;
      let provider = fallbackProvider;
      let key = value;
      let model = fallbackModel || providerDefaultModel(provider);
      if (value.includes("|")) {
        const parts = value.split("|").map(text);
        provider = parts[0].toLowerCase();
        key = parts[1] || "";
        model = parts.slice(2).join("|") || providerDefaultModel(provider);
      } else {
        const match = value.match(/^(gemini|openrouter|deepseek|google|open_router)\s*:(.+)$/i);
        if (match) {
          provider = match[1].toLowerCase().replace("google", "gemini").replace("open_router", "openrouter");
          key = text(match[2]);
          model = providerDefaultModel(provider);
        }
      }
      key = key.replace(/^Bearer\s+/i, "");
      if (!key) return null;
      const fingerprint = `${provider}:${key.slice(-8)}:${index}`;
      let hash = 2166136261;
      for (const char of fingerprint) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
      const ref = {
        id: `key-${provider}-${(hash >>> 0).toString(16)}`,
        alias: `${provider.toUpperCase()} ${index + 1}`,
        provider,
        model,
        masked_tail: key.slice(-4),
        priority: index,
        status: "ready"
      };
      if (seen.has(`${provider}:${key}`)) return null;
      seen.add(`${provider}:${key}`);
      return { ref, key };
    }).filter(Boolean);
  }

  function globalSettings() {
    return readJsonStorage(CONFIG.globalSettingsKey, {
      schema_version: 1,
      key_refs: [],
      provider_priority: ["gemini", "openrouter", "deepseek"],
      paid_fallback: false,
      retention_days: 90,
      proactive: { market_risk: true, setup_lifecycle: true, discipline: true, learning: true, system_health: true },
      migration_state: "not_started"
    });
  }

  function saveGlobalSettings(settings) {
    const clean = {
      ...settings,
      schema_version: 1,
      key_refs: Array.isArray(settings.key_refs) ? settings.key_refs.map(ref => ({
        id: text(ref.id),
        alias: text(ref.alias),
        provider: text(ref.provider),
        model: text(ref.model) || providerDefaultModel(ref.provider),
        masked_tail: text(ref.masked_tail).slice(-4),
        priority: Number(ref.priority) || 0,
        status: text(ref.status) || "ready"
      })) : []
    };
    writeJsonStorage(CONFIG.globalSettingsKey, clean);
    repository.put("settings", { id: "global-ai", ...clean, updated_at: nowIso() });
    return clean;
  }

  async function migrateLegacy() {
    const previous = readJsonStorage(CONFIG.migrationKey, null);
    if (previous?.state === "success") return previous;
    const legacy = readJsonStorage(CONFIG.legacyAssistantSettingsKey, {});
    const settings = globalSettings();
    const provider = text(legacy.provider || "gemini").toLowerCase();
    const model = text(legacy.model || providerDefaultModel(provider));
    const rawPool = [legacy.apiPoolText, legacy.apiKey ? `${provider}:${legacy.apiKey}` : ""].filter(Boolean).join("\n");
    const candidates = parseLegacyPool(rawPool, provider, model);
    const ledger = {
      id: "legacy-to-blueprint-v1",
      schema_version: 1,
      state: "running",
      source_fingerprint: `${CONFIG.legacyAssistantSettingsKey}:${candidates.length}:${journalRows().length}`,
      started_at: previous?.started_at || nowIso(),
      updated_at: nowIso(),
      checkpoint: "detected",
      evidence: { legacy_key_count: candidates.length, journal_count: journalRows().length },
      cleanup: "pending"
    };
    writeJsonStorage(CONFIG.migrationKey, ledger);
    await repository.put("migrations", ledger);

    if (candidates.length && !NativeVault.available()) {
      ledger.state = "needs_attention";
      ledger.checkpoint = "secure_vault_unavailable";
      ledger.updated_at = nowIso();
      writeJsonStorage(CONFIG.migrationKey, ledger);
      await repository.put("migrations", ledger);
      return ledger;
    }

    const refs = [...settings.key_refs];
    for (const candidate of candidates) {
      if (!NativeVault.store(candidate.ref, candidate.key)) {
        ledger.state = "needs_attention";
        ledger.checkpoint = `vault_write_failed:${candidate.ref.id}`;
        ledger.updated_at = nowIso();
        writeJsonStorage(CONFIG.migrationKey, ledger);
        await repository.put("migrations", ledger);
        return ledger;
      }
      if (!refs.some(row => row.id === candidate.ref.id)) refs.push(candidate.ref);
    }

    const migratedSettings = saveGlobalSettings({
      ...settings,
      key_refs: refs,
      paid_fallback: Boolean(legacy.paidFallback ?? settings.paid_fallback),
      migration_state: "success"
    });

    if (candidates.length) {
      writeJsonStorage(CONFIG.legacyAssistantSettingsKey, {
        ...legacy,
        apiPoolText: "",
        apiKey: "",
        migratedToGlobalVault: true,
        migratedAt: nowIso(),
        keyRefCount: migratedSettings.key_refs.length
      });
    }

    const journals = journalRows();
    for (const row of journals) {
      const journal = {
        id: text(row.id) || id("journal"),
        schema: "JournalEntry",
        schema_version: 2,
        plan: clone(row.plan || row.tradePlan || {}),
        execution: clone(row.execution || {}),
        outcome: {
          result: row.result || null,
          profit: row.profit || null,
          loss: row.loss || null,
          notes: row.notes || row.content || ""
        },
        behavior: clone(row.behavior || {}),
        review: clone(row.review || {}),
        context_refs: clone(row.context_refs || {}),
        audit: { migrated_at: nowIso(), source: CONFIG.legacyJournalKey },
        legacy_payload: clone(row)
      };
      await repository.put("journal", journal);
    }

    ledger.state = "success";
    ledger.checkpoint = "committed";
    ledger.updated_at = nowIso();
    ledger.evidence.target_key_count = migratedSettings.key_refs.length;
    ledger.evidence.target_journal_count = journals.length;
    writeJsonStorage(CONFIG.migrationKey, ledger);
    await repository.put("migrations", ledger);
    return ledger;
  }

  const pendingNative = new Map();

  function nativeAiResult(payloadText) {
    const payload = safeParse(payloadText, null);
    if (!payload?.requestId) return;
    const pending = pendingNative.get(payload.requestId);
    if (!pending) return;
    pendingNative.delete(payload.requestId);
    clearTimeout(pending.timer);
    if (payload.ok) pending.resolve(payload);
    else pending.reject(Object.assign(new Error(payload.message || "Provider gagal"), { category: payload.category || "provider_error" }));
  }

  async function callProvider(prompt, context, options = {}) {
    const settings = globalSettings();
    const refs = [...settings.key_refs]
      .filter(ref => ref.status !== "disabled" && (settings.paid_fallback || ref.provider !== "deepseek"))
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));
    if (!NativeVault.available() || !refs.length) {
      throw Object.assign(new Error("Tambahkan API key pada Pengaturan Amy global."), { category: "no_key" });
    }
    const system = [
      "Kamu adalah Amy AI Mentor di Amy FX.",
      "Gunakan hanya Context Envelope yang diberikan sebagai fakta.",
      "Pisahkan fakta pasar, hipotesis arah, dan setup eksekusi.",
      "Jangan membuat sinyal BUY/SELL baru dari berita atau data yang stale.",
      "Jika evidence tidak cukup, nyatakan WAIT.",
      "Sebutkan sumber modul, pair/timeframe bila tersedia, timestamp WITA, dan keterbatasan.",
      "Jawab dalam bahasa Indonesia secara ringkas dan praktis."
    ].join("\n");
    const requestPrompt = `${system}\n\nContext Envelope:\n${JSON.stringify(context)}\n\nPertanyaan pengguna:\n${prompt}`;
    const failures = [];
    for (const ref of refs) {
      const requestId = id("ai");
      try {
        const result = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pendingNative.delete(requestId);
            try { window.AmyNativeAI.cancel(requestId); } catch {}
            reject(Object.assign(new Error("Provider timeout"), { category: "timeout" }));
          }, options.timeout || 35_000);
          pendingNative.set(requestId, { resolve, reject, timer });
          window.AmyNativeAI.send(requestId, ref.id, ref.provider, ref.model || providerDefaultModel(ref.provider), requestPrompt, Boolean(options.json));
        });
        await repository.put("usage", {
          id: id("usage"),
          thread_id: options.threadId || null,
          source_module: context.source_module,
          provider: ref.provider,
          model: ref.model,
          outcome: "success",
          latency_ms: result.latencyMs || null,
          created_at: nowIso()
        });
        return { text: result.text, provider: ref.provider, model: ref.model, source: `Dari ${context.source_module}`, context };
      } catch (error) {
        failures.push({ provider: ref.provider, category: error.category || "provider_error" });
        await repository.put("usage", {
          id: id("usage"),
          thread_id: options.threadId || null,
          source_module: context.source_module,
          provider: ref.provider,
          model: ref.model,
          outcome: error.category || "error",
          created_at: nowIso()
        });
      }
    }
    throw Object.assign(new Error("Semua provider tidak tersedia."), { category: "all_provider_failed", failures });
  }

  function deterministicAnswer(question, context) {
    const source = context.source_module === "mapping" ? "Mapping"
      : context.source_module === "intel" ? "Market Intel"
      : context.source_module === "journal" ? "Jurnal"
      : context.source_module === "academy" ? "Academy" : "Amy FX";
    const freshness = context.freshness?.state || "unknown";
    const payload = context.payload || {};
    const lines = [`Sumber: ${source} • ${context.display_time}.`];
    if (freshness !== "fresh" && !["journal", "academy"].includes(context.source_module)) {
      lines.push(`Status data ${freshness}; saya tidak akan menganggapnya sebagai kondisi live.`);
    }
    if (context.source_module === "mapping") {
      const setupState = payload.setup?.state || "WAIT";
      lines.push(`State setup: ${setupState}.`);
      if (setupState === "WAIT") lines.push("WAIT adalah keputusan valid sampai evidence dan trigger memenuhi kontrak.");
      if (payload.conflicts?.length) lines.push(`Konflik terdeteksi: ${payload.conflicts.length}.`);
      lines.push("Periksa invalidasi, expiry, dan bukti yang bertentangan sebelum membuat rencana.");
    } else if (context.source_module === "journal") {
      const summary = payload.summary || {};
      lines.push(summary.winRate == null
        ? `Data terpilih: ${summary.total || 0} jurnal, win rate belum cukup sampel.`
        : `Data terpilih: ${summary.total || 0} jurnal, win rate ${summary.winRate}%.`);
      lines.push("Pisahkan rencana awal, eksekusi aktual, outcome, dan satu tindakan perbaikan.");
    } else if (context.source_module === "intel") {
      lines.push("Berita dipakai sebagai risiko dan konteks, bukan sumber arah otomatis.");
      lines.push(`Metode liquidity: ${payload.source_method || "tidak tersedia"}.`);
    } else if (context.source_module === "academy") {
      lines.push(`Materi aktif: ${payload.title || "Academy"}.`);
      lines.push("Gunakan konsep ini pada satu contoh chart, lalu uji pemahaman sebelum entry.");
    } else {
      lines.push("Buka Mapping, Intel, Jurnal, atau Academy agar Amy menerima Context Envelope yang lebih spesifik.");
    }
    if (text(question)) lines.push(`Pertanyaan: ${text(question).slice(0, 180)}`);
    return { text: lines.join("\n"), provider: "deterministic", model: "amy-rules-v1", source: `Dari ${source}`, context };
  }

  async function ask(question, options = {}) {
    const context = options.context || await buildContext(options.sourceModule || moduleName);
    try {
      return await callProvider(question, context, options);
    } catch (error) {
      const fallback = deterministicAnswer(question, context);
      fallback.warning = error.message;
      fallback.category = error.category;
      return fallback;
    }
  }

  let mentor = null;

  function mentorMarkup() {
    return `
      <button type="button" class="amy-os-fab" aria-label="Buka Amy AI Mentor">
        <span>AMY</span><small>Mentor</small>
      </button>
      <section class="amy-os-panel" hidden aria-label="Amy AI Mentor">
        <header class="amy-os-panel__header">
          <div><strong>Amy AI Mentor</strong><small>Context-aware • local-first</small></div>
          <div class="amy-os-panel__actions">
            <button type="button" data-amy-settings aria-label="Pengaturan AI">⚙</button>
            <button type="button" data-amy-close aria-label="Tutup Amy">×</button>
          </div>
        </header>
        <div class="amy-os-health" data-amy-health>Menyiapkan Context Envelope...</div>
        <div class="amy-os-contexts" data-amy-contexts></div>
        <div class="amy-os-starters" data-amy-starters></div>
        <div class="amy-os-messages" data-amy-messages aria-live="polite"></div>
        <div class="amy-os-settings" data-amy-settings-panel hidden>
          <strong>Global AI Settings</strong>
          <p data-amy-vault-status></p>
          <label>Tambahkan key ke secure vault
            <textarea data-amy-key-pool rows="5" placeholder="gemini:API_KEY&#10;openrouter:API_KEY&#10;deepseek:API_KEY"></textarea>
          </label>
          <label class="amy-os-switch"><input type="checkbox" data-amy-paid-fallback> Izinkan DeepSeek sebagai fallback berbayar</label>
          <div data-amy-key-list></div>
          <button type="button" data-amy-save-keys>Simpan ke vault</button>
        </div>
        <footer class="amy-os-composer">
          <textarea rows="2" data-amy-input placeholder="Tanya berdasarkan konteks halaman ini"></textarea>
          <button type="button" data-amy-send>Kirim</button>
        </footer>
      </section>`;
  }

  function startersFor(source) {
    return ({
      mapping: ["Jelaskan fakta market saat ini", "Apa invalidasinya?", "Kenapa hasilnya WAIT?"],
      intel: ["Ringkas risiko berita", "Jelaskan liquidity tanpa memberi sinyal", "Apa yang perlu dipantau?"],
      journal: ["Review disiplin entry ini", "Temukan pola kesalahan", "Buat satu tindakan berikutnya"],
      academy: ["Jelaskan materi ini sederhana", "Beri satu contoh chart", "Uji pemahaman saya"],
      home: ["Ringkas status semua modul", "Apa yang perlu saya kerjakan sekarang?", "Buka review jurnal"]
    })[source] || [];
  }

  function addMessage(role, body, meta = "") {
    const messages = mentor?.querySelector("[data-amy-messages]");
    if (!messages) return;
    const row = document.createElement("div");
    row.className = `amy-os-message amy-os-message--${role}`;
    row.innerHTML = `<div>${escapeHtml(body)}</div>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}`;
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  async function refreshMentorContext() {
    if (!mentor) return null;
    const context = await buildContext(moduleName);
    mentor.dataset.contextId = context.id;
    const health = mentor.querySelector("[data-amy-health]");
    const status = context.freshness?.state || "unknown";
    health.textContent = `${context.source_module.toUpperCase()} • ${context.display_time} • ${status.toUpperCase()}`;
    const contexts = mentor.querySelector("[data-amy-contexts]");
    contexts.innerHTML = `<span class="amy-os-chip ${status === "fresh" ? "" : `is-${status}`}">${escapeHtml(context.source_module)}</span><span class="amy-os-chip">${escapeHtml(resolvePair())}</span><span class="amy-os-chip">${escapeHtml(resolveTimeframe())}</span>`;
    return context;
  }

  function refreshSettingsUi() {
    if (!mentor) return;
    const settings = globalSettings();
    const nativeRows = NativeVault.list();
    mentor.querySelector("[data-amy-vault-status]").textContent = NativeVault.available()
      ? `${nativeRows.length} secret tersimpan di secure native vault.`
      : "Secure native vault belum tersedia pada build ini.";
    mentor.querySelector("[data-amy-paid-fallback]").checked = Boolean(settings.paid_fallback);
    const list = mentor.querySelector("[data-amy-key-list]");
    list.innerHTML = settings.key_refs.length ? settings.key_refs.map(ref => `
      <div class="amy-os-key-row"><span>${escapeHtml(ref.alias)} • ${escapeHtml(ref.provider)} ••••${escapeHtml(ref.masked_tail)}</span><button type="button" data-remove-key="${escapeHtml(ref.id)}">Hapus</button></div>`).join("") : "<small>Belum ada key.</small>";
  }

  async function submitMentor() {
    const input = mentor?.querySelector("[data-amy-input]");
    const send = mentor?.querySelector("[data-amy-send]");
    const question = text(input?.value);
    if (!question || !send) return;
    input.value = "";
    send.disabled = true;
    addMessage("user", question);
    const context = await buildContext(moduleName);
    const result = await ask(question, { context });
    addMessage("amy", result.text, `${result.source} • ${result.provider}${result.warning ? ` • ${result.warning}` : ""}`);
    send.disabled = false;
  }

  function bindMentor() {
    const fab = mentor.querySelector(".amy-os-fab");
    const panel = mentor.querySelector(".amy-os-panel");
    fab.addEventListener("click", async () => {
      panel.hidden = false;
      fab.hidden = true;
      await refreshMentorContext();
    });
    mentor.querySelector("[data-amy-close]").addEventListener("click", () => {
      panel.hidden = true;
      fab.hidden = false;
    });
    mentor.querySelector("[data-amy-settings]").addEventListener("click", () => {
      const settingsPanel = mentor.querySelector("[data-amy-settings-panel]");
      settingsPanel.hidden = !settingsPanel.hidden;
      refreshSettingsUi();
    });
    mentor.querySelector("[data-amy-send]").addEventListener("click", submitMentor);
    mentor.querySelector("[data-amy-input]").addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submitMentor(); }
    });
    mentor.querySelector("[data-amy-starters]").addEventListener("click", event => {
      const button = event.target.closest("[data-starter]");
      if (!button) return;
      mentor.querySelector("[data-amy-input]").value = button.dataset.starter;
      submitMentor();
    });
    mentor.querySelector("[data-amy-save-keys]").addEventListener("click", () => {
      if (!NativeVault.available()) {
        addMessage("amy", "Secure native vault belum tersedia. Pembaruan aplikasi diperlukan.");
        return;
      }
      const settings = globalSettings();
      const raw = mentor.querySelector("[data-amy-key-pool]").value;
      const candidates = parseLegacyPool(raw);
      const refs = [...settings.key_refs];
      for (const candidate of candidates) {
        if (NativeVault.store(candidate.ref, candidate.key)) {
          const existing = refs.findIndex(ref => ref.id === candidate.ref.id);
          if (existing >= 0) refs[existing] = candidate.ref; else refs.push(candidate.ref);
        }
      }
      saveGlobalSettings({
        ...settings,
        key_refs: refs,
        paid_fallback: mentor.querySelector("[data-amy-paid-fallback]").checked
      });
      mentor.querySelector("[data-amy-key-pool]").value = "";
      refreshSettingsUi();
      addMessage("amy", `${candidates.length} key diproses ke secure vault.`);
    });
    mentor.querySelector("[data-amy-key-list]").addEventListener("click", event => {
      const button = event.target.closest("[data-remove-key]");
      if (!button) return;
      NativeVault.remove(button.dataset.removeKey);
      const settings = globalSettings();
      saveGlobalSettings({ ...settings, key_refs: settings.key_refs.filter(ref => ref.id !== button.dataset.removeKey) });
      refreshSettingsUi();
    });
    window.addEventListener("amyfx:open-mentor", async () => {
      panel.hidden = false;
      fab.hidden = true;
      await refreshMentorContext();
    });
  }

  function mountMentor() {
    if (!flags.global_mentor || mentor || !document.body) return;
    mentor = document.createElement("div");
    mentor.className = "amy-os-root";
    mentor.dataset.amyModule = moduleName;
    mentor.innerHTML = mentorMarkup();
    document.body.appendChild(mentor);
    mentor.querySelector("[data-amy-starters]").innerHTML = startersFor(moduleName)
      .map(value => `<button type="button" class="amy-os-starter" data-starter="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join("");
    bindMentor();
  }

  async function commandMetrics() {
    const context = await buildContext("home");
    const migration = readJsonStorage(CONFIG.migrationKey, { state: "not_started" });
    const settings = globalSettings();
    const summary = journalSummary();
    return {
      captured: Time.wita(context.captured_at),
      freshness: context.freshness?.state || "unknown",
      journal: `${summary.total} trade • ${summary.winRate ?? "–"}% WR`,
      mentor: settings.key_refs.length ? `${settings.key_refs.length} key siap` : "Mode deterministik",
      migration: migration.state,
      next: summary.total ? "Review satu deviation jurnal" : "Buat rencana trading pertama"
    };
  }

  async function ensureCommandCenter() {
    if (moduleName !== "home" || !flags.command_center) return;
    const main = document.getElementById("main-content");
    if (!main || main.querySelector("[data-amy-command-center]")) return;
    const section = document.createElement("section");
    section.className = "amy-os-command-center";
    section.dataset.amyCommandCenter = "1";
    section.innerHTML = `
      <header><div><small>AMY FX OPERATING SYSTEM</small><strong>Command Center</strong></div><span data-cc-time>Memuat…</span></header>
      <div class="amy-os-command-grid">
        <div class="amy-os-command-item" data-state="unknown"><small>Market freshness</small><strong data-cc-freshness>–</strong></div>
        <div class="amy-os-command-item"><small>Journal loop</small><strong data-cc-journal>–</strong></div>
        <div class="amy-os-command-item"><small>Amy Mentor</small><strong data-cc-mentor>–</strong></div>
        <div class="amy-os-command-item"><small>Migration</small><strong data-cc-migration>–</strong></div>
      </div>
      <div class="amy-os-command-actions"><button type="button" data-cc-amy>Buka Amy</button><button type="button" data-cc-next>Langkah berikutnya</button></div>`;
    main.insertAdjacentElement("afterbegin", section);
    const metrics = await commandMetrics();
    section.querySelector("[data-cc-time]").textContent = metrics.captured;
    const freshness = section.querySelector("[data-cc-freshness]");
    freshness.textContent = metrics.freshness.toUpperCase();
    freshness.closest("[data-state]").dataset.state = metrics.freshness;
    section.querySelector("[data-cc-journal]").textContent = metrics.journal;
    section.querySelector("[data-cc-mentor]").textContent = metrics.mentor;
    section.querySelector("[data-cc-migration]").textContent = metrics.migration;
    section.querySelector("[data-cc-amy]").addEventListener("click", () => window.dispatchEvent(new CustomEvent("amyfx:open-mentor")));
    section.querySelector("[data-cc-next]").addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("amyfx:open-mentor"));
      setTimeout(() => {
        const input = mentor?.querySelector("[data-amy-input]");
        if (input) input.value = `Bantu saya menjalankan langkah berikutnya: ${metrics.next}`;
      }, 0);
    });
  }

  async function ensureModuleStatus() {
    if (moduleName === "home" || !flags.new_shell || document.querySelector("[data-amy-module-status]")) return;
    const context = await buildContext(moduleName);
    const bar = document.createElement("div");
    bar.className = "amy-os-module-status";
    bar.dataset.amyModuleStatus = "1";
    bar.dataset.freshness = context.freshness?.state || "unknown";
    bar.textContent = `${moduleName.toUpperCase()} • ${context.display_time} • ${(context.freshness?.state || "unknown").toUpperCase()}`;
    document.body.appendChild(bar);
  }

  function ensureJournalTimeline() {
    if (moduleName !== "journal" || !flags.journal_schema_v2 || document.querySelector("[data-amy-journal-v2]")) return;
    const target = document.querySelector("#journalView, [data-journal-view]");
    if (!target) return;
    const draft = readJsonStorage("amyfx.os.journalDraft.v2", { plan: "", execution: "", outcome: "", next_action: "" });
    const card = document.createElement("section");
    card.className = "amy-os-journal-v2";
    card.dataset.amyJournalV2 = "1";
    card.innerHTML = `
      <header><div><small>JOURNAL ENTRY V2</small><strong>Plan → Execution → Outcome</strong></div><span>local-first</span></header>
      <label>Rencana asli<textarea data-jv2="plan" rows="2">${escapeHtml(draft.plan)}</textarea></label>
      <label>Eksekusi aktual<textarea data-jv2="execution" rows="2">${escapeHtml(draft.execution)}</textarea></label>
      <label>Outcome & deviation<textarea data-jv2="outcome" rows="2">${escapeHtml(draft.outcome)}</textarea></label>
      <label>Satu tindakan berikutnya<textarea data-jv2="next_action" rows="2">${escapeHtml(draft.next_action)}</textarea></label>
      <button type="button" data-jv2-save>Simpan draft review</button>`;
    target.insertAdjacentElement("afterbegin", card);
    card.querySelector("[data-jv2-save]").addEventListener("click", async () => {
      const value = {};
      card.querySelectorAll("[data-jv2]").forEach(input => { value[input.dataset.jv2] = input.value; });
      value.updated_at = nowIso();
      writeJsonStorage("amyfx.os.journalDraft.v2", value);
      await repository.put("journal", {
        id: "journal-review-draft",
        schema: "JournalEntry",
        schema_version: 2,
        plan: { notes: value.plan },
        execution: { notes: value.execution },
        outcome: { notes: value.outcome },
        review: { next_action: value.next_action },
        audit: { updated_at: value.updated_at, source: "preview-blueprint-runtime" }
      });
      notificationLedger.notify({
        id: `journal-review-${Time.dayKey()}`,
        title: "Review Jurnal Tersimpan",
        message: "Plan, execution, outcome, dan tindakan berikutnya sudah disimpan.",
        expires_at: new Date(Date.now() + 86_400_000).toISOString()
      });
    });
  }

  function ensureProfileSettings() {
    if (moduleName !== "home") return;
    const main = document.getElementById("main-content");
    const list = main?.querySelector(".profile-list");
    if (!list || list.querySelector("[data-profile-action='global-ai']")) return;
    const settings = globalSettings();
    const row = document.createElement("button");
    row.type = "button";
    row.className = "profile-row";
    row.dataset.profileAction = "global-ai";
    row.innerHTML = `<span class="tool-icon">AMY</span><span><strong>Global AI Settings</strong><small>${settings.key_refs.length} key • ${NativeVault.available() ? "Secure vault aktif" : "Vault perlu update"}</small></span><span class="chevron">›</span>`;
    row.addEventListener("click", () => window.dispatchEvent(new CustomEvent("amyfx:open-mentor")));
    list.insertAdjacentElement("afterbegin", row);
  }

  let domScheduled = false;
  function syncUi() {
    if (domScheduled) return;
    domScheduled = true;
    nextFrame(() => {
      domScheduled = false;
      ensureCommandCenter();
      ensureModuleStatus();
      ensureJournalTimeline();
      ensureProfileSettings();
    });
  }

  async function boot() {
    await repository.open();
    mountMentor();
    const migration = await migrateLegacy();
    syncUi();
    const observerTarget = moduleName === "home" ? document.getElementById("main-content") : document.body;
    if (observerTarget) {
      new MutationObserver(syncUi).observe(observerTarget, { childList: true, subtree: true });
    }
    ["amyfx:journal-state-change", "amyfx:mapping-state-change", "amyfx:market-update", "amyfx:home-stats-change"]
      .forEach(name => window.addEventListener(name, () => refreshMentorContext()));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshMentorContext();
    });
    setInterval(() => {
      if (!document.hidden) refreshMentorContext();
    }, 30_000);
    if (migration.state === "success") {
      notificationLedger.notify({
        id: "amyfx-blueprint-migration-v1-success",
        title: "Pembaruan Amy FX",
        message: "Global Amy Mentor dan Journal v2 siap. Data lama tetap dipertahankan.",
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString()
      });
    }
  }

  const AmyFXOS = Object.freeze({
    config: CONFIG,
    flags,
    schemas: Schema.catalog,
    setupStates: SETUP_STATES,
    Time,
    Freshness,
    repository,
    notificationLedger,
    buildContext,
    ask,
    migrateLegacy,
    setFlag,
    getGlobalSettings: globalSettings,
    saveGlobalSettings,
    __nativeAiResult: nativeAiResult,
    openMentor() { window.dispatchEvent(new CustomEvent("amyfx:open-mentor")); },
    version: CONFIG.blueprintVersion
  });

  window.AmyFXOS = AmyFXOS;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
