"use strict";

(function () {
  if (window.__amyFxMentorRuleChatSafeV3) return;
  window.__amyFxMentorRuleChatSafeV3 = true;

  const VERSION = "3.0.0";
  const SESSION_KEY = "amyfx.mentor.safeRuleChat.v3";
  const ROUTES = Object.freeze({
    home: "index.html",
    mapping: "apps/mapping/index.html",
    intel: "apps/market-intel/index.html",
    journal: "apps/journal/index.html",
    academy: "apps/academy/index.html"
  });
  const SCRIPT_URL = document.currentScript?.src || "";
  const ASSET_ROOT = SCRIPT_URL ? new URL("../../", SCRIPT_URL) : new URL("../../", location.href);
  const clean = value => String(value ?? "").trim();
  const lower = value => clean(value).toLowerCase().replace(/\s+/g, " ");

  function safeParse(value, fallback = null) {
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function readSession() {
    try {
      const value = safeParse(sessionStorage.getItem(SESSION_KEY), {}) || {};
      return {
        awaiting: clean(value.awaiting),
        issueArea: clean(value.issueArea),
        lastIntent: clean(value.lastIntent)
      };
    } catch {
      return { awaiting: "", issueArea: "", lastIntent: "" };
    }
  }

  function writeSession(patch) {
    const next = { ...readSession(), ...patch };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch {}
    return next;
  }

  function currentModule() {
    const path = location.pathname.toLowerCase();
    if (path.includes("/apps/mapping/")) return "mapping";
    if (path.includes("/apps/market-intel/")) return "intel";
    if (path.includes("/apps/journal/")) return "journal";
    if (path.includes("/apps/academy/")) return "academy";
    return "home";
  }

  function workspace(context) {
    return context?.payload?.workspace || null;
  }

  function greeting() {
    let hour = new Date().getHours();
    try {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Makassar", hour: "2-digit", hour12: false }).formatToParts(new Date());
      hour = Number(parts.find(part => part.type === "hour")?.value || hour);
    } catch {}
    const period = hour < 11 ? "pagi" : hour < 15 ? "siang" : hour < 19 ? "sore" : "malam";
    return `Hai, selamat ${period}. Aku Amy. Ada yang bisa kubantu?`;
  }

  function navigate(moduleId) {
    const route = ROUTES[moduleId];
    if (!route) return false;
    const target = new URL(route, ASSET_ROOT).href;
    window.setTimeout(() => { location.href = target; }, 350);
    return true;
  }

  function providerStatus(ws) {
    const settings = ws?.system?.ai || ws?.system?.provider_status || ws?.system || {};
    const refs = Array.isArray(settings.key_refs) ? settings.key_refs : [];
    const providers = {};
    refs.forEach(ref => {
      const provider = lower(ref?.provider || "unknown");
      providers[provider] = (providers[provider] || 0) + 1;
    });
    return {
      total: refs.length,
      providers,
      paidFallback: Boolean(settings.paid_fallback),
      vaultAvailable: ws?.system?.secure_vault?.available ?? Boolean(window.AmyNativeAI?.listSecrets)
    };
  }

  function marketFresh(ws) {
    const market = ws?.market || {};
    const state = lower(market?.freshness?.state);
    const timestamp = new Date(market.captured_at || 0).getTime();
    return Number.isFinite(timestamp)
      && timestamp > 86_400_000
      && !["missing", "stale", "expired", "invalid", "unknown"].includes(state);
  }

  function needsAi(question) {
    const value = lower(question);
    if (/^(ai|pakai ai|gunakan ai|tanya ai)\s*[:,-]/.test(value)) return true;
    if (/analisis|analisa|bedah|review mendalam|evaluasi mendalam|bandingkan|prediksi|forecast|buat strategi|susun strategi|jelaskan kenapa market|pola kesalahan|psikologi trading|ajari saya|uji pemahaman/.test(value)) return true;
    return /chart|setup|entry|bias|likuiditas|liquidity|fvg|order block|ict|smc/.test(value) && value.length > 90;
  }

  function stripAiPrefix(question) {
    return clean(question).replace(/^(?:ai|pakai ai|gunakan ai|tanya ai)\s*[:,-]\s*/i, "");
  }

  function issueArea(value) {
    if (/mapping|setup|chart|harga|candle/.test(value)) return "mapping";
    if (/market intel|intel|berita|news|heatmap|liquidity|likuiditas/.test(value)) return "intel";
    if (/jurnal|journal|library|media|catatan|statistik/.test(value)) return "journal";
    if (/academy|materi|belajar|kursus/.test(value)) return "academy";
    if (/amy|mentor|bot|ai|api|gemini|openrouter|deepseek|jawaban/.test(value)) return "mentor";
    if (/update|versi|instal|apk/.test(value)) return "update";
    if (/profil|beranda|home|proyek|koleksi/.test(value)) return "home";
    return "";
  }

  function issueReply(area, ws) {
    const providers = providerStatus(ws);
    return ({
      mapping: "Baik, masalahnya di Mapping. Bagian mana yang macet: harga, chart, tombol analisis, setup, atau riwayat?",
      intel: "Baik, masalahnya di Market Intel. Yang tidak jalan bagian News, Heatmap, atau Liquidity?",
      journal: "Baik, masalahnya di Jurnal atau Library. Datanya tidak muncul, tidak tersimpan, atau statistiknya salah?",
      academy: "Baik, masalahnya di Academy. Materi tidak terbuka, progres tidak bertambah, atau Amy tidak membaca materi?",
      mentor: providers.total
        ? "Baik, masalahnya di Amy. Key AI sudah terdaftar. Pesan tidak terkirim, loading terus, atau jawabannya tidak sesuai?"
        : "Baik, masalahnya di Amy. Chat bantuan lokal tetap aktif, tetapi analisis AI memerlukan key di Pengaturan Amy.",
      update: "Baik, masalahnya di update aplikasi. Update tidak muncul, unduhan gagal, atau APK tidak bisa dipasang?",
      home: "Baik, masalahnya di halaman utama. Bagian mana yang tidak merespons: Beranda, Proyek, Koleksi, atau Profil?"
    })[area] || "Ceritakan bagian yang bermasalah supaya aku bisa mengarahkannya dengan tepat.";
  }

  function localAnswer(question, context) {
    const value = lower(question);
    const ws = workspace(context) || {};
    const session = readSession();

    if (!value || /^(halo|hai|hello|pagi|siang|sore|malam|tes|test|permisi)$/.test(value)) {
      writeSession({ awaiting: "", lastIntent: "greeting" });
      return `${greeting()} Kamu mau cek kondisi sekarang, membuka fitur, atau melaporkan masalah?`;
    }

    if (/^(iya|ya|yap|oke|ok|boleh|lanjut)$/.test(value)) {
      if (session.awaiting === "issue_area") return "Siap. Masalahnya ada di Mapping, Market Intel, Jurnal, Academy, Amy, atau update aplikasi?";
      return "Siap. Langsung tulis yang ingin kamu cek atau masalah yang sedang terjadi.";
    }

    if (/^(tidak|nggak|gak|ga|bukan|batal)$/.test(value)) {
      writeSession({ awaiting: "", issueArea: "", lastIntent: "cancel" });
      return "Baik, kita mulai lagi. Apa yang ingin kamu cek?";
    }

    if (/menu|bantuan|help|fitur apa|bisa apa|cara pakai/.test(value)) {
      return "Aku bisa membantu cek kondisi market, membuka Mapping, Market Intel, Jurnal, Library, Academy, status API, versi aplikasi, dan masalah fitur.";
    }

    if (/siapa kamu|kamu apa/.test(value)) {
      return "Aku Amy, customer service Amy FX. Pertanyaan umum kujawab langsung lewat aturan lokal; AI hanya dipakai untuk analisis yang memang membutuhkannya.";
    }

    if (/terima kasih|makasih|thanks/.test(value)) return "Sama-sama. Ada lagi yang perlu dibantu?";

    const detectedArea = issueArea(value);
    if (session.awaiting === "issue_area" && detectedArea) {
      writeSession({ awaiting: "", issueArea: detectedArea, lastIntent: `issue-${detectedArea}` });
      return issueReply(detectedArea, ws);
    }

    if (/ada (fitur|bagian) yang bermasalah|lapor masalah|error|bug|tidak bisa|gagal|macet|freeze|lambat|slow|loading terus|tidak merespons/.test(value)) {
      if (detectedArea) {
        writeSession({ awaiting: "", issueArea: detectedArea, lastIntent: `issue-${detectedArea}` });
        return issueReply(detectedArea, ws);
      }
      writeSession({ awaiting: "issue_area", lastIntent: "issue-select" });
      return "Tentu, aku bantu cek. Masalahnya ada di Mapping, Market Intel, Jurnal, Academy, Amy, atau update aplikasi?";
    }

    if (/status semua modul|ringkas status semua|status aplikasi|cek semua|cek kondisi sekarang/.test(value)) {
      const journal = ws?.trading?.journal?.summary || {};
      const library = ws?.trading?.library?.catalog || {};
      const academy = ws?.academy?.progress || {};
      const providers = providerStatus(ws);
      return `Saat ini data market ${marketFresh(ws) ? "tersedia" : "belum valid"}. Tersimpan ${journal.total || 0} jurnal, ${library.total || 0} item Library, progres Academy ${academy.read_count || 0}/${academy.total_sections || 36}, dan ${providers.total} key AI.`;
    }

    if (/apa yang perlu (aku|saya) (kerjakan|lakukan)|harus ngapain|langkah sekarang/.test(value)) {
      if (!marketFresh(ws)) return "Untuk sekarang, buka Mapping dan pastikan data market sudah masuk. Sambil menunggu, Jurnal dan Academy tetap bisa digunakan.";
      return "Cek setup aktif di Mapping. Sebelum entry, pastikan arah, trigger, risiko, dan invalidasinya jelas; setelah selesai, catat hasilnya di Jurnal.";
    }

    if (/buka|masuk|pergi ke|arahkan|lihat|tampilkan/.test(value)) {
      if (/mapping/.test(value)) { navigate("mapping"); return "Siap, aku buka Mapping."; }
      if (/market intel|intel|berita|news|heatmap|liquidity|likuiditas/.test(value)) { navigate("intel"); return "Siap, aku buka Market Intel."; }
      if (/jurnal|journal|library|catatan|media|statistik/.test(value)) { navigate("journal"); return "Siap, aku buka Jurnal dan Trading Library."; }
      if (/academy|materi|belajar|kursus/.test(value)) { navigate("academy"); return "Siap, aku buka Amy FX Academy."; }
      if (/beranda|home|profil|proyek|koleksi/.test(value)) { navigate("home"); return "Siap, aku kembali ke halaman utama."; }
    }

    if (/status market|market sekarang|harga sekarang|harga xau|data market|setup aktif|arah market/.test(value)) {
      if (!marketFresh(ws)) return "Data market live belum valid, jadi aku belum akan menyebut arah atau setup. Buka Mapping atau Market Intel lalu muat ulang datanya.";
      const market = ws.market || {};
      const live = market.live_state || {};
      const setup = live.setup || live.bestSetup || market.active_and_recent_setups?.[0] || {};
      const price = Number(market.current_price || 0);
      const state = clean(setup.state || setup.status || live.directionDecision?.signal || "WAIT");
      return `Data XAU/USD tersedia${price > 0 ? ` di sekitar ${price}` : ""}. Status setup saat ini ${state || "WAIT"}.`;
    }

    if (/jumlah jurnal|berapa jurnal|statistik jurnal|win rate|berapa win|berapa loss|hasil trading/.test(value)) {
      const journal = ws?.trading?.journal?.summary || {};
      return `Ada ${journal.total || 0} entry: ${journal.win || 0} win, ${journal.loss || 0} loss, dan ${journal.break_even || 0} break-even. Win rate ${journal.win_rate == null ? "belum cukup data" : `${journal.win_rate}%`}.`;
    }

    if (/jumlah library|berapa file|isi library|koleksi|materi tersimpan|jumlah materi/.test(value)) {
      const library = ws?.trading?.library?.catalog || {};
      return `Trading Library berisi ${library.total || 0} item.`;
    }

    if (/progres academy|sampai mana belajar|materi terakhir|belajar ku|belajarku/.test(value)) {
      const academy = ws?.academy?.progress || {};
      const last = clean(academy.last_title);
      return `Progres belajarmu ${academy.read_count || 0} dari ${academy.total_sections || 36} bagian (${academy.percentage || 0}%)${last ? `. Materi terakhir: ${last}` : ""}.`;
    }

    if (/status api|status key|provider|gemini|openrouter|deepseek|secure vault|api key/.test(value)) {
      const status = providerStatus(ws);
      const labels = Object.entries(status.providers).map(([name, count]) => `${name} ${count}`).join(", ") || "belum ada";
      return `Secure vault ${status.vaultAvailable ? "aktif" : "belum tersedia"}. Key yang terdaftar: ${labels}. DeepSeek ${status.paidFallback ? "boleh dipakai sebagai fallback" : "belum diaktifkan sebagai fallback berbayar"}.`;
    }

    if (/versi|version|update aplikasi|cek update/.test(value)) {
      const version = ws?.system?.app_version || window.AmyFXAppVersion || {};
      return `Amy FX Preview yang terpasang adalah versi ${clean(version.name || version.version || "belum diketahui")}. Pemeriksaan update tersedia di Profil → Versi Aplikasi.`;
    }

    if (/hapus|delete|reset|bersihkan semua|ubah data|edit data/.test(value)) {
      return "Aku bisa membantu mencari dan menjelaskan data, tetapi perubahan atau penghapusan tetap dilakukan dari fitur terkait agar aman.";
    }

    return "Aku belum menangkap bagian yang kamu maksud. Ini tentang market, Jurnal, belajar, API, atau ada fitur aplikasi yang bermasalah?";
  }

  function installAskWrapper() {
    const os = window.AmyFXOS;
    if (!os?.ask || os.__amySafeRuleChatV3) return Boolean(os?.__amySafeRuleChatV3);
    const originalAsk = os.ask.bind(os);
    const originalBuild = typeof os.buildContext === "function" ? os.buildContext.bind(os) : null;

    const ask = async function (question, options = {}) {
      const context = options.context || await originalBuild?.(options.sourceModule || currentModule());
      if (needsAi(question)) return originalAsk(stripAiPrefix(question), { ...options, context });
      return {
        text: localAnswer(question, context),
        provider: "amy-bot",
        model: "rule-chat-safe-v3",
        source: "Amy",
        route: "bot",
        context
      };
    };

    window.AmyFXOS = Object.freeze({
      ...os,
      ask,
      safeRuleChat: Object.freeze({ version: VERSION, needsAi, answer: localAnswer }),
      __amySafeRuleChatV3: true
    });
    window.dispatchEvent(new CustomEvent("amyfx:safe-rule-chat-ready", { detail: { version: VERSION } }));
    return true;
  }

  function ensureStyles() {
    if (document.getElementById("amy-safe-rule-chat-style-v3")) return;
    const style = document.createElement("style");
    style.id = "amy-safe-rule-chat-style-v3";
    style.textContent = `
      .amy-os-panel[data-amy-safe-chat="v3"] .amy-os-contexts { display:none !important; }
      .amy-os-panel[data-amy-safe-chat="v3"] .amy-os-health { color:#8fd6a8 !important; font-size:12px !important; border-bottom:0 !important; padding:7px 20px 4px !important; }
      .amy-os-panel[data-amy-safe-chat="v3"] .amy-os-message--amy small { display:none !important; }
      .amy-os-panel[data-amy-safe-chat="v3"] .amy-os-message > div { white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.5; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function applyUi() {
    ensureStyles();
    const panel = document.querySelector(".amy-os-panel");
    if (!panel) return false;
    panel.dataset.amySafeChat = "v3";

    const header = panel.querySelector(".amy-os-panel__header > div:first-child");
    const headerHtml = "<strong>Amy Assistant</strong><small>Customer Service Amy FX</small>";
    if (header && header.innerHTML !== headerHtml) header.innerHTML = headerHtml;

    const health = panel.querySelector("[data-amy-health]");
    if (health) {
      health.dataset.amyAllAccess = "1";
      if (health.textContent !== "● Amy online • siap membantu") health.textContent = "● Amy online • siap membantu";
    }

    const contexts = panel.querySelector("[data-amy-contexts]");
    if (contexts && !contexts.hidden) contexts.hidden = true;

    const input = panel.querySelector("[data-amy-input]");
    if (input && input.placeholder !== "Tulis pesan ke Amy…") input.placeholder = "Tulis pesan ke Amy…";

    const starters = panel.querySelector("[data-amy-starters]");
    if (starters && starters.dataset.amySafeChat !== "v3") {
      starters.dataset.amySafeChat = "v3";
      starters.innerHTML = [
        ["Cek kondisi sekarang", "Cek kondisi"],
        ["Buka Mapping", "Mapping"],
        ["Cek statistik jurnal", "Jurnal"],
        ["Progres Academy", "Belajar"],
        ["Ada fitur yang bermasalah", "Lapor masalah"]
      ].map(([prompt, label]) => `<button type="button" data-starter="${prompt}">${label}</button>`).join("");
    }

    const messages = panel.querySelector("[data-amy-messages]");
    if (messages && !messages.querySelector("[data-amy-safe-welcome]")) {
      const row = document.createElement("div");
      row.className = "amy-os-message amy-os-message--amy";
      row.dataset.amySafeWelcome = "v3";
      const body = document.createElement("div");
      body.textContent = `${greeting()} Kamu bisa langsung menulis seperti sedang chat dengan customer service.`;
      row.appendChild(body);
      messages.appendChild(row);
    }

    const fab = document.querySelector(".amy-os-fab");
    if (panel.hidden && fab?.hidden) fab.hidden = false;
    return true;
  }

  function boot() {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const ready = installAskWrapper();
      const mounted = applyUi();
      if ((ready && mounted) || attempts >= 120) window.clearInterval(timer);
    }, 100);

    window.addEventListener("amyfx:open-mentor", () => window.setTimeout(applyUi, 0));
    window.addEventListener("focus", applyUi);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) applyUi(); });
  }

  window.AmyFXSafeRuleChat = Object.freeze({ version: VERSION, needsAi, answer: localAnswer, applyUi, navigate });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
