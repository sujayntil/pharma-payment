// Point this at wherever the FastAPI backend is running.
// Local docker-compose: leave as-is, it matches http://localhost:8000.
// Deployed (e.g. Render): change this to your backend's live URL, e.g.
// "https://pharma-backend.onrender.com" -- no trailing slash.
const API_BASE = window.API_BASE || "http://localhost:8000";

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
    throw new Error(detail);
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
