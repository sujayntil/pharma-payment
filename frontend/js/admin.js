Auth.requireRole("ADMIN");
document.getElementById("whoName").textContent = Auth.name();

const pushButton = document.getElementById("enablePushButton");
const pushStatus = document.getElementById("pushStatus");
pushButton.addEventListener("click", async () => {
  pushButton.disabled = true;
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("Push notifications are not supported in this browser.");
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Allow notifications in your browser settings to enable alerts.");

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await apiFetch("/notifications/subscriptions", { method: "DELETE", body: { endpoint: subscription.endpoint } });
      await subscription.unsubscribe();
      pushStatus.textContent = "Payment alerts are disabled on this device.";
      pushButton.textContent = "Enable payment alerts";
    } else {
      const { public_key: publicKey } = await apiFetch("/notifications/vapid-public-key");
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
      });
      await apiFetch("/notifications/subscriptions", { method: "POST", body: subscription.toJSON() });
      pushStatus.textContent = "Payment alerts are enabled on this device.";
      pushButton.textContent = "Disable payment alerts";
    }
  } catch (error) {
    pushStatus.textContent = error.message;
  } finally {
    pushButton.disabled = false;
  }
});

function base64UrlToBytes(value) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
}

if (!("PushManager" in window) || !("serviceWorker" in navigator) || !window.isSecureContext) {
  pushButton.hidden = true;
  pushStatus.textContent = "Push alerts need a supported browser and a secure connection. On iPhone or iPad, install this app from the Home Screen first.";
} else {
  navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => {
    if (subscription) {
      pushStatus.textContent = "Payment alerts are enabled on this device.";
      pushButton.textContent = "Disable payment alerts";
    }
  }).catch(() => {});
}

let dashDateFrom = null, dashDateTo = null;
let perfDateFrom = null, perfDateTo = null;
let invDateFrom = null, invDateTo = null;

renderDateFilter("dashDateFilter", (from, to) => {
  dashDateFrom = from;
  dashDateTo = to;
  loadDashboard();
});
renderDateFilter("perfDateFilter", (from, to) => {
  perfDateFrom = from;
  perfDateTo = to;
  loadPerformance();
});
renderDateFilter("invoicesDateFilter", (from, to) => {
  invDateFrom = from;
  invDateTo = to;
  loadInvoices();
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  Auth.clear();
  window.location.href = "index.html";
});

// ---------- Tabs ----------

const tabs = document.querySelectorAll(".tab");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => showTab(tab.dataset.tab));
});

function showTab(name) {
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));

  if (name === "dashboard") loadDashboard();
  if (name === "invoices") loadInvoices();
  if (name === "customers") loadCustomers();
  if (name === "performance") loadPerformance();
  if (name === "import") loadImportData();
  if (name === "users") loadUsers();
}

// ---------- Dashboard ----------

let seenPaymentIds = new Set();
let paymentFeedInitialized = false;

async function loadRecentPayments() {
  const payments = await apiFetch("/admin/recent-payments?limit=20");
  const newPayments = paymentFeedInitialized
    ? payments.filter((payment) => !seenPaymentIds.has(payment.payment_id))
    : [];
  payments.forEach((payment) => seenPaymentIds.add(payment.payment_id));
  paymentFeedInitialized = true;

  const paymentBody = document.getElementById("recentPaymentsBody");
  const paymentEmpty = document.getElementById("recentPaymentsEmpty");
  if (paymentBody) {
    paymentBody.innerHTML = payments.map((p) => `
      <tr>
        <td>${p.payment_date ? new Date(p.payment_date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "—"}</td>
        <td>${escapeHtml(p.customer_name || "—")}</td>
        <td class="invoice-number">${escapeHtml(p.invoice_number)}</td>
        <td>${escapeHtml(p.collected_by || "—")}</td>
        <td class="num amount">${money(p.amount)}</td>
      </tr>`).join("");
    paymentEmpty.style.display = payments.length ? "none" : "block";
  }

  if (newPayments.length) {
    const notice = document.getElementById("collectionNotice");
    const first = newPayments[0];
    notice.textContent = newPayments.length === 1
      ? `New collection: ${money(first.amount)} recorded by ${first.collected_by || "an MR"} for ${first.customer_name || first.invoice_number}.`
      : `${newPayments.length} new collections have been recorded. See the Recent collections list below.`;
    notice.style.display = "block";
  }
}

