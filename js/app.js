const FILTERS_STORAGE_KEY = "purchase-manager-filters-v5";
const LEGACY_FILTERS_KEYS = [
  "purchase-manager-filters-v4",
  "purchase-manager-filters-v3",
  "purchase-manager-filters-v2"
];

const CURRENT_USER = {
  id: null,
  name: "",
  role: "user",
  email: ""
};

const STORAGE_BUCKET = "purchase-files";
const MAX_ATTACHMENTS = 8;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1600;
const JPEG_QUALITY = 0.78;
const AUTO_REFRESH_MS = 30000;

const LOGIN_ALIASES = new Map([
  ["basel", "basel.slaby@gmail.com"],
  ["باسل", "basel.slaby@gmail.com"],
  ["mohammad", "mohammad@purchases.com"],
  ["mohamed", "mohammad@purchases.com"],
  ["محمد", "mohammad@purchases.com"],
  ["adnan", "adnan@purchases.com"],
  ["عدنان", "adnan@purchases.com"],
  ["samer", "samer@purchases.com"],
  ["سامر", "samer@purchases.com"],
  ["guest", "guest@purchases.com"],
  ["ضيف", "guest@purchases.com"]
]);

const defaultFilters = {
  status: "all",
  type: "all",
  department: "all",
  settlement: "not-settled",
  itemSignal: "all",
  query: ""
};

const state = {
  requests: [],
  filters: loadStoredFilters(),
  draftFilters: { ...defaultFilters },
  deletionLog: [],
  activeDetailsId: null,
  noteFormOpen: false,
  editingNoteId: null,
  lastCardTap: { id: null, time: 0 },
  lastDetailsTap: 0,
  suppressTapUntil: 0,
  selectedAttachments: [],
  materialItemSequence: 0,
  syncTimer: null,
  isRefreshing: false,
  isAuthenticated: false
};

const elements = {
  authGate: document.getElementById("authGate"),
  authForm: document.getElementById("authForm"),
  authIdentifier: document.getElementById("authIdentifier"),
  authPassword: document.getElementById("authPassword"),
  authError: document.getElementById("authError"),
  authSubmit: document.getElementById("authSubmit"),
  authStatus: document.getElementById("authStatus"),
  appShell: document.getElementById("appShell"),
  currentUserName: document.getElementById("currentUserName"),
  currentUserRole: document.getElementById("currentUserRole"),
  logoutButton: document.getElementById("logoutButton"),
  refreshButton: document.getElementById("refreshButton"),
  requestList: document.getElementById("requestList"),
  emptyState: document.getElementById("emptyState"),
  resultsText: document.getElementById("resultsText"),
  totalCount: document.getElementById("totalCount"),
  waitingQuotesCount: document.getElementById("waitingQuotesCount"),
  purchasedCount: document.getElementById("purchasedCount"),
  settledCount: document.getElementById("settledCount"),
  searchInput: document.getElementById("searchInput"),
  activeFiltersCount: document.getElementById("activeFiltersCount"),
  appliedFilters: document.getElementById("appliedFilters"),
  filtersOverlay: document.getElementById("filtersOverlay"),
  openFiltersButton: document.getElementById("openFiltersButton"),
  resetFiltersButton: document.getElementById("resetFiltersButton"),
  applyFiltersButton: document.getElementById("applyFiltersButton"),
  deletionLogCount: document.getElementById("deletionLogCount"),
  deletionLogList: document.getElementById("deletionLogList"),
  detailsOverlay: document.getElementById("detailsOverlay"),
  detailsSheet: document.getElementById("detailsSheet"),
  detailsTitle: document.getElementById("detailsTitle"),
  detailsContent: document.getElementById("detailsContent"),
  addOverlay: document.getElementById("addOverlay"),
  addRequestButton: document.getElementById("addRequestButton"),
  addRequestForm: document.getElementById("addRequestForm"),
  materialsItemsSection: document.getElementById("materialsItemsSection"),
  materialItemsEditor: document.getElementById("materialItemsEditor"),
  addMaterialItemButton: document.getElementById("addMaterialItemButton"),
  workDescriptionField: document.getElementById("workDescriptionField"),
  attachmentsInput: document.getElementById("attachmentsInput"),
  attachmentsPreviewText: document.getElementById("attachmentsPreviewText"),
  toast: document.getElementById("toast")
};

function getSupabase() {
  if (!window.purchaseSupabase) {
    throw new Error("تعذر تهيئة الاتصال بقاعدة البيانات.");
  }
  return window.purchaseSupabase;
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizePurchaseItem(item, requestId, index) {
  const allowedSignals = new Set(["none", "green", "red"]);
  const signal = allowedSignals.has(item?.signal) ? item.signal : "none";

  return {
    id: item?.id || `ITEM-${requestId}-${index + 1}-${Date.now()}`,
    name: String(item?.name || `البند ${index + 1}`),
    specifications: String(item?.specifications || item?.specs || ""),
    origin: String(item?.origin || ""),
    quantity: normalizeOptionalNumber(item?.quantity),
    price: normalizeOptionalNumber(item?.price),
    available: item?.available !== false,
    action: String(item?.action || ""),
    signal
  };
}

function readStoredJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch (error) {
    console.warn(`تعذر قراءة ${key}.`, error);
    return null;
  }
}

function dbItemToApp(item) {
  return {
    id: item.id,
    name: String(item.item_name || ""),
    specifications: String(item.specifications || ""),
    origin: String(item.origin || ""),
    quantity: normalizeOptionalNumber(item.quantity),
    unit: String(item.unit || ""),
    price: normalizeOptionalNumber(item.price),
    available: item.available !== false,
    action: String(item.action_if_unavailable || ""),
    signal: ["none", "green", "red"].includes(item.signal) ? item.signal : "none",
    sortOrder: Number(item.sort_order || 0)
  };
}

function dbNoteToApp(note) {
  return {
    id: note.id,
    text: String(note.body || ""),
    authorId: note.author_id,
    authorName: note.author_name || "مستخدم",
    createdAt: note.created_at,
    updatedAt: note.updated_at || null
  };
}

function dbAttachmentToApp(attachment) {
  return {
    id: attachment.id,
    storagePath: attachment.storage_path,
    name: attachment.original_name,
    mimeType: attachment.mime_type || "",
    sizeBytes: Number(attachment.size_bytes || 0),
    kind: attachment.kind || "other",
    createdAt: attachment.created_at,
    url: ""
  };
}

function dbRequestToApp(row) {
  return {
    id: row.id,
    requestNumber: row.request_number,
    title: row.title,
    type: row.request_type,
    department: row.department_code,
    description: row.description || "",
    initialPrice: normalizeOptionalNumber(row.initial_price),
    currency: row.currency || "SYP",
    createdAt: row.request_date || row.created_at,
    created: Boolean(row.is_uploaded),
    quotes: Boolean(row.has_quotes),
    purchased: Boolean(row.is_purchased),
    settled: Boolean(row.is_settled),
    offersCount: Number(row.offers_count || 0),
    supplier: row.supplier || "",
    sortOrder: Number(row.sort_order || 0),
    items: [...(row.purchase_items || [])]
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .map(dbItemToApp),
    notes: [...(row.notes || [])]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(dbNoteToApp),
    attachments: [...(row.attachments || [])]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(dbAttachmentToApp)
  };
}

function dbDeletionToApp(row) {
  return {
    id: String(row.id),
    requestId: row.request_id,
    title: row.title,
    type: row.request_type,
    typeLabel: getTypeLabel(row.request_type),
    deletedById: row.deleted_by,
    deletedByName: row.deleted_by_name,
    deletedAt: row.deleted_at,
    requestNumber: row.request_number,
    snapshot: row.snapshot
  };
}

function normalizeFilters(filters, migrateLegacy = false) {
  const source = filters && typeof filters === "object" ? filters : {};
  const normalized = {
    ...defaultFilters,
    ...source
  };

  if (migrateLegacy && (!source.settlement || source.settlement === "all")) {
    normalized.settlement = "not-settled";
  }

  if (!["all", "red", "green", "unmarked"].includes(normalized.itemSignal)) {
    normalized.itemSignal = "all";
  }

  return normalized;
}

