Auth.requireRole("MR");
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
  if (name === "invoices") loadMyInvoices();
  if (name === "collections") loadOutstanding();
}

// ---------- Dashboard ----------

async function loadDashboard() {
  try {
    const d = await apiFetch("/mr/dashboard");
    document.getElementById("greeting").textContent = `Hi, ${d.name}`;

    document.getElementById("dashStats").innerHTML = `
      <div class="stat accent">
        <div class="label">Total invoiced</div>
        <div class="value">${money(d.total_amount)}</div>
      </div>
      <div class="stat">
        <div class="label">Total invoices</div>
        <div class="value">${d.total_invoices}</div>
      </div>
      <div class="stat">
        <div class="label">Paid</div>
        <div class="value">${d.paid}</div>
      </div>
      <div class="stat">
        <div class="label">Pending (partial + unpaid)</div>
        <div class="value">${d.partial + d.unpaid}</div>
      </div>
    `;

    const body = document.getElementById("recentInvoicesBody");
    const empty = document.getElementById("recentEmpty");
    if (!d.recent.length) {
      body.innerHTML = "";
      empty.style.display = "block";
    } else {
      empty.style.display = "none";
      body.innerHTML = d.recent
        .map(
          (i) => `
        <tr>
          <td class="invoice-number">${escapeHtml(i.invoice_number)}</td>
          <td>${escapeHtml(i.customer || "—")}</td>
          <td class="num amount">${money(i.total_amount)}</td>
          <td>${statusPill(i.status)}</td>
        </tr>`
        )
        .join("");
    }
  } catch (err) {
    console.error(err);
  }
}

// ---------- Upload + AI extract + review ----------

let currentImagePath = null;
let selectedFile = null;

const fileInput = document.getElementById("invoiceFile");
const extractBtn = document.getElementById("extractBtn");
const previewImg = document.getElementById("previewImg");

fileInput.addEventListener("change", () => {
  selectedFile = fileInput.files[0] || null;
  extractBtn.disabled = !selectedFile;
  const previewFile = document.getElementById("previewFile");

  if (selectedFile && selectedFile.type === "application/pdf") {
    previewImg.style.display = "none";
    document.getElementById("previewFileName").textContent = selectedFile.name;
    previewFile.style.display = "block";
  } else if (selectedFile) {
    previewFile.style.display = "none";
    previewImg.src = URL.createObjectURL(selectedFile);
    previewImg.style.display = "block";
  } else {
    previewImg.style.display = "none";
    previewFile.style.display = "none";
  }
});

extractBtn.addEventListener("click", async () => {
  if (!selectedFile) return;
  const errorBox = document.getElementById("extractError");
  errorBox.innerHTML = "";
  extractBtn.disabled = true;
  extractBtn.textContent = "Reading invoice…";

  try {
    const form = new FormData();
    form.append("file", selectedFile);
    const result = await apiFetch("/invoices/extract", { method: "POST", body: form, isForm: true });
    currentImagePath = result.image_path;
    fillReviewForm(result);
    document.getElementById("uploadStep1").style.display = "none";
    document.getElementById("reviewForm").style.display = "block";
  } catch (err) {
    errorBox.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = "Extract with AI";
  }
});

function fillReviewForm(result) {
  const confidence = result.confidence || {};
  const setField = (id, value, confKey) => {
    const el = document.getElementById(id);
    el.value = value ?? "";
    if (confKey && confidence[confKey] !== undefined && confidence[confKey] < 0.6) {
      el.classList.add("confidence-low");
    } else {
      el.classList.remove("confidence-low");
    }
  };

  setField("f_invoice_number", result.invoice_number, "invoice_number");
  setField("f_invoice_date", result.invoice_date);
  setField("f_customer_name", result.customer_name, "customer_name");
  document.getElementById("f_customer_type").value = result.customer_type || "";
  setField("f_total_amount", result.total_amount, "total_amount");
  setField("f_paid_amount", result.paid_amount ?? 0);
  document.getElementById("f_payment_mode").value = result.payment_mode || "";
  document.getElementById("f_remarks").value = result.remarks || "";

  const notice = document.getElementById("extractNotice");
  if (result.remarks && (!result.invoice_number || !result.total_amount)) {
    notice.style.display = "block";
    notice.textContent = "AI could not confidently read every field — please check the highlighted fields before confirming.";
  } else {
    notice.style.display = "block";
    notice.textContent = "Review the details below, then confirm to save this invoice.";
  }

  updatePendingPreview();
}

