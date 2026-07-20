"use strict";

const STORAGE_KEY = "tradingLibraryManager.items.v1";
const SETTINGS_KEY = "tradingLibraryManager.settings.v1";
const DB_NAME = "tradingLibraryManager.files";
const DB_VERSION = 1;
const FILE_STORE = "files";
const APP_VERSION = "20260519MaterialContentCache1";
const JOURNAL_STORAGE_KEY = "tradingLibraryManager.journals.v1";
const NOTES_STORAGE_KEY = "tradingLibraryManager.notes.v1";
const ASSISTANT_SETTINGS_KEY = "tradingLibraryManager.assistantSettings.v1";
const INSIGHT_CACHE_KEY = "tradingLibraryManager.insightCache.v1";
const ASSISTANT_CHAT_KEY = "tradingLibraryManager.assistantChat.v2";
const ASSISTANT_MAX_HISTORY = 80;
const PIN_KEY = "tradingLibraryManager.pinHash.v1";
const BACKUP_VERSION = "1.0";
const SUPPORTED_SCAN_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "mp4", "mkv", "webm", "ogg", "mov", "m4v", "3gp", "avi", "pdf", "doc", "docx", "md", "txt", "xls", "xlsx", "csv", "ppt", "pptx"]);

const categories = [
  "SMC",
  "ICT",
  "POI",
  "Order Block",
  "FVG",
  "BOS",
  "CHoCH",
  "Entry",
  "Risk Management",
  "Indikator",
  "Video",
  "Gambar Chart",
  "Dokumen",
  "PDF",
  "Markdown",
  "Word",
  "Excel",
  "PowerPoint",
  "Jurnal Trading",
  "Psikologi",
  "Backtest"
];

const statuses = [
  "Belum dibaca",
  "Dipelajari",
  "Dipakai",
  "Perlu revisi",
  "Selesai"
];

const fileTypes = ["Semua", "Gambar", "Video", "PDF", "Word", "Markdown", "Excel", "PowerPoint", "Kode", "Dokumen"];

const dom = {
  categoryPills: document.querySelector("#categoryPills"),
  statusPills: document.querySelector("#statusPills"),
  typePills: document.querySelector("#typePills"),
  mediaTypePills: document.querySelector("#mediaTypePills"),
  sortSelect: document.querySelector("#sortSelect"),
  collectionFilterInput: document.querySelector("#collectionFilterInput"),
  showArchivedInput: document.querySelector("#showArchivedInput"),
  filterToggleBtn: document.querySelector("#filterToggleBtn"),
  filterContent: document.querySelector("#filterContent"),
  searchInput: document.querySelector("#searchInput"),
  focusSearchBtn: document.querySelector("#focusSearchBtn"),
  openSidebarBtn: document.querySelector("#openSidebarBtn"),
  closeSidebarBtn: document.querySelector("#closeSidebarBtn"),
  sidebarBackdrop: document.querySelector("#sidebarBackdrop"),
  sideDrawer: document.querySelector("#sideDrawer"),
  sideNavButtons: document.querySelectorAll(".side-nav-button"),
  openFormBtn: document.querySelector("#openFormBtn"),
  emptyAddBtn: document.querySelector("#emptyAddBtn"),
  clearFiltersBtn: document.querySelector("#clearFiltersBtn"),
  selectModeBtn: document.querySelector("#selectModeBtn"),
  bulkDeleteBtn: document.querySelector("#bulkDeleteBtn"),
  cancelSelectBtn: document.querySelector("#cancelSelectBtn"),
  libraryGrid: document.querySelector("#libraryGrid"),
  codeGrid: document.querySelector("#codeGrid"),
  mediaGrid: document.querySelector("#mediaGrid"),
  libraryEmpty: document.querySelector("#libraryEmpty"),
  codeEmpty: document.querySelector("#codeEmpty"),
  mediaEmpty: document.querySelector("#mediaEmpty"),
  libraryCount: document.querySelector("#libraryCount"),
  codeCount: document.querySelector("#codeCount"),
  mediaCount: document.querySelector("#mediaCount"),
  dashboardGrid: document.querySelector("#dashboardGrid"),
  statisticsViewContent: document.querySelector("#statisticsViewContent"),
  notesView: document.querySelector("#notesView"),
  notesHeading: document.querySelector("#notesHeading"),
  notesCount: document.querySelector("#notesCount"),
  newNoteBtn: document.querySelector("#newNoteBtn"),
  noteForm: document.querySelector("#noteForm"),
  noteId: document.querySelector("#noteId"),
  noteDateInput: document.querySelector("#noteDateInput"),
  noteTitleInput: document.querySelector("#noteTitleInput"),
  noteContentInput: document.querySelector("#noteContentInput"),
  cancelNoteBtn: document.querySelector("#cancelNoteBtn"),
  notesList: document.querySelector("#notesList"),
  installBtn: document.querySelector("#installBtn"),
  exportAllBtn: document.querySelector("#exportAllBtn"),
  importBackupInput: document.querySelector("#importBackupInput"),
  scanStorageBtn: document.querySelector("#scanStorageBtn"),
  storageScanInput: document.querySelector("#storageScanInput"),
  scanStorageMessage: document.querySelector("#scanStorageMessage"),
  setPinBtn: document.querySelector("#setPinBtn"),
  clearPinBtn: document.querySelector("#clearPinBtn"),
  journalCount: document.querySelector("#journalCount"),
  newJournalBtn: document.querySelector("#newJournalBtn"),
  journalForm: document.querySelector("#journalForm"),
  journalId: document.querySelector("#journalId"),
  journalDateInput: document.querySelector("#journalDateInput"),
  journalMarketInput: document.querySelector("#journalMarketInput"),
  journalTitleInput: document.querySelector("#journalTitleInput"),
  journalSetupInput: document.querySelector("#journalSetupInput"),
  journalResultInput: document.querySelector("#journalResultInput"),
  journalProfitInput: document.querySelector("#journalProfitInput"),
  journalLossInput: document.querySelector("#journalLossInput"),
  journalEvaluationInput: document.querySelector("#journalEvaluationInput"),
  journalMistakesInput: document.querySelector("#journalMistakesInput"),
  journalLessonsInput: document.querySelector("#journalLessonsInput"),
  journalEmotionInput: document.querySelector("#journalEmotionInput"),
  journalFileInput: document.querySelector("#journalFileInput"),
  journalFileMeta: document.querySelector("#journalFileMeta"),
  journalMessage: document.querySelector("#journalMessage"),
  resetJournalBtn: document.querySelector("#resetJournalBtn"),
  journalList: document.querySelector("#journalList"),
  journalEmpty: document.querySelector("#journalEmpty"),
  aiProviderInput: document.querySelector("#aiProviderInput"),
  aiBaseUrlInput: document.querySelector("#aiBaseUrlInput"),
  geminiApiKeyInput: document.querySelector("#geminiApiKeyInput"),
  geminiModelInput: document.querySelector("#geminiModelInput"),
  saveGeminiKeyBtn: document.querySelector("#saveGeminiKeyBtn"),
  testGeminiBtn: document.querySelector("#testGeminiBtn"),
  clearGeminiKeyBtn: document.querySelector("#clearGeminiKeyBtn"),
  updateInsightBtn: document.querySelector("#updateInsightBtn"),
  clearInsightBtn: document.querySelector("#clearInsightBtn"),
  askAssistantBtn: document.querySelector("#askAssistantBtn"),
  assistantQuickPrompts: document.querySelector("#assistantQuickPrompts"),
  assistantQuestionInput: document.querySelector("#assistantQuestionInput"),
  assistantAnswer: document.querySelector("#assistantAnswer"),
  assistantChatLog: document.querySelector("#assistantChatLog"),
  assistantModeTabs: document.querySelector("#assistantModeTabs"),
  assistantShortcutMenu: document.querySelector("#assistantShortcutMenu"),
  assistantModeButtons: document.querySelectorAll(".assistant-mode-tab"),
  assistantModeLabel: document.querySelector("#assistantModeLabel"),
  clearAssistantHistoryBtn: document.querySelector("#clearAssistantHistoryBtn"),
  assistantApiSummary: document.querySelector("#assistantApiSummary"),
  assistantMessage: document.querySelector("#assistantMessage"),
  aiChatToggleBtn: document.querySelector("#aiChatToggleBtn"),
  aiChatPopup: document.querySelector("#aiChatPopup"),
  closeAiChatBtn: document.querySelector("#closeAiChatBtn"),
  aiPopupQuestionInput: document.querySelector("#aiPopupQuestionInput"),
  askAiPopupBtn: document.querySelector("#askAiPopupBtn"),
  aiPopupAnswer: document.querySelector("#aiPopupAnswer"),
  saveAiPopupMaterialBtn: document.querySelector("#saveAiPopupMaterialBtn"),
  clearAiPopupBtn: document.querySelector("#clearAiPopupBtn"),
  insightBox: document.querySelector("#insightBox"),
  fullscreenAnalyzeBtn: document.querySelector("#fullscreenAnalyzeBtn"),
  fullscreenDeleteBtn: document.querySelector("#fullscreenDeleteBtn"),
  fullscreenAnalysis: document.querySelector("#fullscreenAnalysis"),
  navButtons: document.querySelectorAll(".bottom-nav .nav-button"),
  views: {
    library: document.querySelector("#libraryView"),
    code: document.querySelector("#codeView"),
    media: document.querySelector("#mediaView"),
    journal: document.querySelector("#journalView"),
    assistant: document.querySelector("#assistantView"),
    statistics: document.querySelector("#statisticsView"),

    notes: document.querySelector("#notesView")
  },
  dialog: document.querySelector("#itemDialog"),
  form: document.querySelector("#itemForm"),
  formMode: document.querySelector("#formMode"),
  closeFormBtn: document.querySelector("#closeFormBtn"),
  deleteCurrentBtn: document.querySelector("#deleteCurrentBtn"),
  itemId: document.querySelector("#itemId"),
  titleInput: document.querySelector("#titleInput"),
  typeInput: document.querySelector("#typeInput"),
  categoryInput: document.querySelector("#categoryInput"),
  statusInput: document.querySelector("#statusInput"),
  collectionInput: document.querySelector("#collectionInput"),
  tagsInput: document.querySelector("#tagsInput"),
  mediaUrlInput: document.querySelector("#mediaUrlInput"),
  fileInput: document.querySelector("#fileInput"),
  fileMeta: document.querySelector("#fileMeta"),
  formPreview: document.querySelector("#formPreview"),
  compressImageInput: document.querySelector("#compressImageInput"),
  notesInput: document.querySelector("#notesInput"),
  checklistInput: document.querySelector("#checklistInput"),
  codeInput: document.querySelector("#codeInput"),
  codeField: document.querySelector("#codeField"),
  formMessage: document.querySelector("#formMessage"),
  cardTemplate: document.querySelector("#cardTemplate"),
  documentDialog: document.querySelector("#documentDialog"),
  closeDocumentBtn: document.querySelector("#closeDocumentBtn"),
  documentTitle: document.querySelector("#documentTitle"),
  documentTypeLabel: document.querySelector("#documentTypeLabel"),
  documentFrame: document.querySelector("#documentFrame"),
  downloadDocumentBtn: document.querySelector("#downloadDocumentBtn"),
  openDocumentBtn: document.querySelector("#openDocumentBtn"),
  fullscreenDialog: document.querySelector("#fullscreenDialog"),
  fullscreenBackBtn: document.querySelector("#fullscreenBackBtn"),
  fullscreenCloseBtn: document.querySelector("#fullscreenCloseBtn"),
  fullscreenExitBtn: document.querySelector("#fullscreenExitBtn"),
  fullscreenPrevBtn: document.querySelector("#fullscreenPrevBtn"),
  fullscreenNextBtn: document.querySelector("#fullscreenNextBtn"),
  fullscreenTitle: document.querySelector("#fullscreenTitle"),
  fullscreenMeta: document.querySelector("#fullscreenMeta"),
  fullscreenStage: document.querySelector("#fullscreenStage")
};

const state = {
  items: [],
  journals: [],
  personalNotes: [],
  category: "Semua",
  status: "Semua",
  fileType: "Semua",
  mediaType: "Semua",
  query: "",
  collectionFilter: "",
  sort: "pinned-newest",
  showArchived: false,
  view: "library",
  pendingMedia: null,
  activeDocument: null,
  renderedObjectUrls: new Set(),
  previewObjectUrl: "",
  documentObjectUrl: "",
  documentObjectUrlFileId: "",
  fullscreenObjectUrl: "",
  fullscreenObjectUrlFileId: "",
  fullscreenFeedObjectUrls: new Set(),
  activeFullscreenItem: null,
  autoTitleFromFile: false,
  pendingJournalFiles: [],
  aiProvider: "gemini",
  aiBaseUrl: "",
  geminiApiKey: "",
  geminiModel: "gemini-2.0-flash",
  insightCache: null,
  selectMode: false,
  selectedIds: new Set(),
  touchStartX: 0,
  dbPromise: null,
  deferredInstallPrompt: null,
  viewerStatusChanged: false,
  journalOpenDate: "",
  journalOpenId: "",
  statsCalendarYear: null,
  statsCalendarMonth: null,
  lastBackAt: 0,
  gridLimits: {},
  itemsVersion: 0,
  filterCache: { key: "", items: null },
  aiPopupLastQuestion: "",
  aiPopupLastAnswer: "",
  videoThumbnailObserver: null,
  videoThumbnailQueue: new Set(),
  videoThumbnailBusy: false,
  nativeThumbnailObserver: null,
  nativeThumbnailRequested: new Set(),
  pendingAiAction: null,
  assistantChatHistory: [],
  assistantMode: "coach",
  aiLastMaterialResults: [],
  materialContentCache: new Map(),
  materialContentHydrated: false,
  scanProgress: null
};

async function boot() {
  await requestPersistentStorage();
  await enforcePinLock();
  state.items = normalizeItems(loadItems());
  state.journals = normalizeJournals(loadJournals());
  state.personalNotes = loadNotes();
  loadAssistantSettings();
  state.assistantChatHistory = loadAssistantChatHistory();
  loadSettings();
  fillSelect(dom.categoryInput, categories);
  fillSelect(dom.statusInput, statuses);
  renderPills();
  bindEvents();
  if (dom.journalDateInput && !dom.journalDateInput.value) dom.journalDateInput.value = new Date().toISOString().slice(0, 10);
  render();
  initBackGuard();
  await migrateLegacyFiles();
  disableServiceWorkerForWebPage();
}

function bindEvents() {
  const debouncedSearchRender = debounce(() => {
    state.query = dom.searchInput.value.trim();
    resetGridLimits();
    saveSettings();
    render();
  }, 220);

  const debouncedCollectionRender = debounce(() => {
    state.collectionFilter = dom.collectionFilterInput?.value.trim() || "";
    resetGridLimits();
    saveSettings();
    render();
  }, 220);

  dom.searchInput.addEventListener("input", () => {
    debouncedSearchRender();
  });

  dom.focusSearchBtn.addEventListener("click", () => {
    dom.searchInput.focus();
  });

  dom.filterToggleBtn?.addEventListener("click", () => {
    if (dom.filterContent) {
      const isHidden = dom.filterContent.hidden;
      dom.filterContent.hidden = !isHidden;
      dom.filterToggleBtn.classList.toggle("is-active", isHidden);
    }
  });

  dom.openSidebarBtn?.addEventListener("click", openSidebar);
  dom.closeSidebarBtn?.addEventListener("click", closeSidebar);
  dom.sidebarBackdrop?.addEventListener("click", closeSidebar);
  dom.sideNavButtons?.forEach((button) => {
    button.addEventListener("click", () => {
      setView(button.dataset.view);
      closeSidebar();
    });
  });

  dom.openFormBtn.addEventListener("click", () => openForm());
  dom.emptyAddBtn.addEventListener("click", () => openForm());

  dom.clearFiltersBtn.addEventListener("click", () => {
    state.category = "Semua";
    state.status = "Semua";
    state.fileType = "Semua";
    state.mediaType = "Semua";
    state.collectionFilter = "";
    state.query = "";
    state.showArchived = false;
    resetGridLimits();
    dom.searchInput.value = "";
    if (dom.collectionFilterInput) dom.collectionFilterInput.value = "";
    if (dom.showArchivedInput) dom.showArchivedInput.checked = false;
    saveSettings();
    renderPills();
    render();
  });

  dom.sortSelect?.addEventListener("change", () => {
    state.sort = dom.sortSelect.value;
    resetGridLimits();
    saveSettings();
    render();
  });

  dom.collectionFilterInput?.addEventListener("input", () => {
    debouncedCollectionRender();
  });

  dom.showArchivedInput?.addEventListener("change", () => {
    state.showArchived = dom.showArchivedInput.checked;
    resetGridLimits();
    saveSettings();
    render();
  });

  dom.exportAllBtn?.addEventListener("click", exportBackup);
  dom.importBackupInput?.addEventListener("change", importBackup);
  dom.scanStorageBtn?.addEventListener("click", scanStorageFiles);
  dom.storageScanInput?.addEventListener("change", handleStorageScanInput);
  window.addEventListener("amyNativeStorageScanResult", handleNativeStorageScanResult);
  window.handleNativeStorageScanResult = (detail) => handleNativeStorageScanResult({ detail });
  dom.setPinBtn?.addEventListener("click", setLocalPin);
  dom.clearPinBtn?.addEventListener("click", clearLocalPin);
  dom.newJournalBtn?.addEventListener("click", () => { resetJournalForm(); openJournalEditor("new"); });
  dom.newNoteBtn?.addEventListener("click", openNoteForm);
  dom.cancelNoteBtn?.addEventListener("click", closeNoteForm);
  dom.noteForm?.addEventListener("submit", saveNote);
  dom.notesList?.addEventListener("click", handleNoteActions);
  dom.resetJournalBtn?.addEventListener("click", closeJournalEditor);
  dom.journalForm?.addEventListener("submit", saveJournalForm);
  dom.journalFileInput?.addEventListener("change", handleJournalFilePick);
  dom.aiProviderInput?.addEventListener("change", () => {
    handleProviderChange();
    saveGeminiSettings(false);
  });
  dom.saveGeminiKeyBtn?.addEventListener("click", () => saveGeminiSettings(true));
  dom.clearGeminiKeyBtn?.addEventListener("click", clearGeminiSettings);
  dom.testGeminiBtn?.addEventListener("click", testGeminiConnection);
  dom.updateInsightBtn?.addEventListener("click", updateInsightCache);
  dom.clearInsightBtn?.addEventListener("click", clearInsightCache);
  dom.askAssistantBtn?.addEventListener("click", askAssistant);
  dom.assistantQuickPrompts?.addEventListener("click", (e) => {
    if (e.target.classList.contains("quick-prompt-btn")) {
      dom.assistantQuestionInput.value = e.target.textContent;
      askAssistant();
    }
  });
  dom.clearAssistantHistoryBtn?.addEventListener("click", clearAssistantHistory);
  dom.assistantModeTabs?.addEventListener("click", (event) => {
    const button = event.target.closest(".assistant-mode-tab");
    if (!button) return;
    setAssistantMode(button.dataset.assistantMode || "coach");
  });
  dom.assistantShortcutMenu?.addEventListener("click", handleAssistantShortcutClick);
  dom.assistantQuestionInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      askAssistant();
    }
  });
  dom.aiChatToggleBtn?.addEventListener("click", toggleAiChatPopup);
  dom.closeAiChatBtn?.addEventListener("click", closeAiChatPopup);
  dom.askAiPopupBtn?.addEventListener("click", askAiPopup);
  dom.saveAiPopupMaterialBtn?.addEventListener("click", saveAiPopupAsMaterial);
  dom.clearAiPopupBtn?.addEventListener("click", clearAiPopupChat);
  dom.aiPopupQuestionInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      askAiPopup();
    }
  });
  dom.fullscreenAnalyzeBtn?.addEventListener("click", analyzeActiveChart);
  dom.fullscreenDeleteBtn?.addEventListener("click", deleteActiveFullscreenItem);
  document.addEventListener("click", closeOpenCardMenus);
  document.addEventListener("click", () => closeOpenFilterMenus());
  dom.selectModeBtn.addEventListener("click", enterSelectMode);
  dom.cancelSelectBtn.addEventListener("click", exitSelectMode);
  dom.bulkDeleteBtn.addEventListener("click", deleteSelectedItems);

  dom.navButtons.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  dom.closeFormBtn.addEventListener("click", () => closeForm());

  dom.dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeForm();
  });

  dom.form.addEventListener("submit", saveForm);
  dom.titleInput.addEventListener("input", () => {
    state.autoTitleFromFile = false;
  });
  dom.deleteCurrentBtn.addEventListener("click", deleteCurrentItem);
  dom.typeInput.addEventListener("change", syncTypeFields);
  dom.mediaUrlInput.addEventListener("input", () => updatePreviewFromUrl());
  dom.fileInput.addEventListener("change", handleFilePick);
  dom.closeDocumentBtn.addEventListener("click", closeDocumentDialog);
  dom.downloadDocumentBtn.addEventListener("click", downloadActiveDocument);
  dom.openDocumentBtn.addEventListener("click", openActiveDocumentInNewTab);
  dom.fullscreenBackBtn.addEventListener("click", closeFullscreenViewer);
  dom.fullscreenCloseBtn.addEventListener("click", closeFullscreenViewer);
  dom.fullscreenExitBtn.addEventListener("click", closeFullscreenViewer);
  document.addEventListener("click", handleGlobalFullscreenControlClick, true);
  dom.fullscreenPrevBtn.addEventListener("click", () => showAdjacentImage(-1));
  dom.fullscreenNextBtn.addEventListener("click", () => showAdjacentImage(1));
  dom.fullscreenStage.addEventListener("touchstart", handleFullscreenTouchStart, { passive: true });
  dom.fullscreenStage.addEventListener("touchend", handleFullscreenTouchEnd, { passive: true });

  dom.documentDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDocumentDialog();
  });

  dom.fullscreenDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeFullscreenViewer();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOpenFilterMenus();
      closeSidebar();
    }
  });
}


function openSidebar() {
  if (!dom.sideDrawer || !dom.sidebarBackdrop) return;
  dom.sideDrawer.classList.add("is-open");
  dom.sideDrawer.setAttribute("aria-hidden", "false");
  dom.sidebarBackdrop.hidden = false;
  document.body.classList.add("sidebar-open");
}

function closeSidebar() {
  if (!dom.sideDrawer || !dom.sidebarBackdrop) return;
  dom.sideDrawer.classList.remove("is-open");
  dom.sideDrawer.setAttribute("aria-hidden", "true");
  dom.sidebarBackdrop.hidden = true;
  document.body.classList.remove("sidebar-open");
}

function initBackGuard() {
  try {
    if (!history.state?.tlm) history.replaceState({ tlm: true, view: state.view }, "", location.href);
    history.pushState({ tlm: true, guard: true, view: state.view }, "", location.href);
    window.addEventListener("popstate", handleAppBack);
  } catch {}
}

function handleAppBack() {
  if (closeTopLayerForBack()) {
    pushBackGuard();
    return;
  }
  if (state.view !== "library") {
    setView("library");
    pushBackGuard();
    return;
  }
  const now = Date.now();
  if (now - state.lastBackAt < 1600) {
    history.back();
    return;
  }
  state.lastBackAt = now;
  pushBackGuard();
}

function pushBackGuard() {
  try {
    history.pushState({ tlm: true, guard: true, view: state.view }, "", location.href);
  } catch {}
}

function closeTopLayerForBack() {
  if (dom.sideDrawer?.classList.contains("is-open")) { closeSidebar(); return true; }
  if (dom.fullscreenDialog?.open) { closeFullscreenViewer(); return true; }
  if (dom.dialog?.open) { closeForm(); return true; }
  if (dom.documentDialog?.open) { closeDocumentDialog(); return true; }
  if (dom.aiChatPopup && !dom.aiChatPopup.hidden) { closeAiChatPopup(); return true; }
  if (document.querySelector(".filter-menu:not([hidden])")) { closeOpenFilterMenus(); return true; }
  if (document.querySelector(".card-menu:not([hidden])")) { closeOpenCardMenus(); return true; }
  return false;
}

function loadItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveItems(items = state.items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.map(cleanItemForStorage)));
  invalidateRenderCache();
  refreshInsightCache();
}

function cleanItemForStorage(item) {
  const {
    data,
    file,
    blob,
    objectUrl,
    textPreview,
    mediaData,
    documentText,
    ...metadata
  } = item;
  return metadata;
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    state.category = saved.category || "Semua";
    state.status = saved.status || "Semua";
    state.fileType = saved.fileType || "Semua";
    state.mediaType = saved.mediaType || "Semua";
    state.query = saved.query || "";
    state.collectionFilter = saved.collectionFilter || "";
    state.sort = saved.sort || "pinned-newest";
    state.showArchived = Boolean(saved.showArchived);
    state.view = saved.view === "code" ? "library" : (saved.view || "library");
    dom.searchInput.value = state.query;
    if (dom.collectionFilterInput) dom.collectionFilterInput.value = state.collectionFilter;
    if (dom.sortSelect) dom.sortSelect.value = state.sort;
    if (dom.showArchivedInput) dom.showArchivedInput.checked = state.showArchived;
    setView(state.view, false);
  } catch {
    setView("library", false);
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    category: state.category,
    status: state.status,
    fileType: state.fileType,
    mediaType: state.mediaType,
    query: state.query,
    collectionFilter: state.collectionFilter,
    sort: state.sort,
    showArchived: state.showArchived,
    view: state.view
  }));
}

function fillSelect(select, options) {
  select.innerHTML = "";
  options.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

function renderPills() {
  renderPillSet(dom.categoryPills, ["Semua", ...categories], state.category, (value) => {
    state.category = value;
    resetGridLimits();
    saveSettings();
    renderPills();
    render();
  });

  renderPillSet(dom.statusPills, ["Semua", ...statuses], state.status, (value) => {
    state.status = value;
    resetGridLimits();
    saveSettings();
    renderPills();
    render();
  });

  renderPillSet(dom.typePills, fileTypes, state.fileType, (value) => {
    state.fileType = value;
    resetGridLimits();
    saveSettings();
    renderPills();
    render();
  });

  renderPillSet(dom.mediaTypePills, fileTypes.filter((value) => value !== "Kode"), state.mediaType, (value) => {
    state.mediaType = value;
    resetGridLimits();
    saveSettings();
    renderPills();
    render();
  });
}

function renderPillSet(container, values, activeValue, onPick) {
  if (!container) return;
  container.replaceChildren();
  container.classList.add("filter-dropdown-row");

  const wrap = document.createElement("div");
  wrap.className = "filter-dropdown";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "filter-toggle-button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = `<span>${escapeHtml(activeValue || "Semua")}</span><i aria-hidden="true"></i>`;

  const menu = document.createElement("div");
  menu.className = "filter-menu";
  menu.hidden = true;

  values.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `pill-button${value === activeValue ? " is-active" : ""}`;
    button.textContent = value;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(value === activeValue));
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onPick(value);
      closeOpenFilterMenus();
    });
    menu.append(button);
  });

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = menu.hidden;
    closeOpenFilterMenus(menu);
    menu.hidden = !willOpen;
    toggle.setAttribute("aria-expanded", String(willOpen));
  });

  wrap.append(toggle, menu);
  container.append(wrap);
}

function closeOpenFilterMenus(except = null) {
  document.querySelectorAll(".filter-menu:not([hidden])").forEach((menu) => {
    if (menu === except) return;
    menu.hidden = true;
    menu.parentElement?.querySelector(".filter-toggle-button")?.setAttribute("aria-expanded", "false");
  });
}

const GRID_BATCH_SIZE = 12;

function invalidateRenderCache(resetLimits = false) {
  state.itemsVersion += 1;
  state.filterCache = { key: "", items: null };
  if (resetLimits) resetGridLimits();
}

function resetGridLimits() {
  state.gridLimits = {};
}

function getGridKey(container) {
  return container?.id || "grid";
}

function setView(view, shouldRender = true) {
  state.view = ["library", "code", "media", "journal", "assistant", "statistics", "notes"].includes(view) ? view : "library";
  Object.entries(dom.views).forEach(([key, section]) => {
    const isActive = key === state.view;
    section.hidden = !isActive;
    section.classList.toggle("is-active", isActive);
  });
  dom.navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.view);
  });
  dom.sideNavButtons?.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.view);
  });
  saveSettings();
  if (shouldRender) scheduleRender();
}

let renderFrameId = 0;
function scheduleRender() {
  if (renderFrameId) cancelAnimationFrame(renderFrameId);
  renderFrameId = requestAnimationFrame(() => {
    renderFrameId = 0;
    render();
  });
}

function render() {
  revokeRenderedObjectUrls();
  const data = getRenderData();
  updateRenderCounters(data);
  renderActiveView(data);
  syncSelectControls();
}

function getRenderData() {
  const allMatches = getFilteredItems(state.items);
  const codeItems = allMatches.filter((item) => item.type === "Kode Indikator" || item.category === "Indikator");
  const mediaItems = allMatches
    .filter((item) => isMediaItem(item) || isDocumentItem(item))
    .filter((item) => state.mediaType === "Semua" || getItemFileType(item) === state.mediaType || (state.mediaType === "Dokumen" && isDocumentItem(item)));
  return { allMatches, codeItems, mediaItems };
}

function updateRenderCounters({ allMatches, codeItems, mediaItems }) {
  if (dom.libraryCount) dom.libraryCount.textContent = makeCount(allMatches.length);
  if (dom.codeCount) dom.codeCount.textContent = makeCount(codeItems.length);
  if (dom.mediaCount) dom.mediaCount.textContent = makeCount(mediaItems.length);
  if (dom.journalCount) dom.journalCount.textContent = `${state.journals.length} jurnal`;
}

function renderActiveView({ allMatches, codeItems, mediaItems }) {
  switch (state.view) {
    case "code":
      renderGrid(dom.codeGrid, codeItems);
      if (dom.codeEmpty) dom.codeEmpty.hidden = codeItems.length > 0;
      break;
    case "media":
      renderGrid(dom.mediaGrid, mediaItems);
      if (dom.mediaEmpty) dom.mediaEmpty.hidden = mediaItems.length > 0;
      break;
    case "journal":
      renderJournals();
      break;
    case "assistant":
      renderAssistantPanel();
      break;
    case "notes":
      renderNotes();
      break;
    case "statistics":
      renderStatistics(allMatches);
      break;

    case "library":
    default:
      renderGrid(dom.libraryGrid, allMatches);
      if (dom.libraryEmpty) dom.libraryEmpty.hidden = allMatches.length > 0;
      break;
  }
}