function loadStoredFilters() {
  const current = readStoredJson(FILTERS_STORAGE_KEY);
  if (current) return normalizeFilters(current);

  for (const key of LEGACY_FILTERS_KEYS) {
    const legacy = readStoredJson(key);
    if (legacy) {
      const migrated = normalizeFilters(legacy, true);
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  }

  return { ...defaultFilters };
}

function saveFilters() {
  localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(state.filters));
}

let orderSaveTimer = null;
function saveRequests() {
  window.clearTimeout(orderSaveTimer);
  orderSaveTimer = window.setTimeout(() => {
    persistRequestOrder().catch(handleDatabaseError);
  }, 250);
}


function handleDatabaseError(error, prefix = "تعذر حفظ التغيير") {
  console.error(error);
  const raw = String(error?.message || error?.error_description || "").trim();
  const friendly = raw.includes("JWT")
    ? "انتهت جلسة الدخول. سجّل الدخول من جديد."
    : raw || prefix;
  showToast(`${prefix}: ${friendly}`);
}

function resolveLoginIdentifier(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("@")) return normalized;
  return LOGIN_ALIASES.get(normalized) || `${normalized}@purchases.com`;
}

function setAuthMessage(message = "", isError = false) {
  if (!elements.authError || !elements.authStatus) return;
  elements.authError.textContent = isError ? message : "";
  elements.authError.hidden = !isError || !message;
  elements.authStatus.textContent = !isError ? message : "";
}

function showAuthGate(message = "") {
  state.isAuthenticated = false;
  elements.appShell.hidden = true;
  elements.addRequestButton.hidden = true;
  elements.authGate.hidden = false;
  if (message) setAuthMessage(message, true);
  window.clearInterval(state.syncTimer);
  state.syncTimer = null;
}

function showApplication() {
  state.isAuthenticated = true;
  elements.authGate.hidden = true;
  elements.appShell.hidden = false;
  elements.addRequestButton.hidden = false;
  elements.currentUserName.textContent = CURRENT_USER.name || "مستخدم";
  elements.currentUserRole.textContent = CURRENT_USER.role === "admin" ? "مدير" : "مستخدم";
}

async function loadCurrentProfile(user) {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("id, display_name, role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data?.active) throw new Error("هذا الحساب غير مفعّل أو لم تتم الموافقة عليه.");

  CURRENT_USER.id = user.id;
  CURRENT_USER.name = data.display_name || user.email || "مستخدم";
  CURRENT_USER.role = data.role || "user";
  CURRENT_USER.email = user.email || "";
}

async function hydrateAttachmentUrls(requests) {
  const attachments = requests.flatMap((request) => request.attachments || []);
  if (!attachments.length) return;

  const paths = attachments.map((attachment) => attachment.storagePath);
  const { data, error } = await getSupabase().storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(paths, 60 * 60);

  if (error) {
    console.warn("تعذر إنشاء روابط مؤقتة لبعض المرفقات.", error);
    return;
  }

  attachments.forEach((attachment, index) => {
    attachment.url = data?.[index]?.signedUrl || "";
  });
}

async function fetchRequests() {
  const { data, error } = await getSupabase()
    .from("requests")
    .select(`
      id, request_number, title, request_type, department_code, description,
      initial_price, currency, request_date, is_uploaded, has_quotes,
      is_purchased, is_settled, offers_count, supplier, sort_order,
      created_at, updated_at,
      purchase_items (
        id, item_name, specifications, origin, quantity, unit, price,
        available, action_if_unavailable, signal, sort_order, created_at
      ),
      notes (
        id, body, author_id, author_name, created_at, updated_at
      ),
      attachments (
        id, storage_path, original_name, mime_type, size_bytes, kind, created_at
      )
    `)
    .order("sort_order", { ascending: true })
    .order("request_date", { ascending: false });

  if (error) throw error;
  const requests = (data || []).map(dbRequestToApp);
  await hydrateAttachmentUrls(requests);
  return requests;
}

async function fetchDeletionLog() {
  const { data, error } = await getSupabase()
    .from("deletion_log")
    .select("id, request_id, request_number, title, request_type, deleted_by, deleted_by_name, deleted_at, snapshot")
    .order("deleted_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data || []).map(dbDeletionToApp);
}

async function refreshAppData({ silent = false } = {}) {
  if (!state.isAuthenticated || state.isRefreshing) return;

  state.isRefreshing = true;
  if (!silent) showToast("جارٍ تحديث البيانات...");

  try {
    const [requests, deletionLog] = await Promise.all([
      fetchRequests(),
      fetchDeletionLog()
    ]);

    state.requests = requests;
    state.deletionLog = deletionLog;
    render();

    if (state.activeDetailsId) {
      const stillExists = state.requests.some((request) => request.id === state.activeDetailsId);
      if (stillExists) renderDetails(state.activeDetailsId);
      else closeDetails();
    }

    if (!silent) showToast("تم تحديث البيانات");
  } catch (error) {
    handleDatabaseError(error, "تعذر تحميل البيانات");
  } finally {
    state.isRefreshing = false;
  }
}

async function persistRequestOrder() {
  if (!state.isAuthenticated) return;
  const client = getSupabase();
  const updates = state.requests.map((request, index) => {
    request.sortOrder = index * 100;
    return client.from("requests").update({ sort_order: request.sortOrder }).eq("id", request.id);
  });

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

function canAutoRefresh() {
  return state.isAuthenticated &&
    document.visibilityState === "visible" &&
    elements.detailsOverlay.hidden &&
    elements.addOverlay.hidden &&
    elements.filtersOverlay.hidden;
}

function startAutoRefresh() {
  window.clearInterval(state.syncTimer);
  state.syncTimer = window.setInterval(() => {
    if (canAutoRefresh()) refreshAppData({ silent: true });
  }, AUTO_REFRESH_MS);
}

async function enterAuthenticatedApp(session) {
  if (!session?.user) {
    showAuthGate();
    return;
  }

  setAuthMessage("جارٍ تحميل حسابك...");
  try {
    await loadCurrentProfile(session.user);
    showApplication();
    await refreshAppData({ silent: true });
    startAutoRefresh();
  } catch (error) {
    console.error(error);
    await getSupabase().auth.signOut();
    showAuthGate(error?.message || "تعذر فتح الحساب.");
  }
}

async function initializeAuthentication() {
  try {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) throw error;

    if (data.session) {
      await enterAuthenticatedApp(data.session);
    } else {
      showAuthGate();
    }

    getSupabase().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        showAuthGate();
        state.requests = [];
        state.deletionLog = [];
        return;
      }


    });
  } catch (error) {
    console.error(error);
    showAuthGate("تعذر الاتصال بخدمة تسجيل الدخول. تحقق من الإنترنت وحاول مجددًا.");
  }
}

function getTypeLabel(type) {
  return type === "work-order" ? "أمر تشغيل" : "طلب شراء مواد";
}

function getDepartmentLabel(department) {
  const labels = {
    operations: "العمليات",
    engineering: "الهندسية",
    technical: "الفنية"
  };

  return labels[department] || department || "غير محددة";
}

function getStatusFilterLabel(value) {
  const labels = {
    all: "كل الحالات",
    new: "جديد",
    quotes: "عروض أسعار",
    purchased: "تم الشراء",
    "not-purchased": "لم يتم الشراء"
  };

  return labels[value] || value;
}

function getSettlementLabel(value) {
  const labels = {
    all: "كل حالات التصفية",
    settled: "تمت التصفية",
    "not-settled": "لم تتم التصفية"
  };

  return labels[value] || value;
}

function getItemSignalFilterLabel(value) {
  const labels = {
    all: "كل إشارات البنود",
    red: "بنود بها مشكلة",
    green: "بنود بإشارة خضراء",
    unmarked: "بنود بدون إشارة"
  };

  return labels[value] || value;
}

function formatItemQuantity(value) {
  return value === null || value === undefined || value === ""
    ? "غير محددة"
    : Number(value).toLocaleString("ar-SY");
}

function formatItemPrice(value) {
  return value === null || value === undefined || value === ""
    ? "غير محدد"
    : `${Number(value).toLocaleString("ar-SY")} ل.س`;
}

function getRequestIssueCount(request) {
  return (request.items || []).filter(
    (item) => item.available === false || item.signal === "red"
  ).length;
}

function getRequestGreenCount(request) {
  return (request.items || []).filter((item) => item.signal === "green").length;
}