function updatePendingPreview() {
  const total = parseFloat(document.getElementById("f_total_amount").value) || 0;
  const paid = parseFloat(document.getElementById("f_paid_amount").value) || 0;
  const pending = Math.max(total - paid, 0);
  document.getElementById("f_pending").textContent = money(pending);
}

document.getElementById("f_total_amount").addEventListener("input", updatePendingPreview);
document.getElementById("f_paid_amount").addEventListener("input", updatePendingPreview);

document.getElementById("cancelReviewBtn").addEventListener("click", resetUploadFlow);

function resetUploadFlow() {
  fileInput.value = "";
  selectedFile = null;
  currentImagePath = null;
  previewImg.style.display = "none";
  document.getElementById("previewFile").style.display = "none";
  extractBtn.disabled = true;
  document.getElementById("uploadStep1").style.display = "block";
  document.getElementById("reviewForm").style.display = "none";
  document.getElementById("reviewForm").reset();
  document.getElementById("extractError").innerHTML = "";
  document.getElementById("saveError").innerHTML = "";
}

async function saveInvoice(confirmDuplicate) {
  const total = parseFloat(document.getElementById("f_total_amount").value) || 0;
  const paid = parseFloat(document.getElementById("f_paid_amount").value) || 0;
  return apiFetch("/invoices", {
    method: "POST",
    body: {
      invoice_number: document.getElementById("f_invoice_number").value.trim(),
      invoice_date: document.getElementById("f_invoice_date").value || null,
      customer_name: document.getElementById("f_customer_name").value.trim(),
      customer_type: document.getElementById("f_customer_type").value || null,
      total_amount: total,
      paid_amount: paid,
      payment_mode: document.getElementById("f_payment_mode").value || null,
      remarks: document.getElementById("f_remarks").value || null,
      image_path: currentImagePath,
      confirm_duplicate: !!confirmDuplicate,
    },
  });
}

document.getElementById("reviewForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("confirmBtn");
  const errorBox = document.getElementById("saveError");
  errorBox.innerHTML = "";
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    try {
      await saveInvoice(false);
    } catch (err) {
      if (err.status === 409 && confirm(err.message + "\n\nSave it anyway?")) {
        await saveInvoice(true);
      } else {
        throw err;
      }
    }

    document.getElementById("saveSuccess").innerHTML =
      `<div class="notice">Invoice saved successfully.</div>`;
    resetUploadFlow();
    setTimeout(() => (document.getElementById("saveSuccess").innerHTML = ""), 4000);
  } catch (err) {
    errorBox.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm entry";
  }
});

// ---------- My invoices ----------

const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Cheque", "NEFT", "RTGS", "Other"];
let allMyInvoices = [];
let myInvDateFrom = null, myInvDateTo = null;

renderDateFilter("invoiceDateFilter", (from, to) => {
  myInvDateFrom = from;
  myInvDateTo = to;
  loadMyInvoices();
});

async function loadMyInvoices() {
  try {
    const params = new URLSearchParams();
    if (myInvDateFrom) params.append("date_from", myInvDateFrom);
    if (myInvDateTo) params.append("date_to", myInvDateTo);
    allMyInvoices = await apiFetch(`/invoices/mine?${params.toString()}`);
    applyInvoiceSearch();
  } catch (err) {
    console.error(err);
  }
}

function applyInvoiceSearch() {
  const q = document.getElementById("invoiceSearch").value.trim().toLowerCase();
  if (!q) {
    renderMyInvoices(allMyInvoices);
    return;
  }
  renderMyInvoices(
    allMyInvoices.filter(
      (i) =>
        i.invoice_number.toLowerCase().includes(q) ||
        (i.customer_name || "").toLowerCase().includes(q)
    )
  );
}

