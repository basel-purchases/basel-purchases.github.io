const DATA_STORAGE_KEY = "purchase-manager-data-v3";
const FILTERS_STORAGE_KEY = "purchase-manager-filters-v3";
const OLD_DATA_STORAGE_KEY = "purchase-manager-data-v2";
const OLD_FILTERS_STORAGE_KEY = "purchase-manager-filters-v2";

const CURRENT_USER = {
  id: "user-basel",
  name: "باسل"
};

const MAX_LOCAL_IMAGES = 4;
const MAX_IMAGE_SIDE = 1100;
const JPEG_QUALITY = 0.72;

const defaultFilters = {
  status: "all",
  type: "all",
  department: "all",
  settlement: "all",
  query: ""
};

const state = {
  requests: loadStoredRequests(),
  filters: loadStoredFilters(),
  draftFilters: { ...defaultFilters },
  activeDetailsId: null,
  noteFormOpen: false,
  editingNoteId: null,
  lastCardTap: {
    id: null,
    time: 0
  },
  lastDetailsTap: 0,
  suppressTapUntil: 0,
  selectedAttachments: []
};

const elements = {
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
  detailsOverlay: document.getElementById("detailsOverlay"),
  detailsSheet: document.getElementById("detailsSheet"),
  detailsTitle: document.getElementById("detailsTitle"),
  detailsContent: document.getElementById("detailsContent"),
  addOverlay: document.getElementById("addOverlay"),
  addRequestButton: document.getElementById("addRequestButton"),
  addRequestForm: document.getElementById("addRequestForm"),
  attachmentsInput: document.getElementById("attachmentsInput"),
  attachmentsPreviewText: document.getElementById("attachmentsPreviewText"),
  resetDataButton: document.getElementById("resetDataButton"),
  toast: document.getElementById("toast")
};

function cloneDefaultRequests() {
  return structuredClone(window.MOCK_PURCHASE_REQUESTS).map(normalizeRequest);
}

function normalizeRequest(request) {
  const normalizedNotes = Array.isArray(request.notes)
    ? request.notes.map((note, index) => normalizeNote(note, request.id, index))
    : request.notes
      ? [
          {
            id: `MIGRATED-${request.id}-1`,
            text: String(request.notes),
            authorId: "legacy-user",
            authorName: "مستخدم سابق",
            createdAt: request.createdAt
              ? `${request.createdAt}T09:00:00`
              : new Date().toISOString()
          }
        ]
      : [];

  return {
    ...request,
    currency: "SYP",
    department: request.department || "operations",
    settled: Boolean(request.settled),
    initialPrice:
      request.initialPrice === undefined
        ? request.price ?? null
        : request.initialPrice,
    notes: normalizedNotes,
    attachments: Array.isArray(request.attachments)
      ? request.attachments
      : []
  };
}