function formatInitialPrice(request) {
  if (
    request.initialPrice === null ||
    request.initialPrice === "" ||
    Number.isNaN(Number(request.initialPrice))
  ) {
    return "غير محدد";
  }

  return `${Number(request.initialPrice).toLocaleString("ar-SY")} ل.س`;
}

function formatDate(dateValue, includeTime = false) {
  if (!dateValue) return "—";

  try {
    const options = includeTime
      ? {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }
      : {
          year: "numeric",
          month: "short",
          day: "numeric"
        };

    return new Intl.DateTimeFormat("ar-SY", options).format(
      new Date(dateValue)
    );
  } catch {
    return dateValue;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getFilteredRequests() {
  const normalizedQuery = state.filters.query.trim().toLowerCase();

  return state.requests.filter((request) => {
    const matchesStatus =
      state.filters.status === "all" ||
      (state.filters.status === "new" && !request.quotes && !request.purchased) ||
      (state.filters.status === "quotes" && request.quotes) ||
      (state.filters.status === "purchased" && request.purchased) ||
      (state.filters.status === "not-purchased" && !request.purchased);

    const matchesType =
      state.filters.type === "all" ||
      request.type === state.filters.type;

    const matchesDepartment =
      state.filters.department === "all" ||
      request.department === state.filters.department;

    const matchesSettlement =
      state.filters.settlement === "all" ||
      (state.filters.settlement === "settled" && request.settled) ||
      (state.filters.settlement === "not-settled" && !request.settled);

    const items = request.items || [];
    const matchesItemSignal =
      state.filters.itemSignal === "all" ||
      (state.filters.itemSignal === "red" &&
        items.some((item) => item.signal === "red" || item.available === false)) ||
      (state.filters.itemSignal === "green" &&
        items.some((item) => item.signal === "green")) ||
      (state.filters.itemSignal === "unmarked" &&
        items.some((item) => item.signal === "none"));

    const noteText = (request.notes || [])
      .map((note) => `${note.authorName} ${note.text}`)
      .join(" ");

    const itemText = items
      .map((item) =>
        [
          item.name,
          item.specifications,
          item.origin,
          item.quantity,
          item.price,
          item.action
        ].join(" ")
      )
      .join(" ");

    const searchableText = [
      request.title,
      request.id,
      request.description,
      itemText,
      getDepartmentLabel(request.department),
      request.supplier,
      noteText
    ]
      .join(" ")
      .toLowerCase();

    const matchesQuery =
      normalizedQuery.length === 0 ||
      searchableText.includes(normalizedQuery);

    return (
      matchesStatus &&
      matchesType &&
      matchesDepartment &&
      matchesSettlement &&
      matchesItemSignal &&
      matchesQuery
    );
  });
}

function progressMarkup(request) {
  return `
    <div class="progress" aria-label="مراحل الطلب">
      <div class="progress-step is-raised">
        <span class="progress-dot"></span>
        <span>تم رفع الطلب</span>
      </div>

      <div class="progress-step ${request.quotes ? "is-quotes" : ""}">
        <span class="progress-dot"></span>
        <span>عروض أسعار</span>
      </div>

      <div class="progress-step ${request.purchased ? "is-purchased" : ""}">
        <span class="progress-dot"></span>
        <span>تم الشراء</span>
      </div>

      <div class="progress-step ${request.settled ? "is-settled" : ""}">
        <span class="progress-dot"></span>
        <span>تمت التصفية</span>
      </div>
    </div>
  `;
}

function requestCardMarkup(request) {
  const priceValue = formatInitialPrice(request);
  const priceClass = priceValue === "غير محدد" ? "is-empty" : "";
  const issueCount = getRequestIssueCount(request);
  const greenCount = getRequestGreenCount(request);
  const itemStatusMarkup =
    request.type === "materials"
      ? `
        <div class="card-item-status">
          <span>${(request.items || []).length.toLocaleString("ar-SY")} بند</span>
          ${
            issueCount > 0
              ? `<span class="item-status-chip is-red"><i class="signal-dot is-red"></i>${issueCount.toLocaleString("ar-SY")} مشكلة</span>`
              : ""
          }
          ${
            greenCount > 0
              ? `<span class="item-status-chip is-green"><i class="signal-dot is-green"></i>${greenCount.toLocaleString("ar-SY")} أخضر</span>`
              : ""
          }
        </div>
      `
      : "";

  return `
    <article
      class="request-card"
      data-request-id="${escapeHtml(request.id)}"
      data-type="${escapeHtml(request.type)}"
      tabindex="0"
      aria-label="${escapeHtml(request.title)}. انقر مرتين لفتح التفاصيل"
    >
      <div class="card-main">
        <div class="card-title-row">
          <h3 class="request-title">${escapeHtml(request.title)}</h3>
          <span class="drag-grip" aria-hidden="true">⠿</span>
        </div>

        <div class="card-meta">
          <span class="type-badge">${getTypeLabel(request.type)}</span>
        </div>

        ${itemStatusMarkup}
      </div>

      <div class="card-price">
        <span>السعر الأولي</span>
        <strong class="${priceClass}">${escapeHtml(priceValue)}</strong>
      </div>

      ${progressMarkup(request)}

      <footer class="card-footer">
        <span class="department-name">${getDepartmentLabel(request.department)}</span>
        <span>${formatDate(request.createdAt)}</span>
      </footer>
    </article>
  `;
}

function getActiveFilterItems() {
  const items = [];

  if (state.filters.status !== "all") {
    items.push(getStatusFilterLabel(state.filters.status));
  }

  if (state.filters.type !== "all") {
    items.push(getTypeLabel(state.filters.type));
  }

  if (state.filters.department !== "all") {
    items.push(getDepartmentLabel(state.filters.department));
  }

  if (state.filters.settlement !== "all") {
    items.push(getSettlementLabel(state.filters.settlement));
  }

  if (state.filters.itemSignal !== "all") {
    items.push(getItemSignalFilterLabel(state.filters.itemSignal));
  }

  if (state.filters.query.trim()) {
    items.push(`بحث: ${state.filters.query.trim()}`);
  }

  return items;
}

function renderAppliedFilters() {
  const activeItems = getActiveFilterItems();

  elements.activeFiltersCount.hidden = activeItems.length === 0;
  elements.activeFiltersCount.textContent = activeItems.length;

  elements.appliedFilters.innerHTML = activeItems
    .map((label) => `<span class="applied-filter">${escapeHtml(label)}</span>`)
    .join("");
}

function renderDeletionLog() {
  elements.deletionLogCount.textContent = state.deletionLog.length.toLocaleString("ar-SY");

  if (state.deletionLog.length === 0) {
    elements.deletionLogList.innerHTML =
      '<p class="deletion-log__empty">لا توجد عمليات حذف مسجلة.</p>';
    return;
  }

  elements.deletionLogList.innerHTML = state.deletionLog
    .slice(0, 50)
    .map((entry) => `
      <article class="deletion-log__entry">
        <strong>${escapeHtml(entry.title || entry.requestId || "وثيقة")}</strong>
        <span>${escapeHtml(entry.requestNumber || entry.requestId || "—")} · ${escapeHtml(entry.typeLabel || "وثيقة")}</span>
        <span>حذفها: ${escapeHtml(entry.deletedByName || "مستخدم غير معروف")}</span>
        <time>${formatDate(entry.deletedAt, true)}</time>
      </article>
    `)
    .join("");
}

function render() {
  const filteredRequests = getFilteredRequests();

  elements.requestList.innerHTML = filteredRequests
    .map(requestCardMarkup)
    .join("");

  elements.emptyState.hidden = filteredRequests.length !== 0;
  elements.requestList.hidden = filteredRequests.length === 0;

  elements.resultsText.textContent =
    filteredRequests.length === state.requests.length
      ? `يعرض ${filteredRequests.length} طلبًا`
      : `يعرض ${filteredRequests.length} من أصل ${state.requests.length}`;

  elements.totalCount.textContent = state.requests.length;
  elements.waitingQuotesCount.textContent = state.requests.filter(
    (request) => !request.quotes
  ).length;
  elements.purchasedCount.textContent = state.requests.filter(
    (request) => request.purchased
  ).length;
  elements.settledCount.textContent = state.requests.filter(
    (request) => request.settled
  ).length;

  elements.searchInput.value = state.filters.query;
  renderAppliedFilters();
  renderDeletionLog();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");

  window.clearTimeout(showToast.timeoutId);

  showToast.timeoutId = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2200);
}

function openOverlay(overlay) {
  overlay.hidden = false;
  document.body.classList.add("has-overlay");
}

function closeOverlay(overlay) {
  overlay.hidden = true;

  if (
    elements.detailsOverlay.hidden &&
    elements.addOverlay.hidden &&
    elements.filtersOverlay.hidden
  ) {
    document.body.classList.remove("has-overlay");
  }
}

function setFilterButtonSelection(groupName, value) {
  document
    .querySelectorAll(`[data-filter-group="${groupName}"] [data-filter-value]`)
    .forEach((button) => {
      button.classList.toggle(
        "is-selected",
        button.dataset.filterValue === value
      );
    });
}

function syncFilterButtons() {
  setFilterButtonSelection("status", state.draftFilters.status);
  setFilterButtonSelection("type", state.draftFilters.type);
  setFilterButtonSelection("department", state.draftFilters.department);
  setFilterButtonSelection("settlement", state.draftFilters.settlement);
  setFilterButtonSelection("itemSignal", state.draftFilters.itemSignal);
}

function openFilters() {
  state.draftFilters = {
    ...state.filters
  };

  syncFilterButtons();
  openOverlay(elements.filtersOverlay);
}

function closeFilters() {
  closeOverlay(elements.filtersOverlay);
}

function notesMarkup(request) {
  const notes = [...(request.notes || [])].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  const noteFormMarkup = state.noteFormOpen
    ? `
      <form class="note-form" data-add-note-form="${escapeHtml(request.id)}">
        <textarea
          name="noteText"
          maxlength="800"
          required
          placeholder="اكتب الملاحظة..."
        ></textarea>

        <div class="note-form-actions">
          <button class="note-save" type="submit">حفظ الملاحظة</button>
          <button class="note-cancel" type="button" data-cancel-note>إلغاء</button>
        </div>
      </form>
    `
    : "";

  const noteItems = notes.length
    ? notes.map((note) => noteMarkup(request, note)).join("")
    : `<p class="notes-empty">لا توجد ملاحظات حتى الآن.</p>`;

  return `
    <section class="notes-section">
      <header class="notes-header">
        <div>
          <h3>الملاحظات</h3>
          <span class="notes-user">الإضافة الآن باسم: ${escapeHtml(CURRENT_USER.name)}</span>
        </div>

        <button
          class="add-note-button"
          type="button"
          data-open-note-form="${escapeHtml(request.id)}"
        >
          ＋ إضافة ملاحظة
        </button>
      </header>

      ${noteFormMarkup}

      <div class="notes-list">
        ${noteItems}
      </div>
    </section>
  `;
}

function noteMarkup(request, note) {
  const isOwner = note.authorId === CURRENT_USER.id;
  const isEditing = isOwner && state.editingNoteId === note.id;
  const updatedText = note.updatedAt ? " · معدّلة" : "";

  if (isEditing) {
    return `
      <article class="note-card">
        <form
          class="note-edit-form"
          data-edit-note-form="${escapeHtml(request.id)}"
          data-note-id="${escapeHtml(note.id)}"
        >
          <textarea name="noteText" maxlength="800" required>${escapeHtml(note.text)}</textarea>

          <div class="note-form-actions">
            <button class="note-save" type="submit">حفظ التعديل</button>
            <button class="note-cancel" type="button" data-cancel-note-edit>إلغاء</button>
          </div>
        </form>
      </article>
    `;
  }

  const ownerActions = isOwner
    ? `
      <div class="note-owner-actions">
        <button
          class="note-edit-button"
          type="button"
          data-edit-note="${escapeHtml(note.id)}"
        >
          تعديل
        </button>

        <button
          class="note-delete-button"
          type="button"
          data-delete-note="${escapeHtml(note.id)}"
        >
          حذف
        </button>
      </div>
    `
    : "";

  return `
    <article class="note-card">
      <div class="note-card__meta">
        <span class="note-author">${escapeHtml(note.authorName)}</span>
        <span>${formatDate(note.updatedAt || note.createdAt, true)}${updatedText}</span>
      </div>

      <p>${escapeHtml(note.text)}</p>

      ${ownerActions}
    </article>
  `;
}

function purchaseItemSignalDot(item) {
  if (item.signal === "green") {
    return '<span class="signal-dot is-green" title="إشارة خضراء"></span>';
  }

  if (item.signal === "red") {
    return '<span class="signal-dot is-red" title="إشارة حمراء"></span>';
  }

  return "";
}

function purchaseItemMarkup(request, item, index) {
  const isMissing = item.available === false;

  return `
    <article class="purchase-item ${isMissing ? "is-missing" : ""}" data-purchase-item="${escapeHtml(item.id)}">
      <header class="purchase-item__header">
        <div>
          <span class="purchase-item__number">البند ${(index + 1).toLocaleString("ar-SY")}</span>
          <h3>
            ${purchaseItemSignalDot(item)}
            ${escapeHtml(item.name || `البند ${index + 1}`)}
          </h3>
        </div>
        <span class="availability-badge ${isMissing ? "is-missing" : "is-available"}">
          ${isMissing ? "غير موجود" : "موجود"}
        </span>
      </header>

      <div class="purchase-item__specs">
        <span>المواصفات</span>
        <p>${escapeHtml(item.specifications || "غير محددة")}</p>
      </div>

      <div class="purchase-item__grid">
        <div>
          <span>المنشأ</span>
          <strong>${escapeHtml(item.origin || "غير محدد")}</strong>
        </div>
        <div>
          <span>العدد / الكمية</span>
          <strong>${escapeHtml(formatItemQuantity(item.quantity))}</strong>
        </div>
        <div>
          <span>السعر</span>
          <strong>${escapeHtml(formatItemPrice(item.price))}</strong>
        </div>
      </div>

      <div class="purchase-item__controls">
        <label class="item-availability-control">
          <input
            type="checkbox"
            data-item-available="${escapeHtml(request.id)}"
            data-item-id="${escapeHtml(item.id)}"
            ${item.available ? "checked" : ""}
          >
          <span>${item.available ? "البند موجود" : "البند غير موجود"}</span>
        </label>

        <div class="item-signal-picker" aria-label="إشارة البند">
          <span>إشارة البند</span>
          <div>
            <button
              class="signal-choice ${item.signal === "none" ? "is-selected" : ""}"
              type="button"
              data-item-signal="none"
              data-request-id="${escapeHtml(request.id)}"
              data-item-id="${escapeHtml(item.id)}"
            >بدون</button>
            <button
              class="signal-choice is-green ${item.signal === "green" ? "is-selected" : ""}"
              type="button"
              data-item-signal="green"
              data-request-id="${escapeHtml(request.id)}"
              data-item-id="${escapeHtml(item.id)}"
            ><span class="signal-dot is-green"></span> خضراء</button>
            <button
              class="signal-choice is-red ${item.signal === "red" ? "is-selected" : ""}"
              type="button"
              data-item-signal="red"
              data-request-id="${escapeHtml(request.id)}"
              data-item-id="${escapeHtml(item.id)}"
            ><span class="signal-dot is-red"></span> حمراء</button>
          </div>
        </div>
      </div>

      ${
        isMissing
          ? `
            <label class="item-action-field">
              <span>الإجراء المتبع لهذا البند</span>
              <textarea
                rows="3"
                maxlength="700"
                data-item-action="${escapeHtml(request.id)}"
                data-item-id="${escapeHtml(item.id)}"
                placeholder="اكتب الإجراء المتبع بسبب عدم توفر البند..."
              >${escapeHtml(item.action || "")}</textarea>
            </label>
          `
          : ""
      }
    </article>
  `;
}

function materialsItemsMarkup(request) {
  const items = request.items || [];

  return `
    <section class="purchase-items-detail">
      <header class="purchase-items-detail__header">
        <div>
          <span>بنود طلب الشراء</span>
          <strong>${items.length.toLocaleString("ar-SY")} بند</strong>
        </div>
        ${
          getRequestIssueCount(request) > 0
            ? `<span class="items-problem-count"><span class="signal-dot is-red"></span>${getRequestIssueCount(request).toLocaleString("ar-SY")} بها مشكلة</span>`
            : ""
        }
      </header>

      <div class="purchase-items-list">
        ${
          items.length > 0
            ? items.map((item, index) => purchaseItemMarkup(request, item, index)).join("")
            : '<p class="purchase-items-empty">لا توجد بنود في هذا الطلب.</p>'
        }
      </div>
    </section>
  `;
}

function renderDetails(requestId) {
  const request = state.requests.find((item) => item.id === requestId);

  if (!request) return;

  elements.detailsTitle.textContent = request.title;

  const attachmentsMarkup =
    request.attachments && request.attachments.length > 0
      ? request.attachments
          .map((attachment) => {
            const isImage = String(attachment.mimeType || "").startsWith("image/");
            if (isImage) {
              return `
                <a class="attachment" href="${escapeHtml(attachment.url)}" target="_blank" rel="noopener">
                  <img src="${escapeHtml(attachment.url)}" alt="${escapeHtml(attachment.name)}">
                  <p>${escapeHtml(attachment.name)}</p>
                </a>
              `;
            }

            return `
              <a class="attachment attachment--document" href="${escapeHtml(attachment.url)}" target="_blank" rel="noopener">
                <span class="attachment__file-icon" aria-hidden="true">📄</span>
                <p>${escapeHtml(attachment.name)}</p>
                <small>فتح الملف</small>
              </a>
            `;
          })
          .join("")
      : "";

  const primaryDetailsMarkup =
    request.type === "materials"
      ? materialsItemsMarkup(request)
      : `
        <article class="detail-description">
          <span>تفاصيل أمر التشغيل</span>
          <p>${escapeHtml(request.description || "لا توجد تفاصيل.")}</p>
        </article>
      `;

  elements.detailsContent.innerHTML = `
    ${primaryDetailsMarkup}

    <div class="detail-status">
      ${progressMarkup(request)}
    </div>

    <div class="detail-grid">
      <article class="detail-box is-wide">
        <span>الجهة الطالبة</span>
        <strong>${getDepartmentLabel(request.department)}</strong>
      </article>

      <article class="detail-box">
        <span>رقم الطلب</span>
        <strong>${escapeHtml(request.requestNumber || request.id)}</strong>
      </article>

      <article class="detail-box">
        <span>نوع الطلب</span>
        <strong>${getTypeLabel(request.type)}</strong>
      </article>

      <article class="detail-box">
        <span>السعر الأولي</span>
        <strong>${escapeHtml(formatInitialPrice(request))}</strong>
      </article>

      <article class="detail-box">
        <span>حالة التصفية</span>
        <strong>${request.settled ? "تمت التصفية" : "لم تتم التصفية"}</strong>
      </article>

      <article class="detail-box">
        <span>تاريخ رفع الطلب</span>
        <strong>${formatDate(request.createdAt)}</strong>
      </article>

      <article class="detail-box">
        <span>عدد عروض الأسعار</span>
        <strong>${Number(request.offersCount || 0).toLocaleString("ar-SY")}</strong>
      </article>

      <article class="detail-box is-wide">
        <span>المورد</span>
        <strong>${escapeHtml(request.supplier || "—")}</strong>
      </article>
    </div>

    <div class="detail-actions">
      <button
        class="detail-action-button"
        type="button"
        data-toggle-settlement="${escapeHtml(request.id)}"
      >
        ${
          request.settled
            ? "إلغاء علامة تمت التصفية"
            : "تحديد الطلب بأنه تمت تصفيته"
        }
      </button>

      <button
        class="detail-delete-button"
        type="button"
        data-delete-request="${escapeHtml(request.id)}"
      >حذف الوثيقة</button>
      <small class="delete-password-note">الحذف يتطلب كلمة المرور ورسالة تأكيد، ويتم التحقق منها داخل قاعدة البيانات.</small>
    </div>

    ${notesMarkup(request)}

    ${
      request.attachments && request.attachments.length > 0
        ? `
          <h3 class="attachments-title">الصور المرفقة</h3>
          <div class="attachments">${attachmentsMarkup}</div>
        `
        : `
          <div class="detail-grid attachments-empty-grid">
            <article class="detail-box is-wide">
              <span>الصور المرفقة</span>
              <p>لا توجد صور مرفقة لهذا الطلب.</p>
            </article>
          </div>
        `
    }
  `;
}

function openDetails(requestId) {
  const request = state.requests.find((item) => item.id === requestId);

  if (!request) return;

  state.activeDetailsId = requestId;
  state.noteFormOpen = false;
  state.editingNoteId = null;
  renderDetails(requestId);
  openOverlay(elements.detailsOverlay);
}

function closeDetails() {
  state.activeDetailsId = null;
  state.noteFormOpen = false;
  state.editingNoteId = null;
  closeOverlay(elements.detailsOverlay);
}

function openAddForm() {
  openOverlay(elements.addOverlay);

  window.setTimeout(() => {
    elements.addRequestForm.elements.title.focus();
  }, 120);
}

function closeAddForm() {
  closeOverlay(elements.addOverlay);
}

function generateRequestId() {
  return crypto.randomUUID();
}

async function compressImageFile(file) {
  if (!String(file.type || "").startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.size <= 1_500_000) {
      bitmap.close?.();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("تعذر ضغط الصورة"))),
        "image/jpeg",
        JPEG_QUALITY
      );
    });

    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "image"}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now()
    });
  } catch (error) {
    console.warn("تعذر ضغط الصورة؛ سيتم رفع الملف الأصلي.", error);
    return file;
  }
}