document.getElementById("invoiceSearch").addEventListener("input", applyInvoiceSearch);

function renderMyInvoices(invoices) {
  const list = document.getElementById("myInvoicesList");
  const empty = document.getElementById("myInvoicesEmpty");
  if (!invoices.length) {
    list.innerHTML = "";
    empty.style.display = "block";
    empty.textContent = allMyInvoices.length ? "No invoices match your search." : "No invoices yet.";
    return;
  }
  empty.style.display = "none";

  list.innerHTML = invoices
      .map(
        (i) => `
      <div class="card" style="margin-top:10px;" id="myinv-${i.id}">
        <div class="row">
          <div>
            <div class="invoice-number" style="font-weight:600;">${escapeHtml(i.invoice_number)}</div>
            <div class="muted" style="font-size:12.5px;">${escapeHtml(i.customer_name || "—")} · ${i.invoice_date || "no date"}</div>
          </div>
          <div style="text-align:right;">
            <div class="amount" style="font-weight:600;">${money(i.total_amount)}</div>
            ${statusPill(i.status)}
          </div>
        </div>

        <div class="edit-form" style="display:none; margin-top:12px; border-top:1px solid var(--line); padding-top:12px;">
          <div class="field-row">
            <div>
              <label>Invoice number</label>
              <input class="e-invoice-number" value="${escapeHtml(i.invoice_number)}" />
            </div>
            <div>
              <label>Invoice date</label>
              <input class="e-invoice-date" type="date" value="${i.invoice_date || ""}" />
            </div>
          </div>
          <div class="field-row">
            <div>
              <label>Customer</label>
              <input class="e-customer" value="${escapeHtml(i.customer_name || "")}" />
            </div>
            <div>
              <label>Invoice amount (₹)</label>
              <input class="e-amount" type="number" min="0" step="0.01" value="${i.total_amount}" />
            </div>
          </div>
          <div class="field-row">
            <div>
              <label>Payment mode</label>
              <select class="e-mode">
                <option value="">—</option>
                ${PAYMENT_MODES.map((m) => `<option ${m === i.payment_mode ? "selected" : ""}>${m}</option>`).join("")}
              </select>
            </div>
            <div>
              <label>Remarks</label>
              <input class="e-remarks" value="${escapeHtml(i.remarks || "")}" />
            </div>
          </div>
          <div class="hint">Already-paid amount isn't edited here — record payments from the Collections tab instead.</div>
          <div class="row" style="margin-top:12px;">
            <button class="secondary" type="button" onclick="toggleInvoiceEdit(${i.id})">Cancel</button>
            <button type="button" onclick="saveInvoiceEdit(${i.id})">Save changes</button>
          </div>
          <div class="edit-error"></div>
        </div>

        <div class="row" style="margin-top:12px;">
          <button class="secondary" type="button" onclick="toggleInvoiceEdit(${i.id})">Edit</button>
          <button class="secondary" type="button" style="border-color:var(--unpaid); color:var(--unpaid);" onclick="deleteInvoice(${i.id})">Delete</button>
        </div>
      </div>`
      )
      .join("");
}

