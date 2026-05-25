/**
 * BusCo — Router (js/router.js)
 * ──────────────────────────────
 * Client-side router. Integrates with security.js to:
 *  1. Build a sidebar showing only routes the current role can access.
 *  2. Refuse navigation to unauthorised routes (renders access-denied).
 */

import { ROUTES, NAV_GROUPS }      from "./config.js";
import { ge }                       from "./utils/dom.js";
import { allowedRoutes, guardRoute, applyWriteGuards, canRead } from "./security.js";
import {
  dashboardController,
  usersController,
  cardsController,
  walletsController,
  driversController,
  busesController,
  tripsController,
  stationsController,
  transactionsController,
  rechargeController,
  transfersController,
  incidentsController,
  logsController,
  adminsController,
} from "./controllers/index.js";
import { analyticsController } from "./controllers/analytics.js";
import { profileController }   from "./controllers/profile.js";

const CONTROLLERS = {
  dashboard:    dashboardController,
  analytics:    analyticsController,
  profile:      profileController,
  users:        usersController,
  cards:        cardsController,
  wallets:      walletsController,
  drivers:      driversController,
  buses:        busesController,
  trips:        tripsController,
  stations:     stationsController,
  transactions: transactionsController,
  recharge:     rechargeController,
  transfers:    transfersController,
  incidents:    incidentsController,
  logs:         logsController,
  admins:       adminsController,
};

export function buildSidebar() {
  // Only show routes the current role is allowed to read
  const visible = allowedRoutes(ROUTES);

  const groups = {};
  visible.forEach(r => {
    if (!groups[r.group]) groups[r.group] = [];
    groups[r.group].push(r);
  });

  ge("sidebarNav").innerHTML = Object.entries(NAV_GROUPS).map(([key, label]) => {
    const routes = groups[key] ?? [];
    if (!routes.length) return "";
    return `
      <div class="nav-group">
        <div class="nav-group-title">${label}</div>
        ${routes.map(r => `
          <button class="nav-item" data-route="${r.id}">
            <span class="nav-icon">${r.icon}</span>
            <span class="nav-label">${r.label}</span>
          </button>
        `).join("")}
      </div>`;
  }).join("");
}

export function navigate(routeId, pushState = true) {
  // Security: if user somehow navigates to a restricted route, block it
  if (!canRead(routeId) && routeId !== "dashboard") {
    routeId = "dashboard";
  }

  const route = ROUTES.find(r => r.id === routeId) ?? ROUTES[0];

  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.route === route.id);
  });

  const bc = ge("breadcrumb");
  if (bc) bc.textContent = route.label;

  if (pushState) history.pushState({ route: route.id }, "", `#${route.id}`);

  const controller = CONTROLLERS[route.id];
  if (controller) {
    controller();
    // After controller renders, apply write guards based on role
    requestAnimationFrame(() => applyWriteGuards(route.id));
  }
}

export function initRouter() {
  buildSidebar();

  ge("sidebarNav").addEventListener("click", e => {
    const btn = e.target.closest(".nav-item[data-route]");
    if (btn) navigate(btn.dataset.route);
  });

  window.addEventListener("popstate", e => {
    if (e.state?.route) navigate(e.state.route, false);
  });

  // Default to first allowed route
  const initial = location.hash.slice(1) || "dashboard";
  navigate(initial, false);
}