async function prepareSelectedAttachments(fileList) {
  const files = [...fileList].slice(0, MAX_ATTACHMENTS);
  const attachments = [];

  for (const originalFile of files) {
    if (originalFile.size > MAX_FILE_BYTES && !String(originalFile.type || "").startsWith("image/")) {
      throw new Error(`الملف «${originalFile.name}» أكبر من 10 MB.`);
    }

    const file = await compressImageFile(originalFile);
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`الملف «${originalFile.name}» أكبر من 10 MB بعد التجهيز.`);
    }

    attachments.push({
      file,
      originalName: originalFile.name,
      mimeType: file.type || originalFile.type || "application/octet-stream",
      kind: String(file.type || originalFile.type || "").startsWith("image/") ? "image" : "document"
    });
  }

  return attachments;
}

function safeStorageFileName(name) {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, "") : "";
  return `${crypto.randomUUID()}${ext || ""}`;
}

async function uploadSelectedAttachments(requestId) {
  const client = getSupabase();

  for (const attachment of state.selectedAttachments) {
    const storagePath = `${requestId}/${safeStorageFileName(attachment.file.name)}`;
    const { error: uploadError } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, attachment.file, {
        contentType: attachment.mimeType,
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { error: metadataError } = await client.from("attachments").insert({
      request_id: requestId,
      storage_path: storagePath,
      original_name: attachment.originalName,
      mime_type: attachment.mimeType,
      size_bytes: attachment.file.size,
      kind: attachment.kind
    });

    if (metadataError) throw metadataError;
  }
}

function materialItemEditorMarkup() {
  state.materialItemSequence += 1;
  const editorId = `material-editor-${state.materialItemSequence}`;

  return `
    <article class="material-item-editor" data-material-item-editor id="${editorId}">
      <header class="material-item-editor__header">
        <strong data-item-editor-title>بند شراء</strong>
        <button class="remove-item-button" type="button" data-remove-material-item>حذف البند</button>
      </header>

      <label>
        <span>اسم البند</span>
        <input data-item-field="name" type="text" maxlength="120" required placeholder="مثال: كابل نحاسي 4×16 مم²">
      </label>

      <label>
        <span>المواصفات</span>
        <textarea data-item-field="specifications" rows="3" maxlength="700" placeholder="المقاس، النوع، المعيار أو المواصفات الفنية"></textarea>
      </label>

      <div class="material-item-editor__grid">
        <label>
          <span>المنشأ</span>
          <input data-item-field="origin" type="text" maxlength="80" placeholder="مثال: سوريا">
        </label>

        <label>
          <span>العدد / الكمية</span>
          <input data-item-field="quantity" type="number" min="0" step="any" required placeholder="0">
        </label>

        <label class="is-wide">
          <span>السعر (ل.س)</span>
          <input data-item-field="price" type="number" min="0" step="1" placeholder="اختياري">
        </label>
      </div>

      <label class="check-row material-item-available">
        <input data-editor-available type="checkbox" checked>
        <span>البند موجود</span>
      </label>

      <label data-editor-action-wrap hidden>
        <span>الإجراء المتبع لهذا البند</span>
        <textarea data-item-field="action" rows="3" maxlength="700" placeholder="ماذا سنفعل بسبب عدم توفر البند؟"></textarea>
      </label>

      <label>
        <span>إشارة البند</span>
        <select data-item-field="signal">
          <option value="none">بدون إشارة</option>
          <option value="green">دائرة خضراء</option>
          <option value="red">دائرة حمراء</option>
        </select>
      </label>
    </article>
  `;
}

function renumberMaterialItemEditors() {
  [...elements.materialItemsEditor.querySelectorAll("[data-material-item-editor]")]
    .forEach((editor, index) => {
      const title = editor.querySelector("[data-item-editor-title]");
      if (title) title.textContent = `البند ${(index + 1).toLocaleString("ar-SY")}`;
    });
}

function addMaterialItemEditor() {
  elements.materialItemsEditor.insertAdjacentHTML(
    "beforeend",
    materialItemEditorMarkup()
  );
  renumberMaterialItemEditors();
}

function resetMaterialItemsEditor() {
  elements.materialItemsEditor.innerHTML = "";
  addMaterialItemEditor();
}

function syncRequestTypeFields() {
  const isMaterials = elements.addRequestForm.elements.type.value === "materials";
  const description = elements.addRequestForm.elements.description;

  elements.materialsItemsSection.hidden = !isMaterials;
  elements.workDescriptionField.hidden = isMaterials;

  elements.materialsItemsSection
    .querySelectorAll("input, textarea, select, button")
    .forEach((control) => {
      control.disabled = !isMaterials;
    });

  description.disabled = isMaterials;
  description.required = !isMaterials;

  if (isMaterials && elements.materialItemsEditor.children.length === 0) {
    addMaterialItemEditor();
  }
}

function collectMaterialItemsFromForm(requestId) {
  const editors = [
    ...elements.materialItemsEditor.querySelectorAll("[data-material-item-editor]")
  ];

  if (editors.length === 0) {
    throw new Error("أضف بندًا واحدًا على الأقل إلى طلب الشراء");
  }

  return editors.map((editor, index) => {
    const getField = (name) => editor.querySelector(`[data-item-field="${name}"]`);
    const name = getField("name").value.trim();
    const available = editor.querySelector("[data-editor-available]").checked;
    const action = getField("action").value.trim();

    if (!name) {
      throw new Error(`اكتب اسم البند ${(index + 1).toLocaleString("ar-SY")}`);
    }

    if (!available && !action) {
      throw new Error(
        `اكتب الإجراء المتبع للبند ${(index + 1).toLocaleString("ar-SY")} لأنه غير موجود`
      );
    }

    return normalizePurchaseItem(
      {
        id: `ITEM-${requestId}-${index + 1}-${Date.now()}`,
        name,
        specifications: getField("specifications").value.trim(),
        origin: getField("origin").value.trim(),
        quantity: getField("quantity").value,
        price: getField("price").value,
        available,
        action,
        signal: getField("signal").value
      },
      requestId,
      index
    );
  });
}

function getRequestItem(requestId, itemId) {
  const request = state.requests.find((item) => item.id === requestId);
  const item = request?.items?.find((entry) => entry.id === itemId);
  return { request, item };
}

async function deleteRequestWithPassword(requestId) {
  const request = state.requests.find((item) => item.id === requestId);
  if (!request) return;

  const confirmed = window.confirm(
    `هل أنت متأكد من حذف الوثيقة «${request.title}»؟ سيتم تسجيل عملية الحذف واسم المستخدم.`
  );
  if (!confirmed) return;

  const password = window.prompt("أدخل كلمة مرور الحذف:");
  if (password === null) return;

  try {
    const { error } = await getSupabase().rpc("delete_request_secure", {
      p_request_id: requestId,
      p_password: password
    });
    if (error) throw error;

    closeDetails();
    await refreshAppData({ silent: true });
    showToast("تم حذف الوثيقة وتسجيل العملية في سجل الحذف");
  } catch (error) {
    const message = String(error?.message || "");
    if (/Invalid delete password/i.test(message)) {
      window.alert("كلمة مرور الحذف غير صحيحة.");
    } else {
      handleDatabaseError(error, "تعذر حذف الوثيقة");
    }
  }
}

async function addRequest(formData) {
  const client = getSupabase();
  const status = formData.get("status");
  const isPurchased = status === "purchased";
  const initialPriceValue = formData.get("initialPrice");
  const type = formData.get("type");
  const materialItems = type === "materials" ? collectMaterialItemsFromForm("new") : [];
  const currentOrders = state.requests.map((request) => Number(request.sortOrder || 0));
  const sortOrder = currentOrders.length ? Math.min(...currentOrders) - 100 : 0;

  const itemsPayload = materialItems.map((item, index) => ({
    item_name: item.name,
    specifications: item.specifications,
    origin: item.origin,
    quantity: item.quantity,
    unit: item.unit || "",
    price: item.price,
    available: item.available,
    action_if_unavailable: item.action,
    signal: item.signal,
    sort_order: index
  }));

  const { data: requestId, error: requestError } = await client.rpc(
    "create_request_secure",
    {
      p_title: String(formData.get("title") || "").trim(),
      p_request_type: type,
      p_department_code: formData.get("department"),
      p_description: type === "work-order" ? String(formData.get("description") || "").trim() : "",
      p_initial_price: initialPriceValue !== "" ? Number(initialPriceValue) : null,
      p_has_quotes: status === "quotes" || isPurchased,
      p_is_purchased: isPurchased,
      p_is_settled: formData.get("settled") === "on",
      p_offers_count: status === "quotes" || isPurchased ? 1 : 0,
      p_sort_order: sortOrder,
      p_items: itemsPayload
    }
  );

  if (requestError) throw requestError;

  let attachmentWarning = "";
  if (state.selectedAttachments.length) {
    try {
      await uploadSelectedAttachments(requestId);
    } catch (error) {
      console.error("تعذر رفع بعض المرفقات", error);
      attachmentWarning = "تم حفظ الطلب، لكن تعذر رفع بعض المرفقات. يمكنك إعادة إضافتها لاحقًا بعد تجهيز تعديل المرفقات.";
    }
  }

  await refreshAppData({ silent: true });
  return { requestId, attachmentWarning };
}

function updateGlobalOrderFromVisibleCards() {
  const visibleIds = [...elements.requestList.querySelectorAll(".request-card")]
    .map((card) => card.dataset.requestId);

  if (visibleIds.length === 0) return;

  const visibleIdSet = new Set(visibleIds);
  const requestMap = new Map(
    state.requests.map((request) => [request.id, request])
  );

  let visibleIndex = 0;

  state.requests = state.requests.map((request) => {
    if (!visibleIdSet.has(request.id)) {
      return request;
    }

    const nextVisibleId = visibleIds[visibleIndex];
    visibleIndex += 1;

    return requestMap.get(nextVisibleId);
  });

  saveRequests();
}

function getAfterElement(container, pointerY) {
  const cards = [
    ...container.querySelectorAll(".request-card:not(.is-dragging)")
  ];

  return cards.reduce(
    (closest, card) => {
      const box = card.getBoundingClientRect();
      const offset = pointerY - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return {
          offset,
          element: card
        };
      }

      return closest;
    },
    {
      offset: Number.NEGATIVE_INFINITY,
      element: null
    }
  ).element;
}

