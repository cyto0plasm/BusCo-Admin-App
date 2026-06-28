/**
 * BusCo — Buses Controller (controllers/buses.js)
 * ─────────────────────────────────────────────────
 * Replaces the makePage() buses entry in controllers/index.js.
 * Edit / create forms use dropdowns for route and driver
 * instead of raw ID text inputs.
 */

import { models }  from "../models/index.js";
import { BaseView } from "../views/BaseView.js";
import {
  ge, toast, openModal, closeModal, confirmDialog,
  gv, fmtDate, fmtId, badge, formField,
} from "../utils/dom.js";
import { guardRoute } from "../security.js";

const BUS_STATUS_OPTS = [
  { value: "IDLE",    label: "IDLE"    },
  { value: "ACTIVE",  label: "ACTIVE"  },
  { value: "ON_TRIP", label: "ON_TRIP" },
  { value: "BROKEN",  label: "BROKEN"  },
];

const actTd = id => `<td class="action-td">
  <button class="icon-btn edit-btn"   data-id="${id}" title="Edit">✎</button>
  <button class="icon-btn delete-btn" data-id="${id}" title="Delete">⌫</button>
</td>`;

export async function busesController() {
  if (!guardRoute("buses")) return;

  // ── Fetch reference data for dropdowns ───────────────────────
  let routes = [], drivers = [], busesForStatusCheck = [];
  try {
    [routes, drivers, busesForStatusCheck] = await Promise.all([
      models.route.list({ select: "route_id,name,number_line" }),
      models.driver.list({ select: "driver_id,name" }),
      models.bus.list({ select: "bus_id,id_driver,number_bus" }) // Added to find occupied drivers
    ]);
    routes  = routes  || [];
    drivers = drivers || [];
    busesForStatusCheck = busesForStatusCheck || [];
  } catch (e) {
    toast("Could not load reference data: " + e.message, "error");
  }

  // Create a quick lookup map of who is driving what right now
  const occupiedDriversMap = new Map();
  busesForStatusCheck.forEach(b => {
    if (b.id_driver) {
      occupiedDriversMap.set(String(b.id_driver), b.number_bus);
    }
  });

  const routeOpts = [
    { value: "", label: "— No route —" },
    ...routes.map(r => ({ value: String(r.route_id), label: `${r.number_line} · ${r.name}` })),
  ];

  // Dynamic helper to build driver lists while keeping current assignment valid
  const getDriverOptsForBus = (currentBusDriverId = null) => {
    return [
      { value: "", label: "— Unassigned —" },
      ...drivers.map(d => {
        const driverIdStr = String(d.driver_id);
        const assignedBusNum = occupiedDriversMap.get(driverIdStr);
        
        let label = `#${d.driver_id} · ${d.name}`;
        // If driver is busy elsewhere, flag them. If they are on THIS bus, leave them clean.
        if (assignedBusNum && driverIdStr !== String(currentBusDriverId ?? "")) {
          label += ` [Busy: ${assignedBusNum}]`;
        }

        return { value: driverIdStr, label };
      }),
    ];
  };

  // Helper: find label for a given id in an options array
  const findLabel = (opts, id) => opts.find(o => String(o.value) === String(id ?? ""))?.label ?? `#${id}`;

  const view = new BaseView({
    title:      "Buses",
    subtitle:   "Fleet — status, GPS, assignments",
    addLabel:   "Add Bus",
    cols:       ["ID", "Bus No.", "Route", "Driver", "Status", "Today", "GPS", ""],
    primaryKey: "bus_id",

    rowHTML: b => `<tr>
      <td>${fmtId(b.bus_id)}</td>
      <td class="name-cell">${b.number_bus ?? "—"}</td>
      <td>${b.route_id
        ? `<span class="badge badge-blue">${findLabel(routeOpts, b.route_id)}</span>`
        : '<span class="nil">—</span>'}</td>
      <td>${b.id_driver
        ? `<span class="badge badge-slate">${findLabel(getDriverOptsForBus(b.id_driver), b.id_driver)}</span>`
        : '<span class="nil">Unassigned</span>'}</td>
      <td>${badge(b.status)}</td>
      <td><span class="badge badge-slate">${b.count_today_trips ?? 0}</span></td>
      <td class="mono sm">${b.gps_lat
        ? `${parseFloat(b.gps_lat).toFixed(4)}, ${parseFloat(b.gps_lng).toFixed(4)}`
        : '<span class="nil">—</span>'}</td>
      ${actTd(b.bus_id)}
    </tr>`,

 createFormHTML: () => `
      ${formField({ id: "bf0", label: "Bus Number", placeholder: "BUS-003", required: true })}
      ${formField({ id: "bf1", label: "Status",  options: BUS_STATUS_OPTS, value: "IDLE" })}
      <div class="form-group full">
        ${formField({ id: "bf3", label: "Driver",  options: getDriverOptsForBus(null), value: "" })}
      </div>
      ${formField({ id: "bf2", label: "Route",   options: routeOpts,       value: "" })}`,

    onCreateSubmit: () => models.bus.create({
      number_bus:        gv("bf0"),
      status:            gv("bf1") || "IDLE",
      route_id:          parseInt(gv("bf2")) || null,
      id_driver:         parseInt(gv("bf3")) || null,
      count_today_trips: 0,
    }),

 editFormHTML: b => `
      ${formField({ id: "bf0", label: "Bus Number", value: b.number_bus, required: true })}
      ${formField({ id: "bf1", label: "Status",  options: BUS_STATUS_OPTS, value: b.status })}
      <div class="form-group full">
        ${formField({ id: "bf3", label: "Driver",  options: getDriverOptsForBus(b.id_driver), value: String(b.id_driver ?? "") })}
      </div>
      ${formField({ id: "bf2", label: "Route",   options: routeOpts,       value: String(b.route_id ?? "") })}
      ${formField({ id: "bf4", label: "Today Trips", type: "number", value: b.count_today_trips ?? 0 })}`,
      
    onEditSubmit: id => models.bus.update(id, {
      number_bus:        gv("bf0"),
      status:            gv("bf1"),
      route_id:          parseInt(gv("bf2")) || null,
      id_driver:         parseInt(gv("bf3")) || null,
      count_today_trips: parseInt(gv("bf4")) || 0,
    }),

    onDelete:    id => models.bus.delete(id),
    deleteLabel: b  => b?.number_bus ?? `Bus #${b?.bus_id}`,
    onRefresh:   load,
  });

  function load() {
    view.renderSkeleton();
    models.bus.list().then(rows => view.renderRows(rows || [])).catch(e => view.renderError(e.message));
  }

  load();
}