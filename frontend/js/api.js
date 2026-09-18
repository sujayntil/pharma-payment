// Point this at wherever the FastAPI backend is running.
// Local docker-compose: leave as-is, it matches https://pharma-payment.onrender.com.
// Deployed (e.g. Render): change this to your backend's live URL, e.g.
// "https://pharma-backend.onrender.com" -- no trailing slash.
const API_BASE = window.API_BASE || "https://pharma-payment.onrender.com";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {
    /* PWA install just won't be offered; the app still works fine without it */
  });
}

const Auth = {
  save(token, role, name, userId) {
    localStorage.setItem("pharma_token", token);
    localStorage.setItem("pharma_role", role);
    localStorage.setItem("pharma_name", name);
    localStorage.setItem("pharma_user_id", userId);
  },
  token() {
    return localStorage.getItem("pharma_token");
  },
  role() {
    return localStorage.getItem("pharma_role");
  },
  name() {
    return localStorage.getItem("pharma_name");
  },
  clear() {
    localStorage.removeItem("pharma_token");
    localStorage.removeItem("pharma_role");
    localStorage.removeItem("pharma_name");
    localStorage.removeItem("pharma_user_id");
  },
  requireRole(role) {
    if (!Auth.token() || Auth.role() !== role) {
      window.location.href = "index.html";
    }
  },
};

async function apiFetch(path, { method = "GET", body, isForm = false } = {}) {
  const headers = {};
  const token = Auth.token();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let payload = body;
  if (body && !isForm) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const resp = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: payload,
  });

  if (resp.status === 401) {
    Auth.clear();
    window.location.href = "index.html";
    throw new Error("Session expired, please log in again.");
  }

  if (!resp.ok) {
    let detail = `Request failed (${resp.status})`;
    try {
      const err = await resp.json();
      detail = err.detail || detail;
    } catch (_) {
      /* ignore */
    }
    const error = new Error(detail);
    error.status = resp.status;
    throw error;
  }

  if (resp.status === 204) return null;
  return resp.json();
}

async function login(employeeCode, password) {
  const form = new URLSearchParams();
  form.append("username", employeeCode);
  form.append("password", password);

  const resp = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });

  if (!resp.ok) {
    let detail = "Invalid employee code or password";
    try {
      const err = await resp.json();
      detail = err.detail || detail;
    } catch (_) {
      /* ignore */
    }
    throw new Error(detail);
  }
  return resp.json();
}

function money(n) {
  const value = Number(n || 0);
  return "₹" + value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function statusPill(status) {
  const s = (status || "UNPAID").toLowerCase();
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return `<span class="pill ${s}">${label}</span>`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------- Shared date-range filter widget ----------
// renderDateFilter("someContainerId", (from, to) => { ... }) draws preset
// buttons (Today / Last 5 days / Last week / Last month / Custom / All
// time) into the container and calls onApply(from, to) whenever the
// selection changes. from/to are "YYYY-MM-DD" strings or null for "no
// bound" (All time -> both null).

function _formatDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function _daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function renderDateFilter(containerId, onApply) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="date-filter-presets">
      <button type="button" class="secondary df-btn active" data-preset="all">All time</button>
      <button type="button" class="secondary df-btn" data-preset="1">Today</button>
      <button type="button" class="secondary df-btn" data-preset="5">Last 5 days</button>
      <button type="button" class="secondary df-btn" data-preset="7">Last week</button>
      <button type="button" class="secondary df-btn" data-preset="30">Last month</button>
      <button type="button" class="secondary df-btn" data-preset="custom">Custom</button>
    </div>
    <div class="date-filter-custom" style="display:none; margin-top:10px;">
      <div class="field-row">
        <div><label>From</label><input type="date" class="df-from" /></div>
        <div><label>To</label><input type="date" class="df-to" /></div>
      </div>
      <button type="button" class="df-apply" style="margin-top:8px;">Apply</button>
    </div>
  `;

  const buttons = container.querySelectorAll(".df-btn");
  const customBox = container.querySelector(".date-filter-custom");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const preset = btn.dataset.preset;

      if (preset === "custom") {
        customBox.style.display = "block";
        return;
      }
      customBox.style.display = "none";

      if (preset === "all") {
        onApply(null, null);
        return;
      }
      const n = parseInt(preset, 10);
      const from = _formatDateLocal(_daysAgo(n - 1)); // "Today" (n=1) -> daysAgo(0) = today
      const to = _formatDateLocal(new Date());
      onApply(from, to);
    });
  });

  container.querySelector(".df-apply").addEventListener("click", () => {
    const from = container.querySelector(".df-from").value || null;
    const to = container.querySelector(".df-to").value || null;
    onApply(from, to);
  });
}