function installLongPressReorder() {
  let pressTimer = null;
  let activeCard = null;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;

  function clearPressTimer() {
    if (pressTimer !== null) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  function finishInteraction() {
    clearPressTimer();

    if (dragging && activeCard) {
      activeCard.classList.remove("is-dragging");
      document.body.classList.remove("is-reordering");
      updateGlobalOrderFromVisibleCards();
      state.suppressTapUntil = Date.now() + 500;
      showToast("تم تحديث الترتيب وسيتم حفظه في القاعدة");
      render();
    }

    activeCard = null;
    pointerId = null;
    dragging = false;
  }

  elements.requestList.addEventListener("pointerdown", (event) => {
    const card = event.target.closest(".request-card");

    if (!card) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    activeCard = card;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragging = false;

    pressTimer = window.setTimeout(() => {
      if (!activeCard) return;

      dragging = true;
      activeCard.classList.add("is-dragging");
      document.body.classList.add("is-reordering");

      if (navigator.vibrate) {
        navigator.vibrate(35);
      }

      showToast("حرّك الطلب إلى مكانه الجديد");
    }, 520);
  });

  window.addEventListener(
    "pointermove",
    (event) => {
      if (!activeCard || event.pointerId !== pointerId) return;

      const distance = Math.hypot(
        event.clientX - startX,
        event.clientY - startY
      );

      if (!dragging && distance > 10) {
        clearPressTimer();
        activeCard = null;
        pointerId = null;
        return;
      }

      if (!dragging) return;

      event.preventDefault();

      const afterElement = getAfterElement(
        elements.requestList,
        event.clientY
      );

      if (afterElement === null) {
        elements.requestList.appendChild(activeCard);
      } else {
        elements.requestList.insertBefore(activeCard, afterElement);
      }
    },
    { passive: false }
  );

  window.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointerId) return;
    finishInteraction();
  });

  window.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== pointerId) return;
    finishInteraction();
  });
}

