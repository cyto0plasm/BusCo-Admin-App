/**
 * BusCo — Auth Controller (js/auth.js)
 * ──────────────────────────────────────
 * Handles login, session, and logout.
 *
 * Login flow (RLS-safe):
 *  1. Browser hashes the entered password with SHA-256 (Web Crypto API)
 *  2. Calls the Postgres RPC  admin_login(email, hash)
 *     • That function runs as SECURITY DEFINER (bypasses RLS on admins table)
 *     • Verifies the hash server-side
 *     • Sets the session GUC variables (app.admin_role, app.admin_id)
 *     • Returns a safe JSON object — password_hash is NEVER in the response
 *  3. The returned data is stored in _session (memory only)
 *  4. All subsequent PostgREST requests carry the session GUC so RLS
 *     policies fire correctly for the logged-in role.
 *
 * Security hardening:
 *  • Password hash is computed client-side; plaintext never leaves the browser
 *  • Session lives in module-scoped memory only (no localStorage/sessionStorage)
 *  • Rate limiting: 5 failed attempts → 30s lockout
 *  • Idle timeout: 60 minutes of inactivity → automatic logout
 */

import { api }             from "./utils/api.js";
import { ge, toast }       from "./utils/dom.js";
import { initRouter }      from "./router.js";

// ── Constants ──────────────────────────────────────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 30_000;        // 30 seconds
const IDLE_TIMEOUT = 60 * 60 * 1000; // 60 minutes

// ── Module-private state ───────────────────────────────────────
let _session     = null;
let _idleTimer   = null;
let _attempts    = 0;
let _lockedUntil = 0;

export function getSession() { return _session; }

// ── Idle timer ─────────────────────────────────────────────────
function resetIdleTimer() {
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    if (_session) {
      toast("Session expired due to inactivity. Please sign in again.", "warning");
      performLogout();
    }
  }, IDLE_TIMEOUT);
}

function startIdleWatcher() {
  ["click", "keydown", "mousemove", "touchstart"].forEach(ev =>
    document.addEventListener(ev, resetIdleTimer, { passive: true })
  );
  resetIdleTimer();
}

function stopIdleWatcher() {
  ["click", "keydown", "mousemove", "touchstart"].forEach(ev =>
    document.removeEventListener(ev, resetIdleTimer)
  );
  clearTimeout(_idleTimer);
}

// ── Password hashing ───────────────────────────────────────────
// SHA-256 via Web Crypto — matches SHA2(password, 256) in PostgreSQL
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Show / hide pages ──────────────────────────────────────────
function showLoginPage() {
  ge("loginPage").classList.add("active");
  ge("appShell").classList.remove("active");
}

function showAppShell() {
  ge("loginPage").classList.remove("active");
  ge("appShell").classList.add("active");
  ge("sessionName").textContent = _session?.name ?? "Admin";

  const badge = ge("sessionRole");
  if (badge) badge.textContent = _session?.role ?? "";

  initRouter();
  startIdleWatcher();
}

// ── Logout ─────────────────────────────────────────────────────
function performLogout() {
  _session = null;
  api.clearSession();
  stopIdleWatcher();
  showLoginPage();
}

// ── Boot ───────────────────────────────────────────────────────
export function initAuth() {
  showLoginPage();

  const form  = ge("loginForm");
  const btn   = ge("loginBtn");
  const errEl = ge("loginError");

  form?.addEventListener("submit", async e => {
    e.preventDefault();

    // Rate-limit check
    if (Date.now() < _lockedUntil) {
      const secsLeft = Math.ceil((_lockedUntil - Date.now()) / 1000);
      errEl.textContent = `Too many failed attempts. Try again in ${secsLeft}s.`;
      errEl.classList.add("visible");
      return;
    }

    const email    = ge("loginEmail").value.trim();
    const password = ge("loginPassword")?.value ?? "";

    if (!email) {
      errEl.textContent = "Please enter your email.";
      errEl.classList.add("visible");
      return;
    }
    if (!password) {
      errEl.textContent = "Please enter your password.";
      errEl.classList.add("visible");
      return;
    }

    errEl.textContent = "";
    errEl.classList.remove("visible");
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Signing in…';

    try {
      // 1. Hash the password in the browser
      const hash = await sha256(password);

      // 2. Call the secure RPC — bypasses RLS, verifies hash, sets session GUC
      //    Returns: { admin_id, name, email, role, id_station, created_at }
      //    Throws a Postgres error if email/password is wrong
      const result = await api.rpc("admin_login", {
        p_email:    email,
        p_password: hash,
      });

      if (!result) throw new Error("Login failed — no response from server.");

      // result may be a JSON string or object depending on PostgREST version
      _session  = typeof result === "string" ? JSON.parse(result) : result;
      _attempts = 0;

      // Inject session role into every future API request (for RLS GUC).
      // Map the enum string (SUPER_ADMIN) to the lowercase form used by policies.
      const roleMap = {
        "SUPER_ADMIN":   "super_admin",
        "BUS_ADMIN":     "bus_admin",
        "FINANCE_ADMIN": "finance_admin",
      };
      const roleLower = roleMap[_session.role] ?? (_session.role || "").toLowerCase();
      api.setSession(_session.admin_id, roleLower);

      showAppShell();

    } catch (err) {
      _attempts++;
      if (_attempts >= MAX_ATTEMPTS) {
        _lockedUntil = Date.now() + LOCKOUT_MS;
        _attempts    = 0;
        errEl.textContent = `Too many failed attempts. Try again in ${LOCKOUT_MS / 1000}s.`;
      } else {
        // Show the server error (Postgres raises 'Invalid email or password.')
        // Strip Postgres boilerplate if present
        const msg = err.message
          .replace(/^ERROR:\s*/i, "")
          .replace(/\s*CONTEXT:.*$/s, "")
          .trim();
        const remaining = MAX_ATTEMPTS - _attempts;
        errEl.textContent = msg + (remaining < MAX_ATTEMPTS
          ? `  (${remaining} attempt${remaining !== 1 ? "s" : ""} left)`
          : "");
      }
      errEl.classList.add("visible");

    } finally {
      btn.disabled    = false;
      btn.innerHTML   = 'Sign In <span class="btn-arrow">→</span>';
    }
  });

  ge("logoutBtn")?.addEventListener("click", performLogout);
}
