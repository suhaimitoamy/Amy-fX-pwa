"use strict";

(function () {
  if (window.__amyFxMentorCustomerServiceV1) return;
  window.__amyFxMentorCustomerServiceV1 = true;

  const VERSION = "2.0.0";
  const ROUTING_KEY = "amyfx.mentor.routing.v1";
  const SESSION_KEY = "amyfx.mentor.ruleChat.v2";
  const SCRIPT_URL = document.currentScript?.src || "";
  const ASSET_ROOT = SCRIPT_URL ? new URL("../../", SCRIPT_URL) : new URL("../../", location.href);
  const ROUTES = Object.freeze({
    home: "index.html",
    mapping: "apps/mapping/index.html",
    intel: "apps/market-intel/index.html",
    journal: "apps/journal/index.html",
    academy: "apps/academy/index.html"
  });
  const DEFAULT_SUGGESTIONS = Object.freeze([
    ["Cek kondisi sekarang", "Cek kondisi"],
    ["Buka Mapping", "Mapping"],
    ["Cek statistik jurnal", "Jurnal"],
    ["Progres Academy", "Belajar"],
    ["Ada fitur yang bermasalah", "Lapor masalah"]
  ]);

  const clean = value => String(value ?? "").trim();
  const lower = value => clean(value).toLowerCase().replace(/\s+/g, " ");
  const safeParse = (value, fallback = null) => {
    try { return JSON.parse(value); } catch { return fallback; }
  };
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));

  function loadSession() {
    try {
      const value = safeParse(sessionStorage.getItem(SESSION_KEY), {}) || {};
      return {
        turns: Number(value.turns) || 0,
        lastIntent: clean(value.lastIntent),
        awaiting: clean(value.awaiting),
        issueArea: clean(value.issueArea),
        greeted: Boolean(value.greeted),
        lastSuggestions: Array.isArray(value.lastSuggestions) ? value.lastSuggestions : []
      };
    } catch {
      return { turns: 0, lastIntent: "", awaiting: "", issueArea: "", greeted: false, lastSuggestions: [] };
    }
  }

  function saveSession(patch = {}) {
    const next = { ...loadSession(), ...patch };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch {}
    return next;
  }

  function remember(intent, suggestions = [], patch = {}) {
    const current = loadSession();
    return saveSession({
      ...patch,
      turns: current.turns + 1,
      lastIntent: intent,
      lastSuggestions: suggestions
    });
  }

  function routeStats() {
    let saved = {};
    try { saved = safeParse(localStorage.getItem(ROUTING_KEY), {}) || {}; } catch {}
    return {
      bot: Number(saved.bot) || 0,
      ai: Number(saved.ai) || 0,
      last_route: clean(saved.last_route),
      updated_at: clean(saved.updated_at)
    };
  }

  function recordRoute(route) {
    const stats = routeStats();
    if (route === "ai") stats.ai += 1;
    else stats.bot += 1;
    stats.last_route = route;
    stats.updated_at = new Date().toISOString();
    try { localStorage.setItem(ROUTING_KEY, JSON.stringify(stats)); } catch {}
    window.dispatchEvent(new CustomEvent("amyfx:mentor-route", { detail: { ...stats, route } }));
    return stats;
  }

  function workspace(context) {
    return context?.payload?.workspace || null;
  }

  function currentModule() {
    const path = location.pathname.toLowerCase();
    if (path.includes("/apps/mapping/")) return "mapping";
    if (path.includes("/apps/market-intel/")) return "intel";
    if (path.includes("/apps/journal/")) return "journal";
    if (path.includes("/apps/academy/")) return "academy";
    return "home";
  }

  function appVersion(ws) {
    const value = ws?.system?.app_version || window.AmyFXAppVersion || {};
    const name = clean(value.name || value.version || value.versionName);
    const code = Number(value.code || value.versionCode || 0);
    return { name: name || "belum diketahui", code: code || null };
  }

  function journalSummary(ws) {
    return ws?.trading?.journal?.summary || {};
  }

  function librarySummary(ws) {
    return ws?.trading?.library?.catalog || {};
  }

  function academyProgress(ws) {
    return ws?.academy?.progress || {};
  }

  function marketData(ws) {
    return ws?.market || {};
  }

  function providerStatus(ws) {
    const settings = ws?.system?.ai || ws?.system?.provider_status || ws?.system || {};
    const refs = Array.isArray(settings.key_refs) ? settings.key_refs : [];
    const providers = {};
    refs.forEach(ref => {
      const provider = lower(ref.provider || "unknown");
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
    const market = marketData(ws);
    const state = lower(market?.freshness?.state);
    const capturedAt = market.captured_at;
    const timestamp = new Date(capturedAt || 0).getTime();
    return Number.isFinite(timestamp)
      && timestamp > 86_400_000
      && !["missing", "stale", "expired", "invalid", "unknown"].includes(state);
  }

  function resultLabel(value) {
    const normalized = lower(value);
    if (normalized === "win") return "win";
    if (normalized === "loss") return "loss";
    if (["be", "break even", "breakeven"].includes(normalized)) return "break-even";
    return normalized || "belum diisi";
  }

  function navigate(moduleId) {
    const path = ROUTES[moduleId];
    if (!path) return false;
    const target = new URL(path, ASSET_ROOT).href;
    window.setTimeout(() => { location.href = target; }, 500);
    return true;
  }

  function witaHour() {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Makassar",
        hour: "2-digit",
        hour12: false
      }).formatToParts(new Date());
      return Number(parts.find(part => part.type === "hour")?.value || 0);
    } catch {
      return new Date().getHours();
    }
  }

  function greeting() {
    const hour = witaHour();
    const part = hour < 11 ? "pagi" : hour < 15 ? "siang" : hour < 19 ? "sore" : "malam";
    return `Hai, selamat ${part}. Aku Amy. Ada yang bisa kubantu?`;
  }

  function menuAnswer() {
    return "Aku bisa bantu cek kondisi market, membuka fitur, melihat Jurnal atau Library, mengecek progres belajar, memeriksa API, dan membantu saat ada fitur yang bermasalah. Pilih salah satu di bawah atau tulis masalahmu seperti biasa.";
  }

  function needsAi(question) {
    const value = lower(question);
    if (/^(ai|pakai ai|gunakan ai|tanya ai)\s*[:,-]/.test(value)) return true;
    if (/analisis|analisa|bedah|review mendalam|evaluasi mendalam|bandingkan|prediksi|forecast|buat strategi|susun strategi|jelaskan kenapa market|pola kesalahan|psikologi trading|ajari saya|uji pemahaman/.test(value)) return true;
    if (/chart|setup|entry|bias|likuiditas|liquidity|fvg|order block|ict|smc/.test(value) && value.length > 70) return true;
    return false;
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
    const replies = {
      mapping: {
        text: "Baik, masalahnya di Mapping. Coba buka Mapping lalu periksa apakah harga dan waktu data sudah bergerak. Kalau masih macet, sebutkan bagian yang gagal: chart, tombol analisis, setup, atau riwayat.",
        suggestions: [["Buka Mapping", "Buka Mapping"], ["Chart Mapping tidak bergerak", "Chart macet"], ["Tombol analisis tidak bekerja", "Analisis gagal"]]
      },
      intel: {
        text: "Baik, masalahnya di Market Intel. Bagian mana yang tidak jalan: News, Heatmap, atau Liquidity?",
        suggestions: [["Buka Heatmap", "Heatmap"], ["Buka Liquidity", "Liquidity"], ["Berita tidak muncul", "News"]]
      },
      journal: {
        text: "Baik, masalahnya di Jurnal atau Library. Apakah data tidak muncul, halaman tidak bisa dibuka, atau hasil Win/Loss tidak tersimpan?",
        suggestions: [["Buka Jurnal", "Buka Jurnal"], ["Jurnal yang disimpan tidak muncul", "Data hilang"], ["Statistik jurnal salah", "Statistik salah"]]
      },
      academy: {
        text: "Baik, masalahnya di Academy. Apakah materi tidak terbuka, progres tidak bertambah, atau Amy tidak membaca materi yang sedang dibuka?",
        suggestions: [["Buka Academy", "Buka Academy"], ["Progres Academy tidak bertambah", "Progres"], ["Materi tidak terbuka", "Materi"]]
      },
      mentor: {
        text: providers.total
          ? "Baik, masalahnya di Amy. Key AI sudah terdaftar. Coba tutup panel ini lalu buka lagi. Kalau masih bermasalah, beri tahu apakah pesan tidak terkirim, loading terus, atau jawaban tidak sesuai."
          : "Baik, masalahnya di Amy. Saat ini belum ada key AI yang siap, tetapi chat bantuan lokal tetap bisa digunakan. Untuk analisis AI, tambahkan key melalui tombol pengaturan.",
        suggestions: [["Amy loading terus", "Loading terus"], ["Jawaban Amy tidak sesuai", "Jawaban salah"], ["Status API", "Cek API"]]
      },
      update: {
        text: "Baik, masalahnya di pembaruan aplikasi. Apakah update tidak muncul, unduhan gagal, atau APK tidak bisa dipasang?",
        suggestions: [["Cek update aplikasi", "Cek update"], ["Unduhan update gagal", "Unduhan gagal"], ["APK tidak bisa dipasang", "Gagal instal"]]
      },
      home: {
        text: "Baik, masalahnya di halaman utama. Bagian mana yang tidak sesuai: Beranda, Proyek, Koleksi, atau Profil?",
        suggestions: [["Buka Beranda", "Beranda"], ["Profil tidak memperbarui data", "Profil"], ["Menu Proyek tidak bisa dibuka", "Proyek"]]
      }
    };
    return replies[area] || null;
  }

  let pendingSuggestions = [];

  function setSuggestions(items) {
    pendingSuggestions = Array.isArray(items) ? items.slice(0, 6) : [];
    window.setTimeout(() => renderQuickReplies(pendingSuggestions), 0);
    return pendingSuggestions;
  }

  function customerServiceResponse(question, context) {
    const value = lower(question);
    const ws = workspace(context);
    const session = loadSession();
    let response = null;

    const done = (intent, text, suggestions = [], patch = {}) => {
      remember(intent, suggestions, patch);
      setSuggestions(suggestions);
      return { text, suggestions, intent };
    };

    if (!value || /^(halo|hai|hello|pagi|siang|sore|malam|tes|test|permisi)$/.test(value)) {
      return done("greeting", `${greeting()} Kamu mau cek kondisi sekarang, membuka fitur, atau melaporkan masalah?`, DEFAULT_SUGGESTIONS, { greeted: true, awaiting: "" });
    }

    if (/^(iya|ya|yap|oke|ok|boleh|lanjut)$/.test(value)) {
      if (session.awaiting === "issue_area") {
        return done("issue-clarify", "Siap. Masalahnya ada di Mapping, Market Intel, Jurnal, Academy, Amy, atau update aplikasi?", [
          ["Masalah di Mapping", "Mapping"], ["Masalah di Jurnal", "Jurnal"], ["Masalah di Market Intel", "Market Intel"], ["Masalah di Amy", "Amy"]
        ], { awaiting: "issue_area" });
      }
      return done("affirmation", "Siap. Pilih bantuan yang kamu perlukan, atau langsung ceritakan masalahnya.", DEFAULT_SUGGESTIONS, { awaiting: "" });
    }

    if (/^(tidak|nggak|gak|ga|bukan|batal)$/.test(value)) {
      return done("negative", "Baik. Kita mulai lagi—apa yang ingin kamu cek?", DEFAULT_SUGGESTIONS, { awaiting: "", issueArea: "" });
    }

    if (/menu|bantuan|help|fitur apa|bisa apa|cara pakai/.test(value)) {
      return done("menu", menuAnswer(), DEFAULT_SUGGESTIONS, { awaiting: "" });
    }

    if (/siapa kamu|kamu apa/.test(value)) {
      return done("identity", "Aku Amy, asisten customer service di Amy FX. Aku menangani bantuan umum lewat aturan lokal supaya cepat, lalu memakai AI hanya saat pertanyaan memang perlu analisis.", DEFAULT_SUGGESTIONS);
    }

    if (/90%|10%|mode bot|mode customer|customer service/.test(value)) {
      const stats = routeStats();
      const total = stats.bot + stats.ai;
      const botPct = total ? Math.round((stats.bot / total) * 100) : 100;
      return done("routing-status", `Mode customer service aktif. Dari ${total} percakapan yang tercatat, ${botPct}% dijawab langsung oleh bot lokal; AI hanya dipakai untuk pertanyaan analisis.`, [["Menu bantuan", "Lihat menu"], ["Tanya AI: analisis kondisi sekarang", "Tanya AI"]]);
    }

    if (/terima kasih|makasih|thanks/.test(value)) {
      return done("thanks", "Sama-sama. Ada lagi yang perlu dibantu?", DEFAULT_SUGGESTIONS);
    }

    const detectedArea = issueArea(value);
    if (session.awaiting === "issue_area" && detectedArea) {
      const issue = issueReply(detectedArea, ws);
      return done(`issue-${detectedArea}`, issue.text, issue.suggestions, { awaiting: "", issueArea: detectedArea });
    }

    if (/ada (fitur|bagian) yang bermasalah|lapor masalah|error|bug|tidak bisa|gagal|macet|freeze|lambat|slow|loading terus|tidak merespons/.test(value)) {
      if (detectedArea) {
        const issue = issueReply(detectedArea, ws);
        return done(`issue-${detectedArea}`, issue.text, issue.suggestions, { awaiting: "", issueArea: detectedArea });
      }
      return done("issue-choose", "Tentu, aku bantu cek. Masalahnya ada di Mapping, Market Intel, Jurnal, Academy, Amy, atau update aplikasi?", [
        ["Masalah di Mapping", "Mapping"], ["Masalah di Jurnal", "Jurnal"], ["Masalah di Market Intel", "Market Intel"], ["Masalah di Amy", "Amy"], ["Masalah update aplikasi", "Update"]
      ], { awaiting: "issue_area" });
    }

    if (/status semua modul|ringkas status semua|status aplikasi|cek semua|cek kondisi sekarang/.test(value)) {
      const journal = journalSummary(ws);
      const library = librarySummary(ws);
      const academy = academyProgress(ws);
      const providers = providerStatus(ws);
      const marketText = marketFresh(ws) ? "data market tersedia" : "data market belum valid";
      return done("status-all", `Saat ini ${marketText}. Tersimpan ${journal.total || 0} jurnal dan ${library.total || 0} item Library. Progres Academy ${academy.read_count || 0}/${academy.total_sections || 36}, dengan ${providers.total} key AI terdaftar.`, [
        ["Buka Mapping", "Lihat Mapping"], ["Cek statistik jurnal", "Lihat Jurnal"], ["Progres Academy", "Lihat belajar"]
      ]);
    }

    if (/apa yang perlu (aku|saya) (kerjakan|lakukan)|harus ngapain|langkah sekarang/.test(value)) {
      if (!marketFresh(ws)) {
        return done("next-step", "Untuk sekarang, buka Mapping dan pastikan data market sudah masuk. Sambil menunggu, kamu tetap bisa melanjutkan Jurnal atau Academy.", [["Buka Mapping", "Buka Mapping"], ["Buka Jurnal", "Buka Jurnal"], ["Buka Academy", "Belajar"]]);
      }
      const recent = ws?.trading?.journal?.recent || [];
      if (!recent.length) {
        return done("next-step", "Data market sudah tersedia. Langkah berikutnya: buat rencana di Mapping, tentukan invalidasi, lalu catat hasilnya di Jurnal.", [["Buka Mapping", "Buat rencana"], ["Buka Jurnal", "Buka Jurnal"]]);
      }
      return done("next-step", "Cek setup aktif di Mapping. Sebelum entry, pastikan arah, trigger, risiko, dan invalidasinya jelas; setelah selesai, lanjutkan review di Jurnal.", [["Buka Mapping", "Cek setup"], ["Buka statistik jurnal", "Review Jurnal"]]);
    }

    if (/buka|masuk|pergi ke|arahkan|lihat|tampilkan/.test(value)) {
      if (/mapping/.test(value)) { navigate("mapping"); return done("navigate-mapping", "Siap, aku buka Mapping.", []); }
      if (/market intel|intel|berita|news|heatmap|liquidity|likuiditas/.test(value)) { navigate("intel"); return done("navigate-intel", "Siap, aku buka Market Intel.", []); }
      if (/jurnal|journal|library|catatan|media|statistik/.test(value)) { navigate("journal"); return done("navigate-journal", "Siap, aku buka Jurnal dan Trading Library.", []); }
      if (/academy|materi|belajar|kursus/.test(value)) { navigate("academy"); return done("navigate-academy", "Siap, aku buka Amy FX Academy.", []); }
      if (/beranda|home|profil|proyek|koleksi/.test(value)) { navigate("home"); return done("navigate-home", "Siap, aku kembali ke halaman utama.", []); }
    }

    if (/status market|market sekarang|harga sekarang|harga xau|data market|setup aktif|arah market/.test(value)) {
      const market = marketData(ws);
      if (!marketFresh(ws)) {
        return done("market-missing", "Data market live belum valid, jadi aku belum akan menyebut arah atau setup. Buka Mapping atau Market Intel lalu muat ulang datanya.", [["Buka Mapping", "Buka Mapping"], ["Buka Market Intel", "Market Intel"]]);
      }
      const live = market.live_state || {};
      const setup = live.setup || live.bestSetup || market.active_and_recent_setups?.[0] || {};
      const price = Number(market.current_price || 0);
      const state = clean(setup.state || setup.status || live.directionDecision?.signal || "WAIT");
      return done("market-status", `Data XAU/USD tersedia${price > 0 ? ` di sekitar ${price}` : ""}. Status setup saat ini ${state || "WAIT"}.`, [["AI: analisis setup sekarang", "Analisis setup"], ["Buka Mapping", "Lihat Mapping"]]);
    }

    if (/jumlah jurnal|berapa jurnal|statistik jurnal|win rate|berapa win|berapa loss|hasil trading/.test(value)) {
      const journal = journalSummary(ws);
      return done("journal-stats", `Ada ${journal.total || 0} entry: ${journal.win || 0} win, ${journal.loss || 0} loss, dan ${journal.break_even || 0} break-even. Win rate ${journal.win_rate == null ? "belum cukup data" : `${journal.win_rate}%`}.`, [["Buka statistik jurnal", "Buka statistik"], ["AI: review pola kesalahan jurnal", "Review mendalam"]]);
    }

    if (/jurnal terakhir|entry terakhir|trade terakhir/.test(value)) {
      const row = ws?.trading?.journal?.recent?.[0];
      if (!row) return done("journal-empty", "Belum ada entry Jurnal yang bisa ditampilkan.", [["Buka Jurnal", "Buat jurnal"]]);
      return done("journal-latest", `Entry terakhir adalah ${clean(row.title || row.market || row.pair || "Trade")}, dengan hasil ${resultLabel(row.result || row.outcome?.result)}${row.date ? ` pada ${row.date}` : ""}.`, [["Buka Jurnal", "Lihat detail"], ["AI: review entry terakhir", "Review AI"]]);
    }

    if (/jumlah library|berapa file|isi library|koleksi|materi tersimpan|jumlah materi/.test(value)) {
      const library = librarySummary(ws);
      const categories = Object.entries(library.by_category || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => `${name} ${count}`).join(", ");
      return done("library-status", `Trading Library berisi ${library.total || 0} item${categories ? `. Kategori terbanyak: ${categories}` : ""}.`, [["Buka Trading Library", "Buka Library"]]);
    }

    if (/progres academy|sampai mana belajar|materi terakhir|belajar ku|belajarku/.test(value)) {
      const academy = academyProgress(ws);
      const last = clean(academy.last_title);
      return done("academy-progress", `Progres belajarmu ${academy.read_count || 0} dari ${academy.total_sections || 36} bagian (${academy.percentage || 0}%)${last ? `. Materi terakhir: ${last}` : ""}.`, [["Buka Academy", "Lanjut belajar"], ["AI: bantu pilih materi berikutnya", "Pilih materi"]]);
    }

    if (/status api|status key|provider|gemini|openrouter|deepseek|secure vault|api key/.test(value)) {
      const status = providerStatus(ws);
      const labels = Object.entries(status.providers).map(([name, count]) => `${name} ${count}`).join(", ") || "belum ada";
      return done("api-status", `Secure vault ${status.vaultAvailable ? "aktif" : "belum tersedia"}. Key yang terdaftar: ${labels}. DeepSeek ${status.paidFallback ? "boleh dipakai sebagai fallback" : "belum diaktifkan sebagai fallback berbayar"}.`, [["Buka pengaturan Amy", "Pengaturan"], ["Ada masalah di Amy", "Cek Amy"]]);
    }

    if (/versi|version|update aplikasi|cek update/.test(value)) {
      const version = appVersion(ws);
      return done("app-version", `Amy FX Preview yang terpasang adalah versi ${version.name}${version.code ? `, code ${version.code}` : ""}. Kamu bisa memeriksa update dari Profil → Versi Aplikasi.`, [["Buka Profil", "Buka Profil"], ["Cek update aplikasi", "Cek update"]]);
    }

    if (/hapus|delete|reset|bersihkan semua|ubah data|edit data/.test(value)) {
      return done("protected-action", "Aku bisa membantu mencari dan menjelaskan data, tetapi tidak akan menghapus atau mengubahnya lewat chat. Buka fitur terkait agar perubahan tetap aman dan bisa kamu konfirmasi sendiri.", DEFAULT_SUGGESTIONS);
    }

    return done("clarify", "Aku belum menangkap bagian yang kamu maksud. Ini tentang market, Jurnal, belajar, API, atau ada fitur aplikasi yang bermasalah?", [
      ["Status market", "Market"], ["Cek statistik jurnal", "Jurnal"], ["Progres Academy", "Belajar"], ["Status API", "API"], ["Ada fitur yang bermasalah", "Lapor masalah"]
    ], { awaiting: "" });
  }

  function customerServiceAnswer(question, context) {
    return customerServiceResponse(question, context).text;
  }

  function fallbackAnswer() {
    const response = customerServiceResponse("", null);
    return response.text;
  }

  function ensureRuleChatStyles() {
    if (document.getElementById("amy-rule-chat-style-v2")) return;
    const style = document.createElement("style");
    style.id = "amy-rule-chat-style-v2";
    style.textContent = `
      .amy-os-panel[data-amy-rule-chat="v2"] .amy-os-contexts { display: none !important; }
      .amy-os-panel[data-amy-rule-chat="v2"] .amy-os-health {
        font-size: 12px; color: #8fd6a8; border-bottom: 0; padding-bottom: 4px;
      }
      .amy-rule-quick-replies {
        display: flex; flex-wrap: wrap; gap: 7px; padding: 4px 20px 12px;
      }
      .amy-rule-quick-replies button {
        border: 1px solid rgba(212,175,55,.34); border-radius: 999px; padding: 8px 12px;
        background: rgba(212,175,55,.08); color: #e7d79b; font: inherit; font-size: 12px;
      }
      .amy-rule-quick-replies button:active { transform: scale(.98); }
      .amy-os-message--amy > div, .amy-os-message--user > div { white-space: normal; line-height: 1.5; }
      .amy-rule-welcome { margin-top: 4px; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function renderQuickReplies(items = pendingSuggestions) {
    const messages = document.querySelector("[data-amy-messages]");
    if (!messages) return;
    messages.querySelectorAll(".amy-rule-quick-replies").forEach(node => node.remove());
    if (!Array.isArray(items) || !items.length) return;
    const row = document.createElement("div");
    row.className = "amy-rule-quick-replies";
    row.innerHTML = items.map(item => {
      const pair = Array.isArray(item) ? item : [item, item];
      return `<button type="button" data-amy-rule-prompt="${escapeHtml(pair[0])}">${escapeHtml(pair[1] || pair[0])}</button>`;
    }).join("");
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  function ensureWelcome() {
    const messages = document.querySelector("[data-amy-messages]");
    if (!messages || messages.querySelector("[data-amy-rule-welcome]")) return;
    const row = document.createElement("div");
    row.className = "amy-os-message amy-os-message--amy amy-rule-welcome";
    row.dataset.amyRuleWelcome = "v2";
    row.innerHTML = `<div>${escapeHtml(`${greeting()} Kamu bisa langsung tulis kebutuhanmu seperti sedang chat dengan customer service.`)}</div>`;
    messages.appendChild(row);
    renderQuickReplies(DEFAULT_SUGGESTIONS);
  }

  function installQuickReplyEvents() {
    if (document.documentElement.dataset.amyRuleQuickReplies === "v2") return;
    document.documentElement.dataset.amyRuleQuickReplies = "v2";
    document.addEventListener("click", event => {
      const button = event.target.closest?.("[data-amy-rule-prompt]");
      if (!button) return;
      const input = document.querySelector("[data-amy-input]");
      const send = document.querySelector("[data-amy-send]");
      if (!input || !send) return;
      input.value = button.dataset.amyRulePrompt || "";
      send.click();
    }, true);
  }

  function installAskWrapper() {
    const os = window.AmyFXOS;
    if (!os?.ask || os.__amyCustomerServiceV1) return Boolean(os?.__amyCustomerServiceV1);
    const originalAsk = os.ask.bind(os);

    const ask = async function (question, options = {}) {
      const context = options.context || await os.buildContext?.(options.sourceModule || currentModule());
      if (needsAi(question)) {
        setSuggestions([["Menu bantuan", "Kembali ke bantuan"]]);
        recordRoute("ai");
        return originalAsk(stripAiPrefix(question), { ...options, context });
      }

      const response = customerServiceResponse(question, context);
      recordRoute("bot");
      return {
        text: response.text,
        suggestions: response.suggestions,
        intent: response.intent,
        provider: "amy-bot",
        model: "customer-service-rule-chat-v2",
        source: "Amy",
        route: "bot",
        context
      };
    };

    window.AmyFXOS = Object.freeze({
      ...os,
      ask,
      customerService: Object.freeze({
        version: VERSION,
        target: { bot: 90, ai: 10 },
        answer: customerServiceAnswer,
        respond: customerServiceResponse,
        needsAi,
        stats: routeStats
      }),
      __amyCustomerServiceV1: true
    });
    window.dispatchEvent(new CustomEvent("amyfx:customer-service-ready", { detail: { version: VERSION, bot: 90, ai: 10, mode: "rule-chat" } }));
    return true;
  }

  function updateUi() {
    ensureRuleChatStyles();
    installQuickReplyEvents();
    const panel = document.querySelector(".amy-os-panel");
    if (panel) panel.dataset.amyRuleChat = "v2";

    const header = document.querySelector(".amy-os-panel__header > div:first-child");
    if (header) header.innerHTML = "<strong>Amy Assistant</strong><small>Customer Service Amy FX</small>";

    const input = document.querySelector("[data-amy-input]");
    if (input) input.placeholder = "Tulis pesan ke Amy…";

    const health = document.querySelector("[data-amy-health]");
    if (health) {
      health.dataset.amyCustomerService = "v2";
      health.textContent = "● Amy online • siap membantu";
    }

    const contexts = document.querySelector("[data-amy-contexts]");
    if (contexts) contexts.hidden = true;

    const starters = document.querySelector("[data-amy-starters]");
    if (starters && starters.dataset.amyCustomerService !== "v2") {
      starters.dataset.amyCustomerService = "v2";
      starters.innerHTML = DEFAULT_SUGGESTIONS.map(([prompt, label]) => `<button type="button" data-starter="${escapeHtml(prompt)}">${escapeHtml(label)}</button>`).join("");
    }
    ensureWelcome();
  }

  function boot() {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const installed = installAskWrapper();
      updateUi();
      if ((installed && document.querySelector("[data-amy-input]")) || attempts >= 300) clearInterval(timer);
    }, 60);
    window.setTimeout(() => clearInterval(timer), 25_000);

    const target = document.body || document.documentElement;
    if (target) new MutationObserver(() => {
      installAskWrapper();
      updateUi();
    }).observe(target, { childList: true, subtree: true });
    window.addEventListener("focus", () => { installAskWrapper(); updateUi(); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { installAskWrapper(); updateUi(); } });
    window.addEventListener("amyfx:open-mentor", () => window.setTimeout(updateUi, 0));
  }

  window.AmyFXCustomerService = Object.freeze({
    version: VERSION,
    target: Object.freeze({ bot: 90, ai: 10 }),
    mode: "rule-chat",
    needsAi,
    answer: customerServiceAnswer,
    respond: customerServiceResponse,
    stats: routeStats,
    navigate,
    renderQuickReplies
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