document.querySelectorAll("[data-filter-group]").forEach((group) => {
  group.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter-value]");

    if (!button) return;

    const groupName = group.dataset.filterGroup;
    state.draftFilters[groupName] = button.dataset.filterValue;
    setFilterButtonSelection(groupName, state.draftFilters[groupName]);
  });
});

elements.openFiltersButton.addEventListener("click", openFilters);

elements.applyFiltersButton.addEventListener("click", () => {
  state.filters = {
    ...state.filters,
    status: state.draftFilters.status,
    type: state.draftFilters.type,
    department: state.draftFilters.department,
    settlement: state.draftFilters.settlement,
    itemSignal: state.draftFilters.itemSignal
  };

  saveFilters();
  render();
  closeFilters();
  showToast("تم تطبيق الفلاتر");
});

elements.resetFiltersButton.addEventListener("click", () => {
  state.draftFilters = {
    ...defaultFilters,
    query: state.filters.query
  };

  syncFilterButtons();
  showToast("تمت إعادة ضبط خيارات الفلترة");
});

elements.searchInput.addEventListener("input", (event) => {
  state.filters.query = event.target.value;
  saveFilters();
  render();
});

elements.requestList.addEventListener("click", (event) => {
  if (Date.now() < state.suppressTapUntil) return;

  const card = event.target.closest(".request-card");

  if (!card) return;

  const now = Date.now();
  const requestId = card.dataset.requestId;
  const isDoubleTap =
    state.lastCardTap.id === requestId &&
    now - state.lastCardTap.time <= 360;

  if (isDoubleTap) {
    openDetails(requestId);
    state.lastCardTap = {
      id: null,
      time: 0
    };
    return;
  }

  state.lastCardTap = {
    id: requestId,
    time: now
  };

  card.classList.add("is-tap-feedback");

  window.setTimeout(() => {
    card.classList.remove("is-tap-feedback");
  }, 170);
});

