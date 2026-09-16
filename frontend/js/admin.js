Auth.requireRole("ADMIN");
document.getElementById("whoName").textContent = Auth.name();

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
    const d = await apiFetch("/admin/dashboard");
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

async function loadInvoices() {
  await ensureMrOptions();
  const mrId = document.getElementById("filterMr").value;
  const status = document.getElementById("filterStatus").value;

  const params = new URLSearchParams();
  if (mrId) params.append("mr_id", mrId);
  if (status) params.append("status", status);

  try {
    const invoices = await apiFetch(`/invoices?${params.toString()}`);
    const body = document.getElementById("invoicesBody");
    const empty = document.getElementById("invoicesEmpty");
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
        <td>${i.invoice_date || "—"}</td>
        <td>${escapeHtml(i.customer_name || "—")}</td>
        <td>${escapeHtml(i.mr_name || "—")}</td>
        <td class="num amount">${money(i.total_amount)}</td>
        <td class="num amount">${money(i.pending_amount)}</td>
        <td>${statusPill(i.status)}</td>
      </tr>`
      )
      .join("");
  } catch (err) {
    console.error(err);
  }
}

document.getElementById("applyFilters").addEventListener("click", loadInvoices);

// ---------- Customers ----------

async function loadCustomers() {
  try {
    const customers = await apiFetch("/customers");
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
  } catch (err) {
    console.error(err);
  }
}

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
    document.getElementById("ledgerBody").innerHTML = data.invoices
      .map(
        (i) => `
      <tr>
        <td class="invoice-number">${escapeHtml(i.invoice_number)}</td>
        <td>${i.date || "—"}</td>
        <td>${escapeHtml(i.mr || "—")}</td>
        <td class="num amount">${money(i.amount)}</td>
        <td>${statusPill(i.status)}</td>
      </tr>`
      )
      .join("");
    document.getElementById("ledgerCard").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error(err);
  }
}

function closeLedger() {
  document.getElementById("ledgerCard").style.display = "none";
}

// ---------- MR performance ----------

async function loadPerformance() {
  try {
    const rows = await apiFetch("/admin/mr-performance");
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
    document.getElementById("usersBody").innerHTML = users
      .map(
        (u) => `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td class="mono">${escapeHtml(u.employee_code)}</td>
        <td>${escapeHtml(u.role)}</td>
        <td>${escapeHtml(u.phone || "—")}</td>
      </tr>`
      )
      .join("");
  } catch (err) {
    console.error(err);
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