async function loadDashboard() {
  try {
    const params = new URLSearchParams();
    if (dashDateFrom) params.append("date_from", dashDateFrom);
    if (dashDateTo) params.append("date_to", dashDateTo);
    const d = await apiFetch(`/admin/dashboard?${params.toString()}`);
    document.getElementById("dashTotals").innerHTML = `
      <div class="stat accent"><div class="label">Total sales</div><div class="value">${money(d.total_sales)}</div></div>
      <div class="stat"><div class="label">Collected</div><div class="value">${money(d.collected)}</div></div>
      <div class="stat"><div class="label">Outstanding</div><div class="value">${money(d.outstanding)}</div></div>
    `;
    document.getElementById("dashCounts").innerHTML = `
      <div class="stat"><div class="label">Paid invoices</div><div class="value">${d.paid}</div></div>
      <div class="stat"><div class="label">Partial invoices</div><div class="value">${d.partial}</div></div>
      <div class="stat"><div class="label">Unpaid invoices</div><div class="value">${d.unpaid}</div></div>
    `;

    const alerts = await apiFetch("/admin/outstanding-alerts?threshold=50000");
    const body = document.getElementById("alertsBody");
    const empty = document.getElementById("alertsEmpty");
    if (!alerts.length) {
      body.innerHTML = "";
      empty.style.display = "block";
    } else {
      empty.style.display = "none";
      body.innerHTML = alerts
        .map(
          (a) => `
        <tr>
          <td>${escapeHtml(a.customer || "—")}</td>
          <td class="invoice-number">${escapeHtml(a.invoice_number)}</td>
          <td>${escapeHtml(a.mr || "—")}</td>
          <td class="num amount">${money(a.pending_amount)}</td>
        </tr>`
        )
        .join("");
    }

    await loadRecentPayments();
  } catch (err) {
    console.error(err);
  }
}

// ---------- Invoices ----------

let mrOptionsLoaded = false;

async function ensureMrOptions() {
  if (mrOptionsLoaded) return;
  try {
    const users = await apiFetch("/admin/users");
    mrUsers = users.filter((u) => u.role === "MR");
    const select = document.getElementById("filterMr");
    mrUsers.forEach((u) => {
        const opt = document.createElement("option");
        opt.value = u.id;
        opt.textContent = u.name;
        select.appendChild(opt);
      });
    mrOptionsLoaded = true;
  } catch (err) {
    console.error(err);
  }
}

let mrUsers = [];

let allInvoices = [];

async function loadInvoices() {
  await ensureMrOptions();
  const mrId = document.getElementById("filterMr").value;
  const status = document.getElementById("filterStatus").value;

  const params = new URLSearchParams();
  if (mrId) params.append("mr_id", mrId);
  if (status) params.append("status", status);
  if (invDateFrom) params.append("date_from", invDateFrom);
  if (invDateTo) params.append("date_to", invDateTo);

  try {
    allInvoices = await apiFetch(`/invoices?${params.toString()}`);
    applyAdminInvoiceSearch();
  } catch (err) {
    console.error(err);
  }
}

function applyAdminInvoiceSearch() {
  const q = document.getElementById("adminInvoiceSearch").value.trim().toLowerCase();
  if (!q) {
    renderInvoices(allInvoices);
    return;
  }
  renderInvoices(
    allInvoices.filter(
      (i) =>
        i.invoice_number.toLowerCase().includes(q) ||
        (i.customer_name || "").toLowerCase().includes(q) ||
        (i.mr_name || "").toLowerCase().includes(q) ||
        (i.payment_mode || "").toLowerCase().includes(q)
    )
  );
}