elements.requestList.addEventListener("dblclick", (event) => {
  const card = event.target.closest(".request-card");

  if (card) {
    openDetails(card.dataset.requestId);
  }
});

elements.requestList.addEventListener("keydown", (event) => {
  const card = event.target.closest(".request-card");

  if (!card) return;

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openDetails(card.dataset.requestId);
  }
});

elements.detailsContent.addEventListener("click", async (event) => {
  const deleteRequestButton = event.target.closest("[data-delete-request]");

  if (deleteRequestButton) {
    await deleteRequestWithPassword(deleteRequestButton.dataset.deleteRequest);
    return;
  }

  const signalButton = event.target.closest("[data-item-signal]");
  if (signalButton) {
    const { request, item } = getRequestItem(
      signalButton.dataset.requestId,
      signalButton.dataset.itemId
    );
    if (!request || !item) return;

    const previous = item.signal;
    const next = signalButton.dataset.itemSignal;
    item.signal = next;
    render();
    renderDetails(request.id);

    const { error } = await getSupabase()
      .from("purchase_items")
      .update({ signal: next })
      .eq("id", item.id);

    if (error) {
      item.signal = previous;
      render();
      renderDetails(request.id);
      handleDatabaseError(error);
      return;
    }

    showToast(
      next === "red"
        ? "تمت إضافة الإشارة الحمراء للبند"
        : next === "green"
          ? "تمت إضافة الإشارة الخضراء للبند"
          : "تمت إزالة إشارة البند"
    );
    return;
  }

  const settlementButton = event.target.closest("[data-toggle-settlement]");
  if (settlementButton) {
    const requestId = settlementButton.dataset.toggleSettlement;
    const request = state.requests.find((item) => item.id === requestId);
    if (!request) return;

    const previous = request.settled;
    request.settled = !request.settled;
    render();
    renderDetails(requestId);

    const { error } = await getSupabase()
      .from("requests")
      .update({ is_settled: request.settled })
      .eq("id", requestId);

    if (error) {
      request.settled = previous;
      render();
      renderDetails(requestId);
      handleDatabaseError(error);
      return;
    }

    showToast(request.settled ? "تم تحديد الطلب بأنه تمت تصفيته" : "تم إلغاء حالة التصفية");
    return;
  }

  const openNoteButton = event.target.closest("[data-open-note-form]");
  if (openNoteButton) {
    state.noteFormOpen = true;
    state.editingNoteId = null;
    renderDetails(openNoteButton.dataset.openNoteForm);
    window.setTimeout(() => {
      elements.detailsContent.querySelector("[data-add-note-form] textarea")?.focus();
    }, 50);
    return;
  }

  if (event.target.closest("[data-cancel-note]")) {
    state.noteFormOpen = false;
    renderDetails(state.activeDetailsId);
    return;
  }

  const editNoteButton = event.target.closest("[data-edit-note]");
  if (editNoteButton) {
    state.editingNoteId = editNoteButton.dataset.editNote;
    state.noteFormOpen = false;
    renderDetails(state.activeDetailsId);
    window.setTimeout(() => {
      elements.detailsContent.querySelector("[data-edit-note-form] textarea")?.focus();
    }, 50);
    return;
  }

  if (event.target.closest("[data-cancel-note-edit]")) {
    state.editingNoteId = null;
    renderDetails(state.activeDetailsId);
    return;
  }

  const deleteNoteButton = event.target.closest("[data-delete-note]");
  if (deleteNoteButton) {
    const request = state.requests.find((item) => item.id === state.activeDetailsId);
    const note = request?.notes.find((item) => item.id === deleteNoteButton.dataset.deleteNote);
    if (!request || !note || note.authorId !== CURRENT_USER.id) return;
    if (!window.confirm("هل تريد حذف هذه الملاحظة؟")) return;

    const { error } = await getSupabase().from("notes").delete().eq("id", note.id);
    if (error) {
      handleDatabaseError(error, "تعذر حذف الملاحظة");
      return;
    }

    request.notes = request.notes.filter((item) => item.id !== note.id);
    render();
    renderDetails(request.id);
    showToast("تم حذف الملاحظة");
  }
});

elements.detailsContent.addEventListener("change", async (event) => {
  const availabilityInput = event.target.closest("[data-item-available]");
  if (availabilityInput) {
    const { request, item } = getRequestItem(
      availabilityInput.dataset.itemAvailable,
      availabilityInput.dataset.itemId
    );
    if (!request || !item) return;

    const previous = item.available;
    item.available = availabilityInput.checked;
    render();
    renderDetails(request.id);

    if (!item.available && !String(item.action || "").trim()) {
      showToast("اكتب الإجراء المتبع ليتم حفظ حالة «غير موجود»");
      window.setTimeout(() => {
        elements.detailsContent.querySelector(`[data-item-action="${request.id}"][data-item-id="${item.id}"]`)?.focus();
      }, 50);
      return;
    }

    const { error } = await getSupabase()
      .from("purchase_items")
      .update({ available: item.available })
      .eq("id", item.id);

    if (error) {
      item.available = previous;
      render();
      renderDetails(request.id);
      handleDatabaseError(error);
      return;
    }

    showToast(item.available ? "تم تحديد البند بأنه موجود" : "تم تحديد البند بأنه غير موجود");
    return;
  }

  const actionField = event.target.closest("[data-item-action]");
  if (actionField) {
    const { request, item } = getRequestItem(
      actionField.dataset.itemAction,
      actionField.dataset.itemId
    );
    if (!request || !item) return;

    const action = actionField.value.trim();
    if (!action && item.available === false) {
      showToast("الإجراء مطلوب عندما يكون البند غير موجود");
      return;
    }

    const { error } = await getSupabase()
      .from("purchase_items")
      .update({ action_if_unavailable: action, available: item.available })
      .eq("id", item.id);

    if (error) {
      handleDatabaseError(error, "تعذر حفظ الإجراء");
      return;
    }

    item.action = action;
    render();
    renderDetails(request.id);
    showToast("تم حفظ الإجراء المتبع للبند");
  }
});

