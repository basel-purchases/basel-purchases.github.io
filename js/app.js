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
  detailsEditMode: false,
  editingItemId: null,
  addingItemRequestId: null,
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
  requestAttachmentsField: document.getElementById("requestAttachmentsField"),
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
    unit: String(item?.unit || ""),
    lastEntryPrice: normalizeOptionalNumber(item?.lastEntryPrice ?? item?.last_entry_price),
    lastEntryDate: item?.lastEntryDate ?? item?.last_entry_date ?? null,
    unitPrice: normalizeOptionalNumber(item?.unitPrice ?? item?.unit_price),
    totalPrice: normalizeOptionalNumber(item?.totalPrice ?? item?.total_price ?? item?.price),
    price: normalizeOptionalNumber(item?.totalPrice ?? item?.total_price ?? item?.price),
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
    lastEntryPrice: normalizeOptionalNumber(item.last_entry_price),
    lastEntryDate: item.last_entry_date || null,
    unitPrice: normalizeOptionalNumber(item.unit_price),
    totalPrice: normalizeOptionalNumber(item.total_price ?? item.price),
    price: normalizeOptionalNumber(item.total_price ?? item.price),
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
    itemId: attachment.purchase_item_id || null,
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
    finalPrice: normalizeOptionalNumber(row.final_price ?? row.initial_price),
    initialPrice: normalizeOptionalNumber(row.final_price ?? row.initial_price),
    currency: row.currency || "SYP",
    createdAt: row.request_date || row.created_at,
    updatedAt: row.updated_at || null,
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
      initial_price, final_price, currency, request_date, is_uploaded, has_quotes,
      is_purchased, is_settled, offers_count, supplier, sort_order,
      created_at, updated_at,
      purchase_items (
        id, item_name, specifications, origin, quantity, unit, price,
        last_entry_price, last_entry_date, unit_price, total_price, available, action_if_unavailable, signal, sort_order, created_at, updated_at
      ),
      notes (
        id, body, author_id, author_name, created_at, updated_at
      ),
      attachments (
        id, purchase_item_id, storage_path, original_name, mime_type, size_bytes, kind, created_at
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

function formatFinalPrice(request) {
  const value = request.finalPrice ?? request.initialPrice;
  if (value === null || value === "" || Number.isNaN(Number(value))) {
    return "غير محدد";
  }
  return `${Number(value).toLocaleString("ar-SY")} ل.س`;
}

function formatInitialPrice(request) {
  return formatFinalPrice(request);
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

function formatDateInput(dateValue) {
  if (!dateValue) return "";
  const text = String(dateValue);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRequestStatusValue(request) {
  if (request?.purchased) return "purchased";
  if (request?.quotes) return "quotes";
  return "new";
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
          item.unit,
          item.lastEntryPrice,
          item.lastEntryDate,
          item.unitPrice,
          item.totalPrice,
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
        <span>السعر النهائي</span>
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

function requestDepartmentOptions(selected) {
  return [
    ["operations", "العمليات"],
    ["engineering", "الهندسية"],
    ["technical", "الفنية"]
  ].map(([value, label]) =>
    `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`
  ).join("");
}

function requestEditFormMarkup(request) {
  const isMaterials = request.type === "materials";
  const status = getRequestStatusValue(request);
  const materialTotal = isMaterials
    ? (request.items || []).reduce((sum, item) => sum + Number(item.totalPrice || 0), 0)
    : null;
  const finalPrice = isMaterials ? materialTotal : request.finalPrice;

  return `
    <form class="request-details-edit-form" data-edit-request-form="${escapeHtml(request.id)}">
      <div class="request-details-edit-form__heading">
        <div>
          <strong>تعديل بيانات الطلب</strong>
          <small>يمكن تعديل بيانات الطلب والبنود من نفس شاشة التفاصيل.</small>
        </div>
        <span class="edit-mode-badge">وضع التعديل</span>
      </div>

      <label class="is-wide">
        <span>النص المختصر</span>
        <input name="title" type="text" maxlength="90" required value="${escapeHtml(request.title)}">
      </label>

      <div class="request-details-edit-form__grid">
        <label>
          <span>الجهة الطالبة</span>
          <select name="department" required>${requestDepartmentOptions(request.department)}</select>
        </label>

        <label>
          <span>نوع الطلب</span>
          <input type="text" value="${escapeHtml(getTypeLabel(request.type))}" disabled>
          <small>نوع الطلب ثابت لحماية البنود والمرفقات المرتبطة به.</small>
        </label>

        <label>
          <span>تاريخ رفع الطلب</span>
          <input name="requestDate" type="date" required value="${escapeHtml(formatDateInput(request.createdAt))}">
        </label>

        <label>
          <span>الحالة</span>
          <select name="status">
            <option value="new" ${status === "new" ? "selected" : ""}>تم رفع الطلب</option>
            <option value="quotes" ${status === "quotes" ? "selected" : ""}>تم إحضار عروض أسعار</option>
            <option value="purchased" ${status === "purchased" ? "selected" : ""}>تم الشراء</option>
          </select>
        </label>

        <label>
          <span>عدد عروض الأسعار</span>
          <input name="offersCount" type="number" min="0" step="1" value="${Number(request.offersCount || 0)}">
        </label>

        <label>
          <span>المورد</span>
          <input name="supplier" type="text" maxlength="160" value="${escapeHtml(request.supplier || "")}" placeholder="اسم المورد">
        </label>

        <label class="is-wide">
          <span>السعر النهائي (ل.س)</span>
          <input name="finalPrice" type="number" min="0" step="1" ${isMaterials ? "readonly" : ""} value="${finalPrice === null || finalPrice === undefined ? "" : escapeHtml(finalPrice)}">
          ${isMaterials ? '<small>يحسب تلقائيًا من مجموع أسعار البنود.</small>' : ""}
        </label>
      </div>

      ${request.type === "work-order" ? `
        <label class="is-wide">
          <span>تفاصيل أمر التشغيل</span>
          <textarea name="description" rows="5" maxlength="2000" required>${escapeHtml(request.description || "")}</textarea>
        </label>
      ` : ""}

      <label class="request-edit-check-row">
        <input name="settled" type="checkbox" ${request.settled ? "checked" : ""}>
        <span>تمت تصفية هذا الطلب</span>
      </label>

      <div class="request-edit-actions">
        <button class="primary-button" type="submit">حفظ التعديلات</button>
        <button class="secondary-button" type="button" data-cancel-request-edit>إلغاء</button>
      </div>
    </form>
  `;
}

function purchaseItemEditFormMarkup(request, item, index, isNew = false) {
  const current = item || {
    name: "",
    specifications: "",
    origin: "",
    quantity: null,
    unit: "",
    lastEntryPrice: null,
    lastEntryDate: null,
    unitPrice: null,
    totalPrice: null,
    available: true,
    action: "",
    signal: "none"
  };
  const formAttribute = isNew
    ? `data-add-purchase-item-form="${escapeHtml(request.id)}"`
    : `data-edit-purchase-item-form="${escapeHtml(request.id)}" data-item-id="${escapeHtml(current.id)}"`;

  return `
    <form class="purchase-item-edit-form" ${formAttribute}>
      <div class="purchase-item-edit-form__heading">
        <strong>${isNew ? "إضافة بند جديد" : `تعديل البند ${(index + 1).toLocaleString("ar-SY")}`}</strong>
        <small>${isNew ? "سيضاف البند إلى الطلب الحالي مباشرة." : "عدّل أي قيمة ثم اضغط حفظ."}</small>
      </div>

      <label class="is-wide">
        <span>اسم البند</span>
        <input data-detail-item-field="name" name="name" type="text" maxlength="120" required value="${escapeHtml(current.name || "")}">
      </label>

      <label class="is-wide">
        <span>المواصفات</span>
        <textarea data-detail-item-field="specifications" name="specifications" rows="3" maxlength="700">${escapeHtml(current.specifications || "")}</textarea>
      </label>

      <div class="purchase-item-edit-form__grid">
        <label>
          <span>المنشأ</span>
          <input data-detail-item-field="origin" name="origin" type="text" maxlength="80" value="${escapeHtml(current.origin || "")}">
        </label>

        <label>
          <span>العدد / الكمية</span>
          <input data-detail-item-field="quantity" name="quantity" type="number" min="0" step="any" required value="${current.quantity === null || current.quantity === undefined ? "" : escapeHtml(current.quantity)}">
        </label>

        <label>
          <span>الوحدة</span>
          <input data-detail-item-field="unit" name="unit" type="text" maxlength="40" value="${escapeHtml(current.unit || "")}" placeholder="قطعة / متر / كغ">
        </label>

        <label>
          <span>سعر آخر إدخال (ل.س)</span>
          <input data-detail-item-field="lastEntryPrice" name="lastEntryPrice" type="number" min="0" step="1" value="${current.lastEntryPrice === null || current.lastEntryPrice === undefined ? "" : escapeHtml(current.lastEntryPrice)}" placeholder="هذا أو السعر الفردي">
        </label>

        <label>
          <span>تاريخ آخر إدخال</span>
          <input data-detail-item-field="lastEntryDate" name="lastEntryDate" type="date" value="${escapeHtml(formatDateInput(current.lastEntryDate))}">
        </label>

        <label>
          <span>السعر الفردي (ل.س)</span>
          <input data-detail-item-field="unitPrice" name="unitPrice" type="number" min="0" step="1" value="${current.unitPrice === null || current.unitPrice === undefined ? "" : escapeHtml(current.unitPrice)}" placeholder="هذا أو سعر آخر إدخال">
        </label>

        <label class="is-wide calculated-total-field">
          <span>السعر الإجمالي (ل.س)</span>
          <input data-detail-item-field="totalPrice" name="totalPrice" type="number" min="0" step="1" readonly value="${current.totalPrice === null || current.totalPrice === undefined ? "" : escapeHtml(current.totalPrice)}">
        </label>
      </div>

      <label class="request-edit-check-row">
        <input data-detail-item-available name="available" type="checkbox" ${current.available !== false ? "checked" : ""}>
        <span>البند موجود</span>
      </label>

      <label class="is-wide">
        <span>الإجراء المتبع عند عدم توفر البند</span>
        <textarea data-detail-item-field="action" name="action" rows="3" maxlength="700" placeholder="يصبح مطلوبًا إذا كان البند غير موجود">${escapeHtml(current.action || "")}</textarea>
      </label>

      <label>
        <span>إشارة البند</span>
        <select data-detail-item-field="signal" name="signal">
          <option value="none" ${current.signal === "none" ? "selected" : ""}>بدون إشارة</option>
          <option value="green" ${current.signal === "green" ? "selected" : ""}>دائرة خضراء</option>
          <option value="red" ${current.signal === "red" ? "selected" : ""}>دائرة حمراء</option>
        </select>
      </label>

      <label class="is-wide purchase-item-edit-images">
        <span>${isNew ? "صور البند" : "إضافة صور جديدة للبند"}</span>
        <input name="itemImages" type="file" accept="image/*" multiple>
        <small>يمكن اختيار عدة صور دفعة واحدة، بحد أقصى ${MAX_ATTACHMENTS} صور في كل مرة.</small>
      </label>

      <div class="request-edit-actions is-wide">
        <button class="primary-button" type="submit">${isNew ? "إضافة البند" : "حفظ البند"}</button>
        <button class="secondary-button" type="button" ${isNew ? "data-cancel-add-purchase-item" : "data-cancel-item-edit"}>إلغاء</button>
      </div>
    </form>
  `;
}

function purchaseItemMarkup(request, item, index) {
  const isMissing = item.available === false;
  const isEditing = state.editingItemId === item.id;
  const compactPriceLabel = item.lastEntryPrice !== null && item.lastEntryPrice !== undefined ? "آخر إدخال" : "السعر الفردي";
  const compactPriceValue = item.lastEntryPrice ?? item.unitPrice;
  const itemAttachments = (request.attachments || []).filter(
    (attachment) => attachment.itemId === item.id
  );
  const itemImagesMarkup = itemAttachments.length
    ? `<div class="purchase-item__images">${itemAttachments.map((attachment) => `
        <a class="attachment" href="${escapeHtml(attachment.url)}" target="_blank" rel="noopener">
          <img src="${escapeHtml(attachment.url)}" alt="${escapeHtml(attachment.name)}">
          <p>${escapeHtml(attachment.name)}</p>
        </a>`).join("")}</div>`
    : '<p class="purchase-item__no-images">لا توجد صور لهذا البند.</p>';

  const readOnlyDetails = `
    <div class="purchase-item__specs">
      <span>المواصفات</span>
      <p>${escapeHtml(item.specifications || "غير محددة")}</p>
    </div>

    <div class="purchase-item__grid">
      <div><span>المنشأ</span><strong>${escapeHtml(item.origin || "غير محدد")}</strong></div>
      <div><span>العدد / الكمية</span><strong>${escapeHtml(formatItemQuantity(item.quantity))}</strong></div>
      <div><span>الوحدة</span><strong>${escapeHtml(item.unit || "غير محددة")}</strong></div>
      <div><span>سعر آخر إدخال</span><strong>${escapeHtml(formatItemPrice(item.lastEntryPrice))}</strong></div>
      <div><span>تاريخ آخر إدخال</span><strong>${escapeHtml(formatDate(item.lastEntryDate))}</strong></div>
      <div><span>السعر الفردي</span><strong>${escapeHtml(formatItemPrice(item.unitPrice))}</strong></div>
      <div class="is-total"><span>السعر الإجمالي</span><strong>${escapeHtml(formatItemPrice(item.totalPrice))}</strong></div>
    </div>

    <div class="purchase-item__controls">
      <button class="edit-item-button" type="button" data-edit-purchase-item="${escapeHtml(request.id)}" data-item-id="${escapeHtml(item.id)}">✎ تعديل كل بيانات البند</button>
      <label class="item-availability-control">
        <input type="checkbox" data-item-available="${escapeHtml(request.id)}" data-item-id="${escapeHtml(item.id)}" ${item.available ? "checked" : ""}>
        <span>${item.available ? "البند موجود" : "البند غير موجود"}</span>
      </label>
      <div class="item-signal-picker" aria-label="إشارة البند">
        <span>إشارة البند</span>
        <div>
          <button class="signal-choice ${item.signal === "none" ? "is-selected" : ""}" type="button" data-item-signal="none" data-request-id="${escapeHtml(request.id)}" data-item-id="${escapeHtml(item.id)}">بدون</button>
          <button class="signal-choice is-green ${item.signal === "green" ? "is-selected" : ""}" type="button" data-item-signal="green" data-request-id="${escapeHtml(request.id)}" data-item-id="${escapeHtml(item.id)}"><span class="signal-dot is-green"></span> خضراء</button>
          <button class="signal-choice is-red ${item.signal === "red" ? "is-selected" : ""}" type="button" data-item-signal="red" data-request-id="${escapeHtml(request.id)}" data-item-id="${escapeHtml(item.id)}"><span class="signal-dot is-red"></span> حمراء</button>
        </div>
      </div>
    </div>

    ${isMissing ? `<label class="item-action-field"><span>الإجراء المتبع لهذا البند</span><textarea rows="3" maxlength="700" data-item-action="${escapeHtml(request.id)}" data-item-id="${escapeHtml(item.id)}" placeholder="اكتب الإجراء المتبع بسبب عدم توفر البند...">${escapeHtml(item.action || "")}</textarea></label>` : ""}
  `;

  return `
    <article class="purchase-item ${isMissing ? "is-missing" : ""} ${isEditing ? "is-expanded" : ""}" data-purchase-item="${escapeHtml(item.id)}">
      <div class="purchase-item__compact" title="انقر مرتين لفتح التفاصيل">
        <div class="purchase-item__title-row">
          <h3>${purchaseItemSignalDot(item)}${escapeHtml(item.name || `البند ${index + 1}`)}</h3>
          <span class="availability-badge ${isMissing ? "is-missing" : "is-available"}">${isMissing ? "غير موجود" : "موجود"}</span>
        </div>
        <div class="purchase-item__summary-row">
          <div class="purchase-item__summary-meta">
            <span>${escapeHtml(compactPriceLabel)}: <strong>${escapeHtml(formatItemPrice(compactPriceValue))}</strong></span>
            <span>الكمية: <strong>${escapeHtml(formatItemQuantity(item.quantity))}</strong></span>
            ${item.lastEntryDate ? `<span>تاريخ آخر إدخال: <strong>${escapeHtml(formatDate(item.lastEntryDate))}</strong></span>` : ""}
          </div>
          <div class="purchase-item__summary-total">
            <span>السعر الإجمالي</span>
            <strong>${escapeHtml(formatItemPrice(item.totalPrice))}</strong>
          </div>
        </div>
        <small class="purchase-item__expand-hint">${isEditing ? "وضع تعديل البند" : "نقرتان لعرض باقي التفاصيل"}</small>
      </div>

      <div class="purchase-item__expanded" ${isEditing ? "" : "hidden"}>
        ${isEditing ? purchaseItemEditFormMarkup(request, item, index, false) : readOnlyDetails}

        <div class="purchase-item__images-section">
          <span>صور البند (${itemAttachments.length.toLocaleString("ar-SY")})</span>
          ${itemImagesMarkup}
          ${isEditing ? "" : `
            <label class="purchase-item__add-images">
              <span>إضافة صور أخرى</span>
              <input type="file" accept="image/*" multiple data-add-item-images-request="${escapeHtml(request.id)}" data-item-id="${escapeHtml(item.id)}">
              <small>يمكن اختيار عدة صور دفعة واحدة.</small>
            </label>
          `}
        </div>
      </div>
    </article>
  `;
}

function materialsItemsMarkup(request) {
  const items = request.items || [];
  const isAdding = state.addingItemRequestId === request.id;

  return `
    <section class="purchase-items-detail">
      <header class="purchase-items-detail__header">
        <div>
          <span>بنود طلب الشراء</span>
          <strong>${items.length.toLocaleString("ar-SY")} بند</strong>
        </div>
        <div class="purchase-items-detail__actions">
          ${
            getRequestIssueCount(request) > 0
              ? `<span class="items-problem-count"><span class="signal-dot is-red"></span>${getRequestIssueCount(request).toLocaleString("ar-SY")} بها مشكلة</span>`
              : ""
          }
          <button class="add-existing-item-button" type="button" data-open-add-purchase-item="${escapeHtml(request.id)}">＋ إضافة بند</button>
        </div>
      </header>

      ${isAdding ? `
        <article class="purchase-item purchase-item--new is-expanded">
          <div class="purchase-item__expanded">
            ${purchaseItemEditFormMarkup(request, null, items.length, true)}
          </div>
        </article>
      ` : ""}

      <div class="purchase-items-list">
        ${
          items.length > 0
            ? items.map((item, index) => purchaseItemMarkup(request, item, index)).join("")
            : '<p class="purchase-items-empty">لا توجد بنود في هذا الطلب. اضغط «إضافة بند» لإضافة أول بند.</p>'
        }
      </div>
    </section>
  `;
}

function requestAttachmentsMarkup(request) {
  const requestLevelAttachments = (request.attachments || []).filter((attachment) => !attachment.itemId);
  const attachmentsMarkup = requestLevelAttachments.length
    ? requestLevelAttachments.map((attachment) => {
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
      }).join("")
    : '<p class="request-attachments-empty">لا توجد صور أو مرفقات على مستوى الطلب حتى الآن.</p>';

  return `
    <section class="request-attachments-section">
      <div class="request-attachments-section__heading">
        <div>
          <h3>صور ومرفقات الطلب</h3>
          <small>${requestLevelAttachments.length.toLocaleString("ar-SY")} مرفق</small>
        </div>
      </div>
      ${requestLevelAttachments.length ? `<div class="attachments">${attachmentsMarkup}</div>` : attachmentsMarkup}
      <label class="request-add-images">
        <span>＋ إضافة صور للطلب / أمر التشغيل</span>
        <input type="file" accept="image/*" multiple data-add-request-images="${escapeHtml(request.id)}">
        <small>يمكن إضافة عدة صور في كل مرة بدون حذف الصور السابقة. الحد الأقصى ${MAX_ATTACHMENTS} صور لكل دفعة.</small>
      </label>
    </section>
  `;
}

function renderDetails(requestId) {
  const request = state.requests.find((item) => item.id === requestId);

  if (!request) return;

  elements.detailsTitle.textContent = request.title;

  const primaryDetailsMarkup = request.type === "materials"
    ? materialsItemsMarkup(request)
    : state.detailsEditMode
      ? ""
      : `
        <article class="detail-description">
          <span>تفاصيل أمر التشغيل</span>
          <p>${escapeHtml(request.description || "لا توجد تفاصيل.")}</p>
        </article>
      `;

  const readOnlyRequestMarkup = `
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
        <span>السعر النهائي</span>
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
      <button class="detail-edit-button" type="button" data-open-request-edit="${escapeHtml(request.id)}">✎ تعديل بيانات الطلب</button>
      <button class="detail-action-button" type="button" data-toggle-settlement="${escapeHtml(request.id)}">
        ${request.settled ? "إلغاء علامة تمت التصفية" : "تحديد الطلب بأنه تمت تصفيته"}
      </button>
      <button class="detail-delete-button" type="button" data-delete-request="${escapeHtml(request.id)}">حذف الوثيقة</button>
      <small class="delete-password-note">الحذف يتطلب كلمة المرور ورسالة تأكيد، ويتم التحقق منها داخل قاعدة البيانات.</small>
    </div>
  `;

  elements.detailsContent.innerHTML = `
    ${primaryDetailsMarkup}
    ${state.detailsEditMode ? requestEditFormMarkup(request) : readOnlyRequestMarkup}
    ${notesMarkup(request)}
    ${requestAttachmentsMarkup(request)}
  `;
}

function openDetails(requestId) {
  const request = state.requests.find((item) => item.id === requestId);

  if (!request) return;

  state.activeDetailsId = requestId;
  state.detailsEditMode = false;
  state.editingItemId = null;
  state.addingItemRequestId = null;
  state.noteFormOpen = false;
  state.editingNoteId = null;
  renderDetails(requestId);
  openOverlay(elements.detailsOverlay);
}

function closeDetails() {
  state.activeDetailsId = null;
  state.detailsEditMode = false;
  state.editingItemId = null;
  state.addingItemRequestId = null;
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

async function uploadRequestAttachments(requestId, attachments) {
  const client = getSupabase();

  for (const attachment of attachments) {
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

async function uploadSelectedAttachments(requestId) {
  return uploadRequestAttachments(requestId, state.selectedAttachments);
}


async function uploadItemAttachments(requestId, itemId, attachments) {
  const client = getSupabase();
  for (const attachment of attachments) {
    const storagePath = `${requestId}/${itemId}/${safeStorageFileName(attachment.file.name)}`;
    const { error: uploadError } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, attachment.file, { contentType: attachment.mimeType, upsert: false });
    if (uploadError) throw uploadError;

    const { error: metadataError } = await client.from("attachments").insert({
      request_id: requestId,
      purchase_item_id: itemId,
      storage_path: storagePath,
      original_name: attachment.originalName,
      mime_type: attachment.mimeType,
      size_bytes: attachment.file.size,
      kind: "image"
    });
    if (metadataError) throw metadataError;
  }
}

async function prepareMaterialItemImages() {
  const editors = [...elements.materialItemsEditor.querySelectorAll("[data-material-item-editor]")];
  const prepared = [];
  for (const [index, editor] of editors.entries()) {
    const input = editor.querySelector("[data-item-images]");
    const files = [...(input?.files || [])];
    if (files.some((file) => !String(file.type || "").startsWith("image/"))) {
      throw new Error(`صور البند ${(index + 1).toLocaleString("ar-SY")} يجب أن تكون ملفات صور فقط.`);
    }
    prepared.push(await prepareSelectedAttachments(files));
  }
  return prepared;
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

        <label>
          <span>الوحدة</span>
          <input data-item-field="unit" type="text" maxlength="40" placeholder="مثال: قطعة / متر / كغ">
        </label>

        <label>
          <span>سعر آخر إدخال (ل.س)</span>
          <input data-item-field="lastEntryPrice" type="number" min="0" step="1" placeholder="عبئ هذا أو السعر الفردي">
        </label>

        <label>
          <span>تاريخ آخر إدخال</span>
          <input data-item-field="lastEntryDate" type="date">
        </label>

        <label>
          <span>السعر الفردي (ل.س)</span>
          <input data-item-field="unitPrice" type="number" min="0" step="1" placeholder="عبئ هذا أو سعر آخر إدخال">
        </label>

        <label class="is-wide calculated-total-field">
          <span>السعر الإجمالي (ل.س)</span>
          <input data-item-field="totalPrice" type="number" min="0" step="1" readonly placeholder="يحسب تلقائيًا">
        </label>
      </div>

      <label class="item-images-field">
        <span>صور البند</span>
        <input data-item-images type="file" accept="image/*" multiple>
        <small data-item-images-preview>يمكن رفع حتى ${MAX_ATTACHMENTS} صور لهذا البند.</small>
      </label>

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

  const finalPrice = elements.addRequestForm.elements.finalPrice;
  if (finalPrice) {
    finalPrice.readOnly = isMaterials;
    finalPrice.placeholder = isMaterials ? "يحسب تلقائيًا من مجموع البنود" : "اختياري";
  }
  if (elements.requestAttachmentsField) elements.requestAttachmentsField.hidden = false;

  if (isMaterials && elements.materialItemsEditor.children.length === 0) {
    addMaterialItemEditor();
  }
  if (isMaterials) recalculateFinalPrice();
}

function calculateItemTotal(quantity, lastEntryPrice, unitPrice) {
  const qty = normalizeOptionalNumber(quantity);
  const last = normalizeOptionalNumber(lastEntryPrice);
  const unit = normalizeOptionalNumber(unitPrice);
  const sourcePrice = unit ?? last;
  if (qty === null || sourcePrice === null) return null;
  return qty * sourcePrice;
}

function recalculateMaterialEditor(editor) {
  if (!editor) return;
  const quantity = editor.querySelector('[data-item-field="quantity"]')?.value;
  const last = editor.querySelector('[data-item-field="lastEntryPrice"]')?.value;
  const unit = editor.querySelector('[data-item-field="unitPrice"]')?.value;
  const total = calculateItemTotal(quantity, last, unit);
  const totalInput = editor.querySelector('[data-item-field="totalPrice"]');
  if (totalInput) totalInput.value = total === null ? "" : String(total);
  recalculateFinalPrice();
}

function recalculateFinalPrice() {
  const finalInput = elements.addRequestForm.elements.finalPrice;
  if (!finalInput || elements.addRequestForm.elements.type.value !== "materials") return;
  const totals = [...elements.materialItemsEditor.querySelectorAll('[data-item-field="totalPrice"]')]
    .map((input) => normalizeOptionalNumber(input.value))
    .filter((value) => value !== null);
  finalInput.value = totals.length ? String(totals.reduce((sum, value) => sum + value, 0)) : "";
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

    const lastEntryPrice = getField("lastEntryPrice").value;
    const unitPrice = getField("unitPrice").value;
    if (lastEntryPrice === "" && unitPrice === "") {
      throw new Error(`أدخل سعر آخر إدخال أو السعر الفردي للبند ${(index + 1).toLocaleString("ar-SY")}`);
    }

    return normalizePurchaseItem(
      {
        id: `ITEM-${requestId}-${index + 1}-${Date.now()}`,
        name,
        specifications: getField("specifications").value.trim(),
        origin: getField("origin").value.trim(),
        quantity: getField("quantity").value,
        unit: getField("unit")?.value.trim() || "",
        lastEntryPrice,
        lastEntryDate: getField("lastEntryDate")?.value || null,
        unitPrice,
        totalPrice: getField("totalPrice").value,
        price: getField("totalPrice").value,
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


function collectDetailsItemForm(form, index = 0) {
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const specifications = String(formData.get("specifications") || "").trim();
  const origin = String(formData.get("origin") || "").trim();
  const unit = String(formData.get("unit") || "").trim();
  const quantity = normalizeOptionalNumber(formData.get("quantity"));
  const lastEntryPrice = normalizeOptionalNumber(formData.get("lastEntryPrice"));
  const lastEntryDate = String(formData.get("lastEntryDate") || "").trim() || null;
  const unitPrice = normalizeOptionalNumber(formData.get("unitPrice"));
  const available = form.querySelector('[name="available"]')?.checked !== false;
  const action = String(formData.get("action") || "").trim();
  const signalValue = String(formData.get("signal") || "none");
  const signal = ["none", "green", "red"].includes(signalValue) ? signalValue : "none";

  if (!name) throw new Error("اكتب اسم البند.");
  if (quantity === null) throw new Error("أدخل العدد / الكمية.");
  if (lastEntryPrice !== null && unitPrice !== null) {
    throw new Error("استخدم سعر آخر إدخال أو السعر الفردي فقط، وليس الحقلين معًا.");
  }
  if (lastEntryPrice === null && unitPrice === null) {
    throw new Error("أدخل سعر آخر إدخال أو السعر الفردي.");
  }
  if (!available && !action) {
    throw new Error("اكتب الإجراء المتبع لأن البند محدد بأنه غير موجود.");
  }

  const totalPrice = calculateItemTotal(quantity, lastEntryPrice, unitPrice);
  if (totalPrice === null) throw new Error("تعذر حساب السعر الإجمالي للبند.");

  return {
    appItem: {
      name,
      specifications,
      origin,
      quantity,
      unit,
      lastEntryPrice,
      lastEntryDate,
      unitPrice,
      totalPrice,
      price: totalPrice,
      available,
      action,
      signal,
      sortOrder: index
    },
    payload: {
      item_name: name,
      specifications,
      origin,
      quantity,
      unit,
      price: totalPrice,
      last_entry_price: lastEntryPrice,
      last_entry_date: lastEntryDate,
      unit_price: unitPrice,
      total_price: totalPrice,
      available,
      action_if_unavailable: action,
      signal,
      sort_order: index
    }
  };
}

async function syncMaterialRequestFinalPrice(requestId) {
  const client = getSupabase();
  const { data, error } = await client
    .from("purchase_items")
    .select("total_price")
    .eq("request_id", requestId);
  if (error) throw error;

  const total = (data || []).reduce((sum, row) => {
    const value = normalizeOptionalNumber(row.total_price);
    return sum + (value ?? 0);
  }, 0);

  const { error: updateError } = await client
    .from("requests")
    .update({ initial_price: total, final_price: total })
    .eq("id", requestId);
  if (updateError) throw updateError;
  return total;
}

async function saveRequestDetails(form) {
  const requestId = form.dataset.editRequestForm;
  const request = state.requests.find((item) => item.id === requestId);
  if (!request) return;

  const formData = new FormData(form);
  const title = String(formData.get("title") || "").trim();
  const department = String(formData.get("department") || "");
  const requestDate = String(formData.get("requestDate") || "").trim();
  const status = String(formData.get("status") || "new");
  const offersCount = Math.max(0, Number(formData.get("offersCount") || 0));
  const supplier = String(formData.get("supplier") || "").trim();
  const settled = form.querySelector('[name="settled"]')?.checked === true;
  const description = request.type === "work-order"
    ? String(formData.get("description") || "").trim()
    : "";
  const finalPriceValue = normalizeOptionalNumber(formData.get("finalPrice"));

  if (!title) throw new Error("النص المختصر مطلوب.");
  if (!["operations", "engineering", "technical"].includes(department)) {
    throw new Error("اختر الجهة الطالبة.");
  }
  if (!requestDate) throw new Error("تاريخ رفع الطلب مطلوب.");
  if (request.type === "work-order" && !description) {
    throw new Error("تفاصيل أمر التشغيل مطلوبة.");
  }

  const hasQuotes = status === "quotes" || status === "purchased";
  const isPurchased = status === "purchased";
  const finalPrice = finalPriceValue;

  const { error } = await getSupabase()
    .from("requests")
    .update({
      title,
      department_code: department,
      description,
      initial_price: finalPrice,
      final_price: finalPrice,
      request_date: requestDate,
      has_quotes: hasQuotes,
      is_purchased: isPurchased,
      is_settled: settled,
      offers_count: Number.isFinite(offersCount) ? Math.trunc(offersCount) : 0,
      supplier
    })
    .eq("id", requestId);

  if (error) throw error;
  state.detailsEditMode = false;
  await refreshAppData({ silent: true });
  showToast("تم حفظ تعديلات الطلب");
}

async function savePurchaseItemDetails(form, isNew) {
  const requestId = isNew ? form.dataset.addPurchaseItemForm : form.dataset.editPurchaseItemForm;
  const request = state.requests.find((item) => item.id === requestId);
  if (!request || request.type !== "materials") return;

  const currentIndex = isNew
    ? request.items.length
    : Math.max(0, request.items.findIndex((item) => item.id === form.dataset.itemId));
  const { payload } = collectDetailsItemForm(form, currentIndex);
  const files = [...(form.querySelector('[name="itemImages"]')?.files || [])];
  if (files.some((file) => !String(file.type || "").startsWith("image/"))) {
    throw new Error("اختر ملفات صور فقط للبند.");
  }

  const client = getSupabase();
  let itemId = form.dataset.itemId || null;

  if (isNew) {
    const { data, error } = await client
      .from("purchase_items")
      .insert({ request_id: requestId, ...payload })
      .select("id")
      .single();
    if (error) throw error;
    itemId = data.id;
  } else {
    const { error } = await client
      .from("purchase_items")
      .update(payload)
      .eq("id", itemId)
      .eq("request_id", requestId);
    if (error) throw error;
  }

  let imageWarning = "";
  if (files.length) {
    try {
      const prepared = await prepareSelectedAttachments(files);
      await uploadItemAttachments(requestId, itemId, prepared);
    } catch (error) {
      console.error("تعذر رفع صور البند", error);
      imageWarning = "تم حفظ بيانات البند، لكن تعذر رفع بعض الصور.";
    }
  }

  await syncMaterialRequestFinalPrice(requestId);
  state.editingItemId = null;
  state.addingItemRequestId = null;
  await refreshAppData({ silent: true });

  if (imageWarning) window.alert(imageWarning);
  else showToast(isNew ? "تمت إضافة البند" : "تم حفظ تعديلات البند");
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
  const finalPriceValue = formData.get("finalPrice");
  const type = formData.get("type");
  const materialItems = type === "materials" ? collectMaterialItemsFromForm("new") : [];
  const materialItemImages = type === "materials" ? await prepareMaterialItemImages() : [];
  const currentOrders = state.requests.map((request) => Number(request.sortOrder || 0));
  const sortOrder = currentOrders.length ? Math.min(...currentOrders) - 100 : 0;

  const itemsPayload = materialItems.map((item, index) => ({
    item_name: item.name,
    specifications: item.specifications,
    origin: item.origin,
    quantity: item.quantity,
    unit: item.unit || "",
    last_entry_price: item.lastEntryPrice,
    last_entry_date: item.lastEntryDate || null,
    unit_price: item.unitPrice,
    total_price: item.totalPrice,
    price: item.totalPrice,
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
      p_initial_price: finalPriceValue !== "" ? Number(finalPriceValue) : null,
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
  if (type === "materials" && materialItemImages.some((files) => files.length)) {
    try {
      const { data: createdItems, error: itemsError } = await client
        .from("purchase_items")
        .select("id, sort_order")
        .eq("request_id", requestId)
        .order("sort_order", { ascending: true });
      if (itemsError) throw itemsError;
      for (let index = 0; index < materialItemImages.length; index += 1) {
        const itemId = createdItems?.[index]?.id;
        if (itemId && materialItemImages[index].length) {
          await uploadItemAttachments(requestId, itemId, materialItemImages[index]);
        }
      }
    } catch (error) {
      console.error("تعذر رفع بعض صور البنود", error);
      attachmentWarning = "تم حفظ الطلب، لكن تعذر رفع بعض صور البنود.";
    }
  }

  if (state.selectedAttachments.length) {
    try {
      await uploadSelectedAttachments(requestId);
    } catch (error) {
      console.error("تعذر رفع بعض المرفقات", error);
      attachmentWarning = "تم حفظ الطلب، لكن تعذر رفع بعض مرفقات الطلب. يمكنك إعادة إضافتها من شاشة التفاصيل.";
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
  const openRequestEditButton = event.target.closest("[data-open-request-edit]");
  if (openRequestEditButton) {
    state.detailsEditMode = true;
    state.editingItemId = null;
    state.addingItemRequestId = null;
    renderDetails(openRequestEditButton.dataset.openRequestEdit);
    window.setTimeout(() => {
      elements.detailsContent.querySelector('[data-edit-request-form] [name="title"]')?.focus();
    }, 50);
    return;
  }

  if (event.target.closest("[data-cancel-request-edit]")) {
    state.detailsEditMode = false;
    renderDetails(state.activeDetailsId);
    return;
  }

  const editItemButton = event.target.closest("[data-edit-purchase-item]");
  if (editItemButton) {
    state.detailsEditMode = false;
    state.addingItemRequestId = null;
    state.editingItemId = editItemButton.dataset.itemId;
    renderDetails(editItemButton.dataset.editPurchaseItem);
    window.setTimeout(() => {
      elements.detailsContent.querySelector('[data-edit-purchase-item-form] [name="name"]')?.focus();
    }, 50);
    return;
  }

  if (event.target.closest("[data-cancel-item-edit]")) {
    state.editingItemId = null;
    renderDetails(state.activeDetailsId);
    return;
  }

  const addItemButton = event.target.closest("[data-open-add-purchase-item]");
  if (addItemButton) {
    state.detailsEditMode = false;
    state.editingItemId = null;
    state.addingItemRequestId = addItemButton.dataset.openAddPurchaseItem;
    renderDetails(state.addingItemRequestId);
    window.setTimeout(() => {
      elements.detailsContent.querySelector('[data-add-purchase-item-form] [name="name"]')?.focus();
    }, 50);
    return;
  }

  if (event.target.closest("[data-cancel-add-purchase-item]")) {
    state.addingItemRequestId = null;
    renderDetails(state.activeDetailsId);
    return;
  }
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
  const requestImagesInput = event.target.closest("[data-add-request-images]");
  if (requestImagesInput) {
    const requestId = requestImagesInput.dataset.addRequestImages;
    const files = [...requestImagesInput.files];
    if (!files.length) return;
    try {
      if (files.some((file) => !String(file.type || "").startsWith("image/"))) {
        throw new Error("اختر ملفات صور فقط للطلب.");
      }
      showToast("جارٍ تجهيز صور الطلب...");
      const prepared = await prepareSelectedAttachments(files);
      await uploadRequestAttachments(requestId, prepared);
      await refreshAppData({ silent: true });
      showToast(`تم رفع ${prepared.length} صورة للطلب`);
    } catch (error) {
      handleDatabaseError(error, "تعذر رفع صور الطلب");
    }
    return;
  }
  const itemImagesInput = event.target.closest("[data-add-item-images-request]");
  if (itemImagesInput) {
    const requestId = itemImagesInput.dataset.addItemImagesRequest;
    const itemId = itemImagesInput.dataset.itemId;
    const files = [...itemImagesInput.files];
    if (!files.length) return;
    try {
      if (files.some((file) => !String(file.type || "").startsWith("image/"))) {
        throw new Error("اختر ملفات صور فقط لهذا البند.");
      }
      showToast("جارٍ تجهيز صور البند...");
      const prepared = await prepareSelectedAttachments(files);
      await uploadItemAttachments(requestId, itemId, prepared);
      await refreshAppData({ silent: true });
      renderDetails(requestId);
      showToast(`تم رفع ${prepared.length} صورة للبند`);
    } catch (error) {
      handleDatabaseError(error, "تعذر رفع صور البند");
    }
    return;
  }

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

elements.detailsContent.addEventListener("input", (event) => {
  const form = event.target.closest("[data-edit-purchase-item-form], [data-add-purchase-item-form]");
  if (!form) return;

  if (event.target.matches('[name="lastEntryPrice"]') && event.target.value !== "") {
    const other = form.querySelector('[name="unitPrice"]');
    if (other) other.value = "";
  } else if (event.target.matches('[name="unitPrice"]') && event.target.value !== "") {
    const other = form.querySelector('[name="lastEntryPrice"]');
    if (other) other.value = "";
  }

  if (event.target.matches('[name="quantity"], [name="lastEntryPrice"], [name="unitPrice"]')) {
    const quantity = form.querySelector('[name="quantity"]')?.value;
    const last = form.querySelector('[name="lastEntryPrice"]')?.value;
    const unit = form.querySelector('[name="unitPrice"]')?.value;
    const total = calculateItemTotal(quantity, last, unit);
    const totalInput = form.querySelector('[name="totalPrice"]');
    if (totalInput) totalInput.value = total === null ? "" : String(total);
  }
});

elements.detailsContent.addEventListener("submit", async (event) => {
  event.preventDefault();

  const requestEditForm = event.target.closest("[data-edit-request-form]");
  if (requestEditForm) {
    const submitButton = requestEditForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "جارٍ الحفظ...";
    }
    try {
      await saveRequestDetails(requestEditForm);
    } catch (error) {
      handleDatabaseError(error, "تعذر حفظ تعديلات الطلب");
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "حفظ التعديلات";
      }
    }
    return;
  }

  const itemEditForm = event.target.closest("[data-edit-purchase-item-form]");
  if (itemEditForm) {
    const submitButton = itemEditForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "جارٍ الحفظ...";
    }
    try {
      await savePurchaseItemDetails(itemEditForm, false);
    } catch (error) {
      handleDatabaseError(error, "تعذر حفظ تعديلات البند");
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "حفظ البند";
      }
    }
    return;
  }

  const addItemForm = event.target.closest("[data-add-purchase-item-form]");
  if (addItemForm) {
    const submitButton = addItemForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "جارٍ الإضافة...";
    }
    try {
      await savePurchaseItemDetails(addItemForm, true);
    } catch (error) {
      handleDatabaseError(error, "تعذر إضافة البند");
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "إضافة البند";
      }
    }
    return;
  }

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

elements.detailsContent.addEventListener("dblclick", (event) => {
  const itemCard = event.target.closest("[data-purchase-item]");
  if (!itemCard || event.target.closest("button, a, input, select, textarea, form, label")) return;
  event.preventDefault();
  event.stopPropagation();
  const expanded = itemCard.querySelector(".purchase-item__expanded");
  if (!expanded) return;
  const willOpen = expanded.hidden;
  expanded.hidden = !willOpen;
  itemCard.classList.toggle("is-expanded", willOpen);
  const hint = itemCard.querySelector(".purchase-item__expand-hint");
  if (hint) hint.textContent = willOpen ? "نقرتان لإغلاق التفاصيل" : "نقرتان لعرض باقي التفاصيل";
});

elements.detailsSheet.addEventListener("click", (event) => {
  if (
    event.target.closest(
      "button, a, input, select, textarea, form, .notes-section, .purchase-item"
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
      "button, a, input, select, textarea, form, .notes-section, .purchase-item"
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
  recalculateFinalPrice();
});

elements.materialItemsEditor.addEventListener("change", (event) => {
  const editor = event.target.closest("[data-material-item-editor]");
  const availability = event.target.closest("[data-editor-available]");
  if (availability) {
    const actionWrap = editor?.querySelector("[data-editor-action-wrap]");
    const labelText = availability.closest("label")?.querySelector("span");
    if (actionWrap) actionWrap.hidden = availability.checked;
    if (labelText) labelText.textContent = availability.checked ? "البند موجود" : "البند غير موجود";
  }

  const imagesInput = event.target.closest("[data-item-images]");
  if (imagesInput) {
    const preview = editor?.querySelector("[data-item-images-preview]");
    const count = Math.min(imagesInput.files.length, MAX_ATTACHMENTS);
    if (preview) preview.textContent = count ? `تم اختيار ${count} صورة لهذا البند.` : `يمكن رفع حتى ${MAX_ATTACHMENTS} صور لهذا البند.`;
    if (imagesInput.files.length > MAX_ATTACHMENTS) showToast(`سيتم اعتماد أول ${MAX_ATTACHMENTS} صور فقط لهذا البند`);
  }
});

elements.materialItemsEditor.addEventListener("input", (event) => {
  const editor = event.target.closest("[data-material-item-editor]");
  if (!editor) return;
  if (event.target.matches('[data-item-field="lastEntryPrice"]') && event.target.value !== "") {
    const other = editor.querySelector('[data-item-field="unitPrice"]');
    if (other) other.value = "";
  } else if (event.target.matches('[data-item-field="unitPrice"]') && event.target.value !== "") {
    const other = editor.querySelector('[data-item-field="lastEntryPrice"]');
    if (other) other.value = "";
  }
  if (event.target.matches('[data-item-field="quantity"], [data-item-field="lastEntryPrice"], [data-item-field="unitPrice"]')) {
    recalculateMaterialEditor(editor);
  }
});

elements.attachmentsInput.addEventListener("change", async (event) => {
  const fileCount = event.target.files.length;

  if (fileCount === 0) {
    state.selectedAttachments = [];
    elements.attachmentsPreviewText.textContent =
      "ترفع الملفات إلى التخزين المشترك الخاص. الحد الأقصى 8 ملفات في كل دفعة.";
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
    "ترفع الملفات إلى التخزين المشترك الخاص. الحد الأقصى 8 ملفات في كل دفعة.";
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