document.getElementById("adminInvoiceSearch").addEventListener("input", applyAdminInvoiceSearch);

function renderInvoices(invoices) {
  const body = document.getElementById("invoicesBody");
  const empty = document.getElementById("invoicesEmpty");
  if (!invoices.length) {
    body.innerHTML = "";
    empty.style.display = "block";
    empty.textContent = allInvoices.length
      ? "No invoices match your search."
      : "No invoices match these filters.";
    return;
  }
  empty.style.display = "none";
  body.innerHTML = invoices
    .map(
      (i) => `
      <tr>
        <td class="invoice-number">${escapeHtml(i.invoice_number)}</td>
        <td>${i.invoice_date || "—"}</td>
        <td>${escapeHtml(i.customer_name || "—")}</td>
        <td>${escapeHtml(i.mr_name || "—")}</td>
        <td class="num amount">${money(i.total_amount)}</td>
        <td class="num amount">${money(i.pending_amount)}</td>
        <td>${escapeHtml(i.payment_mode || "—")}</td>
        <td>${statusPill(i.status)}</td>
      </tr>`
    )
    .join("");
}

// ---------- Customers ----------

let allCustomers = [];

async function loadCustomers() {
  try {
    allCustomers = await apiFetch("/customers");
    renderCustomers(allCustomers);
    renderMappingCustomers(allCustomers);
    renderManualCustomerSuggestions();
  } catch (err) {
    console.error(err);
  }
}

async function loadImportData() {
  await ensureMrOptions();
  await loadCustomers();
}

function renderManualCustomerSuggestions() {
  const list = document.getElementById("manualInvoiceCustomers");
  if (!list) return;
  list.replaceChildren(...allCustomers.map((customer) => {
    const option = document.createElement("option");
    option.value = customer.name;
    return option;
  }));
}

function mrSelectOptions(selectedId) {
  const options = [`<option value="">Unassigned</option>`].concat(
    mrUsers.map((mr) => `<option value="${mr.id}" ${String(mr.id) === String(selectedId || "") ? "selected" : ""}>${escapeHtml(mr.name)}</option>`)
  );
  return options.join("");
}

function renderMappingCustomers(customers) {
  const body = document.getElementById("mappingCustomersBody");
  if (!body) return;
  body.innerHTML = customers.map((c) => `
    <tr class="${c.mr_id ? "" : "mapping-unassigned"}">
      <td>${escapeHtml(c.name)}${c.mr_id ? "" : '<span class="mapping-badge">Needs assignment</span>'}</td>
      <td>${escapeHtml(c.type || "—")}</td>
      <td>${Number(c.invoice_count || 0)}</td>
      <td><select aria-label="Assign ${escapeHtml(c.name)} to MR" onchange="saveCustomerMr(${c.id}, this.value)">${mrSelectOptions(c.mr_id)}</select></td>
    </tr>`).join("");
  document.getElementById("mappingCustomersEmpty").style.display = customers.length ? "none" : "block";
  const q = document.getElementById("mappingCustomerSearch").value.trim().toLowerCase();
  if (q) filterMappingCustomers(q);
}

function filterMappingCustomers(q) {
  document.querySelectorAll("#mappingCustomersBody tr").forEach((row) => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? "" : "none";
  });
}

document.getElementById("mappingCustomerSearch").addEventListener("input", (event) => {
  filterMappingCustomers(event.target.value.trim().toLowerCase());
});

async function saveCustomerMr(customerId, mrId) {
  try {
    await apiFetch(`/admin/customers/${customerId}/mr`, {
      method: "PUT",
      body: { mr_id: mrId ? Number(mrId) : null },
    });
    await loadCustomers();
    await loadInvoices();
    showImportMessage(
      mrId
        ? "Customer assignment saved. Unassigned invoices are now visible to the selected MR."
        : "Customer assignment cleared. Existing invoice assignments were preserved.",
      "success"
    );
  } catch (err) {
    showImportMessage(err.message, "error");
    await loadCustomers();
  }
}

