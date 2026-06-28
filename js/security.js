/**
 * BusCo — Security & RBAC (js/security.js)
 * ──────────────────────────────────────────
 * Role-Based Access Control enforced on the client side.
 * The authoritative enforcement lives in Supabase RLS policies (rls_policies.sql).
 * This module is a UX guard — it hides unauthorised routes from the nav,
 * disables write buttons before render, and short-circuits controllers.
 *
 * Roles (from Admins.Role column):
 *   SUPER_ADMIN    — full access: read + write on everything
 *   BUS_ADMIN      — fleet operations: buses, drivers, trips, stations, incidents
 *   FINANCE_ADMIN  — finance read + reports: transactions, recharges, transfers, wallets (read-only)
 *
 * Every permission check ultimately defers to getSession() so it always
 * reflects the live session — no stale cached role.
 */

import { getSession } from "./auth.js";

// ── Permission matrix ──────────────────────────────────────────
// Each route maps to { read: roles[], write: roles[] }
// 'write' means INSERT / UPDATE / DELETE in the dashboard UI.
export const ROUTE_PERMS = {
  dashboard:    { read: ["SUPER_ADMIN", "BUS_ADMIN", "FINANCE_ADMIN"], write: [] },
  analytics:    { read: ["SUPER_ADMIN", "BUS_ADMIN", "FINANCE_ADMIN"], write: [] },
  profile:      { read: ["SUPER_ADMIN", "BUS_ADMIN", "FINANCE_ADMIN"], write: ["SUPER_ADMIN", "BUS_ADMIN", "FINANCE_ADMIN"] },

  // People
  users:        { read: ["SUPER_ADMIN", "FINANCE_ADMIN"],              write: ["SUPER_ADMIN"] },
  cards:        { read: ["SUPER_ADMIN", "BUS_ADMIN"],                  write: ["SUPER_ADMIN", "BUS_ADMIN"] },
  wallets:      { read: ["SUPER_ADMIN", "FINANCE_ADMIN"],              write: ["SUPER_ADMIN", "FINANCE_ADMIN"] },
  drivers:      { read: ["SUPER_ADMIN", "BUS_ADMIN"],                  write: ["SUPER_ADMIN", "BUS_ADMIN"] },

  // Fleet
  buses:        { read: ["SUPER_ADMIN", "BUS_ADMIN"],                  write: ["SUPER_ADMIN", "BUS_ADMIN"] },
  trips:        { read: ["SUPER_ADMIN", "BUS_ADMIN"],                  write: ["SUPER_ADMIN", "BUS_ADMIN"] },
  stations:     { read: ["SUPER_ADMIN", "BUS_ADMIN", "FINANCE_ADMIN"], write: ["SUPER_ADMIN", "BUS_ADMIN"] },

    map:    { read: ["SUPER_ADMIN", "BUS_ADMIN"],            write: ["SUPER_ADMIN", "BUS_ADMIN"] },
  routes: { read: ["SUPER_ADMIN", "BUS_ADMIN"],            write: ["SUPER_ADMIN", "BUS_ADMIN"] },
 

  // Finance
  transactions: { read: ["SUPER_ADMIN", "FINANCE_ADMIN"],              write: [] },  // immutable ledger
  recharge:     { read: ["SUPER_ADMIN", "FINANCE_ADMIN"],              write: [] },  // immutable ledger
  transfers:    { read: ["SUPER_ADMIN", "FINANCE_ADMIN"],              write: [] },  // immutable ledger

  // Operations
  incidents:    { read: ["SUPER_ADMIN", "BUS_ADMIN"],                  write: ["SUPER_ADMIN", "BUS_ADMIN"] },
  logs:         { read: ["SUPER_ADMIN"],                               write: [] },  // immutable audit trail
  admins:       { read: ["SUPER_ADMIN"],                               write: ["SUPER_ADMIN"] },
};

// ── Core helpers ───────────────────────────────────────────────

/** Return current role or null if no session. */
export function currentRole() {
  return getSession()?.role ?? null;
}

/** True if the current admin can READ the given route. */
export function canRead(routeId) {
  const role = currentRole();
  if (!role) return false;
  return (ROUTE_PERMS[routeId]?.read ?? []).includes(role);
}

/** True if the current admin can WRITE (create/update/delete) on the given route. */
export function canWrite(routeId) {
  const role = currentRole();
  if (!role) return false;
  return (ROUTE_PERMS[routeId]?.write ?? []).includes(role);
}

/**
 * Guard a controller: if the session lacks READ permission, render an
 * "Access Denied" screen and return false. Call at the top of every controller.
 *
 * Usage:
 *   export async function usersController() {
 *     if (!guardRoute("users")) return;
 *     // … rest of controller
 *   }
 */
export function guardRoute(routeId) {
  if (canRead(routeId)) return true;

  const { ge } = window._busco_dom ?? {};
  const main = document.getElementById("main");
  if (main) {
    const role = currentRole() ?? "none";
    main.innerHTML = `
      <div class="page-anim access-denied">
        <div class="ad-icon">⊗</div>
        <h2 class="ad-title">Access Denied</h2>
        <p class="ad-body">
          Your role <strong>${role}</strong> does not have permission to view
          <strong>${routeId}</strong>.
        </p>
        <p class="ad-hint">Contact your system administrator if you believe this is an error.</p>
      </div>`;
  }
  return false;
}

/**
 * Filter the ROUTES array to only those the current session can read.
 * Used by the router to build the sidebar.
 */
export function allowedRoutes(routes) {
  return routes.filter(r => canRead(r.id));
}

/**
 * After a controller renders its page, call this to hide/disable all
 * action buttons (Add, Edit ✎, Delete ⌫) when the role is read-only.
 * Operates on document.getElementById("main").
 */
export function applyWriteGuards(routeId) {
  if (canWrite(routeId)) return; // nothing to hide

  // Disable Add button
  document.querySelectorAll(".btn-primary[data-action='add'], .add-btn, [data-action='add']")
    .forEach(el => { el.disabled = true; el.title = "Read-only — insufficient role"; el.style.opacity = ".4"; el.style.cursor = "not-allowed"; });

  // Hide edit/delete icon buttons
  document.querySelectorAll(".edit-btn, .delete-btn, .topup-btn, .block-btn")
    .forEach(el => { el.style.display = "none"; });

  // Remove the actions column header if present
  const main = document.getElementById("main");
  if (main) {
    main.querySelectorAll("thead th:last-child").forEach(th => {
      if (th.textContent.trim() === "" || th.textContent.trim() === "Actions") th.style.display = "none";
    });
  }
}