elements.detailsContent.addEventListener("submit", async (event) => {
  event.preventDefault();

  const addForm = event.target.closest("[data-add-note-form]");
  if (addForm) {
    const requestId = addForm.dataset.addNoteForm;
    const request = state.requests.find((item) => item.id === requestId);
    const text = String(new FormData(addForm).get("noteText") || "").trim();
    if (!request || !text) return;

    const { data, error } = await getSupabase()
      .from("notes")
      .insert({ request_id: requestId, body: text, author_id: CURRENT_USER.id })
      .select("id, body, author_id, author_name, created_at, updated_at")
      .single();

    if (error) {
      handleDatabaseError(error, "تعذر إضافة الملاحظة");
      return;
    }

    request.notes.push(dbNoteToApp(data));
    state.noteFormOpen = false;
    render();
    renderDetails(requestId);
    showToast("تمت إضافة الملاحظة");
    return;
  }

  const editForm = event.target.closest("[data-edit-note-form]");
  if (editForm) {
    const requestId = editForm.dataset.editNoteForm;
    const request = state.requests.find((item) => item.id === requestId);
    const note = request?.notes.find((item) => item.id === editForm.dataset.noteId);
    const text = String(new FormData(editForm).get("noteText") || "").trim();
    if (!request || !note || note.authorId !== CURRENT_USER.id || !text) return;

    const { data, error } = await getSupabase()
      .from("notes")
      .update({ body: text })
      .eq("id", note.id)
      .select("id, body, author_id, author_name, created_at, updated_at")
      .single();

    if (error) {
      handleDatabaseError(error, "تعذر تعديل الملاحظة");
      return;
    }

    Object.assign(note, dbNoteToApp(data));
    state.editingNoteId = null;
    render();
    renderDetails(requestId);
    showToast("تم تعديل الملاحظة");
  }
});

elements.detailsSheet.addEventListener("click", (event) => {
  if (
    event.target.closest(
      "button, a, input, select, textarea, form, .notes-section"
    )
  ) {
    return;
  }

  const now = Date.now();

  if (now - state.lastDetailsTap <= 360) {
    closeDetails();
    state.lastDetailsTap = 0;
    return;
  }

  state.lastDetailsTap = now;
});

elements.detailsSheet.addEventListener("dblclick", (event) => {
  if (
    !event.target.closest(
      "button, a, input, select, textarea, form, .notes-section"
    )
  ) {
    closeDetails();
  }
});

document.querySelectorAll("[data-close-details]").forEach((element) => {
  element.addEventListener("click", closeDetails);
});

document.querySelectorAll("[data-close-add]").forEach((element) => {
  element.addEventListener("click", closeAddForm);
});

document.querySelectorAll("[data-close-filters]").forEach((element) => {
  element.addEventListener("click", closeFilters);
});

elements.addRequestButton.addEventListener("click", openAddForm);

elements.addMaterialItemButton.addEventListener("click", () => {
  addMaterialItemEditor();

  elements.materialItemsEditor.lastElementChild
    ?.querySelector('[data-item-field="name"]')
    ?.focus();
});

elements.addRequestForm.elements.type.addEventListener("change", syncRequestTypeFields);

elements.materialItemsEditor.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-material-item]");
  if (!removeButton) return;

  const editors = elements.materialItemsEditor.querySelectorAll(
    "[data-material-item-editor]"
  );

  if (editors.length <= 1) {
    showToast("يجب أن يحتوي طلب الشراء على بند واحد على الأقل");
    return;
  }

  removeButton.closest("[data-material-item-editor]")?.remove();
  renumberMaterialItemEditors();
});

elements.materialItemsEditor.addEventListener("change", (event) => {
  const availability = event.target.closest("[data-editor-available]");
  if (!availability) return;

  const editor = availability.closest("[data-material-item-editor]");
  const actionWrap = editor?.querySelector("[data-editor-action-wrap]");
  const labelText = availability.closest("label")?.querySelector("span");

  if (actionWrap) actionWrap.hidden = availability.checked;
  if (labelText) {
    labelText.textContent = availability.checked ? "البند موجود" : "البند غير موجود";
  }
});

elements.attachmentsInput.addEventListener("change", async (event) => {
  const fileCount = event.target.files.length;

  if (fileCount === 0) {
    state.selectedAttachments = [];
    elements.attachmentsPreviewText.textContent =
      "ترفع الملفات إلى التخزين المشترك الخاص. الحد الأقصى 8 ملفات لكل طلب.";
    return;
  }

  elements.attachmentsPreviewText.textContent = "جارٍ تجهيز الملفات...";

  try {
    state.selectedAttachments = await prepareSelectedAttachments(event.target.files);
    elements.attachmentsPreviewText.textContent = state.selectedAttachments.length > 0
      ? `تم تجهيز ${state.selectedAttachments.length} ملف/صورة للرفع.`
      : "تعذر تجهيز الملفات المختارة.";
  } catch (error) {
    state.selectedAttachments = [];
    handleDatabaseError(error, "تعذر تجهيز الملفات");
  }

  if (fileCount > MAX_ATTACHMENTS) {
    showToast(`تم اعتماد أول ${MAX_ATTACHMENTS} ملفات فقط`);
  }
});

elements.addRequestForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = elements.addRequestForm.querySelector('button[type="submit"]');
  const formData = new FormData(elements.addRequestForm);
  submitButton.disabled = true;
  submitButton.textContent = "جارٍ الحفظ...";

  let result;
  try {
    result = await addRequest(formData);
  } catch (error) {
    handleDatabaseError(error, "تعذر إضافة الطلب");
    submitButton.disabled = false;
    submitButton.textContent = "إضافة الطلب";
    return;
  }

  elements.addRequestForm.reset();
  resetMaterialItemsEditor();
  syncRequestTypeFields();
  state.selectedAttachments = [];
  elements.attachmentsPreviewText.textContent =
    "ترفع الملفات إلى التخزين المشترك الخاص. الحد الأقصى 8 ملفات لكل طلب.";
  submitButton.disabled = false;
  submitButton.textContent = "إضافة الطلب";

  closeAddForm();
  if (result?.attachmentWarning) {
    window.alert(result.attachmentWarning);
  } else {
    showToast("تمت إضافة الطلب إلى قاعدة البيانات المشتركة");
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  if (!elements.detailsOverlay.hidden) {
    closeDetails();
  }

  if (!elements.addOverlay.hidden) {
    closeAddForm();
  }

  if (!elements.filtersOverlay.hidden) {
    closeFilters();
  }
});

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = resolveLoginIdentifier(elements.authIdentifier.value);
  const password = elements.authPassword.value;
  if (!email || !password) return;

  elements.authSubmit.disabled = true;
  elements.authSubmit.textContent = "جارٍ الدخول...";
  setAuthMessage("جارٍ التحقق من الحساب...");

  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });

  elements.authSubmit.disabled = false;
  elements.authSubmit.textContent = "دخول";

  if (error) {
    const message = /invalid login credentials/i.test(String(error.message))
      ? "اسم المستخدم أو كلمة المرور غير صحيحة."
      : error.message;
    setAuthMessage(message, true);
    return;
  }

  elements.authPassword.value = "";
  await enterAuthenticatedApp(data.session);
});

elements.logoutButton.addEventListener("click", async () => {
  if (!window.confirm("هل تريد تسجيل الخروج؟")) return;
  await getSupabase().auth.signOut();
});

elements.refreshButton.addEventListener("click", () => refreshAppData());

window.addEventListener("focus", () => {
  if (canAutoRefresh()) refreshAppData({ silent: true });
});

document.addEventListener("visibilitychange", () => {
  if (canAutoRefresh()) refreshAppData({ silent: true });
});

resetMaterialItemsEditor();
syncRequestTypeFields();
installLongPressReorder();
render();
initializeAuthentication();