function showImportMessage(message, type = "") {
  const el = document.getElementById("invoiceImportMessage");
  if (el) {
    el.className = type ? `notice ${type}` : "notice";
    el.textContent = message;
  }
}

function renderImportResult(result) {
  const root = document.getElementById("invoiceImportResults");
  const unmapped = result.unmapped_customers || [];
  const conflicts = result.conflicts || [];
  const errors = result.row_errors || [];
  root.style.display = "block";
  root.innerHTML = `
    <div class="import-summary" aria-label="Import summary">
      <div><span>Imported</span><strong>${result.created}</strong></div>
      <div><span>Updated</span><strong>${result.updated || 0}</strong></div>
      <div><span>Duplicates</span><strong>${result.duplicates}</strong></div>
      <div><span>Conflicts</span><strong>${conflicts.length}</strong></div>
      <div><span>Row issues</span><strong>${errors.length}</strong></div>
    </div>
    ${unmapped.length ? `<div class="import-issues"><h3>Customer needs an MR assignment</h3><p>These invoices were imported and are waiting for assignment.</p><ul>${unmapped.map((c) => `<li><strong>${escapeHtml(c.customer_name)}</strong> · ${c.invoice_count} invoice(s) <select aria-label="Assign ${escapeHtml(c.customer_name)} to MR" onchange="saveCustomerMr(${c.customer_id}, this.value)">${mrSelectOptions("")}</select></li>`).join("")}</ul></div>` : ""}
    ${conflicts.length ? `<div class="import-issues"><h3>Bill number conflicts</h3><ul>${conflicts.map((r) => `<li>Row ${r.row} · ${escapeHtml(r.invoice_number)} — ${escapeHtml(r.message)}</li>`).join("")}</ul></div>` : ""}
    ${errors.length ? `<div class="import-issues"><h3>Rows not imported</h3><ul>${errors.map((r) => `<li>Row ${r.row} — ${escapeHtml(r.message)}</li>`).join("")}</ul></div>` : ""}`;
}

document.getElementById("invoiceImportForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileInput = document.getElementById("invoiceImportFile");
  const button = document.getElementById("invoiceImportButton");
  if (!fileInput.files.length) return;
  button.disabled = true;
  showImportMessage("Importing workbook…");
  try {
    const form = new FormData();
    form.append("file", fileInput.files[0]);
    const result = await apiFetch("/admin/import-invoices", { method: "POST", body: form, isForm: true });
    renderImportResult(result);
    showImportMessage(`Import complete. ${result.created} added, ${result.updated || 0} updated.`, "success");
    await loadCustomers();
    await loadDashboard();
    await loadInvoices();
  } catch (err) {
    showImportMessage(err.message, "error");
  } finally {
    button.disabled = false;
  }
});

document.getElementById("manualInvoiceForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById("manualInvoiceButton");
  const message = document.getElementById("manualInvoiceMessage");
  button.disabled = true;
  message.className = "notice";
  message.textContent = "Adding invoice…";

  try {
    const result = await apiFetch("/admin/manual-invoices", {
      method: "POST",
      body: {
        invoice_number: document.getElementById("manualInvoiceNumber").value.trim(),
        invoice_date: document.getElementById("manualInvoiceDate").value,
        customer_name: document.getElementById("manualInvoiceCustomer").value.trim(),
        total_amount: Number(document.getElementById("manualInvoiceAmount").value),
      },
    });
    form.reset();
    await Promise.all([loadCustomers(), loadDashboard(), loadInvoices()]);
    message.className = "notice success";
    message.textContent = result.mr_name
      ? `Invoice ${result.invoice_number} added and assigned to ${result.mr_name}.`
      : `Invoice ${result.invoice_number} added. This customer has no MR assignment yet; assign one below.`;
  } catch (err) {
    message.className = "notice error";
    message.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("customerSearch").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) {
    renderCustomers(allCustomers);
    return;
  }
  renderCustomers(
    allCustomers.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.type || "").toLowerCase().includes(q)
    )
  );
});