function getFilteredItems(items) {
  const canCache = items === state.items;
  const cacheKey = canCache ? [
    state.itemsVersion,
    state.category,
    state.status,
    state.fileType,
    state.collectionFilter,
    state.query,
    state.sort,
    state.showArchived
  ].join("|") : "";

  if (canCache && state.filterCache.key === cacheKey && Array.isArray(state.filterCache.items)) {
    return state.filterCache.items;
  }

  const query = state.query.toLowerCase();
  const collectionQuery = state.collectionFilter.toLowerCase();
  const result = [...items]
    .filter((item) => state.showArchived || !item.archived)
    .filter((item) => state.category === "Semua" || item.category === state.category)
    .filter((item) => state.status === "Semua" || item.status === state.status)
    .filter((item) => state.fileType === "Semua" || getItemFileType(item) === state.fileType || (state.fileType === "Dokumen" && isDocumentItem(item)))
    .filter((item) => !collectionQuery || String(item.collection || "").toLowerCase().includes(collectionQuery))
    .filter((item) => {
      if (!query) return true;
      return [
        item.title,
        item.type,
        item.category,
        item.status,
        item.collection,
        item.notes,
        item.code,
        item.mediaName,
        item.mediaUrl,
        item.mediaType,
        item.documentType,
        item.mediaSize,
        item.uploadedAt,
        item.documentText,
        ...(item.tags || []),
        ...(item.checklist || []).map((entry) => entry.text)
      ].some((part) => String(part || "").toLowerCase().includes(query));
    })
    .sort(compareItems);

  if (canCache) state.filterCache = { key: cacheKey, items: result };
  return result;
}

function compareItems(a, b) {
  if (state.sort === "pinned-newest") {
    if (Boolean(a.favorite) !== Boolean(b.favorite)) return a.favorite ? -1 : 1;
    return dateValue(b.updatedAt || b.createdAt) - dateValue(a.updatedAt || a.createdAt);
  }
  if (state.sort === "newest") return dateValue(b.updatedAt || b.createdAt) - dateValue(a.updatedAt || a.createdAt);
  if (state.sort === "oldest") return dateValue(a.updatedAt || a.createdAt) - dateValue(b.updatedAt || b.createdAt);
  if (state.sort === "title-asc") return String(a.title || "").localeCompare(String(b.title || ""), "id");
  if (state.sort === "title-desc") return String(b.title || "").localeCompare(String(a.title || ""), "id");
  if (state.sort === "status") return String(a.status || "").localeCompare(String(b.status || ""), "id");
  return 0;
}

function dateValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function renderGrid(container, items) {
  if (!container) return;
  container.replaceChildren();
  const gridKey = getGridKey(container);
  const currentLimit = state.gridLimits[gridKey] || GRID_BATCH_SIZE;
  const limit = Math.min(items.length, currentLimit);
  const fragment = document.createDocumentFragment();
  items.slice(0, limit).forEach((item) => fragment.append(createCard(item)));
  container.append(fragment);

  if (limit < items.length) {
    const loadMoreWrap = document.createElement("div");
    loadMoreWrap.className = "load-more-card";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost-button load-more-button";
    button.textContent = `Muat lagi ${Math.min(GRID_BATCH_SIZE, items.length - limit)} dari ${items.length - limit} item`;
    button.addEventListener("click", () => {
      state.gridLimits[gridKey] = limit + GRID_BATCH_SIZE;
      render();
    });
    loadMoreWrap.append(button);
    container.append(loadMoreWrap);
  }
}

function enterSelectMode() {
  state.selectMode = true;
  state.selectedIds.clear();
  render();
}

function exitSelectMode() {
  state.selectMode = false;
  state.selectedIds.clear();
  render();
}

function toggleSelectedItem(id, checked) {
  if (checked) {
    state.selectedIds.add(id);
  } else {
    state.selectedIds.delete(id);
  }
  syncSelectControls();
  const card = document.querySelector(`.library-card[data-id="${CSS.escape(id)}"]`);
  if (card) card.classList.toggle("is-selected", checked);
}

function syncSelectControls() {
  dom.selectModeBtn.hidden = state.selectMode;
  dom.bulkDeleteBtn.hidden = !state.selectMode;
  dom.cancelSelectBtn.hidden = !state.selectMode;
  dom.bulkDeleteBtn.disabled = state.selectedIds.size === 0;
  dom.bulkDeleteBtn.textContent = state.selectedIds.size
    ? `Hapus Terpilih (${state.selectedIds.size})`
    : "Hapus Terpilih";
}

async function deleteSelectedItems() {
  const ids = [...state.selectedIds];
  if (!ids.length) return;
  const confirmed = window.confirm(`Hapus ${ids.length} item terpilih?`);
  if (!confirmed) return;

  const deleted = await deleteItemsByIds(ids);
  if (deleted) exitSelectMode();
}

function createCard(item) {
  const card = dom.cardTemplate.content.firstElementChild.cloneNode(true);
  const mediaSlot = card.querySelector(".media-slot");
  const actionButton = card.querySelector(".copy-action");
  const fileLine = card.querySelector(".file-line");
  const selectAction = card.querySelector(".select-action");
  const isDocument = isDocumentItem(item);
  const isViewable = canOpenFullscreen(item);
  const isMarkdown = isDocument && getDocumentType(item) === "Markdown";
  const fileMetaLine = getFileMetaLine(item);

  card.dataset.id = item.id;
  card.classList.toggle("has-code", Boolean(item.code));
  card.classList.toggle("has-file", Boolean(fileMetaLine));
  card.classList.toggle("has-document", isDocument);
  card.classList.toggle("has-viewer", isViewable);
  card.classList.toggle("has-markdown", isMarkdown);
  card.classList.toggle("is-selectable", state.selectMode);
  card.classList.toggle("is-selected", state.selectedIds.has(item.id));
  card.querySelector(".category-tag").textContent = item.category;
  card.querySelector(".status-tag").textContent = item.status;
  card.querySelector(".status-tag").dataset.status = item.status;
  card.querySelector(".card-title").textContent = item.title;
  card.querySelector(".card-meta").textContent = `${item.type} • ${formatDate(item.updatedAt || item.createdAt)}`;
  fileLine.textContent = fileMetaLine;
  renderCardTags(card.querySelector(".card-tags"), item);
  card.querySelector(".card-notes").textContent = item.notes || "Tidak ada catatan.";
  renderChecklistPreview(card.querySelector(".checklist-preview"), item);
  renderRevisionLine(card.querySelector(".revision-line"), item);
  const codePreview = card.querySelector(".code-preview");
  codePreview.textContent = isMarkdown ? "Markdown tersimpan di IndexedDB." : item.code || "";
  if (isMarkdown) populateMarkdownPreview(item, codePreview);

  renderMediaSlot(mediaSlot, item);

  const menuWrap = card.querySelector(".card-menu-wrap");
  const menuToggle = card.querySelector(".menu-toggle-action");
  const cardMenu = card.querySelector(".card-menu");
  const editAction = card.querySelector(".edit-action");
  const copyAction = card.querySelector(".copy-action");
  const pinAction = card.querySelector(".pin-action");
  const archiveAction = card.querySelector(".archive-action");
  const exportAction = card.querySelector(".export-action");
  const deleteAction = card.querySelector(".delete-action");

  selectAction.checked = state.selectedIds.has(item.id);
  selectAction.addEventListener("change", () => toggleSelectedItem(item.id, selectAction.checked));
  menuToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleCardMenu(cardMenu);
  });
  menuWrap?.addEventListener("click", (event) => event.stopPropagation());
  editAction?.addEventListener("click", () => openForm(item.id));
  pinAction.textContent = item.favorite ? "Unpin" : "Pin";
  pinAction?.addEventListener("click", () => toggleFavorite(item.id));
  archiveAction.textContent = item.archived ? "Pulihkan" : "Arsip";
  archiveAction?.addEventListener("click", () => toggleArchive(item.id));
  exportAction?.addEventListener("click", () => exportSingleItem(item.id));
  deleteAction?.addEventListener("click", () => deleteItem(item.id));
  if (isViewable) {
    copyAction.textContent = "Lihat";
    copyAction?.addEventListener("click", () => showFullscreenViewer(item));
  } else if (item.code) {
    copyAction.textContent = "Salin";
    copyAction?.addEventListener("click", () => copyCode(item, copyAction));
  } else {
    copyAction.hidden = true;
  }

  return card;
}

function renderMediaSlot(slot, item) {
  slot.replaceChildren();
  const source = getMediaSource(item);
  const mediaKind = item.mediaKind || inferMediaKind(item);
  slot.dataset.itemId = item.id;

  if (isDocumentItem(item)) {
    const fallback = document.createElement("div");
    fallback.className = "media-fallback document-fallback";
    fallback.textContent = getDocumentMark(item);
    fallback.addEventListener("click", () => showFullscreenViewer(item));
    slot.append(fallback, makeMediaLabel(getDocumentType(item)));
    return;
  }

  if (mediaKind === "image") {
    const thumbSource = getThumbnailSource(item);
    if (source) {
      renderImageSlot(slot, item, source);
    } else if (thumbSource || getNativeUri(item)) {
      renderNativeThumbnailSlot(slot, item, thumbSource, "Gambar");
    } else if (item.fileId) {
      renderLoadingSlot(slot, item);
      loadItemObjectUrl(item).then((url) => {
        if (slot.dataset.itemId === item.id && url) renderImageSlot(slot, item, url);
      }).catch(() => renderLoadingSlot(slot, item));
    } else {
      renderLoadingSlot(slot, item);
    }
    return;
  }

  if (mediaKind === "video") {
    renderVideoSlot(slot, item, source);
    return;
  }

  const fallback = document.createElement("div");
  fallback.className = "media-fallback";
  fallback.textContent = getFallbackMark(item);
  slot.append(fallback, makeMediaLabel(item.type.replace(" Pembelajaran", "")));
}

function renderImageSlot(slot, item, source) {
  slot.replaceChildren();
  const img = document.createElement("img");
  img.loading = "lazy";
  img.alt = item.title;
  img.src = source;
  img.addEventListener("click", () => showFullscreenViewer(item));
  img.addEventListener("error", () => {
    const thumbSource = getThumbnailSource(item);
    if (thumbSource && img.src !== thumbSource) img.src = thumbSource;
    else renderNativeThumbnailSlot(slot, item, thumbSource, "Gambar");
  }, { once: true });
  slot.append(img, makeMediaLabel("Gambar"));
}

function renderNativeThumbnailSlot(slot, item, thumbSource = "", labelText = "Gambar") {
  slot.replaceChildren();
  const button = document.createElement("button");
  button.type = "button";
  button.className = `media-fallback native-thumb-slot ${labelText === "Video" ? "video-fallback" : ""}`.trim();
  button.dataset.nativeThumbItemId = item.id;
  button.textContent = labelText === "Video" ? "▶" : getFallbackMark(item);
  if (thumbSource) {
    button.classList.add("has-native-thumb");
    button.style.backgroundImage = `linear-gradient(rgba(0,0,0,.10), rgba(0,0,0,.38)), url("${thumbSource}")`;
  } else {
    queueNativeThumbnail(item, button);
  }
  button.addEventListener("click", () => showFullscreenViewer(item));
  slot.append(button, makeMediaLabel(labelText));
}

function renderVideoSlot(slot, item, source) {
  slot.replaceChildren();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "media-fallback video-fallback";
  button.innerHTML = `<span class="video-play-mark" aria-hidden="true">▶</span>`;
  button.setAttribute("aria-label", `Buka video ${item.title || ""}`.trim());
  button.dataset.nativeThumbItemId = item.id;
  const thumbSource = getThumbnailSource(item);
  if (thumbSource) {
    button.classList.add("has-video-thumb", "has-native-thumb");
    button.style.backgroundImage = `linear-gradient(rgba(0,0,0,.12), rgba(0,0,0,.42)), url("${thumbSource}")`;
  } else if (getNativeUri(item)) {
    queueNativeThumbnail(item, button);
  } else {
    queueVideoThumbnail(item, button, source);
  }
  button.addEventListener("click", () => showFullscreenViewer(item));
  slot.append(button, makeMediaLabel("Video"));
}

function renderLoadingSlot(slot, item) {
  slot.replaceChildren();
  const fallback = document.createElement("div");
  fallback.className = "media-fallback";
  fallback.textContent = getFallbackMark(item);
  slot.append(fallback, makeMediaLabel("Memuat"));
}

function makeMediaLabel(text) {
  const label = document.createElement("span");
  label.className = "media-label";
  label.textContent = text;
  return label;
}

function getFallbackMark(item) {
  if (item.type === "Kode Indikator" || item.category === "Indikator") return "{ }";
  if (item.type === "Video Pembelajaran") return "▶";
  if (item.type === "Gambar Chart") return "▣";
  if (isDocumentItem(item)) return getDocumentMark(item);
  return "TL";
}

function getMediaSource(item) {
  return toWebViewSource(item.objectUrl || item.mediaUrl || "");
}

function getNativeUri(item) {
  const direct = item.nativeUri || item.externalUri || "";
  if (direct) return direct;
  const mediaUrl = String(item.mediaUrl || "");
  return isContentUri(mediaUrl) ? mediaUrl : "";
}

function getThumbnailSource(item) {
  return toWebViewSource(item.thumbnailUrl || item.thumbnailUri || item.videoThumb || item.imageThumb || "");
}

function getNativeWebViewSource(item) {
  const nativeUri = getNativeUri(item);
  if (!nativeUri) return "";
  return isContentUri(nativeUri) ? nativeUri : toWebViewSource(nativeUri);
}

function isContentUri(value) {
  return String(value || "").startsWith("content://");
}

function toWebViewSource(source) {
  const value = String(source || "");
  if (!value || isContentUri(value)) return "";
  if (value.startsWith("file://") && window.Capacitor?.convertFileSrc) {
    try { return window.Capacitor.convertFileSrc(value); } catch {}
  }
  return value;
}

function inferMediaKind(item) {
  const source = getMediaSource(item).toLowerCase();
  if (item.type === "Gambar Chart" || item.category === "Gambar Chart") return "image";
  if (item.type === "Video Pembelajaran" || item.category === "Video") return "video";
  if (item.type === "Dokumen" || ["Dokumen", "PDF", "Markdown", "Word", "Excel", "PowerPoint"].includes(item.category)) return "document";
  if (/\.(png|jpe?g|webp|gif|svg)(\?.*)?$/.test(source) || source.startsWith("data:image/")) return "image";
  if (/\.(mp4|mkv|webm|ogg|mov|m4v|3gp|avi)(\?.*)?$/.test(source) || source.startsWith("data:video/")) return "video";
  if (/\.(md|txt|pdf|docx?|xlsx?|csv|pptx?)(\?.*)?$/.test(source) || source.startsWith("data:application/pdf") || source.startsWith("data:text/markdown") || source.startsWith("data:text/plain") || source.startsWith("data:text/csv") || source.startsWith("data:application/msword") || source.startsWith("data:application/vnd.openxmlformats-officedocument.wordprocessingml.document") || source.startsWith("data:application/vnd.ms-excel") || source.startsWith("data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") || source.startsWith("data:application/vnd.ms-powerpoint") || source.startsWith("data:application/vnd.openxmlformats-officedocument.presentationml.presentation")) return "document";
  return "";
}