function normalizeNote(note, requestId, index) {
  if (typeof note === "string") {
    return {
      id: `NOTE-${requestId}-${index + 1}`,
      text: note,
      authorId: "legacy-user",
      authorName: "مستخدم سابق",
      createdAt: new Date().toISOString()
    };
  }

  return {
    id: note.id || `NOTE-${requestId}-${Date.now()}-${index}`,
    text: String(note.text || ""),
    authorId: note.authorId || "legacy-user",
    authorName: note.authorName || "مستخدم سابق",
    createdAt: note.createdAt || new Date().toISOString(),
    updatedAt: note.updatedAt || null
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

function loadStoredRequests() {
  const current = readStoredJson(DATA_STORAGE_KEY);

  if (Array.isArray(current) && current.length > 0) {
    return current.map(normalizeRequest);
  }

  const old = readStoredJson(OLD_DATA_STORAGE_KEY);

  if (Array.isArray(old) && old.length > 0) {
    const migrated = old.map(normalizeRequest);
    localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  }

  return cloneDefaultRequests();
}

function loadStoredFilters() {
  const current = readStoredJson(FILTERS_STORAGE_KEY);

  if (current && typeof current === "object") {
    return {
      ...defaultFilters,
      ...current
    };
  }

  const old = readStoredJson(OLD_FILTERS_STORAGE_KEY);

  if (old && typeof old === "object") {
    const migrated = {
      ...defaultFilters,
      ...old
    };

    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  }

  return { ...defaultFilters };
}

function saveRequests() {
  localStorage.setItem(
    DATA_STORAGE_KEY,
    JSON.stringify(state.requests)
  );
}

function saveFilters() {
  localStorage.setItem(
    FILTERS_STORAGE_KEY,
    JSON.stringify(state.filters)
  );
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

    const noteText = (request.notes || [])
      .map((note) => `${note.authorName} ${note.text}`)
      .join(" ");

    const searchableText = [
      request.title,
      request.id,
      request.description,
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

function renderDetails(requestId) {
  const request = state.requests.find((item) => item.id === requestId);

  if (!request) return;

  elements.detailsTitle.textContent = request.title;

  const attachmentsMarkup =
    request.attachments && request.attachments.length > 0
      ? request.attachments
          .map((attachment) => `
            <article class="attachment">
              <img src="${escapeHtml(attachment.url)}" alt="${escapeHtml(attachment.name)}">
              <p>${escapeHtml(attachment.name)}</p>
            </article>
          `)
          .join("")
      : "";

  elements.detailsContent.innerHTML = `
    <article class="detail-description">
      <span>التفاصيل الأساسية</span>
      <p>${escapeHtml(request.description || "لا توجد تفاصيل.")}</p>
    </article>

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
        <strong>${escapeHtml(request.id)}</strong>
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
    </div>

    ${notesMarkup(request)}

    ${
      request.attachments && request.attachments.length > 0
        ? `
          <h3 class="attachments-title">الصور المرفقة</h3>
          <div class="attachments">${attachmentsMarkup}</div>
        `
        : `
          <div class="detail-grid">
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
  const numericIds = state.requests
    .map((request) => Number(String(request.id).replace(/\D/g, "")))
    .filter(Number.isFinite);

  const nextId = Math.max(0, ...numericIds) + 1;

  return `REQ-${String(nextId).padStart(3, "0")}`;
}

function generateNoteId(requestId) {
  return `NOTE-${requestId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function fileToCompressedDataUrl(file) {
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const image = await new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = source;
  });

  const scale = Math.min(
    1,
    MAX_IMAGE_SIDE / Math.max(image.width, image.height)
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

async function prepareSelectedAttachments(fileList) {
  const files = [...fileList].slice(0, MAX_LOCAL_IMAGES);
  const attachments = [];

  for (const file of files) {
    try {
      const url = await fileToCompressedDataUrl(file);

      attachments.push({
        name: file.name,
        url
      });
    } catch (error) {
      console.warn("تعذر تجهيز الصورة:", file.name, error);
    }
  }

  return attachments;
}

function addRequest(formData) {
  const status = formData.get("status");
  const isPurchased = status === "purchased";
  const initialPriceValue = formData.get("initialPrice");

  const request = normalizeRequest({
    id: generateRequestId(),
    title: formData.get("title").trim(),
    type: formData.get("type"),
    department: formData.get("department"),
    created: true,
    quotes: status === "quotes" || isPurchased,
    purchased: isPurchased,
    settled: formData.get("settled") === "on",
    initialPrice:
      initialPriceValue !== ""
        ? Number(initialPriceValue)
        : null,
    description: formData.get("description").trim(),
    createdAt: new Date().toISOString().slice(0, 10),
    offersCount: status === "quotes" || isPurchased ? 1 : 0,
    supplier: "غير محدد",
    notes: [],
    attachments: structuredClone(state.selectedAttachments)
  });

  state.requests.unshift(request);
  saveRequests();
  render();
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
      showToast("تم حفظ الترتيب محليًا");
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
    settlement: state.draftFilters.settlement
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

elements.detailsContent.addEventListener("click", (event) => {
  const settlementButton = event.target.closest("[data-toggle-settlement]");

  if (settlementButton) {
    const requestId = settlementButton.dataset.toggleSettlement;
    const request = state.requests.find((item) => item.id === requestId);

    if (request) {
      request.settled = !request.settled;
      saveRequests();
      render();
      renderDetails(requestId);
      showToast(
        request.settled
          ? "تم تحديد الطلب بأنه تمت تصفيته"
          : "تم إلغاء حالة التصفية"
      );
    }

    return;
  }

  const openNoteButton = event.target.closest("[data-open-note-form]");

  if (openNoteButton) {
    state.noteFormOpen = true;
    state.editingNoteId = null;
    renderDetails(openNoteButton.dataset.openNoteForm);

    window.setTimeout(() => {
      elements.detailsContent
        .querySelector("[data-add-note-form] textarea")
        ?.focus();
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
      elements.detailsContent
        .querySelector("[data-edit-note-form] textarea")
        ?.focus();
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
    const request = state.requests.find(
      (item) => item.id === state.activeDetailsId
    );

    const note = request?.notes.find(
      (item) => item.id === deleteNoteButton.dataset.deleteNote
    );

    if (!request || !note || note.authorId !== CURRENT_USER.id) return;

    const confirmed = window.confirm("هل تريد حذف هذه الملاحظة؟");

    if (!confirmed) return;

    request.notes = request.notes.filter((item) => item.id !== note.id);
    saveRequests();
    render();
    renderDetails(request.id);
    showToast("تم حذف الملاحظة");
  }
});

elements.detailsContent.addEventListener("submit", (event) => {
  event.preventDefault();

  const addForm = event.target.closest("[data-add-note-form]");

  if (addForm) {
    const requestId = addForm.dataset.addNoteForm;
    const request = state.requests.find((item) => item.id === requestId);
    const text = new FormData(addForm).get("noteText").trim();

    if (!request || !text) return;

    request.notes.push({
      id: generateNoteId(requestId),
      text,
      authorId: CURRENT_USER.id,
      authorName: CURRENT_USER.name,
      createdAt: new Date().toISOString(),
      updatedAt: null
    });

    state.noteFormOpen = false;
    saveRequests();
    render();
    renderDetails(requestId);
    showToast("تمت إضافة الملاحظة");
    return;
  }

  const editForm = event.target.closest("[data-edit-note-form]");

  if (editForm) {
    const requestId = editForm.dataset.editNoteForm;
    const request = state.requests.find((item) => item.id === requestId);
    const note = request?.notes.find(
      (item) => item.id === editForm.dataset.noteId
    );
    const text = new FormData(editForm).get("noteText").trim();

    if (
      !request ||
      !note ||
      note.authorId !== CURRENT_USER.id ||
      !text
    ) {
      return;
    }

    note.text = text;
    note.updatedAt = new Date().toISOString();
    state.editingNoteId = null;
    saveRequests();
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

elements.attachmentsInput.addEventListener("change", async (event) => {
  const fileCount = event.target.files.length;

  if (fileCount === 0) {
    state.selectedAttachments = [];
    elements.attachmentsPreviewText.textContent =
      "تحفظ الصور المصغّرة محليًا في هذه النسخة التجريبية.";
    return;
  }

  elements.attachmentsPreviewText.textContent =
    "جارٍ تجهيز الصور وحفظ نسخ مصغّرة منها...";

  state.selectedAttachments = await prepareSelectedAttachments(
    event.target.files
  );

  elements.attachmentsPreviewText.textContent =
    state.selectedAttachments.length > 0
      ? `تم تجهيز ${state.selectedAttachments.length} صورة للحفظ المحلي.`
      : "تعذر تجهيز الصور المختارة.";

  if (fileCount > MAX_LOCAL_IMAGES) {
    showToast(`تم اعتماد أول ${MAX_LOCAL_IMAGES} صور فقط`);
  }
});

elements.addRequestForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(elements.addRequestForm);

  try {
    addRequest(formData);
  } catch (error) {
    console.error(error);
    showToast("تعذر الحفظ؛ قد تكون مساحة التخزين المحلي ممتلئة");
    return;
  }

  elements.addRequestForm.reset();
  state.selectedAttachments = [];
  elements.attachmentsPreviewText.textContent =
    "تحفظ الصور المصغّرة محليًا في هذه النسخة التجريبية.";

  closeAddForm();
  showToast("تمت إضافة الطلب وحفظه محليًا");
});

elements.resetDataButton.addEventListener("click", () => {
  const confirmed = window.confirm(
    "سيتم حذف التغييرات المحلية وإعادة البيانات التجريبية. هل تريد المتابعة؟"
  );

  if (!confirmed) return;

  localStorage.removeItem(DATA_STORAGE_KEY);
  state.requests = cloneDefaultRequests();
  saveRequests();
  render();
  showToast("تمت إعادة البيانات التجريبية");
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

installLongPressReorder();
render();