function renderCustomers(customers) {
  document.getElementById("customersBody").innerHTML = customers
      .map(
        (c) => `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.type || "—")}</td>
        <td>${escapeHtml(c.phone || "—")}</td>
        <td><button class="secondary" style="padding:5px 10px; font-size:12.5px;" onclick="openLedger(${c.id})">View ledger</button></td>
      </tr>`
      )
      .join("");
}

let currentLedgerInvoices = [];

async function openLedger(customerId) {
  try {
    const data = await apiFetch(`/customers/${customerId}/ledger`);
    document.getElementById("ledgerCard").style.display = "block";
    document.getElementById("ledgerTitle").textContent = `Ledger — ${data.customer.name}`;
    document.getElementById("ledgerStats").innerHTML = `
      <div class="stat"><div class="label">Total invoiced</div><div class="value">${money(data.total_invoiced)}</div></div>
      <div class="stat"><div class="label">Total paid</div><div class="value">${money(data.total_paid)}</div></div>
      <div class="stat accent"><div class="label">Outstanding</div><div class="value">${money(data.outstanding)}</div></div>
    `;
    currentLedgerInvoices = data.invoices;
    document.getElementById("ledgerSearch").value = "";
    renderLedgerInvoices(currentLedgerInvoices);
    document.getElementById("ledgerCard").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error(err);
  }
}

function renderLedgerInvoices(invoices) {
  const body = document.getElementById("ledgerBody");
  const empty = document.getElementById("ledgerEmpty");
  if (!invoices.length) {
    body.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  body.innerHTML = invoices
    .map(
      (i) => `
      <tr>
        <td class="invoice-number">${escapeHtml(i.invoice_number)}</td>
        <td>${i.date || "—"}</td>
        <td>${escapeHtml(i.mr || "—")}</td>
        <td class="num amount">${money(i.amount)}</td>
        <td>${escapeHtml(i.mode || "—")}</td>
        <td>${statusPill(i.status)}</td>
      </tr>`
    )
    .join("");
}

document.getElementById("ledgerSearch").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) {
    renderLedgerInvoices(currentLedgerInvoices);
    return;
  }
  renderLedgerInvoices(
    currentLedgerInvoices.filter(
      (i) =>
        i.invoice_number.toLowerCase().includes(q) ||
        (i.mr || "").toLowerCase().includes(q) ||
        (i.status || "").toLowerCase().includes(q) ||
        (i.mode || "").toLowerCase().includes(q)
    )
  );
});

function closeLedger() {
  document.getElementById("ledgerCard").style.display = "none";
}

// ---------- MR performance ----------

