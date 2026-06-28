import { models }   from "../models/index.js";
import { api }      from "../utils/api.js";
import {
  ge, toast, openModal, closeModal, gv, formField,
} from "../utils/dom.js";
import { guardRoute, canWrite } from "../security.js";
import { BaseView }  from "../views/BaseView.js";

const actTd = id => `<td class="action-td">
  <button class="icon-btn edit-btn"   data-id="${id}" title="Edit">✎</button>
  <button class="icon-btn delete-btn" data-id="${id}" title="Delete">⌫</button>
</td>`;

// ── Stop manager HTML ──────────────────────────────────────────
function stopManagerHTML(stops, stations, routeId) {
  const stationMap  = Object.fromEntries(stations.map(s => [s.station_id, s]));
  // Stations not yet used in this route (for the add dropdown)
  const usedIds     = new Set(stops.map(s => s.station_id));
  const available   = stations.filter(s => !usedIds.has(s.station_id));

  const stationOpts = [
    `<option value="">— pick a station —</option>`,
    ...available.map(s => `<option value="${s.station_id}">#${s.station_id} · ${s.name}</option>`),
  ].join("");

  const stopRows = stops.map((rs, idx) => {
    const st = stationMap[rs.station_id];
    return `
      <div class="sm-row" data-stop-id="${rs.id}" data-station-id="${rs.station_id}">
        <span class="sm-order">${idx + 1}</span>
        <span class="sm-name">${st ? st.name : `Station #${rs.station_id}`}</span>
        <input class="sm-est-inline" type="number" min="0" placeholder="min"
               value="${rs.estimated_minutes ?? ''}"
               data-stop-id="${rs.id}" title="Estimated minutes">
        <div class="sm-btns">
          <button class="icon-btn sm-up"   data-idx="${idx}" ${idx === 0 ? "disabled" : ""} title="Move up">↑</button>
          <button class="icon-btn sm-down" data-idx="${idx}" ${idx === stops.length - 1 ? "disabled" : ""} title="Move down">↓</button>
          <button class="icon-btn sm-del"  data-station-id="${rs.station_id}" title="Remove">⌫</button>
        </div>
      </div>`;
  }).join("");

  return `
    <div class="sm-wrap">
      <div class="sm-list" id="smList">
        ${stopRows || '<p class="sm-empty">No stops yet — add stations below.</p>'}
      </div>
      <div class="sm-add-row">
        <select class="f-select sm-station-sel" id="smStation"
          ${available.length === 0 ? "disabled" : ""}>${stationOpts}</select>
        <input class="f-input sm-est-inp" id="smEst" type="number" min="0" placeholder="mins (opt.)">
        <button class="btn btn-ghost sm-add-btn" id="smAdd"
          ${!routeId ? "disabled title='Save the route first'" : ""}>+ Add Stop</button>
      </div>
      ${!routeId ? '<p class="sm-hint">Save the route above first, then add stops.</p>' : ''}
    </div>`;
}

// ── Renumber all stops 1…n after any change ───────────────────
// Avoids unique constraint collisions on subsequent reorders.
async function renumberStops(routeId, stops) {
  // Assign a safe temp range first (1000+) then real order
  // to avoid any transient conflicts during update
  const TEMP_BASE = 10000;
  // Step 1: move all to temp
  await Promise.all(stops.map((rs, i) =>
    api.rpc("admin_reorder_stop", {
      p_route_id:   routeId,
      p_station_id: rs.station_id,
      p_new_order:  TEMP_BASE + i,
    })
  ));
  // Step 2: assign real sequential order
  await Promise.all(stops.map((rs, i) =>
    api.rpc("admin_reorder_stop", {
      p_route_id:   routeId,
      p_station_id: rs.station_id,
      p_new_order:  i + 1,
    })
  ));
}

// ── Modal body HTML ───────────────────────────────────────────
function modalBody(route, stops, stations) {
  const isNew = !route;
  return `
    <div class="form-grid" style="margin-bottom:4px">
      ${formField({ id:"re0", label:"Route Name",  value: route?.name        ?? "", placeholder:"Cairo Line 1", required:true, fullWidth:true })}
      ${formField({ id:"re1", label:"Line Number", value: route?.number_line ?? "", placeholder:"L1",           required:true })}
      ${formField({ id:"re2", label:"Fare (EGP)",  type:"number", value: route?.fare ?? "5.00", placeholder:"5.00" })}
    </div>
    <div class="sm-section-head">
      Stops
      ${!isNew ? `<span class="sm-head-count" id="smCount">${stops.length} stop${stops.length !== 1 ? "s" : ""}</span>` : ""}
    </div>
    <div id="smContainer">${stopManagerHTML(stops, stations, isNew ? null : route.route_id)}</div>`;
}

// ── Controller ─────────────────────────────────────────────────
export async function routesController() {
  if (!guardRoute("routes")) return;

  const write = canWrite("routes");

  // Pre-fetch stations once per controller load
  let allStations = [];
  try {
    allStations = await models.station.list({ select: "station_id,name" }) || [];
  } catch (e) {
    toast("Could not load stations: " + e.message, "error");
  }

  const view = new BaseView({
    title:      "Routes",
    subtitle:   "Bus lines and stop sequences",
    addLabel:   write ? "New Route" : null,
    cols:       ["ID", "Name", "Line", "Fare (EGP)", "Stops", ""],
    primaryKey: "route_id",
    rowHTML: r => `<tr>
      <td><span class="row-id">#${r.route_id}</span></td>
      <td class="name-cell">${r.name ?? "—"}</td>
      <td><span class="badge badge-blue">${r.number_line ?? "—"}</span></td>
      <td class="mono sm">${parseFloat(r.fare ?? 0).toFixed(2)}</td>
      <td><span class="badge badge-slate">${r["route_stops"]?.[0]?.count ?? 0}</span></td>
      ${actTd(r.route_id)}
    </tr>`,
    createFormHTML: null,  // handled manually
    editFormHTML:   null,
    onCreateSubmit: null,
    onEditSubmit:   null,
    onDelete:       id => models.route.delete(id),
    deleteLabel:    r  => r?.name ?? `Route #${r?.route_id}`,
    onRefresh:      load,
  });

  function load() {
    view.renderSkeleton();
    models.route.listWithStopCount()
      .then(rows => {
        view.renderRows(rows || []);

        // Add button
        ge("addBtn")?.addEventListener("click", () => openCreateModal());

        // Edit button
        ge("tableCard")?.addEventListener("click", e => {
          const eb = e.target.closest(".edit-btn");
          if (!eb) return;
          const row = view._rows.find(r => String(r.route_id) === String(eb.dataset.id));
          if (row) openEditModal(row);
        });
      })
      .catch(e => view.renderError(e.message));
  }

  // ════════════════════════════════════════════════════════════
  //  CREATE MODAL
  //  Phase 1: fill name/line/fare → "Create Route"
  //  Phase 2: stop manager unlocks, user adds stops → "Done"
  // ════════════════════════════════════════════════════════════
  async function openCreateModal() {
    let createdRouteId = null;

    openModal({
      title: "New Route",
      size:  "lg",
      body:  modalBody(null, [], allStations),
      footer: `
        <button class="btn btn-ghost" id="reCancel">Cancel</button>
        <button class="btn btn-primary" id="reSave">Create Route</button>`,
    });

    ge("reCancel")?.addEventListener("click", () => {
      if (createdRouteId) load(); // refresh if route was already created
      closeModal();
    });

    ge("reSave")?.addEventListener("click", async () => {
      const name       = gv("re0");
      const numberLine = gv("re1");
      const fare       = parseFloat(gv("re2")) || 0;

      if (!name)       { toast("Route name is required", "error");   return; }
      if (!numberLine) { toast("Line number is required", "error");  return; }

      const btn = ge("reSave");
      btn.disabled = true; btn.textContent = "Creating…";

      try {
        const res = await api.rpc("admin_create_route", {
          p_name:        name,
          p_number_line: numberLine,
          p_fare:        fare,
        });
        if (res?.success === false) throw new Error(res.message ?? "Create failed");

        createdRouteId = res.route_id;
        toast("Route created — now add stops below", "success");

        // Switch footer to "Done" and unlock stop manager
        btn.textContent = "Done";
        btn.disabled    = false;
        btn.onclick     = () => { closeModal(); load(); };

        // Also update cancel to refresh
        ge("reCancel").textContent = "Close";

        // Disable the route meta fields (route is saved)
        ["re0","re1","re2"].forEach(id => {
          const el = ge(id);
          if (el) { el.disabled = true; el.style.opacity = ".6"; }
        });

        // Re-render stop manager with the new routeId unlocked
        const container = ge("smContainer");
        if (container) {
          container.innerHTML = stopManagerHTML([], allStations, createdRouteId);
          attachStopManager(createdRouteId, [], allStations);
        }

      } catch (e) {
        const msg = e.message.includes("unique") || e.message.includes("duplicate")
          ? `Line number "${gv("re1")}" already exists — choose a different one.`
          : e.message;
        toast(msg, "error");
        btn.disabled = false; btn.textContent = "Create Route";
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  //  EDIT MODAL
  // ════════════════════════════════════════════════════════════
  async function openEditModal(route) {
    let stops = [];
    try {
      stops = await models.routeStop.listByRoute(route.route_id) || [];
    } catch (e) { toast("Load error: " + e.message, "error"); return; }

    openModal({
      title: `Edit Route — ${route.name}`,
      size:  "lg",
      body:  modalBody(route, stops, allStations),
      footer: `
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="reSave">Save Route</button>`,
    });

    ge("reSave")?.addEventListener("click", async () => {
      const name       = gv("re0");
      const numberLine = gv("re1");
      if (!name)       { toast("Route name is required", "error");  return; }
      if (!numberLine) { toast("Line number is required", "error"); return; }

      const btn = ge("reSave");
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        await models.route.update(route.route_id, {
          name:        name,
          number_line: numberLine,
          fare:        parseFloat(gv("re2")) || 0,
        });
        closeModal();
        toast("Route saved", "success");
        load();
      } catch (e) {
        const msg = e.message.includes("unique") || e.message.includes("duplicate")
          ? `Line number "${numberLine}" already exists — choose a different one.`
          : e.message;
        toast(msg, "error");
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Save Route"; }
      }
    });

    attachStopManager(route.route_id, stops, allStations);
  }

  // ════════════════════════════════════════════════════════════
  //  STOP MANAGER — shared by create + edit
  // ════════════════════════════════════════════════════════════
  function attachStopManager(routeId, stops, stations) {
    const container = ge("smContainer");
    if (!container) return;

    // Refresh stop list in place (keeps modal open)
    async function refresh() {
      stops = await models.routeStop.listByRoute(routeId) || [];
      container.innerHTML = stopManagerHTML(stops, stations, routeId);
      // Update count badge if present
      const countEl = ge("smCount");
      if (countEl) countEl.textContent = `${stops.length} stop${stops.length !== 1 ? "s" : ""}`;
      attachStopManager(routeId, stops, stations);
    }

    // ── Add stop ────────────────────────────────────────────
    ge("smAdd")?.addEventListener("click", async () => {
      const stationId = parseInt(ge("smStation")?.value);
      const estMin    = parseInt(ge("smEst")?.value) || null;
      if (!stationId) { toast("Pick a station first", "error"); return; }

      const nextOrder = stops.length
        ? Math.max(...stops.map(s => s.stop_order)) + 1
        : 1;

      try {
        const res = await api.rpc("admin_add_route_stop", {
          p_route_id:          routeId,
          p_station_id:        stationId,
          p_stop_order:        nextOrder,
          p_estimated_minutes: estMin,
        });
        if (res?.success === false) throw new Error(res.message ?? "Add failed");
        await refresh();
        toast("Stop added", "success");
      } catch (e) { toast(e.message, "error"); }
    });

    // ── Remove stop ─────────────────────────────────────────
    container.querySelectorAll(".sm-del").forEach(btn => {
      btn.addEventListener("click", async () => {
        const stationId = parseInt(btn.dataset.stationId);
        try {
          const res = await api.rpc("admin_remove_route_stop", {
            p_route_id:   routeId,
            p_station_id: stationId,
          });
          if (res?.success === false) throw new Error(res.message ?? "Remove failed");
          // Renumber remaining stops
          const remaining = stops.filter(s => s.station_id !== stationId);
          if (remaining.length) await renumberStops(routeId, remaining);
          await refresh();
          toast("Stop removed", "success");
        } catch (e) { toast(e.message, "error"); }
      });
    });

    // ── Move up (3-step swap to avoid unique constraint) ────
    container.querySelectorAll(".sm-up").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = parseInt(btn.dataset.idx);
        if (idx === 0) return;

        // Reorder in memory
        const reordered = [...stops];
        [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];

        try {
          await renumberStops(routeId, reordered);
          await refresh();
        } catch (e) { toast(e.message, "error"); }
      });
    });

    // ── Move down ───────────────────────────────────────────
    container.querySelectorAll(".sm-down").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = parseInt(btn.dataset.idx);
        if (idx >= stops.length - 1) return;

        const reordered = [...stops];
        [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];

        try {
          await renumberStops(routeId, reordered);
          await refresh();
        } catch (e) { toast(e.message, "error"); }
      });
    });

    // ── Inline estimated minutes edit ───────────────────────
    container.querySelectorAll(".sm-est-inline").forEach(input => {
      input.addEventListener("change", async () => {
        const stopId = parseInt(input.dataset.stopId);
        const mins   = parseInt(input.value) || null;
        try {
          await models.routeStop.update(stopId, { estimated_minutes: mins });
          toast("Time updated", "success");
        } catch (e) { toast(e.message, "error"); input.value = ""; }
      });
    });
  }

  load();
}