function calculateStreak() {
  const dates = new Set();
  state.journals.forEach(j => { if(j && j.date) dates.add(j.date); });
  state.personalNotes.forEach(n => { if(n && n.date) dates.add(n.date); });
  
  const sortedDates = Array.from(dates).sort().reverse();
  if (sortedDates.length === 0) return 0;
  
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  let streak = 0;
  let currentDate = new Date(sortedDates[0]);
  
  if (sortedDates[0] !== todayStr && sortedDates[0] !== yesterdayStr) {
    return 0;
  }
  
  for (let i = 0; i < sortedDates.length; i++) {
    const dStr = sortedDates[i];
    const expectedStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;
    if (dStr === expectedStr) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function renderDashboard(items) {
  if (!dom.dashboardGrid) return;
  const totals = {
    total: items.length,
    code: items.filter((item) => getItemFileType(item) === "Kode").length,
    image: items.filter((item) => getItemFileType(item) === "Gambar").length,
    video: items.filter((item) => getItemFileType(item) === "Video").length,
    pdf: items.filter((item) => getItemFileType(item) === "PDF").length,
    word: items.filter((item) => getItemFileType(item) === "Word").length,
    favorite: items.filter((item) => item.favorite).length,
    archived: state.items.filter((item) => item.archived).length,
    journal: state.journals.length
  };

  dom.dashboardGrid.replaceChildren(
    makeStatCard("🔥 Streak", calculateStreak() + " Hari"),
    makeStatCard("Total File", totals.total),
    makeStatCard("Kode", totals.code),
    makeStatCard("Gambar", totals.image),
    makeStatCard("Video", totals.video),
    makeStatCard("PDF", totals.pdf),
    makeStatCard("Jurnal", totals.journal)
  );
}

function renderStatistics(items) {
  renderDashboard(items);
  const card = document.createElement("div");
  card.className = "stat-card";

  const title = document.createElement("span");
  title.textContent = label;

  const number = document.createElement("strong");
  number.textContent = value;

  card.append(title, number);
  return card;
}


function renderStatistics(items) {
  if (!dom.statisticsViewContent) return;
  const total = items.length;
  const totals = {
    video: items.filter((item) => getItemFileType(item) === "Video").length,
    pdf: items.filter((item) => getItemFileType(item) === "PDF").length,
    image: items.filter((item) => getItemFileType(item) === "Gambar").length,
    journal: state.journals.length
  };
  const unread = items.filter((item) => item.status === "Belum dibaca").length;
  const learned = items.filter((item) => ["Dipelajari", "Dipakai", "Selesai"].includes(item.status)).length;
  const used = items.filter((item) => item.status === "Dipakai").length;
  const videoWatched = items.filter((item) => getItemFileType(item) === "Video" && item.status !== "Belum dibaca").length;
  const pdfOpened = items.filter((item) => getItemFileType(item) === "PDF" && item.status !== "Belum dibaca").length;
  const progressPercent = total ? Math.round((learned / total) * 100) : 0;
  const videoPercent = totals.video ? Math.round((videoWatched / totals.video) * 100) : 0;
  const pdfPercent = totals.pdf ? Math.round((pdfOpened / totals.pdf) * 100) : 0;

  const journalStats = getJournalStatistics();
  const monthInfo = getCurrentMonthInfo();
  const calendarHtml = buildStatisticsCalendar(monthInfo.year, monthInfo.month);
  const performanceRing = journalStats.entryCount ? Math.round((journalStats.win / journalStats.entryCount) * 100) : 0;

  dom.statisticsViewContent.innerHTML = `
    <div class="stats-summary-grid">
      ${makeStatisticsCard("Total Materi", total, "stack")}
      ${makeStatisticsCard("Video", totals.video, "video")}
      ${makeStatisticsCard("PDF", totals.pdf, "pdf")}
      ${makeStatisticsCard("Gambar", totals.image, "image")}
      ${makeStatisticsCard("Jurnal", totals.journal, "journal")}
    </div>

    <div class="stats-progress-grid">
      ${makeProgressStat("Sudah dibaca", learned, progressPercent)}
      ${makeProgressStat("Belum dibaca", unread, total ? Math.round((unread / total) * 100) : 0)}
      ${makeProgressStat("Video ditonton", videoWatched, videoPercent)}
      ${makeProgressStat("PDF terbuka", pdfOpened, pdfPercent)}
    </div>

    <section class="stats-panel">
      <h3>Performa Jurnal Trading</h3>
      <div class="journal-performance-grid">
        ${makeJournalStat("Total Entry", journalStats.entryCount, "chart")}
        ${makeJournalStat("Win Rate", `${journalStats.winRate}%`, "target")}
        ${makeJournalStat("Win / Loss", `${journalStats.win} / ${journalStats.loss}`, "ratio")}
        ${makeJournalStat("BE / No Entry", `${journalStats.be} / ${journalStats.noEntry}`, "money")}
        ${makeJournalStat("Total Profit", formatTradeAmount(journalStats.totalProfit), "money")}
        ${makeJournalStat("Total Loss", formatTradeAmount(journalStats.totalLoss), "money")}
        ${makeJournalStat("Net P/L", formatTradeAmount(journalStats.netProfit), "target")}
      </div>
    </section>

    <section class="stats-panel calendar-panel">
      <div class="calendar-title calendar-title-with-nav">
        <button type="button" class="calendar-nav-button" data-stats-month-nav="-1" aria-label="Bulan sebelumnya">‹</button>
        <div>
          <h3>${monthInfo.label}</h3>
          <p>Monthly Journal • ${journalStats.monthJournalCount} jurnal</p>
        </div>
        <button type="button" class="calendar-nav-button" data-stats-month-nav="1" aria-label="Bulan berikutnya">›</button>
      </div>
      ${calendarHtml}
    </section>

    <div class="stats-lower-grid">
      <section class="stats-panel stat-donut-card">
        <h3>Performa Bulanan</h3>
        <div class="donut-wrap">
          <div class="donut-ring" style="--value:${performanceRing}"><strong>${performanceRing}%</strong><span>Win Rate</span></div>
          <div class="donut-legend">
            <span><i class="legend-profit"></i>Win ${journalStats.win}</span>
            <span><i class="legend-loss"></i>Loss ${journalStats.loss}</span>
            <span><i class="legend-neutral"></i>BE ${journalStats.be}</span>
          </div>
        </div>
      </section>

      <section class="stats-panel progress-learning-card">
        <h3>Progress Belajar</h3>
        <div class="learning-line"><span>Total Materi</span><strong>${total}</strong></div>
        <div class="learning-progress"><i style="width:${progressPercent}%"></i></div>
        <div class="learning-percent">${progressPercent}%</div>
        <div class="learning-list">
          <span>Sudah dibaca <strong>${learned}</strong></span>
          <span>Belum dibaca <strong>${unread}</strong></span>
          <span>Dipakai <strong>${used}</strong></span>
        </div>
      </section>
    </div>
  `;
  bindStatisticsCalendarEvents();
  bindDashboardInteractions();
  requestAnimationFrame(() => animateDashboard());
}

function makeStatisticsCard(label, value, type) {
  return `<article class="stats-card" data-dashboard-filter="${label}"><span class="stats-icon stats-icon-${type}"></span><p>${label}</p><strong class="animate-count-up" data-target="${value}">0</strong></article>`;
}

function makeProgressStat(label, value, percent) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  return `<article class="progress-stat" data-dashboard-filter="${label}"><div class="mini-ring" style="--value:${safePercent}"><span>${safePercent}%</span></div><div><p>${label}</p><strong class="animate-count-up" data-target="${value}">0</strong></div></article>`;
}

function makeJournalStat(label, value, type) {
  return `<article class="journal-stat" data-dashboard-filter="${label}"><span class="journal-stat-icon journal-stat-${type}"></span><p>${label}</p><strong>${value}</strong></article>`;
}

function animateDashboard() {
  const duration = 1200;
  dom.statisticsViewContent.querySelectorAll(".animate-count-up").forEach(el => {
    const target = parseFloat(el.dataset.target);
    if (isNaN(target)) {
      el.textContent = el.dataset.target;
      return;
    }
    const start = performance.now();
    requestAnimationFrame(function update(time) {
      let progress = (time - start) / duration;
      if (progress > 1) progress = 1;
      const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      el.textContent = Math.floor(target * ease);
      if (progress < 1) requestAnimationFrame(update);
      else el.textContent = el.dataset.target;
    });
  });

  dom.statisticsViewContent.querySelectorAll(".mini-ring, .donut-ring").forEach(el => {
    const targetVal = parseFloat(el.style.getPropertyValue('--value')) || 0;
    el.style.setProperty('--value', 0);
    const start = performance.now();
    requestAnimationFrame(function update(time) {
      let progress = (time - start) / duration;
      if (progress > 1) progress = 1;
      const ease = 1 - Math.pow(1 - progress, 3);
      el.style.setProperty('--value', targetVal * ease);
      if (progress < 1) requestAnimationFrame(update);
      else el.style.setProperty('--value', targetVal);
    });
  });
  
  dom.statisticsViewContent.querySelectorAll(".learning-progress i").forEach(el => {
    const targetWidth = parseFloat(el.style.width) || 0;
    el.style.width = '0%';
    const start = performance.now();
    requestAnimationFrame(function update(time) {
      let progress = (time - start) / duration;
      if (progress > 1) progress = 1;
      const ease = 1 - Math.pow(1 - progress, 3);
      el.style.width = (targetWidth * ease) + '%';
      if (progress < 1) requestAnimationFrame(update);
      else el.style.width = targetWidth + '%';
    });
  });
}

function bindDashboardInteractions() {
  dom.statisticsViewContent.querySelectorAll("[data-dashboard-filter]").forEach(card => {
    card.addEventListener("click", () => {
      const filter = card.dataset.dashboardFilter;
      if (filter === "Jurnal") {
        setView("journal");
        return;
      }
      if (filter === "Video" || filter === "PDF" || filter === "Gambar") {
        state.fileType = filter;
        state.status = "Semua";
        state.sort = "pinned-newest";
        resetGridLimits();
        saveSettings();
        renderPills();
        setView("library");
        return;
      }
      if (filter === "Belum dibaca") {
        state.status = "Belum dibaca";
        state.fileType = "Semua";
        resetGridLimits();
        saveSettings();
        renderPills();
        setView("library");
        return;
      }
      if (filter === "Sudah dibaca") {
        state.status = "Selesai";
        state.fileType = "Semua";
        resetGridLimits();
        saveSettings();
        renderPills();
        setView("library");
      }
    });
  });
}

function getJournalStatistics() {
  const monthInfo = getCurrentMonthInfo();
  const monthPrefix = `${monthInfo.year}-${String(monthInfo.month + 1).padStart(2, "0")}`;
  const monthJournals = state.journals.filter((journal) => String(journal.date || "").startsWith(monthPrefix));
  return {
    ...calculateJournalStats(monthJournals),
    monthJournalCount: monthJournals.length
  };
}

function calculateJournalStats(source = []) {
  const win = source.filter((journal) => journal.result === "Win").length;
  const loss = source.filter((journal) => journal.result === "Loss").length;
  const be = source.filter((journal) => journal.result === "BE").length;
  const noEntry = source.filter((journal) => journal.result === "Tidak entry").length;
  const entryCount = source.filter((journal) => journal.result !== "Tidak entry").length;
  const decided = win + loss;
  const totalProfit = source.reduce((sum, journal) => sum + parseTradeAmount(journal.profit), 0);
  const totalLoss = source.reduce((sum, journal) => sum + parseTradeAmount(journal.loss), 0);
  const netProfit = totalProfit - totalLoss;
  return {
    win,
    loss,
    be,
    noEntry,
    entryCount,
    winRate: decided ? Math.round((win / decided) * 100) : 0,
    totalProfit,
    totalLoss,
    netProfit,
    averageProfit: win ? totalProfit / win : 0,
    averageLoss: loss ? totalLoss / loss : 0
  };
}

function getCurrentMonthInfo() {
  const now = new Date();
  if (!Number.isInteger(state.statsCalendarYear)) state.statsCalendarYear = now.getFullYear();
  if (!Number.isInteger(state.statsCalendarMonth)) state.statsCalendarMonth = now.getMonth();
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return {
    year: state.statsCalendarYear,
    month: state.statsCalendarMonth,
    label: `${monthNames[state.statsCalendarMonth]} ${state.statsCalendarYear}`
  };
}

function shiftStatisticsMonth(offset) {
  const current = getCurrentMonthInfo();
  const next = new Date(current.year, current.month + offset, 1);
  state.statsCalendarYear = next.getFullYear();
  state.statsCalendarMonth = next.getMonth();
  renderStatistics(getFilteredItems(state.items));
}

function buildStatisticsCalendar(year, month) {
  const dayLabels = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB", "MINGGUAN"];
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay();
  const totalDays = last.getDate();
  const cells = [];
  for (let i = 0; i < startDay; i += 1) cells.push({ empty: true });
  for (let day = 1; day <= totalDays; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const journals = state.journals.filter((journal) => journal.date === date);
    cells.push({ day, date, journals });
  }
  while (cells.length % 7 !== 0) cells.push({ empty: true });
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const header = dayLabels.map((label) => `<div class="cal-head">${label}</div>`).join("");
  const rows = weeks.map((week) => {
    const win = week.flatMap((cell) => cell.journals || []).filter((journal) => journal.result === "Win").length;
    const loss = week.flatMap((cell) => cell.journals || []).filter((journal) => journal.result === "Loss").length;
    const weekClass = win > loss ? "is-win" : loss > win ? "is-loss" : "";
    const weekText = win || loss ? `${win}W / ${loss}L` : "No Trade";
    return week.map((cell) => makeCalendarCell(cell)).join("") + `<div class="cal-cell cal-week ${weekClass}">${weekText}</div>`;
  }).join("");
  return `<div class="statistics-calendar">${header}${rows}</div>`;
}

function makeCalendarCell(cell) {
  if (cell.empty) return `<div class="cal-cell is-empty"></div>`;
  const journals = cell.journals || [];
  const hasWin = journals.some((journal) => journal.result === "Win");
  const hasLoss = journals.some((journal) => journal.result === "Loss");
  const hasBe = journals.some((journal) => journal.result === "BE");
  const cls = hasWin ? "is-win" : hasLoss ? "is-loss" : hasBe ? "is-be" : "";
  const label = journals.length ? (journals.length > 1 ? `${journals.length} jurnal` : journals[0].result || "Jurnal") : "No Trade";
  if (!journals.length) return `<div class="cal-cell ${cls}"><strong>${cell.day}</strong><span>${label}</span></div>`;
  return `<button type="button" class="cal-cell ${cls} is-clickable" data-journal-date="${cell.date}"><strong>${cell.day}</strong><span>${label}</span></button>`;
}

function bindStatisticsCalendarEvents() {
  dom.statisticsViewContent?.querySelectorAll("[data-journal-date]").forEach((button) => {
    button.addEventListener("click", () => openJournalDate(button.dataset.journalDate));
  });
  dom.statisticsViewContent?.querySelectorAll("[data-stats-month-nav]").forEach((button) => {
    button.addEventListener("click", () => shiftStatisticsMonth(Number(button.dataset.statsMonthNav) || 0));
  });
}

function openJournalDate(date) {
  const journals = state.journals.filter((journal) => journal.date === date);
  if (!journals.length) return;
  state.journalOpenDate = date;
  state.journalOpenId = journals.length === 1 ? journals[0].id : "";
  setView("journal");
  render();
  requestAnimationFrame(() => {
    document.querySelector(`[data-journal-date-group="${CSS.escape(date)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

function openForm(id = null) {
  const item = id ? state.items.find((entry) => entry.id === id) : null;
  resetForm();

  if (item) {
    dom.formMode.textContent = "Edit";
    dom.itemId.value = item.id;
    dom.titleInput.value = item.title;
    dom.typeInput.value = item.type;
    dom.categoryInput.value = item.category;
    dom.statusInput.value = item.status;
    dom.collectionInput.value = item.collection || "";
    dom.tagsInput.value = (item.tags || []).join(", ");
    dom.mediaUrlInput.value = item.mediaUrl || "";
    dom.notesInput.value = item.notes || "";
    dom.checklistInput.value = checklistToText(item.checklist || []);
    dom.codeInput.value = item.code || "";
    dom.deleteCurrentBtn.hidden = false;
    state.pendingMedia = null;
    updatePreviewForItem(item);
  } else {
    dom.formMode.textContent = "Tambah";
  }

  syncTypeFields();
  showDialog();
  requestAnimationFrame(() => dom.titleInput.focus());
}

function resetForm() {
  dom.form.reset();
  dom.itemId.value = "";
  dom.typeInput.value = "Materi Trading";
  dom.categoryInput.value = "SMC";
  dom.statusInput.value = "Belum dibaca";
  dom.fileMeta.textContent = "PNG, JPG, WEBP, MP4, MKV, WEBM, MD, TXT, DOC, DOCX, PDF, XLS, XLSX, CSV, PPT, PPTX";
  dom.compressImageInput.checked = false;
  dom.formMessage.textContent = "";
  dom.deleteCurrentBtn.hidden = true;
  state.pendingMedia = null;
  state.autoTitleFromFile = false;
  revokePreviewObjectUrl();
  clearPreview();
}

function showDialog() {
  if (typeof dom.dialog.showModal === "function") {
    dom.dialog.showModal();
  } else {
    dom.dialog.setAttribute("open", "");
  }
}

function closeForm() {
  if (dom.dialog.open && typeof dom.dialog.close === "function") {
    dom.dialog.close();
  } else {
    dom.dialog.removeAttribute("open");
  }
  resetForm();
}

function setScanStorageMessage(message) {
  if (dom.scanStorageMessage) dom.scanStorageMessage.textContent = message || "";
}

function setScanProgress(update = {}) {
  const previous = state.scanProgress || {
    found: 0,
    imported: 0,
    skipped: 0,
    duplicates: 0,
    failed: 0,
    errors: 0,
    message: ""
  };
  state.scanProgress = { ...previous, ...update };
  const progress = state.scanProgress;
  const parts = [
    progress.message || "Memindai file...",
    `ditemukan ${progress.found || 0}`,
    `masuk ${progress.imported || 0}`,
    `duplikat ${progress.duplicates || 0}`,
    `dilewati ${progress.skipped || 0}`,
    `error ${progress.failed || progress.errors || 0}`
  ];
  setScanStorageMessage(parts.join(" • "));
}

function finishScanProgress(summary) {
  const found = summary.found || 0;
  const imported = summary.imported || 0;
  const duplicates = summary.duplicates || 0;
  const failed = summary.failed || summary.errors || 0;
  const skipped = summary.skipped || 0;
  setScanStorageMessage(`Scan selesai: total ditemukan ${found} • berhasil masuk ${imported} • duplikat dilewati ${duplicates} • gagal masuk ${failed}${skipped ? ` • dilewati ${skipped}` : ""}.`);
}

async function scanStorageFiles() {
  setScanStorageMessage("");
  state.scanProgress = null;

  if (window.TradingStorageScanner && typeof window.TradingStorageScanner.scanFiles === "function") {
    try {
      setScanProgress({ message: "Meminta izin Android...", found: 0, imported: 0, skipped: 0, duplicates: 0, failed: 0, errors: 0 });
      window.TradingStorageScanner.scanFiles();
      return;
    } catch (error) {
      setScanStorageMessage("Scan native gagal dibuka. Memakai pemilih file manual.");
    }
  }

  if (window.showDirectoryPicker) {
    try {
      const directory = await window.showDirectoryPicker({ mode: "read" });
      setScanProgress({ message: "Memindai file...", found: 0, imported: 0, skipped: 0, duplicates: 0, failed: 0, errors: 0 });
      const files = await collectSupportedFilesFromDirectory(directory);
      await importScannedFiles(files);
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        setScanStorageMessage("Scan dibatalkan.");
        return;
      }
    }
  }
  dom.storageScanInput?.click();
}

async function handleNativeStorageScanResult(event) {
  const detail = event?.detail || {};
  const status = detail.status || "";
  const message = detail.message || "";

  if (status === "permission_required") {
    setScanProgress({ message: message || "Meminta izin Android...", found: Number(detail.found || 0) });
    return;
  }

  if (status === "progress") {
    setScanProgress({ message: message || "Memindai file...", found: Number(detail.found || 0), errors: Number(detail.errors || 0) });
    return;
  }

  if (status === "denied") {
    setScanStorageMessage(message || "Izin storage ditolak.");
    return;
  }

  if (status === "error") {
    setScanStorageMessage(message || "Scan storage gagal.");
    return;
  }

  if (status === "success") {
    const files = Array.isArray(detail.files) ? detail.files : [];
    setScanProgress({ message: "Memasukkan file ke Library...", found: Number(detail.found || files.length || 0), errors: Number(detail.errors || 0) });
    await importNativeScannedFiles(files, { found: Number(detail.found || files.length || 0), errors: Number(detail.errors || 0) });
    return;
  }

  if (message) setScanStorageMessage(message);
}


window.scanStorageFiles = scanStorageFiles;

async function handleStorageScanInput() {
  const files = [...(dom.storageScanInput?.files || [])];
  await importScannedFiles(files);
  if (dom.storageScanInput) dom.storageScanInput.value = "";
}

async function collectSupportedFilesFromDirectory(directoryHandle, limit = 800) {
  const files = [];
  async function walk(handle) {
    for await (const entry of handle.values()) {
      if (files.length >= limit) return;
      if (entry.kind === "file") {
        const file = await entry.getFile();
        if (isSupportedScanFile(file)) files.push(file);
      } else if (entry.kind === "directory") {
        await walk(entry);
      }
    }
  }
  await walk(directoryHandle);
  return files;
}

function isSupportedScanFile(file) {
  return SUPPORTED_SCAN_EXTENSIONS.has(getFileExtension(file.name)) || isImageFile(file) || isVideoFile(file) || isDocumentFile(file);
}

async function importScannedFiles(files) {
  const supported = [...files].filter(isSupportedScanFile);
  const totalFound = supported.length;
  if (!supported.length) {
    setScanStorageMessage("Tidak ada file yang cocok.");
    return;
  }
  setScanProgress({ message: "Memasukkan file ke Library...", found: totalFound, imported: 0, skipped: 0, duplicates: 0, failed: 0 });
  const now = new Date().toISOString();
  const createdItems = [];
  const createdFileIds = [];
  const batchHashes = new Set();
  let skipped = 0;
  let duplicates = 0;
  let failed = 0;

  try {
    for (const file of supported) {
      const pending = await makePendingMedia(file, { compressImage: false });
      if (!pending) { skipped += 1; continue; }
      if (pending.fileHash && (findDuplicateByHash(pending.fileHash) || batchHashes.has(pending.fileHash))) {
        skipped += 1;
        duplicates += 1;
        setScanProgress({ found: totalFound, imported: createdItems.length, skipped, duplicates, failed });
        continue;
      }
      if (pending.fileHash) batchHashes.add(pending.fileHash);

      const id = createId();
      const fileId = createId();
      const documentType = pending.documentType || "";
      const item = {
        id,
        title: fileTitleFromName(pending.name),
        type: getTypeForPendingMedia(pending),
        category: getCategoryForPendingMedia(pending),
        status: "Belum dibaca",
        collection: "Scan HP",
        tags: ["Scan HP"],
        notes: "File masuk dari scan storage HP dengan izin pengguna.",
        checklist: [],
        code: "",
        mediaUrl: "",
        fileId,
        mediaKind: pending.kind,
        mediaName: pending.name,
        mediaType: pending.type,
        mediaSize: pending.size,
        documentType,
        documentText: pending.documentText || "",
        fileHash: pending.fileHash || "",
        source: "storage-scan",
        scannedAt: now,
        favorite: false,
        archived: false,
        revisionHistory: [],
        uploadedAt: now,
        createdAt: now,
        updatedAt: now
      };

      await putFileRecord({
        id: fileId,
        itemId: id,
        blob: pending.file,
        name: pending.name,
        type: pending.type,
        size: pending.size,
        kind: pending.kind,
        documentType,
        documentText: pending.documentText || "",
        fileHash: pending.fileHash || "",
        source: "storage-scan",
        uploadedAt: now
      });

      createdFileIds.push(fileId);
      createdItems.push(item);
      if (createdItems.length % 25 === 0) setScanProgress({ found: totalFound, imported: createdItems.length, skipped, duplicates, failed });
    }

    if (!createdItems.length) {
      finishScanProgress({ found: totalFound, imported: 0, duplicates, skipped, failed });
      return;
    }

    state.items = [...createdItems, ...state.items];
    saveItems();
    resetGridLimits();
    setView("library", false);
    render();
    finishScanProgress({ found: totalFound, imported: createdItems.length, duplicates, skipped, failed });
  } catch {
    await Promise.all(createdFileIds.map((fileId) => deleteFileRecord(fileId).catch(() => {})));
    failed += 1;
    finishScanProgress({ found: totalFound, imported: createdItems.length, duplicates, skipped, failed });
  }
}

async function importNativeScannedFiles(files, scanStats = {}) {
  const supported = [...files].filter(isSupportedNativeScanFile);
  const totalFound = Number(scanStats.found || files.length || supported.length || 0);
  if (!supported.length) {
    finishScanProgress({ found: totalFound, imported: 0, duplicates: 0, skipped: files.length, failed: Number(scanStats.errors || 0) });
    return;
  }

  const now = new Date().toISOString();
  const createdItems = [];
  const batchHashes = new Set();
  let skipped = 0;
  let duplicates = 0;
  let failed = Number(scanStats.errors || 0);

  for (const nativeFile of supported) {
    const name = nativeFile.name || nativeFile.displayName || "File Storage";
    const uri = nativeFile.uri || nativeFile.contentUri || "";
    if (!uri) { skipped += 1; failed += 1; continue; }

    const kind = getNativeScanKind(nativeFile);
    const documentType = kind === "document" ? getDocumentTypeFromFile({ name, type: nativeFile.mimeType || nativeFile.type || "" }) : "";
    const fileHash = nativeFile.fileHash || nativeFile.dedupKey || buildNativeScanDedupKey(nativeFile);
    const dedupKey = nativeFile.dedupKey || fileHash;

    if (findDuplicateByHash(fileHash) || findDuplicateNativeFile(nativeFile, dedupKey) || batchHashes.has(fileHash) || state.items.some((item) => item.nativeUri === uri || item.externalUri === uri || item.mediaUrl === uri)) {
      skipped += 1;
      duplicates += 1;
      continue;
    }
    batchHashes.add(fileHash);

    const item = {
      id: createId(),
      title: fileTitleFromName(name),
      type: getTypeForNativeScanKind(kind),
      category: getCategoryForNativeScanKind(kind, documentType),
      status: "Belum dibaca",
      collection: "Scan HP",
      tags: ["Scan HP"],
      notes: "File masuk dari scan storage HP dengan izin pengguna.",
      checklist: [],
      code: "",
      mediaUrl: "",
      nativeUri: uri,
      externalUri: uri,
      thumbnailUrl: nativeFile.thumbnailUri || nativeFile.thumbnailUrl || "",
      fileId: "",
      mediaKind: kind,
      mediaName: name,
      mediaType: nativeFile.mimeType || nativeFile.type || getMimeForFileExtension(name) || "",
      mediaSize: Number(nativeFile.size || 0),
      documentType,
      documentText: "",
      fileHash,
      dedupKey,
      nativePath: nativeFile.path || "",
      nativeModifiedAt: Number(nativeFile.modifiedAt || nativeFile.dateModified || 0),
      source: "storage-scan",
      scannedAt: now,
      favorite: false,
      archived: false,
      revisionHistory: [],
      uploadedAt: now,
      createdAt: now,
      updatedAt: now
    };

    createdItems.push(item);
    if (createdItems.length % 50 === 0) setScanProgress({ message: "Memasukkan file ke Library...", found: totalFound, imported: createdItems.length, skipped, duplicates, failed });
  }

  if (!createdItems.length) {
    finishScanProgress({ found: totalFound, imported: 0, duplicates, skipped, failed });
    return;
  }

  state.items = [...createdItems, ...state.items];
  saveItems();
  resetGridLimits();
  setView("library", false);
  render();
  finishScanProgress({ found: totalFound, imported: createdItems.length, duplicates, skipped, failed });
}

function isSupportedNativeScanFile(file) {
  const name = file?.name || file?.displayName || "";
  const mime = file?.mimeType || file?.type || "";
  const ext = getFileExtension(name);
  return SUPPORTED_SCAN_EXTENSIONS.has(ext) || mime.startsWith("image/") || mime.startsWith("video/") || isDocumentExtension(ext);
}

function buildNativeScanDedupKey(file) {
  const name = String(file?.name || file?.displayName || "").trim().toLowerCase();
  const size = Number(file?.size || 0);
  const mime = String(file?.mimeType || file?.type || "").trim().toLowerCase();
  const modified = Number(file?.modifiedAt || file?.dateModified || file?.lastModified || 0);
  const path = String(file?.path || file?.relativePath || file?.uri || file?.contentUri || "").trim().toLowerCase();
  return `native:${name}:${size}:${mime}:${modified}:${path}`;
}

function findDuplicateNativeFile(nativeFile, dedupKey = "") {
  const name = String(nativeFile?.name || nativeFile?.displayName || "").trim().toLowerCase();
  const size = Number(nativeFile?.size || 0);
  const mime = String(nativeFile?.mimeType || nativeFile?.type || "").trim().toLowerCase();
  const modified = Number(nativeFile?.modifiedAt || nativeFile?.dateModified || nativeFile?.lastModified || 0);
  const path = String(nativeFile?.path || nativeFile?.relativePath || "").trim().toLowerCase();
  return state.items.find((item) => {
    if (dedupKey && item.dedupKey === dedupKey) return true;
    const itemName = String(item.mediaName || item.title || "").trim().toLowerCase();
    const itemMime = String(item.mediaType || "").trim().toLowerCase();
    const itemPath = String(item.nativePath || "").trim().toLowerCase();
    const itemModified = Number(item.nativeModifiedAt || item.modifiedAt || 0);
    const sameBase = itemName === name && Number(item.mediaSize || 0) === size && itemMime === mime;
    if (!sameBase) return false;
    if (path && itemPath) return path === itemPath;
    return modified ? itemModified === modified : true;
  });
}

function getNativeScanKind(file) {
  const name = file?.name || file?.displayName || "";
  const mime = file?.mimeType || file?.type || "";
  const ext = getFileExtension(name);
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "image";
  if (mime.startsWith("video/") || ["mp4", "mkv", "webm", "ogg", "mov", "m4v", "3gp", "avi"].includes(ext)) return "video";
  return "document";
}

function isDocumentExtension(ext) {
  return ["pdf", "doc", "docx", "md", "txt", "xls", "xlsx", "csv", "ppt", "pptx"].includes(ext);
}

function getTypeForNativeScanKind(kind) {
  if (kind === "image") return "Gambar Chart";
  if (kind === "video") return "Video Pembelajaran";
  return "Dokumen";
}

function getCategoryForNativeScanKind(kind, documentType = "") {
  if (kind === "image") return "Gambar Chart";
  if (kind === "video") return "Video";
  if (kind === "document") return getCategoryForDocumentType(documentType);
  return "Dokumen";
}


function syncTypeFields() {
  const type = dom.typeInput.value;
  dom.codeField.hidden = type !== "Kode Indikator";

  if (type === "Kode Indikator") {
    dom.categoryInput.value = "Indikator";
  } else if (type === "Gambar Chart") {
    dom.categoryInput.value = "Gambar Chart";
  } else if (type === "Video Pembelajaran") {
    dom.categoryInput.value = "Video";
  } else if (type === "Dokumen" && !["Dokumen", "PDF", "Markdown", "Word", "Excel", "PowerPoint"].includes(dom.categoryInput.value)) {
    dom.categoryInput.value = "Dokumen";
  }
}

async function handleFilePick() {
  const files = [...(dom.fileInput.files || [])];
  dom.formMessage.textContent = "";

  if (!files.length) {
    state.pendingMedia = null;
    state.autoTitleFromFile = false;
    revokePreviewObjectUrl();
    dom.fileMeta.textContent = "PNG, JPG, WEBP, MP4, MKV, WEBM, MD, TXT, DOC, DOCX, PDF, XLS, XLSX, CSV, PPT, PPTX";
    updatePreviewFromUrl();
    return;
  }

  try {
    const pendingFiles = [];
    const batchHashes = new Set();
    for (const file of files) {
      const pending = await makePendingMedia(file, { compressImage: dom.compressImageInput?.checked });
      if (!pending) continue;
      if (pending.fileHash && (findDuplicateByHash(pending.fileHash) || batchHashes.has(pending.fileHash))) {
        dom.formMessage.textContent = `File "${file.name}" sudah ada di Library.`;
        dom.fileInput.value = "";
        return;
      }
      if (pending.fileHash) batchHashes.add(pending.fileHash);
      pendingFiles.push(pending);
    }

    if (!pendingFiles.length) {
      state.pendingMedia = null;
      clearPreview();
      dom.formMessage.textContent = "Format file belum didukung.";
      return;
    }

    state.pendingMedia = pendingFiles[0];
    state.pendingMedia.files = pendingFiles;
    revokePreviewObjectUrl();
    state.previewObjectUrl = URL.createObjectURL(pendingFiles[0].file);
    pendingFiles[0].objectUrl = state.previewObjectUrl;
    dom.fileMeta.textContent = pendingFiles.length === 1
      ? `${pendingFiles[0].name} • ${formatBytes(pendingFiles[0].size)}`
      : `${pendingFiles.length} file dipilih`;
    if (!dom.itemId.value && !dom.titleInput.value.trim()) {
      dom.titleInput.value = pendingFiles.length === 1
        ? fileTitleFromName(pendingFiles[0].name)
        : `${pendingFiles.length} file dipilih`;
      state.autoTitleFromFile = true;
    }
    updatePreview(pendingFiles[0].objectUrl, pendingFiles[0].kind, pendingFiles[0]);
    applyPendingMediaType(pendingFiles[0]);
  } catch {
    state.pendingMedia = null;
    clearPreview();
    dom.formMessage.textContent = "File tidak bisa dibaca.";
  }
}

async function makePendingMedia(file, options = {}) {
  let workingFile = file;
  let compressed = false;
  if (options.compressImage && isImageFile(file) && file.size > 450 * 1024) {
    const compressedBlob = await compressImageFile(file).catch(() => null);
    if (compressedBlob && compressedBlob.size < file.size) {
      workingFile = new File([compressedBlob], file.name.replace(/\.[^.]+$/, ".webp"), { type: compressedBlob.type || "image/webp" });
      compressed = true;
    }
  }
  const fileHash = await hashBlob(workingFile).catch(() => `${workingFile.name}:${workingFile.size}:${workingFile.lastModified || 0}`);

  if (isImageFile(workingFile)) {
    return {
      file: workingFile,
      kind: "image",
      name: workingFile.name,
      type: workingFile.type || getMimeForFileExtension(workingFile.name) || "image/*",
      size: workingFile.size,
      objectUrl: "",
      fileHash,
      compressed,
      documentText: ""
    };
  }

  if (isVideoFile(workingFile)) {
    return {
      file: workingFile,
      kind: "video",
      name: workingFile.name,
      type: workingFile.type || getMimeForFileExtension(workingFile.name) || "video/*",
      size: workingFile.size,
      objectUrl: "",
      fileHash,
      compressed,
      documentText: ""
    };
  }

  if (isDocumentFile(workingFile)) {
    const documentType = getDocumentTypeFromFile(workingFile);
    const textPreview = documentType === "Markdown" ? await readAsText(workingFile) : "";
    const documentText = await extractDocumentTextFromBlob(workingFile, documentType).catch(() => textPreview || "");
    return {
      file: workingFile,
      kind: "document",
      name: workingFile.name,
      type: workingFile.type || getMimeForDocumentType(documentType),
      size: workingFile.size,
      objectUrl: "",
      documentType,
      textPreview,
      documentText,
      fileHash,
      compressed
    };
  }

  return null;
}

function applyPendingMediaType(pending) {
  if (pending.kind === "image") {
    if (dom.typeInput.value === "Materi Trading") dom.typeInput.value = "Gambar Chart";
  } else if (pending.kind === "video") {
    dom.typeInput.value = "Video Pembelajaran";
  } else if (pending.kind === "document") {
    dom.typeInput.value = "Dokumen";
    dom.categoryInput.value = getCategoryForDocumentType(pending.documentType);
  }
  syncTypeFields();
}

function updatePreviewFromUrl() {
  if (state.pendingMedia?.file) return;
  const url = dom.mediaUrlInput.value.trim();
  updatePreview(url, inferMediaKind({ mediaUrl: url, type: dom.typeInput.value, category: dom.categoryInput.value }), {
    mediaUrl: url,
    type: dom.typeInput.value,
    category: dom.categoryInput.value
  });
}

function updatePreview(source, kind, item = {}) {
  clearPreview();
  if (!source) return;

  const mediaKind = kind || inferMediaKind({ mediaUrl: source, type: dom.typeInput.value, category: dom.categoryInput.value });
  let media;

  if (mediaKind === "image") {
    media = document.createElement("img");
    media.alt = dom.titleInput.value || "Preview gambar";
  } else if (mediaKind === "video") {
    media = document.createElement("video");
    media.controls = true;
    media.playsInline = true;
    media.preload = "metadata";
  } else if (mediaKind === "document") {
    renderDocumentPreview(dom.formPreview, {
      ...item,
      objectUrl: source
    });
    dom.formPreview.hidden = false;
    return;
  } else {
    return;
  }

  media.src = source;
  dom.formPreview.append(media);
  dom.formPreview.hidden = false;
}

function clearPreview() {
  dom.formPreview.replaceChildren();
  dom.formPreview.hidden = true;
}

async function saveForm(event) {
  event.preventDefault();
  if (!dom.itemId.value && state.pendingMedia?.files?.length > 1) {
    await saveMultipleFileItems();
    return;
  }

  const id = dom.itemId.value || createId();
  const existing = state.items.find((item) => item.id === id);
  const now = new Date().toISOString();
  const mediaUrl = dom.mediaUrlInput.value.trim();
  const pending = state.pendingMedia;
  if (!existing && pending?.fileHash && findDuplicateByHash(pending.fileHash)) {
    dom.formMessage.textContent = "File duplikat terdeteksi. File ini sudah ada di library.";
    return;
  }
  const mediaUrlChanged = Boolean(existing) && mediaUrl !== (existing.mediaUrl || "");
  const keepExistingFile = Boolean(existing?.fileId) && !pending?.file && !(mediaUrlChanged && mediaUrl);
  const fileId = pending?.file ? createId() : keepExistingFile ? existing.fileId : "";
  const mediaKind = pending?.kind
    || (keepExistingFile ? existing?.mediaKind : "")
    || inferMediaKind({ mediaUrl, type: dom.typeInput.value, category: dom.categoryInput.value })
    || (!mediaUrlChanged ? existing?.mediaKind : "")
    || "";
  const mediaName = pending?.name
    || (keepExistingFile ? existing?.mediaName : "")
    || fileNameFromUrl(mediaUrl);
  const mediaType = pending?.type || (keepExistingFile ? existing?.mediaType : "");
  const mediaSize = pending?.size || (keepExistingFile ? existing?.mediaSize : 0) || 0;
  const documentType = pending?.documentType
    || (mediaKind === "document" ? getDocumentType({ mediaUrl, mediaName, mediaType, category: dom.categoryInput.value }) : "");
  const uploadedAt = pending?.file ? now : existing?.uploadedAt || now;

  const item = {
    id,
    title: dom.titleInput.value.trim(),
    type: dom.typeInput.value,
    category: dom.categoryInput.value,
    status: dom.statusInput.value,
    collection: dom.collectionInput.value.trim(),
    tags: parseTags(dom.tagsInput.value),
    notes: dom.notesInput.value.trim(),
    checklist: parseChecklistText(dom.checklistInput.value),
    code: dom.codeField.hidden ? "" : dom.codeInput.value.trim(),
    mediaUrl,
    fileId,
    mediaKind,
    mediaName,
    mediaType,
    mediaSize,
    documentType,
    documentText: pending?.documentText || existing?.documentText || "",
    fileHash: pending?.fileHash || existing?.fileHash || "",
    favorite: Boolean(existing?.favorite),
    archived: Boolean(existing?.archived),
    revisionHistory: buildRevisionHistory(existing, now),
    uploadedAt,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  try {
    if (pending?.file) {
      await putFileRecord({
        id: fileId,
        itemId: id,
        blob: pending.file,
        name: mediaName,
        type: mediaType,
        size: mediaSize,
        kind: mediaKind,
        documentType,
        documentText: pending.documentText || "",
        fileHash: pending.fileHash || "",
        uploadedAt
      });
    }

    const nextItems = existing
      ? state.items.map((entry) => entry.id === id ? item : entry)
      : [item, ...state.items];

    saveItems(nextItems);
    state.items = nextItems;
    closeForm();
    render();

    if (existing?.fileId && existing.fileId !== fileId && (pending?.file || mediaUrlChanged)) {
      deleteFileRecord(existing.fileId).catch(() => {});
    }
  } catch {
    if (pending?.file && fileId) {
      deleteFileRecord(fileId).catch(() => {});
    }
    dom.formMessage.textContent = "File belum tersimpan. Ruang penyimpanan browser mungkin penuh.";
  }
}

async function saveMultipleFileItems() {
  const pendingFiles = state.pendingMedia?.files || [];
  const now = new Date().toISOString();
  const baseTitle = dom.titleInput.value.trim();
  const useFileNamesOnly = state.autoTitleFromFile;
  const notes = dom.notesInput.value.trim();
  const status = dom.statusInput.value;
  const mediaUrl = dom.mediaUrlInput.value.trim();
  const createdItems = [];
  const createdFileIds = [];

  try {
    for (const pending of pendingFiles) {
      if (pending.fileHash && findDuplicateByHash(pending.fileHash)) continue;
      const id = createId();
      const fileId = createId();
      const itemType = getTypeForPendingMedia(pending);
      const category = getCategoryForPendingMedia(pending);
      const documentType = pending.documentType || "";
      const item = {
        id,
        title: useFileNamesOnly ? fileTitleFromName(pending.name) : (baseTitle ? `${baseTitle} - ${pending.name}` : fileTitleFromName(pending.name)),
        type: itemType,
        category,
        status,
        collection: dom.collectionInput.value.trim(),
        tags: parseTags(dom.tagsInput.value),
        notes,
        checklist: parseChecklistText(dom.checklistInput.value),
        code: "",
        mediaUrl,
        fileId,
        mediaKind: pending.kind,
        mediaName: pending.name,
        mediaType: pending.type,
        mediaSize: pending.size,
        documentType,
        documentText: pending.documentText || "",
        fileHash: pending.fileHash || "",
        favorite: false,
        archived: false,
        revisionHistory: [],
        uploadedAt: now,
        createdAt: now,
        updatedAt: now
      };

      await putFileRecord({
        id: fileId,
        itemId: id,
        blob: pending.file,
        name: pending.name,
        type: pending.type,
        size: pending.size,
        kind: pending.kind,
        documentType,
        documentText: pending.documentText || "",
        fileHash: pending.fileHash || "",
        uploadedAt: now
      });

      createdFileIds.push(fileId);
      createdItems.push(item);
    }

    state.items = [...createdItems, ...state.items];
    saveItems();
    closeForm();
    render();
  } catch {
    await Promise.all(createdFileIds.map((fileId) => deleteFileRecord(fileId).catch(() => {})));
    dom.formMessage.textContent = "Sebagian file belum tersimpan. Ruang penyimpanan browser mungkin penuh.";
  }
}

function getTypeForPendingMedia(pending) {
  if (pending.kind === "image") return "Gambar Chart";
  if (pending.kind === "video") return "Video Pembelajaran";
  if (pending.kind === "document") return "Dokumen";
  return dom.typeInput.value;
}

function getCategoryForPendingMedia(pending) {
  if (pending.kind === "image") return "Gambar Chart";
  if (pending.kind === "video") return "Video";
  if (pending.kind === "document") return getCategoryForDocumentType(pending.documentType);
  return dom.categoryInput.value;
}

async function updatePreviewForItem(item) {
  const source = getMediaSource(item);
  if (source) {
    updatePreview(source, item.mediaKind || inferMediaKind(item), item);
    return;
  }

  if (!item.fileId) {
    clearPreview();
    return;
  }

  const url = await loadItemObjectUrl(item, "preview");
  if (url && dom.itemId.value === item.id) updatePreview(url, item.mediaKind || inferMediaKind(item), item);
}

async function deleteCurrentItem() {
  const id = dom.itemId.value;
  if (!id) return;
  const deleted = await deleteItem(id);
  if (deleted) closeForm();
}

async function deleteItem(id, options = {}) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return false;
  if (!options.skipConfirm) {
    const confirmed = window.confirm(`Hapus "${item.title}" dari aplikasi?`);
    if (!confirmed) return false;
  }
  return deleteItemsByIds([id]);
}

async function deleteItemsByIds(ids) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (!uniqueIds.length) return false;
  const selectedItems = state.items.filter((item) => uniqueIds.includes(item.id));
  try {
    await Promise.all(selectedItems.map((item) => item.fileId ? deleteFileRecord(item.fileId) : Promise.resolve()));
  } catch {
    window.showToast("Sebagian file belum bisa dihapus dari IndexedDB.");
    return false;
  }
  state.items = state.items.filter((entry) => !uniqueIds.includes(entry.id));
  saveItems();
  resetGridLimits();
  render();
  return true;
}

async function copyTextSafe(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

async function copyCode(item, button) {
  if (!item.code) return;
  const ok = await copyTextSafe(item.code);
  pulseButton(button, ok ? "Tersalin" : "Gagal");
  if (!ok) window.showToast("Gagal menyalin kode. Pilih teks lalu salin manual.");
}

async function showDocument(item) {
  await showFullscreenViewer(item);
}

async function showFullscreenViewer(item) {
  if (!canOpenFullscreen(item)) return;

  state.activeFullscreenItem = item;
  state.viewerStatusChanged = false;
  dom.fullscreenStage.classList.remove("is-reader-stage");
  dom.fullscreenTitle.textContent = item.title || getDocumentName(item) || "Preview";
  dom.fullscreenMeta.textContent = getFullscreenMeta(item);
  dom.fullscreenStage.replaceChildren(makeFullscreenLoading());

  if (typeof dom.fullscreenDialog.showModal === "function") {
    dom.fullscreenDialog.showModal();
  } else {
    dom.fullscreenDialog.setAttribute("open", "");
  }

  await renderFullscreenContent(item);
  updateFullscreenImageNav();
  updateFullscreenAnalyzeButton();
}

function handleGlobalFullscreenControlClick(event) {
  const target = event.target;
  if (!target || !dom.fullscreenDialog?.open) return;
  const closeBtn = target.closest?.("#fullscreenCloseBtn, #fullscreenBackBtn, #fullscreenExitBtn");
  if (closeBtn) {
    event.preventDefault();
    event.stopPropagation();
    closeFullscreenViewer();
    return;
  }
  const analyzeBtn = target.closest?.("#fullscreenAnalyzeBtn");
  if (analyzeBtn) {
    event.preventDefault();
    event.stopPropagation();
    analyzeActiveChart();
    return;
  }
  const deleteBtn = target.closest?.("#fullscreenDeleteBtn");
  if (deleteBtn) {
    event.preventDefault();
    event.stopPropagation();
    deleteActiveFullscreenItem();
  }
}

function closeFullscreenViewer() {
  const media = dom.fullscreenStage.querySelector("video, audio");
  if (media) media.pause();
  dom.fullscreenStage.replaceChildren();
  dom.fullscreenStage.classList.remove("is-reader-stage");
  if (dom.fullscreenAnalysis) { dom.fullscreenAnalysis.hidden = true; dom.fullscreenAnalysis.textContent = ""; }
  state.activeFullscreenItem = null;
  state.touchStartX = 0;
  revokeFullscreenObjectUrl();
  revokeFullscreenFeedObjectUrls();

  if (dom.fullscreenDialog.open && typeof dom.fullscreenDialog.close === "function") {
    dom.fullscreenDialog.close();
  } else {
    dom.fullscreenDialog.removeAttribute("open");
  }
  if (state.viewerStatusChanged) {
    state.viewerStatusChanged = false;
    render();
  }
}

async function deleteActiveFullscreenItem() {
  const item = state.activeFullscreenItem;
  if (!item?.id) return;
  const confirmed = window.confirm(`Hapus "${item.title || item.mediaName || "file ini"}" dari aplikasi?`);
  if (!confirmed) return;

  if (item.isJournalAttachment || item.journalId || String(item.id).includes(":")) {
    const parsed = getJournalAttachmentTarget(item);
    if (parsed?.journalId && parsed?.fileId) {
      closeFullscreenViewer();
      await removeJournalAttachment(parsed.journalId, parsed.fileId, { skipConfirm: true });
      return;
    }
  }

  const id = item.id;
  closeFullscreenViewer();
  await deleteItem(id, { skipConfirm: true });
}

async function renderFullscreenContent(item) {
  const mediaKind = item.mediaKind || inferMediaKind(item);
  const documentType = getDocumentType(item);

  if (mediaKind === "image") {
    const source = await getFullscreenSource(item);
    if (!source) return renderFullscreenError("Gambar belum bisa dimuat.");

    const image = document.createElement("img");
    image.className = "fullscreen-image";
    image.alt = item.title || "Preview gambar";
    image.src = source;
    dom.fullscreenStage.replaceChildren(image);
    setupImageCompletionTracking(item);
    return;
  }

  if (mediaKind === "video") {
    await renderVideoFeed(item);
    return;
  }

  if (documentType === "Markdown") {
    try {
      const raw = await readItemText(item) || "Markdown kosong.";
      const reader = createProfessionalReader(item, raw, { sourceType: "Markdown" });
      dom.fullscreenStage.classList.add("is-reader-stage");
      dom.fullscreenStage.replaceChildren(reader);
      setupReadableCompletionTracking(reader, item);
    } catch {
      renderFullscreenError("Markdown belum bisa dimuat.");
    }
    return;
  }

  if (documentType === "PDF") {
    renderFullscreenDocumentSummary(item);
    return;
  }

  if (documentType === "Word") {
    await renderDocxReader(item);
    return;
  }

  renderFullscreenDocumentSummary(item);
}



function markItemCompleted(item) {
  if (!item?.id || String(item.id).includes(":")) return;
  const index = state.items.findIndex((entry) => entry.id === item.id);
  if (index < 0 || state.items[index].status === "Selesai") return;
  state.items[index] = { ...state.items[index], status: "Selesai", updatedAt: new Date().toISOString() };
  if (state.activeFullscreenItem?.id === item.id) state.activeFullscreenItem = state.items[index];
  state.viewerStatusChanged = true;
  saveItems();
}

function setupVideoCompletionTracking(video, item) {
  const complete = () => markItemCompleted(item);
  video.addEventListener("ended", complete);
  video.addEventListener("timeupdate", () => {
    if (video.duration && Number.isFinite(video.duration) && video.currentTime / video.duration >= 0.98) complete();
  });
}

function setupImageCompletionTracking(item) {
  const itemId = item?.id;
  window.setTimeout(() => {
    if (state.activeFullscreenItem?.id === itemId) markItemCompleted(item);
  }, 3500);
}

function setupReadableCompletionTracking(element, item) {
  if (!element) return;
  const completeIfRead = () => {
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 32) markItemCompleted(item);
  };
  element.addEventListener("scroll", completeIfRead, { passive: true });
  window.setTimeout(() => {
    if (element.scrollHeight <= element.clientHeight + 32) markItemCompleted(item);
  }, 3500);
  window.setTimeout(completeIfRead, 600);
}

function queueNativeThumbnail(item, element) {
  const nativeUri = getNativeUri(item);
  if (!nativeUri || !element) return;
  const existing = getThumbnailSource(item);
  element.dataset.nativeThumbItemId = item.id;
  if (existing) {
    applyNativeThumbnailToDom(item.id, existing);
    return;
  }
  const observer = getNativeThumbnailObserver();
  observer.observe(element);
}

function getNativeThumbnailObserver() {
  if (state.nativeThumbnailObserver) return state.nativeThumbnailObserver;
  state.nativeThumbnailObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const element = entry.target;
      state.nativeThumbnailObserver.unobserve(element);
      const item = state.items.find((entryItem) => entryItem.id === element.dataset.nativeThumbItemId);
      requestNativeThumbnail(item);
    });
  }, { rootMargin: "180px" });
  return state.nativeThumbnailObserver;
}

function requestNativeThumbnail(item) {
  const nativeUri = getNativeUri(item);
  if (!item?.id || !nativeUri || state.nativeThumbnailRequested.has(item.id)) return;
  if (!window.TradingStorageScanner || typeof window.TradingStorageScanner.requestThumbnail !== "function") return;
  state.nativeThumbnailRequested.add(item.id);
  try {
    window.TradingStorageScanner.requestThumbnail(item.id, nativeUri, item.mediaKind || inferMediaKind(item) || "");
  } catch {
    state.nativeThumbnailRequested.delete(item.id);
  }
}

function handleNativeThumbnailResult(event) {
  const detail = event?.detail || {};
  const itemId = detail.itemId || detail.id || "";
  if (!itemId) return;
  state.nativeThumbnailRequested.delete(itemId);
  const thumb = detail.thumbnailUri || detail.thumbnailUrl || "";
  if (!thumb) return;
  const index = state.items.findIndex((item) => item.id === itemId);
  if (index >= 0) {
    state.items[index] = { ...state.items[index], thumbnailUrl: thumb, updatedAt: state.items[index].updatedAt || new Date().toISOString() };
    saveItems();
  }
  applyNativeThumbnailToDom(itemId, toWebViewSource(thumb));
}

function applyNativeThumbnailToDom(itemId, thumb) {
  if (!itemId || !thumb) return;
  document.querySelectorAll(`[data-native-thumb-item-id="${CSS.escape(itemId)}"]`).forEach((element) => {
    element.classList.add("has-native-thumb", "has-video-thumb");
    element.style.backgroundImage = `linear-gradient(rgba(0,0,0,.10), rgba(0,0,0,.38)), url("${thumb}")`;
  });
}

function queueVideoThumbnail(item, button, source = "") {
  if (!item?.id || !button) return;
  const observer = getVideoThumbnailObserver();
  button.dataset.thumbnailItemId = item.id;
  if (source) button.dataset.thumbnailSource = source;
  observer.observe(button);
}

function getVideoThumbnailObserver() {
  if (state.videoThumbnailObserver) return state.videoThumbnailObserver;
  state.videoThumbnailObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const button = entry.target;
      state.videoThumbnailObserver.unobserve(button);
      const item = state.items.find((entryItem) => entryItem.id === button.dataset.thumbnailItemId);
      if (!item || item.videoThumb) return;
      state.videoThumbnailQueue.add(item.id);
      processVideoThumbnailQueue();
    });
  }, { rootMargin: "160px" });
  return state.videoThumbnailObserver;
}

async function processVideoThumbnailQueue() {
  if (state.videoThumbnailBusy) return;
  const nextId = state.videoThumbnailQueue.values().next().value;
  if (!nextId) return;
  state.videoThumbnailQueue.delete(nextId);
  const item = state.items.find((entry) => entry.id === nextId);
  if (!item || item.videoThumb) {
    processVideoThumbnailQueue();
    return;
  }
  state.videoThumbnailBusy = true;
  try {
    const thumb = await createVideoThumbnailForItem(item);
    if (thumb) {
      state.items = state.items.map((entry) => entry.id === item.id ? { ...entry, videoThumb: thumb } : entry);
      saveItemsWithoutInsightRefresh();
      applyCachedVideoThumbnailToDom(item.id, thumb);
    }
  } catch {}
  state.videoThumbnailBusy = false;
  window.setTimeout(processVideoThumbnailQueue, 250);
}

function saveItemsWithoutInsightRefresh(items = state.items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.map(cleanItemForStorage)));
  invalidateRenderCache();
}

function applyCachedVideoThumbnailToDom(itemId, thumb) {
  document.querySelectorAll(`[data-thumbnail-item-id="${CSS.escape(itemId)}"]`).forEach((button) => {
    button.classList.add("has-video-thumb");
    button.style.backgroundImage = `linear-gradient(rgba(0,0,0,.12), rgba(0,0,0,.42)), url("${thumb}")`;
  });
}

async function createVideoThumbnailForItem(item) {
  let source = getMediaSource(item);
  let temporaryUrl = "";
  if (!source && item.fileId) {
    const record = await getFileRecord(item.fileId);
    if (!record?.blob) return "";
    temporaryUrl = URL.createObjectURL(record.blob);
    source = temporaryUrl;
  }
  if (!source) return "";
  try {
    return await captureVideoFrame(source);
  } finally {
    if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
  }
}

function captureVideoFrame(source) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    let done = false;
    const finish = (value = "") => {
      if (done) return;
      done = true;
      video.removeAttribute("src");
      video.load?.();
      resolve(value);
    };
    const capture = () => {
      if (!video.videoWidth || !video.videoHeight) return finish("");
      try {
        const canvas = document.createElement("canvas");
        const maxWidth = 260;
        const ratio = Math.min(1, maxWidth / video.videoWidth);
        canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
        canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.62));
      } catch {
        finish("");
      }
    };
    video.addEventListener("error", () => finish(""), { once: true });
    video.addEventListener("loadedmetadata", () => {
      try {
        const seekTime = Number.isFinite(video.duration) && video.duration > 1 ? Math.min(1, video.duration * 0.08) : 0;
        video.currentTime = seekTime;
      } catch {
        capture();
      }
    }, { once: true });
    video.addEventListener("seeked", capture, { once: true });
    video.addEventListener("loadeddata", () => window.setTimeout(capture, 120), { once: true });
    window.setTimeout(() => finish(""), 2600);
    video.src = source;
  });
}

function applyVideoThumbnail(video, source) {
  if (!video || !source) return;
  video.muted = true;
  video.preload = "metadata";
  let captured = false;
  const capture = () => {
    if (captured || !video.videoWidth || !video.videoHeight) return;
    try {
      captured = true;
      const canvas = document.createElement("canvas");
      const maxWidth = 480;
      const ratio = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
      canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      video.poster = canvas.toDataURL("image/jpeg", 0.72);
      video.currentTime = 0;
    } catch {
      captured = true;
    }
  };
  video.addEventListener("loadeddata", capture, { once: true });
  video.addEventListener("seeked", capture, { once: true });
  video.addEventListener("loadedmetadata", () => {
    try {
      if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(0.6, video.duration * 0.05);
    } catch {}
  }, { once: true });
  window.setTimeout(capture, 1800);
}

function getVisibleVideoItems() {
  return getFilteredItems(state.items).filter((item) => (item.mediaKind || inferMediaKind(item)) === "video");
}

async function renderVideoFeed(activeItem) {
  const videoItems = getVisibleVideoItems();
  const items = videoItems.length ? videoItems : [activeItem];
  const feed = document.createElement("div");
  feed.className = "fullscreen-video-feed";

  for (const videoItem of items) {
    const panel = document.createElement("section");
    panel.className = "fullscreen-video-panel";
    panel.dataset.id = videoItem.id;

    const source = await getFullscreenFeedSource(videoItem);
    if (source) {
      const video = document.createElement("video");
      video.className = "fullscreen-video feed-video";
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = source;
      setupVideoCompletionTracking(video, videoItem);
      panel.append(video);
    } else {
      const error = document.createElement("div");
      error.className = "fullscreen-error";
      error.textContent = "Video belum bisa dimuat.";
      panel.append(error);
    }

    const caption = document.createElement("div");
    caption.className = "fullscreen-video-caption";
    caption.textContent = videoItem.title || videoItem.mediaName || "Video";
    panel.append(caption);
    feed.append(panel);
  }

  dom.fullscreenStage.replaceChildren(feed);

  const activePanel = feed.querySelector(`[data-id="${CSS.escape(activeItem.id)}"]`);
  if (activePanel) {
    requestAnimationFrame(() => {
      activePanel.scrollIntoView({ block: "start" });
      playVisibleFeedVideo(feed);
    });
  } else {
    playVisibleFeedVideo(feed);
  }

  feed.addEventListener("scroll", debounce(() => {
    playVisibleFeedVideo(feed);
  }, 120), { passive: true });
}

function playVisibleFeedVideo(feed) {
  const panels = [...feed.querySelectorAll(".fullscreen-video-panel")];
  if (!panels.length) return;

  const feedRect = feed.getBoundingClientRect();
  let activePanel = panels[0];
  let activeDistance = Infinity;

  panels.forEach((panel) => {
    const rect = panel.getBoundingClientRect();
    const distance = Math.abs(rect.top - feedRect.top);
    if (distance < activeDistance) {
      activeDistance = distance;
      activePanel = panel;
    }
  });

  panels.forEach((panel) => {
    const video = panel.querySelector("video");
    if (!video) return;
    if (panel === activePanel) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });

  const activeItem = state.items.find((item) => item.id === activePanel.dataset.id);
  if (activeItem) {
    state.activeFullscreenItem = activeItem;
    dom.fullscreenTitle.textContent = activeItem.title || "Video";
    dom.fullscreenMeta.textContent = getFullscreenMeta(activeItem);
  }
}

function debounce(callback, wait = 120) {
  let timeoutId = 0;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), wait);
  };
}

async function getFullscreenFeedSource(item) {
  const source = getMediaSource(item);
  if (source) return source;
  const nativeSource = getNativeWebViewSource(item);
  if (nativeSource) return nativeSource;
  if (!item.fileId) return "";
  const record = await getFileRecord(item.fileId);
  if (!record?.blob) return "";
  const url = URL.createObjectURL(record.blob);
  state.fullscreenFeedObjectUrls.add(url);
  return url;
}

function revokeFullscreenFeedObjectUrls() {
  state.fullscreenFeedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.fullscreenFeedObjectUrls.clear();
}

function getVisibleImageItems() {
  return getFilteredItems(state.items).filter((item) => (item.mediaKind || inferMediaKind(item)) === "image");
}

function updateFullscreenImageNav() {
  const item = state.activeFullscreenItem;
  const isImage = item && (item.mediaKind || inferMediaKind(item)) === "image";
  const imageItems = isImage ? getVisibleImageItems() : [];
  const canNavigate = imageItems.length > 1;
  dom.fullscreenPrevBtn.hidden = !canNavigate;
  dom.fullscreenNextBtn.hidden = !canNavigate;
  if (dom.fullscreenDeleteBtn) dom.fullscreenDeleteBtn.hidden = !Boolean(state.activeFullscreenItem?.id);
}

async function showAdjacentImage(direction) {
  const current = state.activeFullscreenItem;
  if (!current || (current.mediaKind || inferMediaKind(current)) !== "image") return;
  const imageItems = getVisibleImageItems();
  if (imageItems.length < 2) return;
  const currentIndex = imageItems.findIndex((item) => item.id === current.id);
  const nextIndex = (currentIndex + direction + imageItems.length) % imageItems.length;
  const nextItem = imageItems[nextIndex];
  state.activeFullscreenItem = nextItem;
  dom.fullscreenTitle.textContent = nextItem.title || "Preview gambar";
  dom.fullscreenMeta.textContent = getFullscreenMeta(nextItem);
  dom.fullscreenStage.replaceChildren(makeFullscreenLoading());
  await renderFullscreenContent(nextItem);
  updateFullscreenImageNav();
  updateFullscreenAnalyzeButton();
}

function handleFullscreenTouchStart(event) {
  if (!event.changedTouches.length) return;
  state.touchStartX = event.changedTouches[0].clientX;
}

function handleFullscreenTouchEnd(event) {
  if (!event.changedTouches.length || !state.touchStartX) return;
  const deltaX = event.changedTouches[0].clientX - state.touchStartX;
  state.touchStartX = 0;
  if (Math.abs(deltaX) < 48) return;
  showAdjacentImage(deltaX < 0 ? 1 : -1);
}

async function getFullscreenSource(item) {
  const source = getMediaSource(item);
  if (source) return source;
  const nativeSource = getNativeWebViewSource(item);
  if (nativeSource) return nativeSource;
  const thumbSource = getThumbnailSource(item);
  if (thumbSource && (item.mediaKind || inferMediaKind(item)) === "image") return thumbSource;
  try {
    return await loadItemObjectUrl(item, "fullscreen");
  } catch {
    return "";
  }
}

function renderFullscreenDocumentSummary(item) {
  const summary = document.createElement("div");
  summary.className = "fullscreen-doc-summary";

  const mark = document.createElement("div");
  mark.className = "media-fallback document-fallback";
  mark.textContent = getDocumentMark(item);

  const title = document.createElement("h3");
  title.textContent = getDocumentName(item);

  const meta = document.createElement("p");
  meta.textContent = getFileMetaLine(item) || getDocumentType(item);

  const actions = document.createElement("div");
  actions.className = "fullscreen-doc-actions";

  const openButton = document.createElement("button");
  openButton.className = "primary-button";
  openButton.type = "button";
  openButton.textContent = "Buka";
  openButton.addEventListener("click", () => openFullscreenItemInNewTab(item));

  const downloadButton = document.createElement("button");
  downloadButton.className = "ghost-button";
  downloadButton.type = "button";
  downloadButton.textContent = "Download";
  downloadButton.addEventListener("click", () => downloadFullscreenItem(item));

  actions.append(downloadButton, openButton);
  summary.append(mark, title, meta, actions);
  dom.fullscreenStage.replaceChildren(summary);
}

function createProfessionalReader(item, rawText, options = {}) {
  const sourceType = options.sourceType || getDocumentType(item) || "Dokumen";
  const shell = document.createElement("article");
  shell.className = "professional-reader fullscreen-markdown";

  const tabs = document.createElement("div");
  tabs.className = "reader-tabs";
  const originalTab = document.createElement("button");
  originalTab.type = "button";
  originalTab.className = "reader-tab";
  originalTab.textContent = "Baca Asli";
  const cleanTab = document.createElement("button");
  cleanTab.type = "button";
  cleanTab.className = "reader-tab is-active";
  cleanTab.textContent = "Versi AI Rapi";
  tabs.append(originalTab, cleanTab);

  const head = document.createElement("header");
  head.className = "reader-head";
  const kicker = document.createElement("span");
  kicker.textContent = sourceType;
  const title = document.createElement("h1");
  title.textContent = cleanReaderTitle(item, rawText);
  const meta = document.createElement("p");
  meta.textContent = `${sourceType} • ${formatDate(item.updatedAt || item.createdAt)} • ${estimateReadTime(rawText)} menit baca`;
  head.append(kicker, title, meta);

  const body = document.createElement("div");
  body.className = "reader-body";
  const original = document.createElement("pre");
  original.className = "reader-original";
  original.textContent = rawText || "Dokumen kosong.";
  original.hidden = true;
  const clean = renderReadableMarkdown(rawText || "Dokumen kosong.");
  clean.className = "reader-clean";
  body.append(clean, original);

  originalTab.addEventListener("click", () => {
    original.hidden = false;
    clean.hidden = true;
    originalTab.classList.add("is-active");
    cleanTab.classList.remove("is-active");
  });
  cleanTab.addEventListener("click", () => {
    original.hidden = true;
    clean.hidden = false;
    cleanTab.classList.add("is-active");
    originalTab.classList.remove("is-active");
  });

  shell.append(tabs, head, body);
  return shell;
}

function cleanReaderTitle(item, rawText) {
  const firstHeading = String(rawText || "").split(/\n/).map((line) => line.trim()).find((line) => /^#{1,2}\s+/.test(line));
  return (firstHeading ? firstHeading.replace(/^#{1,6}\s+/, "") : item.title || getDocumentName(item) || "Materi").trim();
}

function estimateReadTime(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

function renderReadableMarkdown(rawText) {
  const container = document.createElement("div");
  const lines = String(rawText || "").replace(/\r\n/g, "\n").split("\n");
  let paragraph = [];
  let list = null;
  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    paragraph = [];
    if (!text) return;
    const p = document.createElement("p");
    p.textContent = stripInlineMarkdown(text);
    container.append(p);
  };
  const flushList = () => {
    if (list) {
      container.append(list);
      list = null;
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(3, heading[1].length + 1);
      const h = document.createElement(`h${level}`);
      h.textContent = stripInlineMarkdown(heading[2]);
      container.append(h);
      return;
    }
    if (/^>\s+/.test(trimmed)) {
      flushParagraph();
      flushList();
      const quote = document.createElement("blockquote");
      quote.textContent = stripInlineMarkdown(trimmed.replace(/^>\s+/, ""));
      container.append(quote);
      return;
    }
    const bullet = trimmed.match(/^[-*•]\s+(.+)$/) || trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (!list) list = document.createElement("ul");
      const li = document.createElement("li");
      li.textContent = stripInlineMarkdown(bullet[1]);
      list.append(li);
      return;
    }
    paragraph.push(trimmed);
  });
  flushParagraph();
  flushList();
  return container;
}

function stripInlineMarkdown(text) {
  return String(text || "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .trim();
}

function renderFullscreenError(message) {
  const box = document.createElement("div");
  box.className = "fullscreen-error";
  box.textContent = message;
  dom.fullscreenStage.replaceChildren(box);
}

function makeFullscreenLoading() {
  const loading = document.createElement("div");
  loading.className = "fullscreen-error";
  loading.textContent = "Memuat preview...";
  return loading;
}

async function openFullscreenItemInNewTab(item) {
  const popup = window.open("", "_blank");
  if (popup) popup.opener = null;
  const source = await getFullscreenSource(item);
  if (!source) {
    if (popup) popup.close();
    return;
  }
  if (popup) {
    popup.location.href = source;
  } else {
    window.open(source, "_blank", "noopener");
  }
}

async function downloadFullscreenItem(item) {
  const source = await getFullscreenSource(item);
  if (!source) return;

  const link = document.createElement("a");
  link.href = source;
  link.download = item.mediaName || getFallbackDocumentName(item);
  document.body.append(link);
  link.click();
  link.remove();
}

function closeDocumentDialog() {
  state.activeDocument = null;
  dom.documentFrame.replaceChildren();
  revokeDocumentObjectUrl();
  if (dom.documentDialog.open && typeof dom.documentDialog.close === "function") {
    dom.documentDialog.close();
  } else {
    dom.documentDialog.removeAttribute("open");
  }
}

async function openActiveDocumentInNewTab() {
  const item = state.activeDocument;
  if (!item) return;
  const popup = window.open("", "_blank");
  if (popup) popup.opener = null;
  const source = await getDocumentOpenSource(item);
  if (!source) {
    if (popup) popup.close();
    return;
  }
  if (popup) {
    popup.location.href = source;
  } else {
    window.open(source, "_blank", "noopener");
  }
}

async function downloadActiveDocument() {
  const item = state.activeDocument;
  if (!item) return;
  const source = await getDocumentOpenSource(item);
  if (!source) return;

  const link = document.createElement("a");
  link.href = source;
  link.download = item.mediaName || getFallbackDocumentName(item);
  document.body.append(link);
  link.click();
  link.remove();
}

async function getDocumentOpenSource(item) {
  const source = getMediaSource(item);
  if (source) return source;
  const nativeSource = getNativeWebViewSource(item);
  if (nativeSource) return nativeSource;
  try {
    return await loadItemObjectUrl(item, "document");
  } catch {
    return "";
  }
}

async function renderDocumentPreview(container, item, expanded = false) {
  container.replaceChildren();
  const documentType = getDocumentType(item);
  const name = getDocumentName(item);

  if (documentType === "PDF") {
    const summary = document.createElement("div");
    summary.className = "document-summary";

    const mark = document.createElement("div");
    mark.className = "media-fallback document-fallback";
    mark.textContent = "PDF";

    const copy = document.createElement("div");
    copy.className = "document-summary-copy";

    const title = document.createElement("strong");
    title.textContent = name;

    const meta = document.createElement("span");
    meta.textContent = "PDF tersimpan • Reader dinonaktifkan";

    copy.append(title, meta);
    summary.append(mark, copy);
    container.append(summary);
    return;
  }

  if (documentType === "Markdown") {
    const preview = document.createElement("pre");
    preview.className = "document-text-preview";
    try {
      preview.textContent = item.textPreview || await readItemText(item) || "Markdown akan dibuka sebagai teks.";
    } catch {
      preview.textContent = "Markdown belum bisa dimuat.";
    }
    if (!expanded) preview.dataset.compact = "true";
    container.append(preview);
    return;
  }

  const summary = document.createElement("div");
  summary.className = "document-summary";

  const mark = document.createElement("div");
  mark.className = "media-fallback document-fallback";
  mark.textContent = getDocumentMark(item);

  const copy = document.createElement("div");
  copy.className = "document-summary-copy";

  const title = document.createElement("strong");
  title.textContent = name;

  const meta = document.createElement("span");
  meta.textContent = `${documentType} • ${item.mediaSize ? formatBytes(item.mediaSize) : "File dokumen"}`;

  copy.append(title, meta);
  summary.append(mark, copy);
  container.append(summary);
}

async function populateMarkdownPreview(item, preview) {
  try {
    const text = await readItemText(item);
    if (text) preview.textContent = text;
  } catch {
    preview.textContent = "Markdown belum bisa dimuat.";
  }
}

function isMediaItem(item) {
  return item.mediaKind === "image"
    || item.mediaKind === "video"
    || item.type === "Gambar Chart"
    || item.type === "Video Pembelajaran";
}

function canOpenFullscreen(item) {
  return isMediaItem(item) || isDocumentItem(item);
}

function getFullscreenMeta(item) {
  const mediaKind = item.mediaKind || inferMediaKind(item);
  if (mediaKind === "image") return "Gambar • Fullscreen";
  if (mediaKind === "video") return "Video • Fullscreen";
  if (isDocumentItem(item)) return `${getDocumentType(item)} • Fullscreen`;
  return "Preview";
}

function isImageFile(file) {
  return file.type.startsWith("image/")
    || ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(getFileExtension(file.name));
}

function isVideoFile(file) {
  return file.type.startsWith("video/")
    || ["mp4", "mkv", "webm", "ogg", "mov", "m4v", "3gp", "avi"].includes(getFileExtension(file.name));
}

function isDocumentItem(item) {
  return item.mediaKind === "document"
    || item.type === "Dokumen"
    || ["Dokumen", "PDF", "Markdown", "Word", "Excel", "PowerPoint"].includes(item.category);
}

function isDocumentFile(file) {
  const extension = getFileExtension(file.name);
  return ["md", "txt", "pdf", "doc", "docx", "xls", "xlsx", "csv", "ppt", "pptx"].includes(extension)
    || [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/markdown",
      "text/plain"
    ].includes(file.type);
}

function getDocumentType(item) {
  if (item.documentType) return item.documentType;
  if (item.category === "PDF") return "PDF";
  if (item.category === "Markdown") return "Markdown";
  if (item.category === "Word") return "Word";
  if (item.category === "Excel") return "Excel";
  if (item.category === "PowerPoint") return "PowerPoint";

  const source = `${item.mediaName || ""} ${item.mediaUrl || ""} ${item.mediaType || ""}`.toLowerCase();
  if (source.includes("application/pdf") || /\.pdf(?:$|[?#\s])/.test(source)) return "PDF";
  if (source.includes("text/markdown") || source.includes("text/plain") || /\.(md|txt)(?:$|[?#\s])/.test(source)) return "Markdown";
  if (source.includes("application/msword") || source.includes("officedocument.wordprocessingml") || /\.docx?(?:$|[?#\s])/.test(source)) return "Word";
  if (source.includes("ms-excel") || source.includes("spreadsheetml") || source.includes("text/csv") || /\.(xls|xlsx|csv)(?:$|[?#\s])/.test(source)) return "Excel";
  if (source.includes("ms-powerpoint") || source.includes("presentationml") || /\.(ppt|pptx)(?:$|[?#\s])/.test(source)) return "PowerPoint";
  return "Dokumen";
}

function getDocumentTypeFromFile(file) {
  return getDocumentType({
    mediaName: file.name,
    mediaType: file.type
  });
}

function getDocumentMark(item) {
  const documentType = getDocumentType(item);
  if (documentType === "PDF") return "PDF";
  if (documentType === "Markdown") return "MD";
  if (documentType === "Word") return "DOC";
  if (documentType === "Excel") return "XLS";
  if (documentType === "PowerPoint") return "PPT";
  return "DOC";
}

function getCategoryForDocumentType(documentType) {
  if (["PDF", "Markdown", "Word", "Excel", "PowerPoint"].includes(documentType)) return documentType;
  return "Dokumen";
}

function getMimeForDocumentType(documentType) {
  if (documentType === "PDF") return "application/pdf";
  if (documentType === "Markdown") return "text/markdown";
  if (documentType === "Word") return "application/msword";
  if (documentType === "Excel") return "application/vnd.ms-excel";
  if (documentType === "PowerPoint") return "application/vnd.ms-powerpoint";
  return "application/octet-stream";
}

function getMimeForFileExtension(name = "") {
  const mimeByExtension = {
    gif: "image/gif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    avi: "video/x-msvideo",
    m4v: "video/mp4",
    md: "text/markdown",
    mkv: "video/x-matroska",
    mov: "video/quicktime",
    mp4: "video/mp4",
    ogg: "video/ogg",
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
    webm: "video/webm",
    txt: "text/plain",
    webp: "image/webp",
    "3gp": "video/3gpp",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  };
  return mimeByExtension[getFileExtension(name)] || "";
}

function getFallbackDocumentName(item) {
  const type = getDocumentType(item);
  const extension = type === "Markdown" ? "md" : type === "PowerPoint" ? "ppt" : type === "Excel" ? "xls" : type.toLowerCase();
  return `${(item.title || "dokumen").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "dokumen"}.${extension}`;
}

function getDocumentName(item) {
  return item.mediaName || fileNameFromUrl(item.mediaUrl) || "Dokumen";
}

function getFileMetaLine(item) {
  const name = item.mediaName || fileNameFromUrl(item.mediaUrl);
  if (!name) return "";
  const type = isDocumentItem(item) ? getDocumentType(item) : item.mediaType || item.mediaKind || item.type;
  const size = item.mediaSize ? ` • ${formatBytes(item.mediaSize)}` : "";
  return `${name} • ${type}${size}`;
}

function getFileExtension(name = "") {
  return String(name).split(".").pop().toLowerCase();
}

function fileNameFromUrl(url = "") {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split("/").pop() || "");
  } catch {
    return String(url).split("/").pop() || "";
  }
}

function fileTitleFromName(name = "") {
  const withoutExtension = String(name).replace(/\.[^.]+$/, "");
  return withoutExtension.replace(/[-_]+/g, " ").trim() || "File baru";
}

function decodeTextDataUrl(source = "") {
  if (!source.startsWith("data:")) return "";
  const commaIndex = source.indexOf(",");
  if (commaIndex < 0) return "";
  const meta = source.slice(0, commaIndex);
  const payload = source.slice(commaIndex + 1);
  try {
    if (!meta.includes(";base64")) return decodeURIComponent(payload);
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function pulseButton(button, label) {
  const original = button.textContent;
  button.textContent = label;
  window.setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function openFileDb() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB tidak tersedia."));
  }

  if (state.dbPromise) return state.dbPromise;

  state.dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return state.dbPromise;
}

async function withFileStore(mode, action) {
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE, mode);
    const store = transaction.objectStore(FILE_STORE);
    const request = action(store);
    let result;

    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function putFileRecord(record) {
  return withFileStore("readwrite", (store) => store.put(record));
}

function getFileRecord(fileId) {
  if (!fileId) return Promise.resolve(null);
  return withFileStore("readonly", (store) => store.get(fileId));
}

function deleteFileRecord(fileId) {
  if (!fileId) return Promise.resolve();
  return withFileStore("readwrite", (store) => store.delete(fileId));
}

async function loadItemObjectUrl(item, scope = "rendered") {
  const source = getMediaSource(item);
  if (source) return source;
  if (!item.fileId) return "";
  if (scope === "document" && state.documentObjectUrl && state.documentObjectUrlFileId === item.fileId) {
    return state.documentObjectUrl;
  }
  if (scope === "fullscreen" && state.fullscreenObjectUrl && state.fullscreenObjectUrlFileId === item.fileId) {
    return state.fullscreenObjectUrl;
  }

  const record = await getFileRecord(item.fileId);
  if (!record?.blob) return "";

  let blob = record.blob;
  if (record.type && blob.type !== record.type) {
    blob = new Blob([blob], { type: record.type });
  }

  const url = URL.createObjectURL(blob);
  if (scope === "preview") {
    revokePreviewObjectUrl();
    state.previewObjectUrl = url;
  } else if (scope === "document") {
    revokeDocumentObjectUrl();
    state.documentObjectUrl = url;
    state.documentObjectUrlFileId = item.fileId;
  } else if (scope === "fullscreen") {
    revokeFullscreenObjectUrl();
    state.fullscreenObjectUrl = url;
    state.fullscreenObjectUrlFileId = item.fileId;
  } else {
    state.renderedObjectUrls.add(url);
  }
  return url;
}

function createPreviewObjectUrl(file) {
  revokePreviewObjectUrl();
  const url = URL.createObjectURL(file);
  state.previewObjectUrl = url;
  return url;
}

function revokePreviewObjectUrl() {
  if (!state.previewObjectUrl) return;
  URL.revokeObjectURL(state.previewObjectUrl);
  state.previewObjectUrl = "";
}

function revokeDocumentObjectUrl() {
  if (!state.documentObjectUrl) return;
  URL.revokeObjectURL(state.documentObjectUrl);
  state.documentObjectUrl = "";
  state.documentObjectUrlFileId = "";
}

function revokeFullscreenObjectUrl() {
  if (!state.fullscreenObjectUrl) return;
  URL.revokeObjectURL(state.fullscreenObjectUrl);
  state.fullscreenObjectUrl = "";
  state.fullscreenObjectUrlFileId = "";
}

function revokeRenderedObjectUrls() {
  state.renderedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.renderedObjectUrls.clear();
}

async function readItemText(item) {
  if (item.documentText) return item.documentText;
  if (item.textPreview) return item.textPreview;
  if (item.file instanceof Blob) {
    const docType = item.documentType || getDocumentType(item);
    if (docType === "Word") return extractDocumentTextFromBlob(item.file, docType).catch(() => "");
    return item.file.text();
  }
  if (item.fileId) {
    const record = await getFileRecord(item.fileId);
    if (record?.documentText) return record.documentText;
    if (record?.blob) {
      const docType = record.documentType || item.documentType || getDocumentType(item);
      const extracted = await extractDocumentTextFromBlob(record.blob, docType).catch(() => docType === "Word" ? "" : record.blob.text());
      if (extracted && !record.documentText) {
        await putFileRecord({ ...record, documentText: extracted }).catch(() => {});
      }
      return extracted || "";
    }
    return "";
  }
  return decodeTextDataUrl(getMediaSource(item));
}

async function migrateLegacyFiles() {
  const needsMigration = state.items.some((item) => item.mediaData || item.documentText);
  if (!needsMigration) return;

  const migrated = [];
  try {
    for (const item of state.items) {
      if (!item.mediaData && !item.documentText) {
        migrated.push(cleanItemForStorage(item));
        continue;
      }

      const blob = item.mediaData
        ? dataUrlToBlob(item.mediaData)
        : new Blob([item.documentText], { type: "text/markdown;charset=utf-8" });
      const fileId = item.fileId || createId();
      const mediaKind = item.mediaKind
        || inferMediaKind({ ...item, mediaUrl: item.mediaData || item.mediaUrl })
        || (isDocumentItem(item) ? "document" : "");
      const mediaName = item.mediaName || getDocumentName(item);
      const mediaType = item.mediaType || blob.type || getMimeForDocumentType(item.documentType || getDocumentType(item));
      const mediaSize = item.mediaSize || blob.size;
      const uploadedAt = item.uploadedAt || item.updatedAt || item.createdAt || new Date().toISOString();

      await putFileRecord({
        id: fileId,
        itemId: item.id,
        blob,
        name: mediaName,
        type: mediaType,
        size: mediaSize,
        kind: mediaKind,
        documentType: item.documentType || (mediaKind === "document" ? getDocumentType({ ...item, mediaType }) : ""),
        documentText: item.documentText || "",
        fileHash: item.fileHash || "",
        uploadedAt
      });

      migrated.push(cleanItemForStorage({
        ...item,
        fileId,
        mediaKind,
        mediaName,
        mediaType,
        mediaSize,
        uploadedAt
      }));
    }

    state.items = migrated;
    saveItems();
    render();
  } catch {
    dom.formMessage.textContent = "Migrasi file lama ke IndexedDB belum berhasil.";
  }
}

function dataUrlToBlob(dataUrl) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) return new Blob([]);

  const meta = dataUrl.slice(0, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const mime = meta.match(/^data:([^;,]+)/)?.[1] || "application/octet-stream";

  if (meta.includes(";base64")) {
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: mime });
  }

  return new Blob([decodeURIComponent(payload)], { type: mime });
}

function makeCount(count) {
  return `${count} item`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function installApp() {
  return;
}

function disableServiceWorkerForWebPage() {
  clearOldAppCaches().catch(() => {});
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations?.().then((registrations) => {
      registrations.forEach((registration) => {
        const scope = registration.scope || "";
        if (scope.startsWith(location.origin)) registration.unregister().catch(() => {});
      });
    }).catch(() => {});
  });
}


function normalizeItems(items) {
  return items.map((item) => ({
    collection: "",
    tags: [],
    checklist: [],
    documentText: "",
    fileHash: "",
    favorite: false,
    archived: false,
    revisionHistory: [],
    ...item,
    tags: Array.isArray(item.tags) ? item.tags : parseTags(item.tags || ""),
    checklist: Array.isArray(item.checklist) ? item.checklist : parseChecklistText(item.checklist || ""),
    revisionHistory: Array.isArray(item.revisionHistory) ? item.revisionHistory : []
  }));
}

function getItemFileType(item) {
  if (item.type === "Kode Indikator" || item.category === "Indikator") return "Kode";
  const mediaKind = item.mediaKind || inferMediaKind(item);
  if (mediaKind === "image") return "Gambar";
  if (mediaKind === "video") return "Video";
  if (isDocumentItem(item)) {
    const type = getDocumentType(item);
    if (["PDF", "Word", "Markdown", "Excel", "PowerPoint"].includes(type)) return type;
    return "Dokumen";
  }
  return "Dokumen";
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  return String(value || "").split(/[#,]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
}

function parseChecklistText(value) {
  if (Array.isArray(value)) return value.map((entry) => ({ text: String(entry.text || entry).trim(), done: Boolean(entry.done) })).filter((entry) => entry.text);
  return String(value || "").split(/\n+/).map((line) => {
    const text = line.replace(/^\s*\[(x|X|✓)\]\s*/, "").replace(/^\s*\[\s\]\s*/, "").trim();
    return { text, done: /^\s*\[(x|X|✓)\]/.test(line) };
  }).filter((entry) => entry.text).slice(0, 40);
}

function checklistToText(checklist) {
  return (checklist || []).map((entry) => `${entry.done ? "[x]" : "[ ]"} ${entry.text}`).join("\n");
}

function renderCardTags(container, item) {
  if (!container) return;
  const parts = [];
  if (item.favorite) parts.push("📌 Pin");
  if (item.archived) parts.push("Arsip");
  if (item.collection) parts.push(`Folder: ${item.collection}`);
  parts.push(...(item.tags || []).map((tag) => `#${tag}`));
  container.textContent = parts.join("  ");
  container.hidden = !parts.length;
}

function renderChecklistPreview(container, item) {
  if (!container) return;
  const checklist = item.checklist || [];
  container.replaceChildren();
  if (!checklist.length) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  checklist.slice(0, 4).forEach((entry, index) => {
    const label = document.createElement("label");
    label.className = "mini-check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(entry.done);
    checkbox.addEventListener("change", () => updateChecklistState(item.id, index, checkbox.checked));
    const span = document.createElement("span");
    span.textContent = entry.text;
    label.append(checkbox, span);
    container.append(label);
  });
  if (checklist.length > 4) {
    const more = document.createElement("span");
    more.className = "check-more";
    more.textContent = `+${checklist.length - 4} checklist lain`;
    container.append(more);
  }
}

function renderRevisionLine(container, item) {
  if (!container) return;
  const count = item.revisionHistory?.length || 0;
  container.textContent = count ? `${count} catatan revisi` : "";
  container.hidden = !count;
}

function updateChecklistState(itemId, index, done) {
  state.items = state.items.map((item) => {
    if (item.id !== itemId) return item;
    const checklist = [...(item.checklist || [])];
    if (!checklist[index]) return item;
    checklist[index] = { ...checklist[index], done };
    return { ...item, checklist, updatedAt: new Date().toISOString() };
  });
  saveItems();
  render();
}

function buildRevisionHistory(existing, now) {
  const history = Array.isArray(existing?.revisionHistory) ? [...existing.revisionHistory] : [];
  if (!existing) return history;
  const changes = [];
  const watched = ["title", "status", "notes", "code", "collection"];
  const current = {
    title: dom.titleInput.value.trim(),
    status: dom.statusInput.value,
    notes: dom.notesInput.value.trim(),
    code: dom.codeField.hidden ? "" : dom.codeInput.value.trim(),
    collection: dom.collectionInput.value.trim()
  };
  watched.forEach((key) => {
    if (String(existing[key] || "") !== String(current[key] || "")) changes.push(key);
  });
  if (changes.length) history.unshift({ at: now, changes });
  return history.slice(0, 30);
}

function toggleFavorite(id) {
  state.items = state.items.map((item) => item.id === id ? { ...item, favorite: !item.favorite, updatedAt: new Date().toISOString() } : item);
  saveItems();
  render();
}

function toggleArchive(id) {
  state.items = state.items.map((item) => item.id === id ? { ...item, archived: !item.archived, updatedAt: new Date().toISOString() } : item);
  saveItems();
  render();
}

function findDuplicateByHash(fileHash) {
  if (!fileHash) return null;
  return state.items.find((item) => item.fileHash && item.fileHash === fileHash);
}

async function hashBlob(blob) {
  if (!globalThis.crypto?.subtle) return `${blob.name || "blob"}:${blob.size || 0}:${blob.lastModified || 0}:${blob.type || ""}`;
  if (blob.size > 24 * 1024 * 1024) return `${blob.name || "blob"}:${blob.size || 0}:${blob.lastModified || 0}:${blob.type || ""}`;
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function compressImageFile(file) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1800;
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/webp", 0.82));
}

async function extractDocumentTextFromBlob(blob, documentType) {
  if (documentType === "Markdown") return blob.text();
  if (documentType === "Word") return extractDocxText(blob);
  if (documentType === "PDF") return extractPdfText(blob);
  return "";
}

async function extractDocxText(blob) {
  if (!window.JSZip) return "";
  const zip = await window.JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return "";
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocxHtml(blob) {
  if (!window.JSZip) return "";
  const zip = await window.JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return "";
  const paragraphs = xml.split(/<w:p[\s>]/).slice(1).map((chunk) => {
    const text = chunk
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
      .trim();
    return text ? `<p>${escapeHtml(text)}</p>` : "";
  }).filter(Boolean);
  return paragraphs.join("") || `<pre>${escapeHtml(await extractDocxText(blob))}</pre>`;
}

async function extractPdfText(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let latin = "";
  const max = Math.min(bytes.length, 3_000_000);
  for (let i = 0; i < max; i += 1) latin += String.fromCharCode(bytes[i]);
  const parts = [];
  const literalRe = /\((?:\\.|[^\\()])*\)\s*T[Jj]/g;
  let match;
  while ((match = literalRe.exec(latin)) && parts.length < 2000) {
    parts.push(decodePdfLiteral(match[0].replace(/\)\s*T[Jj]$/, "").slice(1)));
  }
  const arrayRe = /\[((?:\s*\((?:\\.|[^\\()])*\)\s*)+)\]\s*TJ/g;
  while ((match = arrayRe.exec(latin)) && parts.length < 3000) {
    const inside = match[1];
    const strings = inside.match(/\((?:\\.|[^\\()])*\)/g) || [];
    parts.push(strings.map((str) => decodePdfLiteral(str.slice(1, -1))).join(""));
  }
  return parts.join(" ").replace(/\s{2,}/g, " ").trim();
}

function decodePdfLiteral(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

async function getFileBlob(item) {
  if (item.file instanceof Blob) return item.file;
  if (item.fileId) {
    const record = await getFileRecord(item.fileId);
    return record?.blob || null;
  }
  const source = getMediaSource(item);
  if (source?.startsWith("data:")) return dataUrlToBlob(source);
  return null;
}

async function renderDocxReader(item) {
  const blob = await getFileBlob(item);
  if (!blob) return renderFullscreenError("Word belum bisa dimuat.");
  const shell = document.createElement("article");
  shell.className = "professional-reader docx-reader";

  const tabs = document.createElement("div");
  tabs.className = "reader-tabs";
  const originalTab = document.createElement("button");
  originalTab.type = "button";
  originalTab.className = "reader-tab";
  originalTab.textContent = "Baca Asli";
  const cleanTab = document.createElement("button");
  cleanTab.type = "button";
  cleanTab.className = "reader-tab is-active";
  cleanTab.textContent = "Versi AI Rapi";
  tabs.append(originalTab, cleanTab);

  const head = document.createElement("header");
  head.className = "reader-head";
  const kicker = document.createElement("span");
  kicker.textContent = "Word";
  const title = document.createElement("h1");
  title.textContent = item.title || getDocumentName(item);
  const meta = document.createElement("p");
  meta.textContent = `Word • ${formatDate(item.updatedAt || item.createdAt)}`;
  head.append(kicker, title, meta);

  const body = document.createElement("div");
  body.className = "reader-body";
  const original = document.createElement("pre");
  original.className = "reader-original";
  original.textContent = item.documentText || "Word belum bisa dibaca sebagai teks mentah.";
  original.hidden = true;
  const clean = document.createElement("div");
  clean.className = "reader-clean docx-body";
  try {
    clean.innerHTML = await extractDocxHtml(blob) || `<p>${escapeHtml(item.documentText || "Word kosong.")}</p>`;
  } catch {
    clean.append(renderReadableMarkdown(item.documentText || "Word belum bisa dibaca di perangkat ini."));
  }
  body.append(clean, original);

  originalTab.addEventListener("click", () => {
    original.hidden = false;
    clean.hidden = true;
    originalTab.classList.add("is-active");
    cleanTab.classList.remove("is-active");
  });
  cleanTab.addEventListener("click", () => {
    original.hidden = true;
    clean.hidden = false;
    cleanTab.classList.add("is-active");
    originalTab.classList.remove("is-active");
  });

  shell.append(tabs, head, body);
  dom.fullscreenStage.classList.add("is-reader-stage");
  dom.fullscreenStage.replaceChildren(shell);
  setupReadableCompletionTracking(shell, item);
}


function escapeHtml(value) {
  return String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

async function exportBackup() {
  if (!window.JSZip) return window.showToast("JSZip belum termuat.");
  try {
    const zip = new window.JSZip();
    zip.file("data.json", JSON.stringify({ version: BACKUP_VERSION, exportedAt: new Date().toISOString(), items: state.items, journals: state.journals, insightCache: state.insightCache }, null, 2));
    const folder = zip.folder("files");
    for (const item of state.items) {
      if (!item.fileId) continue;
      const record = await getFileRecord(item.fileId).catch(() => null);
      if (record?.blob) folder.file(`${item.fileId}-${sanitizeFileName(record.name || item.mediaName || "file")}`, record.blob);
    }
    for (const journal of state.journals) {
      for (const attachment of journal.attachments || []) {
        if (!attachment.fileId) continue;
        const record = await getFileRecord(attachment.fileId).catch(() => null);
        if (record?.blob) folder.file(`${attachment.fileId}-${sanitizeFileName(record.name || attachment.name || "file")}`, record.blob);
      }
    }
    const blob = await zip.generateAsync({ type: "blob" });
    await downloadBlob(blob, `trading-library-backup-${new Date().toISOString().slice(0, 10)}.zip`);
  } catch {
    window.showToast("Backup gagal dibuat. Cek izin penyimpanan atau ruang perangkat.");
  }
}

async function exportSingleItem(id) {
  if (!window.JSZip) return window.showToast("JSZip belum termuat.");
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  const zip = new window.JSZip();
  zip.file("data.json", JSON.stringify({ version: BACKUP_VERSION, exportedAt: new Date().toISOString(), items: [item] }, null, 2));
  if (item.fileId) {
    const record = await getFileRecord(item.fileId).catch(() => null);
    if (record?.blob) zip.folder("files").file(`${item.fileId}-${sanitizeFileName(record.name || item.mediaName || "file")}`, record.blob);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  await downloadBlob(blob, `${sanitizeFileName(item.title || "item")}.zip`);
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || !window.JSZip) return;
  try {
    const zip = await window.JSZip.loadAsync(file);
    const payload = JSON.parse(await zip.file("data.json").async("string"));
    const incomingItems = normalizeItems(payload.items || []);
    const incomingJournals = normalizeJournals(payload.journals || []);
    const existingById = new Map(state.items.map((item) => [item.id, item]));
    for (const item of incomingItems) existingById.set(item.id, item);
    for (const item of incomingItems) {
      if (!item.fileId) continue;
      const fileEntry = Object.values(zip.files).find((entry) => !entry.dir && entry.name.startsWith(`files/${item.fileId}-`));
      if (!fileEntry) continue;
      const blob = await fileEntry.async("blob");
      await putFileRecord({
        id: item.fileId,
        itemId: item.id,
        blob,
        name: item.mediaName || fileEntry.name.split("-").slice(1).join("-") || "file",
        type: item.mediaType || blob.type || getMimeForFileExtension(item.mediaName),
        size: item.mediaSize || blob.size,
        kind: item.mediaKind || inferMediaKind(item),
        documentType: item.documentType || (isDocumentItem(item) ? getDocumentType(item) : ""),
        documentText: item.documentText || "",
        fileHash: item.fileHash || "",
        uploadedAt: item.uploadedAt || new Date().toISOString()
      });
    }
    const existingJournalsById = new Map(state.journals.map((journal) => [journal.id, journal]));
    for (const journal of incomingJournals) existingJournalsById.set(journal.id, journal);
    for (const journal of incomingJournals) {
      for (const attachment of journal.attachments || []) {
        if (!attachment.fileId) continue;
        const fileEntry = Object.values(zip.files).find((entry) => !entry.dir && entry.name.startsWith(`files/${attachment.fileId}-`));
        if (!fileEntry) continue;
        const blob = await fileEntry.async("blob");
        await putFileRecord({
          id: attachment.fileId,
          itemId: journal.id,
          blob,
          name: attachment.name || fileEntry.name.split("-").slice(1).join("-") || "file",
          type: attachment.type || blob.type || getMimeForFileExtension(attachment.name),
          size: attachment.size || blob.size,
          kind: attachment.kind || inferMediaKind({ mediaName: attachment.name, mediaType: attachment.type }),
          documentType: attachment.documentType || "",
          documentText: attachment.documentText || "",
          uploadedAt: attachment.uploadedAt || new Date().toISOString()
        });
      }
    }
    state.items = [...existingById.values()];
    state.journals = [...existingJournalsById.values()];
    state.insightCache = payload.insightCache || state.insightCache;
    saveItems();
    saveJournals();
    saveInsightCache();
    render();
    window.showToast("Restore selesai.");
  } catch {
    window.showToast("Backup belum bisa dibaca.");
  }
}

async function downloadBlob(blob, filename) {
  const file = new File([blob], filename, { type: blob.type || "application/zip" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function sanitizeFileName(value) {
  return String(value || "file").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "file";
}

async function setLocalPin() {
  const pin = window.prompt("Masukkan PIN baru minimal 4 angka:");
  if (!pin) return;
  if (!/^\d{4,}$/.test(pin)) return window.showToast("PIN minimal 4 angka.");
  localStorage.setItem(PIN_KEY, await hashText(pin));
  window.showToast("PIN aktif.");
}

async function clearLocalPin() {
  if (!localStorage.getItem(PIN_KEY)) return;
  const pin = window.prompt("Masukkan PIN lama untuk menghapus:");
  if (!pin) return;
  if (await hashText(pin) !== localStorage.getItem(PIN_KEY)) return window.showToast("PIN salah.");
  localStorage.removeItem(PIN_KEY);
  window.showToast("PIN dihapus.");
}

async function enforcePinLock() {
  const savedHash = localStorage.getItem(PIN_KEY);
  if (!savedHash) return;
  document.body.append(makeLockOverlay());
  return new Promise((resolve) => {
    const input = document.querySelector("#pinUnlockInput");
    const message = document.querySelector("#pinUnlockMessage");
    const button = document.querySelector("#pinUnlockBtn");
    const unlock = async () => {
      if (await hashText(input.value) === savedHash) {
        document.querySelector(".pin-lock")?.remove();
        resolve();
      } else {
        message.textContent = "PIN salah.";
        input.value = "";
        input.focus();
      }
    };
    button.addEventListener("click", unlock);
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") unlock(); });
    input.focus();
  });
}

function makeLockOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "pin-lock";
  overlay.innerHTML = `
    <div class="pin-card">
      <div class="brand-mark">TL</div>
      <h2>Masukkan PIN</h2>
      <input id="pinUnlockInput" type="password" inputmode="numeric" autocomplete="current-password" placeholder="PIN">
      <button id="pinUnlockBtn" class="primary-button" type="button">Buka</button>
      <p id="pinUnlockMessage"></p>
    </div>`;
  return overlay;
}

async function hashText(value) {
  if (!globalThis.crypto?.subtle) return btoa(value);
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {}
}

async function clearOldAppCaches() {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("trading-library-manager-") && !key.endsWith(APP_VERSION)).map((key) => caches.delete(key)));
}


function toggleCardMenu(menu) {
  if (!menu) return;
  const willOpen = menu.hidden;
  closeOpenCardMenus();
  menu.hidden = !willOpen;
}

function closeOpenCardMenus() {
  document.querySelectorAll(".card-menu:not([hidden])").forEach((menu) => {
    menu.hidden = true;
  });
}

function loadJournals() {
  try {
    const parsed = JSON.parse(localStorage.getItem(JOURNAL_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJournals(journals = state.journals) {
  localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(journals));
  refreshInsightCache();
}

function normalizeJournals(journals) {
  return (journals || []).map((journal) => ({
    id: createId(),
    date: new Date().toISOString().slice(0, 10),
    title: "Jurnal Trading",
    market: "",
    setup: "",
    result: "Belum selesai",
    profit: 0,
    loss: 0,
    evaluation: "",
    mistakes: "",
    lessons: "",
    emotion: "",
    attachments: [],
    revisionHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...journal,
    attachments: Array.isArray(journal.attachments) ? journal.attachments : [],
    revisionHistory: Array.isArray(journal.revisionHistory) ? journal.revisionHistory : []
  }));
}

function resetJournalForm() {
  if (!dom.journalForm) return;
  dom.journalForm.reset();
  dom.journalId.value = "";
  dom.journalDateInput.value = new Date().toISOString().slice(0, 10);
  dom.journalResultInput.value = "Belum selesai";
  if (dom.journalProfitInput) dom.journalProfitInput.value = "";
  if (dom.journalLossInput) dom.journalLossInput.value = "";
  dom.journalFileMeta.textContent = "Gambar chart, video, PDF, Markdown, TXT, Word";
  dom.journalMessage.textContent = "";
  if (dom.resetJournalBtn) dom.resetJournalBtn.textContent = "Tutup Editor";
  state.pendingJournalFiles = [];
}

function openJournalEditor(mode = "new") {
  if (!dom.journalForm) return;
  state.journalEditorOpen = true;
  dom.journalForm.hidden = false;
  dom.journalForm.classList.add("is-open");
  if (dom.newJournalBtn) dom.newJournalBtn.textContent = mode === "edit" ? "Editor Aktif" : "Editor Terbuka";
  requestAnimationFrame(() => {
    dom.journalForm.scrollIntoView({ block: "start", behavior: "smooth" });
    dom.journalTitleInput?.focus();
  });
}

function closeJournalEditor() {
  if (!dom.journalForm) return;
  state.journalEditorOpen = false;
  dom.journalForm.hidden = true;
  dom.journalForm.classList.remove("is-open");
  if (dom.newJournalBtn) dom.newJournalBtn.textContent = "+ Jurnal Baru";
  state.pendingJournalFiles = [];
  if (dom.journalFileInput) dom.journalFileInput.value = "";
  if (dom.journalMessage) dom.journalMessage.textContent = "";
}

async function handleJournalFilePick() {
  const files = [...(dom.journalFileInput?.files || [])];
  state.pendingJournalFiles = [];
  if (!files.length) {
    dom.journalFileMeta.textContent = "Gambar chart, video, PDF, Markdown, TXT, Word";
    return;
  }
  try {
    const pending = [];
    for (const file of files) {
      const media = await makePendingMedia(file, { compressImage: true });
      if (media) pending.push(media);
    }
    state.pendingJournalFiles = pending;
    dom.journalFileMeta.textContent = pending.length === 1
      ? `${pending[0].name} • ${formatBytes(pending[0].size)}`
      : `${pending.length} lampiran dipilih`;
    if (!dom.journalTitleInput.value.trim() && pending[0]) {
      dom.journalTitleInput.value = fileTitleFromName(pending[0].name);
    }
  } catch {
    dom.journalMessage.textContent = "Lampiran jurnal belum bisa dibaca.";
  }
}

function getJournalFormData() {
  const now = new Date().toISOString();
  const existing = state.journals.find((journal) => journal.id === dom.journalId.value);
  const draft = {
    id: existing?.id || createId(),
    date: dom.journalDateInput.value || new Date().toISOString().slice(0, 10),
    title: dom.journalTitleInput.value.trim() || "Jurnal Trading",
    market: dom.journalMarketInput.value.trim(),
    setup: dom.journalSetupInput.value.trim(),
    result: dom.journalResultInput.value,
    profit: parseTradeAmount(dom.journalProfitInput?.value),
    loss: parseTradeAmount(dom.journalLossInput?.value),
    evaluation: dom.journalEvaluationInput.value.trim(),
    mistakes: dom.journalMistakesInput.value.trim(),
    lessons: dom.journalLessonsInput.value.trim(),
    emotion: dom.journalEmotionInput.value.trim(),
    attachments: [...(existing?.attachments || [])],
    revisionHistory: [...(existing?.revisionHistory || [])],
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  if (existing) {
    draft.revisionHistory = buildJournalRevisionHistory(existing, draft, now);
  }
  return draft;
}

function buildJournalRevisionHistory(existing, next, now) {
  const changed = ["title", "market", "setup", "result", "profit", "loss", "evaluation", "mistakes", "lessons", "emotion"]
    .some((key) => String(existing?.[key] || "") !== String(next?.[key] || ""));
  if (!changed) return existing.revisionHistory || [];
  return [
    ...(existing.revisionHistory || []),
    {
      at: now,
      title: existing.title,
      result: existing.result,
      evaluation: existing.evaluation,
      mistakes: existing.mistakes,
      lessons: existing.lessons
    }
  ].slice(-30);
}

async function saveJournalForm(event) {
  event.preventDefault();
  const journal = getJournalFormData();
  const createdFileIds = [];
  try {
    for (const pending of state.pendingJournalFiles || []) {
      const fileId = createId();
      await putFileRecord({
        id: fileId,
        itemId: journal.id,
        blob: pending.file,
        name: pending.name,
        type: pending.type,
        size: pending.size,
        kind: pending.kind,
        documentType: pending.documentType || "",
        documentText: pending.documentText || "",
        fileHash: pending.fileHash || "",
        uploadedAt: new Date().toISOString()
      });
      createdFileIds.push(fileId);
      journal.attachments.push({
        fileId,
        name: pending.name,
        type: pending.type,
        size: pending.size,
        kind: pending.kind,
        documentType: pending.documentType || "",
        documentText: pending.documentText || "",
        uploadedAt: new Date().toISOString()
      });
    }
    const exists = state.journals.some((entry) => entry.id === journal.id);
    state.journals = exists
      ? state.journals.map((entry) => entry.id === journal.id ? journal : entry)
      : [journal, ...state.journals];
    saveJournals();
    state.pendingJournalFiles = [];
    dom.journalFileInput.value = "";
    resetJournalForm();
    closeJournalEditor();
    render();
  } catch {
    await Promise.all(createdFileIds.map((fileId) => deleteFileRecord(fileId).catch(() => {})));
    dom.journalMessage.textContent = "Jurnal belum tersimpan.";
  }
}

function renderJournals() {
  if (!dom.journalList) return;
  dom.journalList.replaceChildren();
  const journals = [...state.journals].sort((a, b) => dateValue(b.date || b.updatedAt || b.createdAt) - dateValue(a.date || a.updatedAt || a.createdAt));
  dom.journalEmpty.hidden = journals.length > 0;
  dom.journalCount.textContent = `${journals.length} jurnal`;
  const grouped = groupJournalsByDate(journals);
  const fragment = document.createDocumentFragment();
  grouped.forEach(([date, rows]) => fragment.append(createJournalDateGroup(date, rows)));
  dom.journalList.append(fragment);
}

function groupJournalsByDate(journals) {
  const map = new Map();
  journals.forEach((journal) => {
    const date = journal.date || new Date().toISOString().slice(0, 10);
    if (!map.has(date)) map.set(date, []);
    map.get(date).push(journal);
  });
  return [...map.entries()].sort((a, b) => dateValue(b[0]) - dateValue(a[0]));
}

function createJournalDateGroup(date, journals) {
  const group = document.createElement("article");
  group.className = "journal-date-group";
  group.dataset.journalDateGroup = date;
  const isOpen = state.journalOpenDate === date;
  group.classList.toggle("is-open", isOpen);

  const win = journals.filter((journal) => journal.result === "Win").length;
  const loss = journals.filter((journal) => journal.result === "Loss").length;
  const profit = journals.reduce((sum, journal) => sum + parseTradeAmount(journal.profit), 0);
  const lossAmount = journals.reduce((sum, journal) => sum + parseTradeAmount(journal.loss), 0);

  const head = document.createElement("button");
  head.type = "button";
  head.className = "journal-date-head";
  head.innerHTML = `
    <span><strong>${formatDate(date)}</strong><small>${journals.length} jurnal • ${win}W / ${loss}L</small></span>
    <em>${formatTradeAmount(profit - lossAmount)}</em>
    <i aria-hidden="true"></i>
  `;
  head.addEventListener("click", () => toggleJournalDateGroup(date));
  group.append(head);

  if (isOpen) {
    const body = document.createElement("div");
    body.className = "journal-date-body";
    journals.forEach((journal) => body.append(createJournalCard(journal, state.journalOpenId === journal.id)));
    group.append(body);
  }
  return group;
}

function toggleJournalDateGroup(date) {
  state.journalOpenDate = state.journalOpenDate === date ? "" : date;
  state.journalOpenId = "";
  renderJournals();
}

function toggleJournalDetails(id) {
  state.journalOpenId = state.journalOpenId === id ? "" : id;
  renderJournals();
  requestAnimationFrame(() => document.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
}

function createJournalCard(journal, expanded = false) {
  const card = document.createElement("article");
  card.className = "journal-card";
  card.classList.toggle("is-expanded", expanded);
  card.dataset.id = journal.id;

  const head = document.createElement("div");
  head.className = "journal-card-head";
  const copy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = journal.title;
  const meta = document.createElement("p");
  meta.textContent = [formatDate(journal.date), journal.market, journal.setup, journal.result, getJournalProfitLossText(journal)].filter(Boolean).join(" • ");
  copy.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "journal-actions";
  const edit = makeJournalButton("Edit", () => editJournal(journal.id));
  const analyze = makeJournalButton("Tanya", () => askFromJournal(journal.id));
  const remove = makeJournalButton("Hapus", () => deleteJournal(journal.id), "danger");
  [edit, analyze, remove].forEach((button) => button.addEventListener("click", (event) => event.stopPropagation()));
  actions.append(edit, analyze, remove);
  copy.addEventListener("click", () => toggleJournalDetails(journal.id));
  head.append(copy, actions);

  const body = document.createElement("div");
  body.className = "journal-body";
  body.append(makeJournalTextBlock("Evaluasi", journal.evaluation));
  body.append(makeJournalTextBlock("Kesalahan", journal.mistakes));
  body.append(makeJournalTextBlock("Pelajaran", journal.lessons));
  if (journal.emotion) body.append(makeJournalTextBlock("Emosi", journal.emotion));
  body.hidden = !expanded;

  const attachments = document.createElement("div");
  attachments.className = "journal-attachments";
  if ((journal.attachments || []).length) {
    journal.attachments.forEach((attachment) => attachments.append(createJournalAttachment(journal, attachment)));
  }
  attachments.hidden = !expanded || !(journal.attachments || []).length;

  const rev = document.createElement("p");
  rev.className = "revision-line";
  rev.textContent = (journal.revisionHistory || []).length ? `${journal.revisionHistory.length} revisi tersimpan` : "";
  rev.hidden = !expanded || !(journal.revisionHistory || []).length;

  card.append(head, body, attachments, rev);
  return card;
}

function makeJournalButton(text, onClick, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `small-button ${extraClass}`.trim();
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function makeJournalTextBlock(label, value) {
  const block = document.createElement("div");
  block.className = "journal-text-block";
  const title = document.createElement("strong");
  title.textContent = label;
  const text = document.createElement("p");
  text.textContent = value || "-";
  block.append(title, text);
  return block;
}

function createJournalAttachment(journal, attachment) {
  const item = journalAttachmentToItem(journal, attachment);
  const wrap = document.createElement("div");
  wrap.className = "journal-attachment-wrap";

  const open = document.createElement("button");
  open.type = "button";
  open.className = "journal-attachment";
  open.title = attachment.name || "Lampiran";
  const mark = document.createElement("span");
  mark.textContent = attachment.kind === "image" ? "▣" : attachment.kind === "video" ? "▶" : (attachment.documentType || "DOC");
  const name = document.createElement("small");
  name.textContent = attachment.name || "Lampiran";
  open.append(mark, name);
  open.addEventListener("click", (event) => {
    event.stopPropagation();
    showFullscreenViewer(item);
  });
  if (attachment.kind === "image") {
    loadItemObjectUrl(item).then((url) => {
      if (!url) return;
      open.style.backgroundImage = `linear-gradient(rgba(0,0,0,.28),rgba(0,0,0,.62)), url(${url})`;
    }).catch(() => {});
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "journal-attachment-remove";
  remove.textContent = "×";
  remove.setAttribute("aria-label", `Hapus lampiran ${attachment.name || "jurnal"}`);
  remove.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    deleteJournalAttachment(journal.id, attachment.fileId);
  });

  wrap.append(open, remove);
  return wrap;
}

async function deleteJournalAttachment(journalId, fileId) {
  return removeJournalAttachment(journalId, fileId);
}

function getJournalAttachmentTarget(item) {
  if (!item) return null;
  const id = String(item.id || "");
  const [idJournalId, idFileId] = id.includes(":") ? id.split(":") : ["", ""];
  return {
    journalId: item.journalId || idJournalId,
    fileId: item.attachmentFileId || item.fileId || idFileId
  };
}

async function removeJournalAttachment(journalId, fileId, options = {}) {
  if (!journalId || !fileId) return false;
  const journal = state.journals.find((entry) => entry.id === journalId);
  if (!journal) return false;
  const attachment = (journal.attachments || []).find((entry) => entry.fileId === fileId);
  if (!attachment) return false;
  if (!options.skipConfirm) {
    const confirmed = window.confirm(`Hapus lampiran "${attachment.name || "jurnal"}"?`);
    if (!confirmed) return false;
  }
  await deleteFileRecord(fileId).catch(() => {});
  state.journals = state.journals.map((entry) => {
    if (entry.id !== journalId) return entry;
    return {
      ...entry,
      attachments: (entry.attachments || []).filter((item) => item.fileId !== fileId),
      updatedAt: new Date().toISOString()
    };
  });
  saveJournals();
  render();
  return true;
}

function journalAttachmentToItem(journal, attachment) {
  return {
    id: `${journal.id}:${attachment.fileId}`,
    journalId: journal.id,
    attachmentFileId: attachment.fileId,
    isJournalAttachment: true,
    title: `${journal.title} - ${attachment.name || "Lampiran"}`,
    type: attachment.kind === "image" ? "Gambar Chart" : attachment.kind === "video" ? "Video Pembelajaran" : "Dokumen",
    category: attachment.kind === "image" ? "Gambar Chart" : attachment.kind === "video" ? "Video" : getCategoryForDocumentType(attachment.documentType),
    status: journal.result || "Belum dibaca",
    notes: journal.evaluation || "Lampiran jurnal",
    mediaUrl: "",
    fileId: attachment.fileId,
    mediaKind: attachment.kind,
    mediaName: attachment.name,
    mediaType: attachment.type,
    mediaSize: attachment.size,
    documentType: attachment.documentType || "",
    documentText: attachment.documentText || "",
    uploadedAt: attachment.uploadedAt,
    createdAt: journal.createdAt,
    updatedAt: journal.updatedAt
  };
}

function editJournal(id) {
  const journal = state.journals.find((entry) => entry.id === id);
  if (!journal) return;
  dom.journalId.value = journal.id;
  dom.journalDateInput.value = journal.date || new Date().toISOString().slice(0, 10);
  dom.journalMarketInput.value = journal.market || "";
  dom.journalTitleInput.value = journal.title || "";
  dom.journalSetupInput.value = journal.setup || "";
  dom.journalResultInput.value = journal.result || "Belum selesai";
  if (dom.journalProfitInput) dom.journalProfitInput.value = journal.profit ? String(journal.profit) : "";
  if (dom.journalLossInput) dom.journalLossInput.value = journal.loss ? String(journal.loss) : "";
  let combinedNotes = journal.evaluation || "";
  if (journal.plan && !journal.evaluation) combinedNotes = journal.plan;
  else if (journal.plan && journal.evaluation) combinedNotes = "Rencana:\n" + journal.plan + "\n\nEvaluasi:\n" + journal.evaluation;
  dom.journalEvaluationInput.value = combinedNotes;
  dom.journalMistakesInput.value = journal.mistakes || "";
  dom.journalLessonsInput.value = journal.lessons || "";
  dom.journalEmotionInput.value = journal.emotion || "";
  dom.journalFileMeta.textContent = "Tambah lampiran baru bila perlu";
  dom.journalMessage.textContent = "Mode edit jurnal aktif.";
  if (dom.resetJournalBtn) dom.resetJournalBtn.textContent = "Batal Edit";
  setView("journal");
  openJournalEditor("edit");
}

async function deleteJournal(id) {
  const journal = state.journals.find((entry) => entry.id === id);
  if (!journal) return;
  if (!window.confirm(`Hapus jurnal "${journal.title}"?`)) return;
  await Promise.all((journal.attachments || []).map((attachment) => deleteFileRecord(attachment.fileId).catch(() => {})));
  state.journals = state.journals.filter((entry) => entry.id !== id);
  saveJournals();
  render();
}

function parseTradeAmount(value) {
  const normalized = String(value ?? "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function formatTradeAmount(value) {
  const number = Number(value) || 0;
  const sign = number < 0 ? "-" : "";
  const abs = Math.abs(number);
  return `${sign}${abs.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
}

function getJournalProfitLossText(journal) {
  const profit = parseTradeAmount(journal.profit);
  const loss = parseTradeAmount(journal.loss);
  if (profit && loss) return `P/L ${formatTradeAmount(profit - loss)}`;
  if (profit) return `Profit ${formatTradeAmount(profit)}`;
  if (loss) return `Loss ${formatTradeAmount(loss)}`;
  return "";
}

function loadAssistantSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(ASSISTANT_SETTINGS_KEY) || "{}");
    state.aiProvider = normalizeProvider(saved.provider || saved.aiProvider || "openrouter");
    state.geminiApiKey = normalizeApiKey(saved.apiKey || "");
    state.geminiModel = saved.model || getDefaultModelForProvider(state.aiProvider);
    state.aiBaseUrl = saved.baseUrl || "";
  } catch {
    state.aiProvider = "openrouter";
    state.geminiApiKey = "";
    state.geminiModel = getDefaultModelForProvider("openrouter");
    state.aiBaseUrl = "";
  }
  try {
    state.insightCache = JSON.parse(localStorage.getItem(INSIGHT_CACHE_KEY) || "null");
  } catch {
    state.insightCache = null;
  }
}

function saveGeminiSettings(showMessage = true) {
  state.aiProvider = normalizeProvider(dom.aiProviderInput?.value || state.aiProvider || "openrouter");
  state.geminiApiKey = normalizeApiKey(dom.geminiApiKeyInput?.value || "");
  state.geminiModel = dom.geminiModelInput?.value.trim() || getDefaultModelForProvider(state.aiProvider);
  state.aiBaseUrl = normalizeBaseUrl(dom.aiBaseUrlInput?.value.trim() || "");
  localStorage.setItem(ASSISTANT_SETTINGS_KEY, JSON.stringify({
    provider: state.aiProvider,
    apiKey: state.geminiApiKey,
    model: state.geminiModel,
    baseUrl: state.aiBaseUrl
  }));
  syncProviderFields();
  if (showMessage && dom.assistantMessage) {
    dom.assistantMessage.textContent = state.geminiApiKey ? `API ${getProviderLabel(state.aiProvider)} tersimpan lokal di webpage.` : "API key kosong.";
  }
}

function clearGeminiSettings() {
  state.aiProvider = normalizeProvider(dom.aiProviderInput?.value || "openrouter");
  state.geminiApiKey = "";
  state.geminiModel = getDefaultModelForProvider(state.aiProvider);
  state.aiBaseUrl = "";
  localStorage.removeItem(ASSISTANT_SETTINGS_KEY);
  if (dom.geminiApiKeyInput) dom.geminiApiKeyInput.value = "";
  if (dom.geminiModelInput) dom.geminiModelInput.value = state.geminiModel;
  if (dom.aiBaseUrlInput) dom.aiBaseUrlInput.value = "";
  syncProviderFields();
  if (dom.assistantMessage) dom.assistantMessage.textContent = "API key dihapus.";
}

function renderAssistantPanel() {
  if (!dom.geminiApiKeyInput) return;
  if (dom.aiProviderInput && document.activeElement !== dom.aiProviderInput) dom.aiProviderInput.value = state.aiProvider || "openrouter";
  if (document.activeElement !== dom.geminiApiKeyInput) dom.geminiApiKeyInput.value = state.geminiApiKey || "";
  if (document.activeElement !== dom.geminiModelInput) dom.geminiModelInput.value = state.geminiModel || getDefaultModelForProvider(state.aiProvider);
  if (dom.aiBaseUrlInput && document.activeElement !== dom.aiBaseUrlInput) dom.aiBaseUrlInput.value = state.aiBaseUrl || "";
  syncProviderFields();
  renderAssistantModeTabs();
  renderAssistantChatLog();
  renderInsightBox();
  updateAssistantApiSummary();
}

function updateAssistantApiSummary() {
  if (!dom.assistantApiSummary) return;
  const provider = getProviderLabel(state.aiProvider || dom.aiProviderInput?.value || "openrouter");
  const model = state.geminiModel || dom.geminiModelInput?.value || getDefaultModelForProvider(state.aiProvider);
  const status = normalizeApiKey(state.geminiApiKey || dom.geminiApiKeyInput?.value || "") ? "Terhubung" : "Belum tersambung";
  dom.assistantApiSummary.textContent = `${provider} • ${model || "default"} • ${status}`;
}

function syncProviderFields() {
  const provider = normalizeProvider(dom.aiProviderInput?.value || state.aiProvider || "openrouter");
  state.aiProvider = provider;
  const defaultModel = getDefaultModelForProvider(provider);
  if (dom.geminiModelInput) {
    dom.geminiModelInput.placeholder = defaultModel;
    if (!dom.geminiModelInput.value.trim()) dom.geminiModelInput.value = defaultModel;
  }
  if (dom.aiBaseUrlInput) {
    const needsBaseUrl = provider === "custom";
    dom.aiBaseUrlInput.closest("label")?.toggleAttribute("hidden", !needsBaseUrl);
    dom.aiBaseUrlInput.required = needsBaseUrl;
    dom.aiBaseUrlInput.placeholder = "https://domain-api-kamu.com/v1/chat/completions";
  }
}

function handleProviderChange() {
  const provider = normalizeProvider(dom.aiProviderInput?.value || "openrouter");
  state.aiProvider = provider;
  const defaultModel = getDefaultModelForProvider(provider);
  if (dom.geminiModelInput) dom.geminiModelInput.value = defaultModel;
  syncProviderFields();
}

function getDefaultModelForProvider(provider) {
  const defaults = {
    deepseek: "deepseek-chat",
    gemini: "gemini-2.0-flash",
    groq: "llama-3.1-8b-instant",
    openrouter: "google/gemini-2.0-flash-001",
    mistral: "mistral-small-latest",
    openai: "gpt-4o-mini",
    custom: ""
  };
  return defaults[provider] || defaults.openrouter;
}

function getProviderLabel(provider) {
  const labels = {
    deepseek: "DeepSeek",
    gemini: "Gemini",
    groq: "Groq",
    openrouter: "OpenRouter",
    mistral: "Mistral/Mimo",
    openai: "OpenAI",
    custom: "Custom API"
  };
  return labels[provider] || provider || "AI";
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  const aliases = {
    openrouterai: "openrouter",
    open_router: "openrouter",
    openai: "openai",
    gemini: "gemini",
    google: "gemini",
    groq: "groq",
    mistral: "mistral",
    mimo: "mistral",
    custom: "custom"
  };
  return aliases[provider] || provider || "openrouter";
}

function normalizeApiKey(value) {
  return String(value || "").trim().replace(/^Bearer\s+/i, "");
}

function saveInsightCache() {
  if (state.insightCache) {
    localStorage.setItem(INSIGHT_CACHE_KEY, JSON.stringify(state.insightCache));
  } else {
    localStorage.removeItem(INSIGHT_CACHE_KEY);
  }
}

function clearInsightCache() {
  state.insightCache = null;
  saveInsightCache();
  renderAssistantPanel();
}

function updateInsightCache() {
  refreshInsightCache({ renderPanel: true, showMessage: true });
}

function refreshInsightCache(options = {}) {
  const { renderPanel = state.view === "assistant", showMessage = false } = options;
  try {
    const text = buildLocalInsightText();
    state.insightCache = {
      updatedAt: new Date().toISOString(),
      text,
      cards: buildInsightCards()
    };
    saveInsightCache();
    if (renderPanel) renderInsightBox();
    if (showMessage && dom.assistantMessage) dom.assistantMessage.textContent = "Insight lokal diperbarui otomatis tanpa memakai API.";
  } catch {}
}

function buildLocalInsightText() {
  const keywordRows = getKeywordRows();
  const journalResults = countBy(state.journals, (journal) => journal.result || "Belum selesai");
  const setups = countBy(state.journals, (journal) => journal.setup || "Tanpa setup");
  const categories = countBy(state.items, (item) => item.category || "Tanpa kategori");
  const stats = calculateJournalStats(state.journals);
  const profitSetups = rankSetupsByAmount("profit");
  const lossSetups = rankSetupsByAmount("loss");
  const recentJournals = state.journals.slice(0, 5).map((journal) => `- ${formatDate(journal.date)} ${journal.market || ""} ${journal.result || ""} ${getJournalProfitLossText(journal)}: ${journal.mistakes || journal.lessons || journal.plan || "tanpa catatan"}`.trim()).join("\n");
  return [
    `Update: ${new Date().toLocaleString("id-ID")}`,
    `Total file/materi: ${state.items.length}`,
    `Total jurnal: ${state.journals.length}`,
    `Win rate: ${stats.winRate}%`,
    `Total profit: ${formatTradeAmount(stats.totalProfit)}`,
    `Total loss: ${formatTradeAmount(stats.totalLoss)}`,
    `Net P/L: ${formatTradeAmount(stats.netProfit)}`,
    `Rata-rata profit: ${formatTradeAmount(stats.averageProfit)}`,
    `Rata-rata loss: ${formatTradeAmount(stats.averageLoss)}`,
    `Setup paling profit: ${profitSetups || "belum ada"}`,
    `Setup paling merugikan: ${lossSetups || "belum ada"}`,
    `Pola kata kunci dominan: ${keywordRows.length ? keywordRows.map((row) => `${row.label} (${row.count})`).join(", ") : "belum cukup data"}`,
    `Hasil jurnal: ${formatCountMap(journalResults)}`,
    `Setup jurnal: ${formatCountMap(setups)}`,
    `Kategori file dominan: ${formatCountMap(categories)}`,
    `Jurnal terbaru:\n${recentJournals || "Belum ada jurnal."}`
  ].join("\n");
}

function getKeywordRows() {
  const allTexts = [
    ...state.items.map((item) => [item.title, item.category, item.status, item.collection, item.notes, item.documentText, ...(item.tags || [])].join(" ")),
    ...state.journals.map((journal) => [journal.title, journal.market, journal.setup, journal.result, journal.plan, journal.evaluation, journal.mistakes, journal.lessons, journal.emotion].join(" "))
  ].join("\n").toLowerCase();
  const keywordMap = {
    "FOMO": ["fomo", "takut ketinggalan"],
    "Revenge trade": ["revenge", "balas", "balas dendam"],
    "Entry terlalu cepat": ["entry cepat", "terlalu cepat", "cepat entry"],
    "Overconfidence": ["over confident", "overconfidence", "terlalu confident", "percaya diri"],
    "Overtrading": ["overtrading", "terlalu banyak", "banyak entry"],
    "Risk management": ["risk", "rr", "sl", "stop loss", "lot"],
    "Liquidity / sweep": ["liquidity", "sweep", "liquid", "fakeout"],
    "Order Block / FVG": ["order block", "ob", "fvg", "fair value gap"]
  };
  return Object.entries(keywordMap).map(([label, words]) => ({
    label,
    count: words.reduce((sum, word) => sum + countOccurrences(allTexts, word), 0)
  })).filter((row) => row.count).sort((a, b) => b.count - a.count);
}

function buildInsightCards() {
  const stats = calculateJournalStats(state.journals);
  const keywordRows = getKeywordRows();
  const topKeyword = keywordRows[0]?.label || "Belum cukup data";
  const topSetup = countBy(state.journals, (journal) => journal.setup || "Tanpa setup")[0]?.[0] || "Belum ada";
  return [
    { label: "Jurnal", value: state.journals.length },
    { label: "Win Rate", value: `${stats.winRate}%` },
    { label: "Net P/L", value: formatTradeAmount(stats.netProfit) },
    { label: "Kesalahan", value: topKeyword },
    { label: "Setup", value: topSetup }
  ];
}

function renderInsightBox() {
  if (!dom.insightBox) return;
  if (!state.insightCache) {
    dom.insightBox.textContent = "Belum ada insight. Tekan Update Insight.";
    return;
  }
  const cards = state.insightCache.cards || buildInsightCards();
  dom.insightBox.innerHTML = `
    <div class="insight-cards">
      ${cards.map((card) => `<article class="insight-mini-card"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></article>`).join("")}
    </div>
    <pre class="insight-text">${escapeHtml(state.insightCache.text || "")}</pre>
  `;
}

function rankSetupsByAmount(key) {
  const map = new Map();
  state.journals.forEach((journal) => {
    const setup = journal.setup || "Tanpa setup";
    const amount = parseTradeAmount(journal[key]);
    if (!amount) return;
    map.set(setup, (map.get(setup) || 0) + amount);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([setup, amount]) => `${setup} (${formatTradeAmount(amount)})`).join(", ");
}

function countOccurrences(text, word) {
  if (!word) return 0;
  return (text.match(new RegExp(escapeRegExp(word), "g")) || []).length;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countBy(items, getter) {
  const map = new Map();
  items.forEach((item) => {
    const key = getter(item) || "-";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
}

function formatCountMap(entries) {
  return entries.length ? entries.map(([key, count]) => `${key} (${count})`).join(", ") : "belum ada";
}

async function testGeminiConnection() {
  saveGeminiSettings(false);
  state.geminiApiKey = normalizeApiKey(state.geminiApiKey || dom.geminiApiKeyInput?.value || "");
  if (!state.geminiApiKey) {
    dom.assistantMessage.textContent = "Isi API key dulu.";
    return;
  }
  dom.assistantMessage.textContent = `Mengetes koneksi ${getProviderLabel(state.aiProvider)}...`;
  try {
    await callAI([{ text: "Balas singkat dalam bahasa Indonesia: koneksi berhasil." }]);
    dom.assistantMessage.textContent = `Koneksi ${getProviderLabel(state.aiProvider)} berhasil.`;
  } catch (error) {
    dom.assistantMessage.textContent = `Koneksi gagal: ${error.message || "API error"}`;
  }
}

function loadAssistantChatHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ASSISTANT_CHAT_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((message) => message && ["user", "assistant"].includes(message.role)).slice(-ASSISTANT_MAX_HISTORY);
  } catch {
    return [];
  }
}

function saveAssistantChatHistory() {
  try {
    localStorage.setItem(ASSISTANT_CHAT_KEY, JSON.stringify(state.assistantChatHistory.slice(-ASSISTANT_MAX_HISTORY)));
  } catch {}
}

function setAssistantMode(mode = "coach") {
  const nextMode = ["coach", "material", "action"].includes(mode) ? mode : "coach";
  state.assistantMode = nextMode;
  renderAssistantModeTabs();
}

function getAssistantModeConfig(mode = state.assistantMode || "coach") {
  const configs = {
    coach: {
      label: "Coach Trading",
      placeholder: "Tanya evaluasi trading, jurnal, psikologi, atau konsep...",
      items: [
        { label: "Evaluasi jurnal terakhir", prompt: "evaluasi jurnal terakhir saya" },
        { label: "Kenapa saya sering salah?", prompt: "kenapa saya sering salah dari jurnal terakhir?" },
        { label: "Buat checklist entry", prompt: "buatkan checklist sebelum entry berdasarkan jurnal saya" },
        { label: "Jelaskan konsep", prompt: "jelaskan konsep trading ini secara sederhana: " }
      ]
    },
    material: {
      label: "Cari Materi",
      placeholder: "Cari materi, buka bab, atau tampilkan daftar file...",
      items: [
        { label: "Cari materi", prompt: "cari materi tentang " },
        { label: "Buka bab", prompt: "buka bab " },
        { label: "Daftar video", prompt: "tampilkan daftar materi video" },
        { label: "Daftar markdown", prompt: "tampilkan daftar materi markdown" }
      ]
    },
    action: {
      label: "Aksi Aplikasi",
      placeholder: "Pilih aksi aman: hapus, arsipkan, ubah status, atau buka file...",
      items: [
        { label: "Hapus materi", prompt: "hapus materi " },
        { label: "Arsipkan materi", prompt: "arsipkan materi " },
        { label: "Ubah status selesai", prompt: "ubah status materi menjadi selesai: " },
        { label: "Buka file", prompt: "buka file " }
      ]
    }
  };
  return configs[mode] || configs.coach;
}

function renderAssistantModeTabs() {
  const buttons = dom.assistantModeTabs?.querySelectorAll(".assistant-mode-tab") || dom.assistantModeButtons || [];
  buttons.forEach((button) => {
    const active = button.dataset.assistantMode === state.assistantMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  const config = getAssistantModeConfig();
  if (dom.assistantModeLabel) dom.assistantModeLabel.textContent = config.label;
  if (dom.assistantQuestionInput) dom.assistantQuestionInput.placeholder = config.placeholder;
  renderAssistantShortcutMenu(config);
}

function renderAssistantShortcutMenu(config = getAssistantModeConfig()) {
  if (!dom.assistantShortcutMenu) return;
  dom.assistantShortcutMenu.replaceChildren();
  config.items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "assistant-shortcut-chip";
    button.textContent = item.label;
    button.dataset.prompt = item.prompt;
    dom.assistantShortcutMenu.append(button);
  });
}


function autoGrowTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
}

function handleAssistantShortcutClick(event) {
  const button = event.target.closest(".assistant-shortcut-chip");
  if (!button || !dom.assistantQuestionInput) return;
  dom.assistantQuestionInput.value = button.dataset.prompt || "";
  dom.assistantQuestionInput.focus();
  autoGrowTextarea(dom.assistantQuestionInput);
}

function clearAssistantHistory() {
  state.assistantChatHistory = [];
  saveAssistantChatHistory();
  renderAssistantChatLog();
}

function appendAssistantChat(role, text, extra = {}) {
  const message = {
    id: createId(),
    role,
    text: String(text || ""),
    createdAt: new Date().toISOString(),
    ...extra
  };
  state.assistantChatHistory.push(message);
  state.assistantChatHistory = state.assistantChatHistory.slice(-ASSISTANT_MAX_HISTORY);
  saveAssistantChatHistory();
  renderAssistantChatLog();
  return message;
}

function updateAssistantChatMessage(id, text, extra = {}) {
  const index = state.assistantChatHistory.findIndex((message) => message.id === id);
  if (index < 0) {
    appendAssistantChat("assistant", text, extra);
    return;
  }
  state.assistantChatHistory[index] = { ...state.assistantChatHistory[index], text: String(text || ""), ...extra };
  saveAssistantChatHistory();
  renderAssistantChatLog();
}

function renderAssistantChatLog() {
  if (!dom.assistantChatLog) return;
  dom.assistantChatLog.replaceChildren();
  if (!state.assistantChatHistory.length) {
    const empty = document.createElement("div");
    empty.className = "assistant-chat-empty";
    empty.innerHTML = `
      <strong>Tulis bebas.</strong>
      <span>Asisten akan otomatis membaca maksud: coaching, cari materi, buka file, atau aksi aplikasi.</span>
    `;
    if (dom.assistantQuickPrompts) dom.assistantQuickPrompts.style.display = "flex";
  } else {
    if (dom.assistantQuickPrompts) dom.assistantQuickPrompts.style.display = "none";
    const fragment = document.createDocumentFragment();
    state.assistantChatHistory.forEach((message) => fragment.append(createAssistantMessageNode(message)));
    dom.assistantChatLog.append(fragment);
  }
  if (state.pendingAiAction?.surface === "assistant") {
    dom.assistantChatLog.append(createAiActionConfirmNode(state.pendingAiAction));
  }
  dom.assistantChatLog.scrollTop = dom.assistantChatLog.scrollHeight;
}

function createAssistantMessageNode(message) {
  const wrapper = document.createElement("div");
  wrapper.className = `assistant-message-wrapper ${message.role === "user" ? "is-user" : "is-ai"}`;

  const avatar = document.createElement("div");
  avatar.className = "assistant-avatar";
  if (message.role === "user") {
    avatar.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
  } else {
    avatar.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7v1a1 1 0 0 1-1 1h-1v1a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-1H3a1 1 0 0 1-1-1v-1a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 12 2z"></path><path d="M9 13v2"></path><path d="M15 13v2"></path></svg>`;
  }

  const bubble = document.createElement("article");
  bubble.className = `assistant-message ${message.role === "user" ? "is-user" : "is-ai"}`;

  const text = document.createElement("div");
  text.className = "assistant-message-text";
  
  let formattedText = escapeHtml(message.text || "");
  formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formattedText = formattedText.replace(/\n\* (.*?)/g, '<br>• $1');
  formattedText = formattedText.replace(/\n- (.*?)/g, '<br>• $1');
  text.innerHTML = formattedText;

  bubble.append(text);
  if (message.kind === "materials" && Array.isArray(message.itemIds)) {
    bubble.append(createMaterialResultList(message.itemIds));
  }
  
  if (message.role !== "user") {
    if (message.isFakeLoading) {
      text.classList.add("ai-loading-text");
    } else {
      const saveBtn = document.createElement("button");
      saveBtn.className = "text-button save-ai-btn";
      saveBtn.type = "button";
      saveBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
        Simpan Jawaban
      `;
      saveBtn.addEventListener("click", () => saveAiResponseAsMaterial(message));
      bubble.append(saveBtn);
    }
  }
  
  wrapper.append(avatar, bubble);
  return wrapper;
}

function formatMessageTime(value) {
  try {
    return new Date(value || Date.now()).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function createMaterialResultList(itemIds = []) {
  const wrap = document.createElement("div");
  wrap.className = "assistant-material-results";
  const items = itemIds.map((id) => state.items.find((item) => item.id === id)).filter(Boolean).slice(0, 8);
  items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "assistant-material-row";
    const info = document.createElement("span");
    info.textContent = `${index + 1}. ${item.title} • ${getItemFileType(item)} • ${item.status}`;
    const open = document.createElement("button");
    open.type = "button";
    open.className = "small-button";
    open.textContent = "Buka";
    open.addEventListener("click", () => openAiMaterialItem(item));
    row.append(info, open);
    wrap.append(row);
  });
  return wrap;
}

function saveAiResponseAsMaterial(message) {
  const shortText = message.text.replace(/\n/g, " ").slice(0, 30);
  const newItem = {
    id: createId(),
    type: "Materi Baru",
    category: "Markdown",
    status: "Inbox",
    title: `Jawaban AI: ${shortText}...`,
    documentText: message.text,
    notes: "",
    tags: ["AI"],
    createdAt: new Date().toISOString()
  };
  state.items.unshift(newItem);
  saveItems();
  renderGrid(dom.libraryGrid, filterGridItems(state.items));
  showToast("Jawaban berhasil disimpan ke Library sebagai Markdown!");
}

function openAiMaterialItem(item) {
  if (!item) return;
  if (canOpenFullscreen(item)) {
    showFullscreenViewer(item);
    return;
  }
  openForm(item.id);
}

async function askAssistant() {
  const question = dom.assistantQuestionInput?.value.trim() || "";
  if (!question) return;
  if (dom.assistantQuestionInput) dom.assistantQuestionInput.value = "";
  await processAssistantInput(question, "assistant");
}

async function hydrateMaterialContentsForQuery(query = "", options = {}) {
  const maxItems = options.maxItems || 220;
  const docs = state.items
    .filter((item) => !item.archived && shouldHydrateMaterialContent(item))
    .slice(0, maxItems);
  if (!docs.length) return;
  const keywords = extractItemSearchKeywords(query);
  const prioritized = docs.sort((a, b) => {
    const aMeta = [a.title, a.mediaName, a.category, a.collection, a.notes, ...(a.tags || [])].join(" ").toLowerCase();
    const bMeta = [b.title, b.mediaName, b.category, b.collection, b.notes, ...(b.tags || [])].join(" ").toLowerCase();
    const aScore = keywords.reduce((sum, word) => sum + (aMeta.includes(word) ? 1 : 0), 0);
    const bScore = keywords.reduce((sum, word) => sum + (bMeta.includes(word) ? 1 : 0), 0);
    return bScore - aScore;
  });
  const concurrency = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < prioritized.length) {
      const item = prioritized[cursor++];
      const text = await getCachedMaterialContent(item);
      if (text) item.documentText = text;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, prioritized.length) }, worker));
  state.materialContentHydrated = true;
}

function shouldHydrateMaterialContent(item) {
  if (!item) return false;
  const fileType = getItemFileType(item);
  return item.documentText
    || item.textPreview
    || item.fileId
    || /^data:text\//i.test(getMediaSource(item))
    || ["Markdown", "Word", "PDF"].includes(fileType)
    || item.mediaKind === "document";
}

async function getCachedMaterialContent(item) {
  if (!item) return "";
  const cacheKey = item.fileId || item.id;
  if (cacheKey && state.materialContentCache.has(cacheKey)) return state.materialContentCache.get(cacheKey);
  let text = item.documentText || item.textPreview || "";
  if (!text && item.fileId) {
    const record = await getFileRecord(item.fileId).catch(() => null);
    if (record?.documentText) {
      text = record.documentText;
    } else if (record?.blob) {
      const docType = record.documentType || item.documentType || getDocumentType(item);
      text = await extractDocumentTextFromBlob(record.blob, docType).catch(() => docType === "Word" ? "" : record.blob.text());
      if (text && !record.documentText) await putFileRecord({ ...record, documentText: text }).catch(() => {});
    }
  }
  if (!text) text = decodeTextDataUrl(getMediaSource(item));
  text = normalizeMaterialContentText(text).slice(0, 30000);
  if (cacheKey) state.materialContentCache.set(cacheKey, text);
  return text;
}

function normalizeMaterialContentText(text) {
  return String(text || "")
    .replace(/\u0000/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

async function buildLocalAssistantQuickAnswer(question) {
  const normalized = normalizeCommandText(question);
  const stats = calculateJournalStats(state.journals);
  if (/\b(berapa|jumlah|total)\b.*\b(jurnal|entry|entri)\b/i.test(normalized) || /\b(sudah ada|ada)\b.*\b(jurnal|entry|entri)\b/i.test(normalized)) {
    return `Saat ini ada ${state.journals.length} jurnal. Win rate ${stats.winRate}%, net P/L ${formatTradeAmount(stats.netProfit)}.`;
  }
  if (/\b(berapa|jumlah|total)\b.*\b(file|materi|library|dokumen)\b/i.test(normalized)) {
    const active = state.items.filter((item) => !item.archived).length;
    return `Saat ini ada ${state.items.length} file/materi, dengan ${active} item aktif dan ${state.items.length - active} item arsip.`;
  }
  if (/\b(win rate|wr|rasio menang)\b/i.test(normalized)) {
    return `Win rate jurnal saat ini ${stats.winRate}% dari ${state.journals.length} jurnal.`;
  }
  if (/\b(net p\/l|profit loss|profit|loss)\b/i.test(normalized) && /\b(berapa|total|jumlah|saat ini)\b/i.test(normalized)) {
    return `Total profit ${formatTradeAmount(stats.totalProfit)}, total loss ${formatTradeAmount(stats.totalLoss)}, net P/L ${formatTradeAmount(stats.netProfit)}.`;
  }
  const conceptAnswer = buildTradingConceptAnswer(question);
  if (conceptAnswer) return conceptAnswer;
  return "";
}

function buildTradingConceptAnswer(question) {
  const normalized = normalizeCommandText(question);
  if (!isTradingConceptQuestion(normalized)) return null;

  const concept = detectTradingConcept(normalized);
  const relatedItems = getRelatedMaterialsForConcept(question, concept).slice(0, 5);
  if (!concept && !relatedItems.length) return null;

  const explanation = concept?.explanation || buildFallbackConceptExplanation(question, relatedItems);
  const materialLines = relatedItems.length
    ? ["", "Materi terkait:", ...relatedItems.map((item, index) => `${index + 1}. ${item.title}`)]
    : [];
  const source = relatedItems.length && concept
    ? "Sumber: materi terupload + pengetahuan AI"
    : relatedItems.length
      ? "Sumber: materi terupload"
      : "Sumber: pengetahuan AI, bukan dari materi/jurnal pengguna";

  return {
    text: [explanation, ...materialLines, "", source].join("\n"),
    extra: relatedItems.length ? { kind: "materials", itemIds: relatedItems.map((item) => item.id) } : {}
  };
}

function isTradingConceptQuestion(normalized) {
  return /\b(apa itu|apakah|jelaskan|jelasin|maksud|pengertian|definisi|konsep|artinya|arti|fungsi|kegunaan|bagaimana cara kerja)\b/i.test(normalized);
}

function detectTradingConcept(normalized) {
  const concepts = [
    {
      aliases: ["order block", "orderblock", " ob "],
      title: "Order Block",
      explanation: "Order Block adalah area harga tempat institusi atau pelaku besar kemungkinan meninggalkan jejak order sebelum harga bergerak kuat. Dalam praktik trading, area ini sering dipakai sebagai zona reaksi potensial, bukan sinyal tunggal untuk entry. Order Block yang lebih kuat biasanya muncul setelah displacement jelas, sweep liquidity, atau perubahan struktur market."
    },
    {
      aliases: ["fair value gap", " fvg ", "imbalance"],
      title: "Fair Value Gap",
      explanation: "FVG atau Fair Value Gap adalah area ketidakseimbangan harga yang terbentuk saat harga bergerak cepat dan meninggalkan ruang antar candle. Area ini sering dianggap sebagai zona yang berpotensi dikunjungi kembali oleh harga sebelum melanjutkan arah. FVG lebih aman dibaca bersama struktur market, liquidity, dan konteks premium-discount."
    },
    {
      aliases: ["liquidity sweep", "liquidity", "sweep", "liquiditas", "likuiditas"],
      title: "Liquidity Sweep",
      explanation: "Liquidity Sweep adalah gerakan harga yang mengambil stop loss atau likuiditas di atas high/di bawah low sebelum harga berbalik atau melanjutkan arah yang lebih jelas. Konsep ini membantu trader membedakan breakout asli dengan jebakan likuiditas. Sweep tetap perlu dikonfirmasi dengan reaksi harga, struktur, dan timing session."
    },
    {
      aliases: ["bos", "break of structure"],
      title: "BOS",
      explanation: "BOS atau Break of Structure adalah kondisi ketika harga menembus struktur penting dan menunjukkan kelanjutan arah market. BOS biasanya dipakai untuk mengonfirmasi bahwa momentum masih searah dengan bias utama. Validitas BOS lebih kuat jika terjadi setelah liquidity diambil dan disertai displacement yang jelas."
    },
    {
      aliases: ["choch", "change of character", "change in character"],
      title: "CHoCH",
      explanation: "CHoCH atau Change of Character adalah perubahan karakter pergerakan harga yang memberi tanda awal potensi perubahan arah. CHoCH tidak otomatis berarti reversal pasti, tetapi menjadi peringatan bahwa struktur sebelumnya mulai melemah. Konfirmasi tambahan tetap diperlukan melalui liquidity, displacement, dan area reaksi."
    },
    {
      aliases: ["poi", "point of interest"],
      title: "POI",
      explanation: "POI atau Point of Interest adalah area harga yang dianggap penting untuk menunggu reaksi, seperti Order Block, FVG, supply-demand, atau area liquidity. POI bukan tempat entry otomatis, tetapi lokasi untuk mencari konfirmasi. POI yang baik biasanya selaras dengan bias, struktur, dan target likuiditas."
    },
    {
      aliases: ["judas swing", "judas"],
      title: "Judas Swing",
      explanation: "Judas Swing adalah gerakan awal session yang terlihat meyakinkan ke satu arah, tetapi sering berfungsi menjebak trader sebelum harga bergerak ke arah utama. Konsep ini banyak dipakai untuk membaca manipulasi awal London/New York. Trader biasanya menunggu sweep dan konfirmasi sebelum mengambil keputusan."
    },
    {
      aliases: ["pdh", "previous day high"],
      title: "PDH",
      explanation: "PDH atau Previous Day High adalah harga tertinggi hari sebelumnya. Level ini sering menjadi area likuiditas karena banyak stop loss atau order tertahan di sekitar high tersebut. Reaksi harga di PDH perlu dibaca bersama sweep, displacement, dan bias harian."
    },
    {
      aliases: ["pdl", "previous day low"],
      title: "PDL",
      explanation: "PDL atau Previous Day Low adalah harga terendah hari sebelumnya. Level ini sering menjadi area likuiditas karena stop loss seller/buyer dapat terkumpul di sana. PDL penting untuk membaca potensi sweep, reversal, atau continuation berdasarkan konteks market."
    },
    {
      aliases: ["ce", "consequent encroachment"],
      title: "CE",
      explanation: "CE atau Consequent Encroachment adalah area tengah dari imbalance/FVG yang sering dipakai sebagai level reaksi. Dalam praktik ICT, CE membantu mengukur apakah harga sudah mengisi sebagian gap secara cukup. CE tetap harus dibaca bersama struktur, liquidity, dan bias market."
    },
    {
      aliases: ["premium", "discount", "premium discount"],
      title: "Premium dan Discount",
      explanation: "Premium dan Discount adalah cara membaca posisi harga relatif terhadap range. Area premium berarti harga relatif mahal dalam range, sedangkan discount berarti relatif murah. Konsep ini membantu trader menghindari buy terlalu tinggi atau sell terlalu rendah."
    },
    {
      aliases: ["risk management", "manajemen risiko", "risk", "rr", "risk reward"],
      title: "Risk Management",
      explanation: "Risk Management adalah aturan mengelola risiko agar satu kesalahan tidak merusak akun. Isinya bisa berupa batas risiko per trade, stop loss, ukuran posisi, RR minimal, dan batas kerugian harian. Dalam trading, risk management sering lebih menentukan konsistensi daripada akurasi entry."
    }
  ];
  const padded = ` ${normalized} `;
  return concepts.find((concept) => concept.aliases.some((alias) => padded.includes(alias)));
}

function buildFallbackConceptExplanation(question, relatedItems = []) {
  const title = relatedItems[0]?.title || extractItemSearchKeywords(question).join(" ") || "konsep ini";
  return `Konsep ini berkaitan dengan materi ${title}. Untuk jawaban yang lebih tepat, buka materi terkait di bawah agar isi lengkapnya tampil di viewer aplikasi.`;
}

function getRelatedMaterialsForConcept(question, concept = null) {
  const queryParts = [question, concept?.title || "", ...(concept?.aliases || [])].filter(Boolean);
  const keywords = extractItemSearchKeywords(queryParts.join(" "));
  const questionText = normalizeCommandText(queryParts.join(" "));
  const ranked = rankContextItems(questionText, keywords).slice(0, 8);
  const direct = resolveAiMaterialMatches(question, {}).slice(0, 8);
  return mergeUniqueById([...ranked, ...direct]).filter((item) => !item.archived).slice(0, 5);
}

async function getRelevantLocalContext(question) {
  await hydrateMaterialContentsForQuery(question);
  const keywords = extractItemSearchKeywords(question);
  const questionText = normalizeCommandText(question);
  const stats = calculateJournalStats(state.journals);
  const matchedItems = rankContextItems(questionText, keywords).slice(0, 8);
  const recentJournals = state.journals.slice(0, 8);
  const matchedJournals = rankContextJournals(questionText, keywords).slice(0, 6);
  const journalPool = mergeUniqueById([...matchedJournals, ...recentJournals]).slice(0, 10);

  const materialText = matchedItems.map((item, index) => {
    const body = buildRelevantMaterialSnippet(item, keywords, 1100);
    return `${index + 1}. ${item.title || "Tanpa judul"} | ${getItemFileType(item)} | ${item.category || "-"} | ${item.status || "-"}\nPotongan isi relevan: ${body || "Tidak ada ringkasan."}`;
  }).join("\n\n");

  const journalText = journalPool.map((journal, index) => {
    return `${index + 1}. ${formatDate(journal.date)} ${journal.market || ""} ${journal.setup || ""} ${journal.result || ""} ${getJournalProfitLossText(journal)}\nRencana: ${journal.plan || "-"}\nEvaluasi: ${journal.evaluation || "-"}\nKesalahan: ${journal.mistakes || "-"}\nPelajaran: ${journal.lessons || "-"}`;
  }).join("\n\n");

  const text = [
    "Sumber Lokal Aplikasi:",
    `Total file/materi: ${state.items.length}`,
    `Total jurnal: ${state.journals.length}`,
    `Win rate: ${stats.winRate}%`,
    `Total profit: ${formatTradeAmount(stats.totalProfit)}`,
    `Total loss: ${formatTradeAmount(stats.totalLoss)}`,
    `Net P/L: ${formatTradeAmount(stats.netProfit)}`,
    "",
    `Materi relevan:\n${materialText || "Tidak ada materi relevan yang cocok."}`,
    "",
    `Jurnal relevan/terbaru:\n${journalText || "Belum ada jurnal."}`
  ].join("\n");
  return { text };
}

function buildRelevantMaterialSnippet(item, keywords = [], maxLength = 900) {
  const text = [item.notes, item.documentText, item.code].filter(Boolean).join("\n").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  const hit = (keywords || []).find((word) => word && lower.includes(word));
  if (!hit) return text.slice(0, maxLength);
  const index = lower.indexOf(hit);
  const start = Math.max(0, index - Math.floor(maxLength * 0.35));
  const end = Math.min(text.length, start + maxLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function rankContextItems(questionText, keywords) {
  return [...state.items].map((item) => {
    const title = [item.title, item.mediaName].join(" ").toLowerCase();
    const meta = [item.type, item.category, item.status, item.collection, item.notes, ...(item.tags || [])].join(" ").toLowerCase();
    const content = String(item.documentText || "").toLowerCase();
    const haystack = `${title} ${meta} ${content}`;
    let score = 0;
    keywords.forEach((word) => {
      if (!word) return;
      if (title.includes(word)) score += 12;
      if (meta.includes(word)) score += 6;
      if (content.includes(word)) score += 4;
    });
    if (questionText && item.title && questionText.includes(String(item.title).toLowerCase())) score += 12;
    if (/\b(fvg|fair value gap)\b/i.test(questionText) && /\b(fvg|fair value gap)\b/i.test(haystack)) score += 8;
    if (/\border block\b|\bob\b/i.test(questionText) && /\border block\b|\bob\b/i.test(haystack)) score += 8;
    if (item.favorite) score += 1;
    score += Math.max(0, 3 - Math.floor((Date.now() - dateValue(item.updatedAt || item.createdAt)) / (30 * 24 * 60 * 60 * 1000)));
    return { item, score };
  }).filter((row) => row.score > 0).sort((a, b) => b.score - a.score).map((row) => row.item);
}

function rankContextJournals(questionText, keywords) {
  return [...state.journals].map((journal) => {
    const haystack = [journal.title, journal.market, journal.setup, journal.result, journal.plan, journal.evaluation, journal.mistakes, journal.lessons, journal.emotion].join(" ").toLowerCase();
    let score = 0;
    keywords.forEach((word) => { if (haystack.includes(word)) score += 3; });
    if (/\b(jurnal|loss|profit|win|entry|setup|kesalahan|emosi)\b/i.test(questionText)) score += 2;
    score += Math.max(0, 3 - Math.floor((Date.now() - dateValue(journal.updatedAt || journal.createdAt || journal.date)) / (30 * 24 * 60 * 60 * 1000)));
    return { journal, score };
  }).filter((row) => row.score > 0).sort((a, b) => b.score - a.score).map((row) => row.journal);
}

function mergeUniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = item?.id || JSON.stringify(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function runAssistantQuestion(question, targetElement, options = {}) {
  saveGeminiSettings();
  state.geminiApiKey = normalizeApiKey(state.geminiApiKey || dom.geminiApiKeyInput?.value || "");
  if (!question) return "";
  if (!state.geminiApiKey) {
    const message = "Isi API key dulu di Pengaturan API.";
    if (targetElement) targetElement.textContent = message;
    return message;
  }
  refreshInsightCache({ renderPanel: state.view === "assistant" });
  if (targetElement) targetElement.textContent = "Menganalisis dari materi, jurnal, statistik, lalu pengetahuan AI jika perlu...";
  const context = await getRelevantLocalContext(question);
  const prompt = `Kamu adalah asisten trading pribadi di aplikasi Trading Library Manager. Jawab dalam bahasa Indonesia, ringkas, praktis, dan edukatif. Jangan memberi sinyal pasti buy/sell.

Mode aktif: ${options.mode || state.assistantMode || "coach"}

Aturan sumber dan format jawaban:
1. Prioritaskan Sumber Lokal dari materi terupload, jurnal, statistik, catatan file, dan insight lokal.
2. Jika user bertanya konsep trading seperti "apa itu", "jelaskan", atau "maksudnya", jawab definisi dan penjelasan sederhana dulu dalam 3-6 kalimat. Jangan hanya menyuruh user membaca materi.
3. Setelah menjawab konsep, jika ada Materi relevan, tampilkan bagian "Materi terkait:" berisi judul materi yang cocok.
4. Jika Sumber Lokal tidak cukup, boleh jawab memakai pengetahuan umum AI, tetapi tetap praktis dan edukatif.
5. Jangan menyalin isi materi panjang ke chat. Untuk daftar materi atau isi materi penuh, arahkan aplikasi untuk membuka daftar/viewer.
6. Di akhir jawaban tulis sumber secara jelas, misalnya "Sumber: materi terupload + pengetahuan AI", "Sumber: materi terupload", "Sumber: jurnal trading", "Sumber: statistik", atau "Sumber: pengetahuan AI, bukan dari materi/jurnal pengguna".

Insight kebiasaan lokal:
${state.insightCache?.text || "Belum ada insight."}

${context.text}

Pertanyaan pengguna:
${question}`;
  try {
    const answer = await callAI([{ text: prompt }]);
    if (targetElement) targetElement.textContent = answer;
    return answer;
  } catch (error) {
    const message = `Gagal memanggil ${getProviderLabel(state.aiProvider)}: ${error.message || "API error"}`;
    if (targetElement) targetElement.textContent = message;
    return message;
  }
}

async function processAssistantInput(question, surface = "assistant") {
  const isAssistantSurface = surface === "assistant";
  let loadingId = "";
  if (isAssistantSurface) {
    if (state.isAiProcessing) return;
    state.isAiProcessing = true;
    appendAssistantChat("user", question);
    loadingId = appendAssistantChat("assistant", "Memproses perintah...", { transient: true }).id;
  } else {
    renderAiPopupText("Memproses perintah...");
  }

  const finish = (text, extra = {}) => {
    const safeText = text || "Tidak ada jawaban.";
    state.aiPopupLastQuestion = question;
    state.aiPopupLastAnswer = safeText;
    if (isAssistantSurface && pendingId) updateAssistantChatMessage(pendingId, safeText, extra);
    if (!isAssistantSurface) renderAiPopupText(safeText);
    return safeText;
  };

  try {
    await hydrateMaterialContentsForQuery(question);
    const actionResult = await handleAiActionCommand(question, { surface });
    if (actionResult) {
      if (!isAssistantSurface && dom.saveAiPopupMaterialBtn) dom.saveAiPopupMaterialBtn.disabled = true;
      return finish(actionResult.text || "Selesai.", actionResult.extra || {});
    }

    const quickAnswer = await buildLocalAssistantQuickAnswer(question);
    if (quickAnswer) {
      if (!isAssistantSurface && dom.saveAiPopupMaterialBtn) dom.saveAiPopupMaterialBtn.disabled = false;
      if (typeof quickAnswer === "object") return finish(quickAnswer.text, quickAnswer.extra || {});
      return finish(quickAnswer);
    }

    const answer = await runAssistantQuestion(question, null, { mode: state.assistantMode });
    if (!isAssistantSurface && dom.saveAiPopupMaterialBtn) dom.saveAiPopupMaterialBtn.disabled = !answer;
    return finish(answer || "Tidak ada jawaban.");
  } catch (error) {
    const message = `Asisten berhenti karena error: ${error.message || "proses gagal"}`;
    if (!isAssistantSurface && dom.saveAiPopupMaterialBtn) dom.saveAiPopupMaterialBtn.disabled = true;
    return finish(message);
  }
}

async function askAiPopup() {
  const question = dom.aiPopupQuestionInput?.value.trim() || "";
  if (!question) return;
  if (dom.aiPopupQuestionInput) dom.aiPopupQuestionInput.value = "";
  if (dom.saveAiPopupMaterialBtn) dom.saveAiPopupMaterialBtn.disabled = true;
  await processAssistantInput(question, "popup");
}

async function handleAiActionCommand(question, options = {}) {
  const surface = options.surface || "popup";
  const localPlan = buildLocalAiActionPlan(question);
  if (localPlan) return executeAiActionPlan(localPlan, question, surface);

  if (!shouldUseRemoteActionPlanner(question, surface)) return null;
  const remotePlan = await interpretAiActionPlan(question);
  if (!remotePlan || !remotePlan.action || remotePlan.action === "answer") return null;
  return executeAiActionPlan(remotePlan, question, surface);
}

function buildLocalAiActionPlan(question) {
  const normalized = normalizeCommandText(question);
  if (!normalized) return null;

  if (isClearChatIntent(normalized)) return { action: "clear_chat" };

  const openNumber = normalized.match(/\b(?:buka|bukakan|bukain|membuka|open|lihat|tampilkan)\b.*\b(?:nomor|no|urutan)?\s*(\d{1,3})\b/i);
  if (openNumber && state.aiLastMaterialResults.length) {
    return { action: "open_material", resultIndex: Number(openNumber[1]) - 1 };
  }

  if (/(tambah|buat|simpan).{0,18}materi/i.test(normalized)) return { action: "add_material", raw: question };

  if (isDeleteMaterialIntent(normalized)) return { action: "delete_materials", query: question };
  if (isArchiveMaterialIntent(normalized)) return { action: "archive_materials", query: question };

  const status = detectStatusFromCommand(normalized);
  if ((isStatusMaterialIntent(normalized) || status) && /\b(status|selesai|dibaca|ditonton|dipelajari|dipakai|revisi|tuntas)\b/i.test(normalized)) {
    if (status) return { action: "update_status", query: question, status };
  }

  const hasMaterialTarget = hasAiMaterialTarget(normalized);
  const wantsSearch = isSearchMaterialIntent(normalized) && hasMaterialTarget;
  if (wantsSearch) return { action: isOpenMaterialIntent(normalized) && !/\b(daftar|list)\b/i.test(normalized) ? "open_material" : "search_materials", query: question };

  if (state.assistantMode === "material") return { action: "search_materials", query: question };
  return null;
}

function detectStatusFromCommand(normalized) {
  const lower = String(normalized || "").toLowerCase();
  if (/\b(selesai|sudah dibaca|sudah ditonton|tuntas)\b/.test(lower)) return "Selesai";
  if (/\b(belum dibaca|belum ditonton|belum selesai)\b/.test(lower)) return "Belum dibaca";
  if (/\b(dipelajari|sedang belajar)\b/.test(lower)) return "Dipelajari";
  if (/\b(dipakai|terpakai|gunakan)\b/.test(lower)) return "Dipakai";
  if (/\b(revisi|perlu revisi|benahi)\b/.test(lower)) return "Perlu revisi";
  return statuses.find((entry) => lower.includes(entry.toLowerCase())) || "";
}

function normalizeCommandText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAiMaterialTarget(normalized) {
  return /\b(file|berkas|materi|video|gambar|image|chart|dokumen|pdf|word|doc|docx|markdown|md|txt|catatan|library|isi|bab|chapter|judul|readme)\b/i.test(normalized);
}

function isClearChatIntent(normalized) {
  return /\b(hapus|bersihkan|clear|reset)\b.*\b(chat|riwayat|history)\b/i.test(normalized);
}

function isDeleteMaterialIntent(normalized) {
  if (isClearChatIntent(normalized)) return false;
  return /\b(hapus|hapuskan|hapusin|menghapus|dihapus|delete|remove|buang|buangin|membuang|dibuang|hilangkan|menghilangkan|singkirkan)\b/i.test(normalized) && (hasAiMaterialTarget(normalized) || /\b(ini|itu|yang ini|sedang dibuka|terbuka|current|semua|lama|tidak aktif)\b/i.test(normalized));
}

function isArchiveMaterialIntent(normalized) {
  return /\b(arsip|arsipkan|arsipin|mengarsipkan|diarsipkan|sembunyikan|menyembunyikan)\b/i.test(normalized) && (hasAiMaterialTarget(normalized) || /\b(ini|itu|semua|lama|tidak aktif)\b/i.test(normalized));
}

function isOpenMaterialIntent(normalized) {
  return /\b(buka|bukakan|bukain|membuka|dibuka|open|lihat|tampilkan|bacakan)\b/i.test(normalized) && hasAiMaterialTarget(normalized);
}

function isSearchMaterialIntent(normalized) {
  return /\b(cari|carikan|temukan|tampilkan|lihat|daftar|list|buka|bukakan|bukain|membuka|open)\b/i.test(normalized) && hasAiMaterialTarget(normalized);
}

function isStatusMaterialIntent(normalized) {
  return /\b(ubah|ganti|set|jadikan|tandai|mark|selesaikan|ubahin|gantikan)\b/i.test(normalized) && hasAiMaterialTarget(normalized);
}

function shouldUseRemoteActionPlanner(question, surface) {
  if (!state.geminiApiKey && !dom.geminiApiKeyInput?.value.trim()) return false;
  const normalized = normalizeCommandText(question);
  if (state.assistantMode === "action" || state.assistantMode === "material") return true;
  if (isDeleteMaterialIntent(normalized) || isArchiveMaterialIntent(normalized) || isOpenMaterialIntent(normalized) || isSearchMaterialIntent(normalized) || isStatusMaterialIntent(normalized)) return true;
  if (/\b(tolong|coba|bantu|mau|ingin|hapus|hapuskan|hapusin|menghapus|delete|remove|buang|arsip|arsipkan|arsipin|mengarsipkan|sembunyi|sembunyikan|ubah|ganti|tandai|buka|bukakan|bukain|membuka|open|lihat|cari|carikan|daftar|list|materi|file|berkas|bab|judul|status)\b/i.test(normalized)) return true;
  return false;
}

async function interpretAiActionPlan(question) {
  try {
    saveGeminiSettings(false);
    state.geminiApiKey = normalizeApiKey(state.geminiApiKey || dom.geminiApiKeyInput?.value || "");
    const prompt = `Terjemahkan perintah user ke JSON aksi Trading Library Manager.
HANYA kembalikan objek JSON valid tanpa markdown, tanpa teks tambahan.
Aksi yang tersedia: answer, search_materials, open_material, add_material, delete_materials, archive_materials, update_status, clear_chat.
Status yang tersedia: ${statuses.join(", ")}

Format JSON:
{
  "action": "string",
  "query": "string (opsional)",
  "status": "string (opsional)",
  "title": "string (opsional)",
  "body": "string (opsional)",
  "response": "pesan ramah untuk user"
}

User: ${question}`;
    const raw = await callAI([{ text: prompt }], { json: true });
    return sanitizeAiActionPlan(parseJsonFromText(raw));
  } catch {
    return null;
  }
}

function parseJsonFromText(text) {
  const raw = String(text || "").trim();
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function sanitizeAiActionPlan(plan) {
  if (!plan || typeof plan !== "object") return null;
  const allowed = new Set(["answer", "search_materials", "open_material", "add_material", "delete_materials", "archive_materials", "update_status", "clear_chat"]);
  const action = String(plan.action || "answer").trim().toLowerCase();
  if (!allowed.has(action)) return null;
  const status = statuses.includes(plan.status) ? plan.status : detectStatusFromCommand(`${plan.status || ""} ${plan.query || ""}`);
  return {
    action,
    query: String(plan.query || "").trim(),
    status,
    title: String(plan.title || "").trim(),
    body: String(plan.body || "").trim(),
    response: String(plan.response || "").trim()
  };
}

async function executeAiActionPlan(plan, originalQuestion, surface = "popup") {
  const action = plan.action;
  if (action === "clear_chat") {
    if (surface === "assistant") clearAssistantHistory(); else clearAiPopupChat();
    const text = "Riwayat chat dibersihkan.";
    if (surface === "popup") renderAiPopupText(text);
    return { text };
  }

  if (action === "add_material") {
    const created = createMaterialFromAiCommand(plan.raw || originalQuestion, plan);
    const text = created ? `Materi baru dibuat: ${created.title}` : "Format: tambah materi: judul | isi materi";
    if (surface === "popup") renderAiPopupText(text);
    return { text };
  }

  if (action === "search_materials" || action === "open_material") {
    const matches = resolveAiMaterialMatches(plan.query || originalQuestion, plan);
    state.aiLastMaterialResults = matches.map((item) => item.id);
    if (action === "open_material" && Number.isInteger(plan.resultIndex)) {
      const picked = state.items.find((item) => item.id === state.aiLastMaterialResults[plan.resultIndex]);
      if (picked) {
        openAiMaterialItem(picked);
        const text = `Saya buka materi: ${picked.title}`;
        if (surface === "popup") renderAiPopupText(text);
        return { text };
      }
    }
    if (action === "open_material" && matches.length >= 1) {
      const picked = pickBestMaterialMatch(matches, plan.query || originalQuestion);
      if (picked) {
        openAiMaterialItem(picked);
        const text = matches.length === 1
          ? `Saya buka materi: ${picked.title}`
          : `Saya buka materi paling cocok: ${picked.title}`;
        if (surface === "popup") renderAiPopupText(text);
        return { text };
      }
    }
    const text = matches.length
      ? `Ditemukan ${matches.length} materi. Pilih tombol Buka untuk membuka isi penuh di viewer aplikasi.`
      : "Tidak ada materi yang cocok.";
    if (surface === "popup") showAiMaterialResults(surface, matches, text);
    if (matches.length) applyMaterialSearchToLibrary(plan.query || originalQuestion);
    return { text, extra: matches.length ? { kind: "materials", itemIds: matches.map((item) => item.id) } : {} };
  }

  if (action === "delete_materials" || action === "archive_materials" || action === "update_status") {
    const matches = resolveAiMaterialMatches(plan.query || originalQuestion, plan);
    const type = action === "delete_materials" ? "delete" : action === "archive_materials" ? "archive" : "status";
    const title = type === "delete" ? "Konfirmasi hapus" : type === "archive" ? "Konfirmasi arsip" : "Konfirmasi ubah status";
    const message = type === "status"
      ? (matches.length ? `Ditemukan ${matches.length} item. Ubah status menjadi ${plan.status}?` : "Bisa. Sebutkan nama file/materi atau target yang statusnya mau diubah.")
      : (matches.length ? `Ditemukan ${matches.length} item. ${type === "delete" ? "Hapus dari aplikasi" : "Arsipkan"}?` : `Bisa. Sebutkan nama file/materi atau target yang mau ${type === "delete" ? "dihapus" : "diarsipkan"}.`);
    showAiActionConfirmation({
      type,
      ids: matches.map((item) => item.id),
      status: plan.status,
      title,
      message,
      surface
    });
    const text = matches.length ? `${title}. Menunggu YES / NO untuk ${matches.length} item.` : message;
    return { text };
  }

  return null;
}

function pickBestMaterialMatch(matches = [], query = "") {
  if (!matches.length) return null;
  const keywords = extractItemSearchKeywords(query);
  const normalized = normalizeCommandText(query);
  let best = matches[0];
  let bestScore = -1;
  matches.forEach((item, index) => {
    const title = normalizeCommandText(item.title || item.mediaName || "");
    const haystack = [item.title, item.mediaName, item.category, item.status, item.collection, item.notes, item.documentText, ...(item.tags || [])].join(" ").toLowerCase();
    let score = Math.max(0, 20 - index);
    keywords.forEach((word) => {
      if (title.includes(word)) score += 8;
      else if (haystack.includes(word)) score += 3;
    });
    const chapter = normalized.match(/\b(?:bab|chapter)\s*(\d{1,3})\b/i);
    if (chapter) {
      const num = chapter[1].padStart(2, "0");
      if (new RegExp(`\\b(?:bab|chapter)\\s*0?${chapter[1]}\\b`, "i").test(item.title || "")) score += 30;
      if (String(item.title || "").includes(`Bab ${num}`)) score += 30;
    }
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  });
  return best;
}

function applyMaterialSearchToLibrary(query) {
  const keywords = extractItemSearchKeywords(query).join(" ");
  if (!keywords) return;
  state.query = keywords;
  if (dom.searchInput) dom.searchInput.value = keywords;
  resetGridLimits();
  setView("library");
}

function showAiMaterialResults(surface, matches, heading) {
  const ids = matches.map((item) => item.id).slice(0, 12);
  if (surface === "assistant") {
    appendAssistantChat("assistant", heading, { kind: "materials", itemIds: ids });
    return;
  }
  renderAiPopupMaterialResults(heading, ids);
}

function renderAiPopupMaterialResults(heading, itemIds) {
  if (!dom.aiPopupAnswer) return;
  dom.aiPopupAnswer.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "ai-material-result-box";
  const title = document.createElement("strong");
  title.textContent = heading;
  wrap.append(title, createMaterialResultList(itemIds));
  dom.aiPopupAnswer.append(wrap);
}

function renderAiPopupText(text) {
  if (!dom.aiPopupAnswer) return;
  dom.aiPopupAnswer.replaceChildren();
  dom.aiPopupAnswer.textContent = text;
}

function resolveAiMaterialMatches(query, plan = {}) {
  const normalized = normalizeCommandText(query || "");
  if (/\b(ini|yang ini|sedang dibuka|terbuka|current)\b/i.test(normalized) && state.activeFullscreenItem?.id) {
    const active = state.items.find((item) => item.id === state.activeFullscreenItem.id);
    if (active) return [active];
  }
  let items = findItemsForAiCommand(query || "");
  if (!items.length && plan.query && plan.query !== query) items = findItemsForAiCommand(plan.query);
  if (!items.length && query) {
    const keywords = extractItemSearchKeywords(query);
    items = state.items.filter((item) => {
      const haystack = [item.title, item.mediaName, item.category, item.status, item.collection, item.notes, item.documentText, ...(item.tags || [])].join(" ").toLowerCase();
      return keywords.some((word) => haystack.includes(word));
    });
  }
  return items.slice(0, 50);
}

function findItemsForAiCommand(command) {
  const normalized = normalizeCommandText(command);
  let items = [...state.items];
  if (/\b(hasil scan|scan hp|file scan|storage)\b/i.test(normalized)) items = items.filter((item) => item.source === "storage-scan" || item.collection === "Scan HP" || (item.tags || []).includes("Scan HP"));
  if (/\b(video|rekaman)\b/i.test(normalized)) items = items.filter((item) => getItemFileType(item) === "Video");
  if (/\b(gambar|image|chart)\b/i.test(normalized)) items = items.filter((item) => getItemFileType(item) === "Gambar");
  if (/\b(pdf)\b/i.test(normalized)) items = items.filter((item) => getItemFileType(item) === "PDF");
  if (/\b(word|doc|docx)\b/i.test(normalized)) items = items.filter((item) => getItemFileType(item) === "Word");
  if (/\b(markdown|md|txt)\b/i.test(normalized)) items = items.filter((item) => getItemFileType(item) === "Markdown");
  if (/\b(excel|xls|xlsx|csv)\b/i.test(normalized)) items = items.filter((item) => getItemFileType(item) === "Excel");
  if (/\b(powerpoint|ppt|pptx)\b/i.test(normalized)) items = items.filter((item) => getItemFileType(item) === "PowerPoint");
  if (/\b(dokumen|document|materi|catatan)\b/i.test(normalized)) items = items.filter((item) => ["Dokumen", "PDF", "Word", "Markdown", "Excel", "PowerPoint", "Video", "Gambar", "Kode"].includes(getItemFileType(item)) || item.type);
  if (/\bbelum (dibaca|ditonton|selesai)\b/i.test(normalized)) items = items.filter((item) => item.status === "Belum dibaca");
  if (/\b(selesai|sudah dibaca|sudah ditonton)\b/i.test(normalized) && !/ubah|ganti|set|jadikan|tandai/i.test(normalized)) items = items.filter((item) => item.status === "Selesai");
  if (/\b(lama|tidak aktif)\b/i.test(normalized)) {
    const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
    items = items.filter((item) => dateValue(item.updatedAt || item.createdAt) < cutoff);
  }

  const keywords = extractItemSearchKeywords(command);
  if (keywords.length && !/\bsemua\b/i.test(normalized)) {
    items = items.filter((item) => {
      const haystack = [item.title, item.mediaName, item.category, item.status, item.collection, item.notes, item.documentText, ...(item.tags || [])].join(" ").toLowerCase();
      return keywords.every((word) => haystack.includes(word));
    });
  }
  return items;
}

function extractItemSearchKeywords(command) {
  const normalized = normalizeCommandText(command)
    .replace(/\b(apa|apakah|bisa|dapat|mampu|tolong|coba|bantu|minta|aku|saya|kamu|anda|dong|ya|nih|ini|itu|yang|dari|ke|di|dan|atau|untuk|dengan|lebih|semua|file|berkas|materi|video|gambar|image|chart|dokumen|pdf|word|doc|docx|markdown|md|txt|excel|xls|xlsx|csv|powerpoint|ppt|pptx|hasil|scan|storage|hp|aplikasi|buka|bukakan|bukain|membuka|dibuka|open|lihat|daftar|list|cari|carikan|temukan|tampilkan|hapus|hapuskan|hapusin|menghapus|dihapus|delete|remove|buang|buangin|membuang|dibuang|hilangkan|menghilangkan|singkirkan|arsip|arsipkan|arsipin|mengarsipkan|diarsipkan|sembunyikan|menyembunyikan|ubah|ubahin|ganti|gantikan|set|status|menjadi|jadikan|tandai|mark|belum|pernah|dibaca|ditonton|selesai|sudah|lama|tidak|aktif|isi|nomor|no|urutan)\b/g, " ")
    .replace(/[^a-z0-9_.-]+/g, " ")
    .trim();
  return normalized.split(/\s+/).filter((word) => word.length > 2).slice(0, 8);
}

function showAiActionConfirmation(action) {
  const surface = action.surface || "popup";
  state.pendingAiAction = { ...action, surface };
  if (!action.ids?.length) {
    const text = action.message || "Tidak ada item yang cocok.";
    if (surface === "assistant") appendAssistantChat("assistant", text); else renderAiPopupText(text);
    return;
  }
  if (surface === "assistant") {
    renderAssistantChatLog();
    return;
  }
  if (!dom.aiPopupAnswer) return;
  dom.aiPopupAnswer.replaceChildren(createAiActionConfirmNode(state.pendingAiAction));
}

function createAiActionConfirmNode(action) {
  const wrap = document.createElement("div");
  wrap.className = "ai-action-confirm";
  const title = document.createElement("strong");
  title.textContent = action.title || "Konfirmasi";
  const message = document.createElement("p");
  message.textContent = action.message;
  const preview = document.createElement("div");
  preview.className = "ai-action-preview";
  const matched = state.items.filter((item) => action.ids.includes(item.id)).slice(0, 10);
  preview.textContent = matched.map((item, index) => `${index + 1}. ${item.title} • ${getItemFileType(item)} • ${item.status}`).join("\n");
  const buttons = document.createElement("div");
  buttons.className = "ai-action-buttons";
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "primary-button";
  yes.textContent = action.type === "delete" ? "YES, Hapus" : action.type === "archive" ? "YES, Arsipkan" : "YES";
  yes.disabled = !action.ids.length;
  yes.addEventListener("click", confirmPendingAiAction);
  const no = document.createElement("button");
  no.type = "button";
  no.className = "ghost-button";
  no.textContent = "NO";
  no.addEventListener("click", cancelPendingAiAction);
  buttons.append(yes, no);
  wrap.append(title, message);
  if (preview.textContent) wrap.append(preview);
  wrap.append(buttons);
  return wrap;
}

async function confirmPendingAiAction() {
  const action = state.pendingAiAction;
  if (!action) return;
  state.pendingAiAction = null;
  const now = new Date().toISOString();
  let text = "Aksi selesai.";
  if (action.type === "delete") {
    const ok = await deleteItemsByIds(action.ids);
    text = ok ? `Selesai. ${action.ids.length} item dihapus dari aplikasi.` : "Hapus dibatalkan/gagal.";
  } else if (action.type === "archive") {
    state.items = state.items.map((item) => action.ids.includes(item.id) ? { ...item, archived: true, updatedAt: now } : item);
    saveItems();
    render();
    text = `Selesai. ${action.ids.length} item diarsipkan.`;
  } else if (action.type === "status") {
    state.items = state.items.map((item) => action.ids.includes(item.id) ? { ...item, status: action.status, updatedAt: now } : item);
    saveItems();
    render();
    text = `Selesai. ${action.ids.length} item diubah menjadi ${action.status}.`;
  }
  if (action.surface === "assistant") appendAssistantChat("assistant", text); else renderAiPopupText(text);
}

function cancelPendingAiAction() {
  const action = state.pendingAiAction;
  state.pendingAiAction = null;
  const text = "Aksi dibatalkan.";
  if (action?.surface === "assistant") appendAssistantChat("assistant", text); else renderAiPopupText(text);
}

function createMaterialFromAiCommand(command, plan = {}) {
  const raw = command.replace(/^\s*(tambah|buat|simpan)\s+materi\s*:?/i, "").trim();
  if (!raw && !plan.title && !plan.body) return null;
  const [titlePart, ...bodyParts] = raw.split("|");
  const title = (plan.title || titlePart || "Materi Baru").trim().slice(0, 100) || "Materi Baru";
  const body = (plan.body || bodyParts.join("|").trim() || title).slice(0, 8000);
  const now = new Date().toISOString();
  const markdown = `# ${title}

${body}
`;
  const item = {
    id: createId(),
    title,
    type: "Dokumen",
    category: "Markdown",
    status: "Belum dibaca",
    collection: "Catatan AI",
    tags: ["AI"],
    notes: "Materi dibuat lewat AI Action Mode.",
    checklist: [],
    code: "",
    mediaUrl: `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`,
    fileId: "",
    mediaKind: "document",
    mediaName: `${sanitizeFileName(title)}.md`,
    mediaType: "text/markdown",
    mediaSize: markdown.length,
    documentType: "Markdown",
    documentText: "",
    fileHash: "",
    favorite: false,
    archived: false,
    revisionHistory: [],
    uploadedAt: now,
    createdAt: now,
    updatedAt: now
  };
  state.items = [item, ...state.items];
  saveItems();
  resetGridLimits();
  render();
  return item;
}

function saveAiPopupAsMaterial() {
  const question = state.aiPopupLastQuestion || dom.aiPopupQuestionInput?.value.trim() || "";
  const answer = state.aiPopupLastAnswer || dom.aiPopupAnswer?.textContent || "";
  if (!question || !answer) return;
  const now = new Date();
  const iso = now.toISOString();
  const title = `Catatan AI ${iso.slice(0, 10)} ${String(now.getHours()).padStart(2, "0")}.${String(now.getMinutes()).padStart(2, "0")}`;
  const markdown = `# ${title}\n\n## Pertanyaan\n${question}\n\n## Jawaban\n${answer}\n`;
  const encoded = encodeURIComponent(markdown);
  const item = {
    id: createId(),
    title,
    type: "Dokumen",
    category: "Markdown",
    status: "Belum dibaca",
    collection: "Catatan AI",
    tags: ["AI", "Chat"],
    notes: "Materi dibuat dari popup chat AI.",
    checklist: [],
    code: "",
    mediaUrl: `data:text/markdown;charset=utf-8,${encoded}`,
    fileId: "",
    mediaKind: "document",
    mediaName: `${sanitizeFileName(title)}.md`,
    mediaType: "text/markdown",
    mediaSize: markdown.length,
    documentType: "Markdown",
    documentText: "",
    fileHash: "",
    favorite: false,
    archived: false,
    revisionHistory: [],
    uploadedAt: iso,
    createdAt: iso,
    updatedAt: iso
  };
  state.items = [item, ...state.items];
  saveItems();
  resetGridLimits();
  render();
  if (dom.aiPopupAnswer) dom.aiPopupAnswer.textContent = `${answer}\n\n✓ Disimpan sebagai materi: ${title}`;
}

async function askFromJournal(id) {
  const journal = state.journals.find((entry) => entry.id === id);
  if (!journal) return;
  setView("assistant");
  dom.assistantQuestionInput.value = `Analisis jurnal ini berdasarkan kebiasaan trading saya. Data jurnal lengkap:
${formatJournalForAI(journal)}`;
  await askAssistant();
}

function formatJournalForAI(journal) {
  return [
    `Tanggal: ${formatDate(journal.date)}`,
    `Market: ${journal.market || "-"}`,
    `Judul: ${journal.title || "-"}`,
    `Setup: ${journal.setup || "-"}`,
    `Hasil: ${journal.result || "-"}`,
    `Profit: ${formatTradeAmount(parseTradeAmount(journal.profit))}`,
    `Loss: ${formatTradeAmount(parseTradeAmount(journal.loss))}`,
    `Net P/L: ${formatTradeAmount(parseTradeAmount(journal.profit) - parseTradeAmount(journal.loss))}`,
    `Catatan awal: ${journal.plan || "-"}`,
    `Evaluasi: ${journal.evaluation || "-"}`,
    `Kesalahan: ${journal.mistakes || "-"}`,
    `Pelajaran: ${journal.lessons || "-"}`,
    `Emosi: ${journal.emotion || "-"}`,
    `Lampiran: ${(journal.attachments || []).length}`
  ].join("\n");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Koneksi AI timeout. Coba kirim ulang atau pakai model yang lebih cepat.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function callAI(parts, options = {}) {
  const provider = state.aiProvider || "gemini";
  if (provider === "gemini") return callGeminiProvider(parts, options);
  return callOpenAICompatibleProvider(parts, provider, options);
}

async function callGeminiProvider(parts, options = {}) {
  const model = encodeURIComponent(state.geminiModel || getDefaultModelForProvider("gemini"));
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(state.geminiApiKey)}`;
  
  const generationConfig = { temperature: 0.35, topP: 0.9, maxOutputTokens: 1400 };
  if (options.json) generationConfig.responseMimeType = "application/json";

  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig
    })
  });
  if (!response.ok) throw new Error(await readApiError(response));
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim();
  if (!text) throw new Error("Respons kosong");
  return text;
}

async function callOpenAICompatibleProvider(parts, provider, options = {}) {
  const endpoint = getChatCompletionEndpoint(provider);
  const content = partsToOpenAIContent(parts);
  const model = state.geminiModel || getDefaultModelForProvider(provider);
  
  const payload = {
    model,
    messages: [
      {
        role: "system",
        content: "Kamu adalah asisten jurnal trading pribadi. Jawab dalam bahasa Indonesia, ringkas, praktis, dan edukatif. Jangan memberi sinyal pasti buy/sell."
      },
      { role: "user", content }
    ],
    temperature: 0.35,
    max_tokens: 1400
  };

  if (options.json) payload.response_format = { type: "json_object" };

  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    headers: getOpenAICompatibleHeaders(provider),
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await readApiError(response));
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || data.output_text || "";
  if (!String(text).trim()) throw new Error("Respons kosong");
  return String(text).trim();
}

function getChatCompletionEndpoint(provider) {
  if (provider === "deepseek") return "https://api.deepseek.com/chat/completions";
  if (provider === "groq") return "https://api.groq.com/openai/v1/chat/completions";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1/chat/completions";
  if (provider === "mistral") return "https://api.mistral.ai/v1/chat/completions";
  if (provider === "openai") return "https://api.openai.com/v1/chat/completions";
  if (provider === "custom") {
    const customUrl = normalizeBaseUrl(state.aiBaseUrl);
    if (!customUrl) throw new Error("Isi Base URL untuk Custom API.");
    return customUrl;
  }
  throw new Error(`Provider belum didukung: ${provider}`);
}

function getOpenAICompatibleHeaders(provider) {
  const apiKey = normalizeApiKey(state.geminiApiKey || dom.geminiApiKeyInput?.value || "");
  if (!apiKey) throw new Error("Isi API key dulu.");
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = location.href;
    headers["X-Title"] = "Trading Library Manager";
  }
  return headers;
}

function partsToOpenAIContent(parts) {
  const imageParts = parts.filter((part) => part.inline_data);
  const text = parts.map((part) => part.text || "").filter(Boolean).join("\n\n").trim();
  if (!imageParts.length) return text;
  const content = [];
  if (text) content.push({ type: "text", text });
  imageParts.forEach((part) => {
    const mime = part.inline_data?.mime_type || "image/jpeg";
    const data = part.inline_data?.data || "";
    if (data) content.push({ type: "image_url", image_url: { url: `data:${mime};base64,${data}` } });
  });
  return content;
}

async function readApiError(response) {
  const status = `HTTP ${response.status}`;
  let body = "";
  try {
    const data = await response.clone().json();
    body = data.error?.message || data.message || data.detail || JSON.stringify(data.error || data).slice(0, 300);
  } catch {
    try {
      body = (await response.text()).slice(0, 300);
    } catch {}
  }
  return body ? `${status}: ${body}` : status;
}

function updateFullscreenAnalyzeButton() {
  if (!dom.fullscreenAnalyzeBtn) return;
  const item = state.activeFullscreenItem;
  const isImage = item && (item.mediaKind || inferMediaKind(item)) === "image";
  dom.fullscreenAnalyzeBtn.hidden = !isImage;
}

async function analyzeActiveChart() {
  saveGeminiSettings();
  state.geminiApiKey = normalizeApiKey(state.geminiApiKey || dom.geminiApiKeyInput?.value || "");
  const item = state.activeFullscreenItem;
  if (!item || (item.mediaKind || inferMediaKind(item)) !== "image") return;
  if (!state.geminiApiKey) {
    showFullscreenAnalysis("Isi API key dulu di tab Asisten.");
    return;
  }
  refreshInsightCache();
  showFullscreenAnalysis("Mengompres gambar dan menganalisis chart...");
  try {
    const inline = await makeGeminiImagePart(item);
    const prompt = `Analisis chart trading ini secara edukatif, bukan sinyal pasti. Fokus pada:\n- bias trend\n- struktur market\n- BOS / CHoCH jika terlihat\n- area Order Block\n- area FVG\n- Supply & Demand\n- liquidity / sweep\n- zona entry potensial agresif dan konservatif\n- invalidasi\n- risiko\n- catatan berdasarkan kebiasaan jurnal pengguna\n\nInsight kebiasaan pengguna:\n${state.insightCache?.text || "Belum ada insight."}\n\nFormat jawaban ringkas dengan poin yang mudah dibaca. Di akhir jawaban tulis: Sumber: gambar chart yang dianalisis + insight/jurnal pengguna jika dipakai.`;
    const answer = await callAI([{ text: prompt }, inline]);
    showFullscreenAnalysis(answer);
    if (dom.assistantAnswer) dom.assistantAnswer.textContent = answer;
  } catch (error) {
    showFullscreenAnalysis(`Analisis gagal: ${error.message || "API error"}`);
  }
}

function showFullscreenAnalysis(text) {
  if (!dom.fullscreenAnalysis) return;
  dom.fullscreenAnalysis.hidden = false;
  dom.fullscreenAnalysis.textContent = text;
}

async function makeGeminiImagePart(item) {
  const blob = await getFileBlob(item);
  if (!blob) throw new Error("Gambar lokal belum ditemukan.");
  const compressed = await compressImageForGemini(blob);
  const dataUrl = await blobToDataUrl(compressed.blob);
  const base64 = dataUrl.split(",")[1] || "";
  return { inline_data: { mime_type: compressed.mimeType, data: base64 } };
}

async function compressImageForGemini(blob) {
  const bitmap = await createImageBitmap(blob);
  const maxSide = 1100;
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const out = await new Promise((resolve) => canvas.toBlob((result) => resolve(result), "image/jpeg", 0.72));
  return { blob: out || blob, mimeType: out ? "image/jpeg" : (blob.type || "image/jpeg") };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// --- PERSONAL NOTES LOGIC ---
function loadNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveNotes(notes = state.personalNotes) {
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
}

function openNoteForm(note = null) {
  dom.noteForm.hidden = false;
  if (note && note.id) {
    dom.noteId.value = note.id;
    dom.noteDateInput.value = note.date || "";
    dom.noteTitleInput.value = note.title || "";
    dom.noteContentInput.value = note.content || "";
  } else {
    dom.noteForm.reset();
    dom.noteId.value = "";
    const now = new Date();
    dom.noteDateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
}

function closeNoteForm() {
  dom.noteForm.hidden = true;
  dom.noteForm.reset();
}

function saveNote(e) {
  e.preventDefault();
  const id = dom.noteId.value || crypto.randomUUID();
  const date = dom.noteDateInput.value;
  const title = dom.noteTitleInput.value.trim();
  const content = dom.noteContentInput.value.trim();

  const existingIndex = state.personalNotes.findIndex(n => n.id === id);
  const noteData = { id, date, title, content };

  if (existingIndex >= 0) {
    state.personalNotes[existingIndex] = noteData;
  } else {
    state.personalNotes.unshift(noteData);
  }

  saveNotes();
  closeNoteForm();
  renderNotes();
  showToast("Catatan disimpan");
}

function handleNoteActions(e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;
  if (!id) return;

  if (btn.classList.contains("toggle-collapse-btn")) {
    const content = btn.previousElementSibling;
    if (content && content.classList.contains("note-content")) {
      const isCollapsed = content.classList.toggle("is-collapsed");
      btn.textContent = isCollapsed ? "Baca Selengkapnya" : "Tutup";
    }
    return;
  }

  if (btn.classList.contains("edit-note-btn")) {
    const note = state.personalNotes.find(n => n.id === id);
    if (note) openNoteForm(note);
  } else if (btn.classList.contains("delete-note-btn")) {
    if (confirm("Hapus catatan ini?")) {
      state.personalNotes = state.personalNotes.filter(n => n.id !== id);
      saveNotes();
      renderNotes();
      showToast("Catatan dihapus");
    }
  } else if (btn.classList.contains("roast-note-btn")) {
    roastNote(id);
  }
}

function roastNote(id) {
  const note = state.personalNotes.find(n => n.id === id);
  if (!note) return;
  
  const prompt = `Ini adalah catatan pribadi saya:\nJudul: ${note.title}\nIsi: ${note.content}\n\nInstruksi: Anda adalah pelatih trading/mentor yang SANGAT GALAK, SARKASTIK, TEGAS, dan KEJAM. Evaluasi tulisan saya ini. Maki kesalahan saya agar mental saya kuat, dan berikan motivasi negatif agar saya disiplin. Jangan bersikap sopan, jadilah brutal tapi membangun (Tough Love).`;
  
  dom.assistantQuestionInput.value = prompt;
  setView("assistant");
  if (typeof askAssistant === "function") {
    askAssistant();
  } else {
    dom.askAssistantBtn?.click();
  }
}

function renderNotes() {
  if (!dom.notesList || state.view !== "notes") return;
  
  dom.notesCount.textContent = `${state.personalNotes.length} catatan`;
  dom.notesList.replaceChildren();

  if (state.personalNotes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<p>Belum ada catatan pribadi.</p>`;
    dom.notesList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.personalNotes.forEach(note => {
    const article = document.createElement("article");
    article.className = "note-card";
    article.innerHTML = `
      <div class="note-header">
        <strong>${escapeHtml(note.title)}</strong>
        <span>${escapeHtml(note.date)}</span>
      </div>
      <div class="note-content is-collapsed">${escapeHtml(note.content).replace(/\n/g, "<br>")}</div>
      <button class="text-button toggle-collapse-btn" type="button">Baca Selengkapnya</button>
      <div class="note-actions">
        <button class="icon-button edit-note-btn" data-id="${note.id}" type="button" aria-label="Edit">✎</button>
        <button class="icon-button delete-note-btn" data-id="${note.id}" type="button" aria-label="Hapus">🗑</button>
        <button class="roast-note-btn" data-id="${note.id}" type="button">🔥 Evaluasi Kasar AI</button>
      </div>
    `;
    fragment.append(article);
  });
  dom.notesList.append(fragment);
}

boot();


// GLOBAL AMY FX JS SYSTEM
window.showToast = function(msg) {
  if ('vibrate' in navigator) navigator.vibrate(50);
  let container = document.getElementById('amy-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'amy-toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'amy-toast';
  toast.innerHTML = msg;
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3000);
};

window.triggerHaptic = function(pattern) {
  if ('vibrate' in navigator) navigator.vibrate(pattern || 20);
};

if (!window.amyHapticListenerAdded) {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button, a, .clickable, .nav-btn, .action-btn, .card');
      if (btn) window.triggerHaptic(20);
    });
    window.amyHapticListenerAdded = true;
}


/* AMYFX_NOTIFY_GUARD_START */
(function(){
  if(window.__amyfxNotifyGuardLoaded)return;
  window.__amyfxNotifyGuardLoaded=true;

  const STORE='amyfx.notify.last.sent';
  const COOLDOWN=5*60*1000;
  const RESUME_MUTE=9000;
  const MAX_ITEMS=80;
  let muteUntil=0;

  function now(){return Date.now()}
  function norm(x){
    return String(x||'')
      .replace(/\d+([.,]\d+)?/g,'#')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0,180);
  }
  function kind(t,b){
    const x=(String(t||'')+' '+String(b||'')).toLowerCase();
    if(x.includes('scanner terhubung'))return 'scanner_connected';
    if(x.includes('amy fx aktif'))return 'scanner_alive';
    if(x.includes('liquidity sweep'))return 'liquidity_sweep';
    if(x.includes('ssl')||x.includes('bsl'))return 'bsl_ssl_touched';
    return 'amyfx_alert';
  }
  function key(t,b){
    return kind(t,b)+'|'+norm(t)+'|'+norm(b);
  }
  function read(){
    try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){return{}}
  }
  function write(o){
    const arr=Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,MAX_ITEMS);
    localStorage.setItem(STORE,JSON.stringify(Object.fromEntries(arr)));
  }
  function route(t,b){
    const k=kind(t,b);
    if(k==='liquidity_sweep')return 'Analyze';
    if(k==='bsl_ssl_touched')return 'Analyze';
    if(k==='scanner_connected'||k==='scanner_alive')return 'Dashboard';
    return 'Analyze';
  }
  function openRoute(t,b){
    const r=route(t,b);
    try{localStorage.setItem('amyfx.notification.route',r)}catch(e){}
    try{if(typeof setTab==='function')setTab(r)}catch(e){}
    try{window.focus()}catch(e){}
  }
  function allow(t,b){
    const n=now();
    const k=key(t,b);

    if(n<muteUntil && kind(t,b)!=='scanner_alive')return false;

    const last=read();
    const prev=last[k]||0;
    if(n-prev<COOLDOWN)return false;

    last[k]=n;
    write(last);
    return true;
  }

  document.addEventListener('visibilitychange',function(){
    if(!document.hidden){
      muteUntil=now()+RESUME_MUTE;
    }
  });

  window.addEventListener('pageshow',function(){
    muteUntil=now()+RESUME_MUTE;
  });

  try{
    if('Notification' in window && !window.Notification.__amyfxWrapped){
      const OriginalNotification=window.Notification;
      const WrappedNotification=function(title,opts){
        opts=opts||{};
        const body=opts.body||'';
        if(!allow(title,body))return null;
        const n=new OriginalNotification(title,opts);
        n.onclick=function(){openRoute(title,body)};
        return n;
      };
      Object.getOwnPropertyNames(OriginalNotification).forEach(function(k){
        try{WrappedNotification[k]=OriginalNotification[k]}catch(e){}
      });
      WrappedNotification.prototype=OriginalNotification.prototype;
      WrappedNotification.__amyfxWrapped=true;
      window.Notification=WrappedNotification;
    }
  }catch(e){}

  function wrapBridge(obj){
    if(!obj||obj.__amyfxNotifyBridgeWrapped)return;
    Object.keys(obj).forEach(function(k){
      if(!/notify|notification|alert|push/i.test(k))return;
      if(typeof obj[k]!=='function')return;
      const old=obj[k];
      obj[k]=function(){
        const args=[].slice.call(arguments);
        const title=args[0]||'Amy FX';
        const body=args[1]||args[0]||'';
        if(!allow(title,body))return null;
        try{return old.apply(this,args)}catch(e){return null}
      };
    });
    obj.__amyfxNotifyBridgeWrapped=true;
  }

  function wrapAll(){
    ['Android','AndroidBridge','AmyFX','AmyFx','Native','NotificationBridge','AppBridge'].forEach(function(n){
      try{wrapBridge(window[n])}catch(e){}
    });
  }

  wrapAll();
  setInterval(wrapAll,1500);

  window.__amyfxNotifyAllow=allow;
  window.__amyfxNotifyOpenRoute=openRoute;
})();
/* AMYFX_NOTIFY_GUARD_END */