async function loadPerformance() {
  try {
    const params = new URLSearchParams();
    if (perfDateFrom) params.append("date_from", perfDateFrom);
    if (perfDateTo) params.append("date_to", perfDateTo);
    const rows = await apiFetch(`/admin/mr-performance?${params.toString()}`);
    document.getElementById("performanceBody").innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(r.name)}</td>
        <td class="num amount">${money(r.sales)}</td>
        <td class="num amount">${money(r.collected)}</td>
        <td class="num amount">${money(r.pending)}</td>
      </tr>`
      )
      .join("");
  } catch (err) {
    console.error(err);
  }
}

// ---------- Users ----------

async function loadUsers() {
  try {
    const users = await apiFetch("/admin/users");
    document.getElementById("usersList").innerHTML = users
      .map(
        (u) => `
      <div class="card" style="margin-top:10px;" id="user-${u.id}">
        <div class="row">
          <div>
            <div style="font-weight:600;">${escapeHtml(u.name)}</div>
            <div class="muted mono" style="font-size:12.5px;">${escapeHtml(u.employee_code)} · ${escapeHtml(u.phone || "no phone")}</div>
          </div>
          <span class="pill ${u.role === "ADMIN" ? "partial" : "paid"}">${escapeHtml(u.role)}</span>
        </div>

        <div class="edit-form" style="display:none; margin-top:12px; border-top:1px solid var(--line); padding-top:12px;">
          <div class="field-row">
            <div>
              <label>Name</label>
              <input class="e-name" value="${escapeHtml(u.name)}" />
            </div>
            <div>
              <label>Phone</label>
              <input class="e-phone" value="${escapeHtml(u.phone || "")}" />
            </div>
          </div>
          <div class="field-row">
            <div>
              <label>Role</label>
              <select class="e-role">
                <option value="MR" ${u.role === "MR" ? "selected" : ""}>MR</option>
                <option value="ADMIN" ${u.role === "ADMIN" ? "selected" : ""}>Admin</option>
              </select>
            </div>
            <div>
              <label>New password</label>
              <input class="e-password" type="password" placeholder="leave blank to keep current" />
            </div>
          </div>
          <div class="row" style="margin-top:12px;">
            <button class="secondary" type="button" onclick="toggleUserEdit(${u.id})">Cancel</button>
            <button type="button" onclick="saveUserEdit(${u.id})">Save changes</button>
          </div>
          <div class="edit-error"></div>
        </div>

        <div class="row" style="margin-top:12px;">
          <button class="secondary" type="button" onclick="toggleUserEdit(${u.id})">Edit</button>
          <button class="secondary" type="button" style="border-color:var(--unpaid); color:var(--unpaid);" onclick="deleteUser(${u.id}, '${escapeHtml(u.name).replace(/'/g, "\\'")}')">Delete</button>
        </div>
      </div>`
      )
      .join("");
  } catch (err) {
    console.error(err);
  }
}

function toggleUserEdit(userId) {
  const card = document.getElementById(`user-${userId}`);
  const form = card.querySelector(".edit-form");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function saveUserEdit(userId) {
  const card = document.getElementById(`user-${userId}`);
  const errorBox = card.querySelector(".edit-error");
  errorBox.innerHTML = "";

  const password = card.querySelector(".e-password").value;
  const body = {
    name: card.querySelector(".e-name").value.trim(),
    phone: card.querySelector(".e-phone").value || null,
    role: card.querySelector(".e-role").value,
  };
  if (password) body.password = password;

  try {
    await apiFetch(`/admin/users/${userId}`, { method: "PUT", body });
    loadUsers();
    mrOptionsLoaded = false; // role may have changed, refresh the invoice filter's MR list next time it's opened
  } catch (err) {
    errorBox.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

async function deleteUser(userId, name) {
  if (!confirm(`Delete ${name}? This can't be undone.`)) return;
  try {
    await apiFetch(`/admin/users/${userId}`, { method: "DELETE" });
    loadUsers();
    mrOptionsLoaded = false;
  } catch (err) {
    alert(err.message);
  }
}

document.getElementById("userForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById("userError");
  errorBox.innerHTML = "";
  try {
    await apiFetch("/admin/users", {
      method: "POST",
      body: {
        name: document.getElementById("u_name").value.trim(),
        employee_code: document.getElementById("u_code").value.trim(),
        role: document.getElementById("u_role").value,
        phone: document.getElementById("u_phone").value || null,
        password: document.getElementById("u_password").value,
      },
    });
    document.getElementById("userForm").reset();
    loadUsers();
    mrOptionsLoaded = false; // refresh MR filter options next time invoices tab is opened
  } catch (err) {
    errorBox.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
});

// ---------- init ----------

loadDashboard();
window.setInterval(() => {
  if (document.visibilityState === "visible") loadRecentPayments().catch(console.error);
}, 60_000);