function toggleInvoiceEdit(invoiceId) {
  const card = document.getElementById(`myinv-${invoiceId}`);
  const form = card.querySelector(".edit-form");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function saveInvoiceEdit(invoiceId) {
  const card = document.getElementById(`myinv-${invoiceId}`);
  const errorBox = card.querySelector(".edit-error");
  errorBox.innerHTML = "";

  const amount = parseFloat(card.querySelector(".e-amount").value);
  if (!amount || amount <= 0) {
    errorBox.innerHTML = `<div class="error">Enter a valid invoice amount.</div>`;
    return;
  }

  try {
    await apiFetch(`/invoices/${invoiceId}`, {
      method: "PUT",
      body: {
        invoice_number: card.querySelector(".e-invoice-number").value.trim(),
        invoice_date: card.querySelector(".e-invoice-date").value || null,
        customer_name: card.querySelector(".e-customer").value.trim(),
        total_amount: amount,
        payment_mode: card.querySelector(".e-mode").value || null,
        remarks: card.querySelector(".e-remarks").value || null,
      },
    });
    loadMyInvoices();
  } catch (err) {
    errorBox.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

async function deleteInvoice(invoiceId) {
  if (!confirm("Delete this invoice? This also removes its payment history and can't be undone.")) {
    return;
  }
  try {
    await apiFetch(`/invoices/${invoiceId}`, { method: "DELETE" });
    loadMyInvoices();
    loadDashboard();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- Outstanding / collections ----------

async function loadOutstanding() {
  const list = document.getElementById("outstandingList");
  const empty = document.getElementById("outstandingEmpty");
  try {
    const data = await apiFetch("/mr/outstanding");
    document.getElementById("totalOutstanding").textContent = money(data.total_outstanding);

    if (!data.items.length) {
      list.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    list.innerHTML = data.items
      .map(
        (item) => `
      <div class="card" style="margin-top:10px;" id="outstanding-${item.invoice_id}">
        <div class="row">
          <div>
            <div style="font-weight:600;">${escapeHtml(item.customer || "—")}</div>
            <div class="muted invoice-number" style="font-size:12.5px;">Invoice ${escapeHtml(item.invoice_number)}</div>
          </div>
          <div style="text-align:right;">
            <div class="amount" style="font-weight:600;">${money(item.pending_amount)}</div>
            ${statusPill(item.status)}
          </div>
        </div>
        <div class="payment-form" style="display:none; margin-top:12px; border-top:1px solid var(--line); padding-top:12px;">
          <div class="field-row">
            <div>
              <label>Amount received (₹)</label>
              <input type="number" min="0.01" step="0.01" max="${item.pending_amount}" class="pay-amount" />
            </div>
            <div>
              <label>Payment mode</label>
              <select class="pay-mode">
                <option>Cash</option><option>UPI</option><option>Bank Transfer</option>
                <option>Cheque</option><option>NEFT</option><option>RTGS</option><option>Other</option>
              </select>
            </div>
          </div>
          <label>Reference / UTR number (optional)</label>
          <input class="pay-ref" placeholder="e.g. UPI123456" />
          <div class="row" style="margin-top:12px;">
            <button class="secondary" type="button" onclick="togglePaymentForm(${item.invoice_id})">Cancel</button>
            <button type="button" onclick="submitPayment(${item.invoice_id}, ${item.pending_amount})">Save payment</button>
          </div>
          <div class="pay-error"></div>
        </div>
        <button class="secondary" type="button" style="margin-top:12px;" onclick="togglePaymentForm(${item.invoice_id})">Update payment</button>
      </div>`
      )
      .join("");
  } catch (err) {
    console.error(err);
  }
}

function togglePaymentForm(invoiceId) {
  const card = document.getElementById(`outstanding-${invoiceId}`);
  const form = card.querySelector(".payment-form");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function submitPayment(invoiceId, maxAmount) {
  const card = document.getElementById(`outstanding-${invoiceId}`);
  const amount = parseFloat(card.querySelector(".pay-amount").value);
  const mode = card.querySelector(".pay-mode").value;
  const ref = card.querySelector(".pay-ref").value;
  const errorBox = card.querySelector(".pay-error");
  errorBox.innerHTML = "";

  if (!amount || amount <= 0) {
    errorBox.innerHTML = `<div class="error">Enter a valid amount.</div>`;
    return;
  }
  if (amount > maxAmount + 0.01) {
    errorBox.innerHTML = `<div class="error">Amount can't exceed the outstanding balance of ${money(maxAmount)}.</div>`;
    return;
  }

  try {
    await apiFetch("/payments", {
      method: "POST",
      body: { invoice_id: invoiceId, amount, mode, transaction_reference: ref || null },
    });
    loadOutstanding();
  } catch (err) {
    errorBox.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

// ---------- init ----------

loadDashboard();
