/**
 * BusCo — DOM Utilities (utils/dom.js)
 * ──────────────────────────────────────
 * Reusable helpers for rendering, formatting, toast, modal, confirm dialog.
 */

// ── Selectors ─────────────────────────────────────────────────
export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
export const ge = id => document.getElementById(id);

// ── Formatters ─────────────────────────────────────────────────
export function fmtDate(v) {
  if (!v) return '<span class="nil">—</span>';
  return new Date(v).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function fmtMoney(v) {
  if (v === null || v === undefined) return '<span class="nil">—</span>';
  const n = parseFloat(v).toFixed(2);
  return `<span class="money">${n} <span class="currency">EGP</span></span>`;
}

export function fmtId(v) {
  if (v === null || v === undefined) return '<span class="nil">—</span>';
  return `<span class="row-id">#${v}</span>`;
}

export function badge(status) {
  if (!status) return '<span class="nil">—</span>';
  const map = {
    ACTIVE:        "badge-green",
    IDLE:          "badge-slate",
    BROKEN:        "badge-red",
    SUCCESS:       "badge-green",
    FAILED:        "badge-red",
    PENDING:       "badge-amber",
    DEBIT:         "badge-red",
    CREDIT:        "badge-green",
    LOW:           "badge-green",
    MEDIUM:        "badge-amber",
    HIGH:          "badge-red",
    SUPER_ADMIN:   "badge-indigo",
    BUS_ADMIN:     "badge-blue",
    FINANCE_ADMIN: "badge-teal",
    TOPUP_OPERATOR:"badge-slate",
    COMPANY_ADMIN: "badge-indigo",
  };
  const cls = map[status] ?? "badge-slate";
  return `<span class="badge ${cls}">${status}</span>`;
}

// ── Empty / loading states ──────────────────────────────────────
export function emptyRow(cols, msg = "No records found") {
  return `<tr><td colspan="${cols}" class="empty-cell">${msg}</td></tr>`;
}

export function loadingRow(cols) {
  return `<tr><td colspan="${cols}" class="loading-cell">
    <span class="spinner"></span> Loading…
  </td></tr>`;
}

// ── Toast ──────────────────────────────────────────────────────
const toastQueue = [];

export function toast(message, type = "info", duration = 3500) {
  const container = ge("toastContainer");
  if (!container) return;

  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  const icons = { info: "◈", success: "✓", error: "✕", warning: "△" };
  el.innerHTML = `
    <span class="toast-icon">${icons[type] ?? "◈"}</span>
    <span class="toast-msg">${message}</span>
    <button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>
  `;
  container.appendChild(el);

  // Animate in
  requestAnimationFrame(() => el.classList.add("toast-visible"));

  // Auto remove
  setTimeout(() => {
    el.classList.remove("toast-visible");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
  }, duration);
}

// ── Modal ──────────────────────────────────────────────────────
export function openModal({ title, body, footer, size = "md" }) {
  const overlay = ge("modalOverlay");
  const modal   = ge("modal");
  if (!overlay || !modal) return;

  modal.dataset.size = size;
  ge("modalTitle").textContent = title;
  ge("modalBody").innerHTML    = body;
  ge("modalFooter").innerHTML  = footer ?? `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
  `;
  overlay.classList.add("open");
  // Focus first input
  setTimeout(() => modal.querySelector("input,select,textarea")?.focus(), 80);
}

export function closeModal() {
  ge("modalOverlay")?.classList.remove("open");
}

// ── Confirm Dialog ─────────────────────────────────────────────
export function confirmDialog({ title, message, onConfirm, danger = true }) {
  const overlay = ge("confirmOverlay");
  if (!overlay) return;

  ge("confirmTitle").textContent   = title;
  ge("confirmMessage").textContent = message;

  const btn = ge("confirmOk");
  btn.className = danger ? "btn btn-danger" : "btn btn-primary";
  btn.onclick   = () => { closeConfirm(); onConfirm(); };

  overlay.classList.add("open");
}

export function closeConfirm() {
  ge("confirmOverlay")?.classList.remove("open");
}

// ── Form helpers ───────────────────────────────────────────────
export function gv(id) {
  const el = ge(id);
  return el ? el.value.trim() : "";
}

export function formField({
  id, label, type = "text", value = "", placeholder = "",
  options = null, required = false, fullWidth = false,
}) {
  const req  = required ? '<span class="req">*</span>' : "";
  const cls  = fullWidth ? "form-group full" : "form-group";
  const val  = String(value ?? "").replace(/"/g, "&quot;");

  if (options) {
    const opts = options.map(o =>
      `<option value="${o.value}" ${String(value) === String(o.value) ? "selected" : ""}>${o.label}</option>`
    ).join("");
    return `<div class="${cls}">
      <label class="f-label" for="${id}">${label}${req}</label>
      <select class="f-select" id="${id}">${opts}</select>
    </div>`;
  }

  if (type === "textarea") {
    return `<div class="${cls}">
      <label class="f-label" for="${id}">${label}${req}</label>
      <textarea class="f-input f-textarea" id="${id}" placeholder="${placeholder}">${val}</textarea>
    </div>`;
  }

  return `<div class="${cls}">
    <label class="f-label" for="${id}">${label}${req}</label>
    <input class="f-input" id="${id}" type="${type}" value="${val}" placeholder="${placeholder}">
  </div>`;
}
