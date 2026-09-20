Auth.requireRole("ADMIN");
document.getElementById("whoName").textContent = Auth.name();

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
  if (name === "users") loadUsers();
}

// ---------- Dashboard ----------

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
    const select = document.getElementById("filterMr");
    users
      .filter((u) => u.role === "MR")
      .forEach((u) => {
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

document.getElementById("applyFilters").addEventListener("click", loadInvoices);

// ---------- Customers ----------

let allCustomers = [];

async function loadCustomers() {
  try {
    allCustomers = await apiFetch("/customers");
    renderCustomers(allCustomers);
  } catch (err) {
    console.error(err);
  }
}

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
