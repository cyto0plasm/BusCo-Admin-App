/**
 * BusCo — Stations Controller (controllers/stations.js)
 * ───────────────────────────────────────────────────────
 * Replaces the makePage stationsController in controllers/index.js.
 *
 * Improvements over the original:
 *  • Create / edit modal embeds a mini Leaflet map — click to drop a pin,
 *    lat/lng fields update automatically.
 *  • Manual lat/lng inputs still work and move the pin when typed.
 *  • No browser geolocation used (no surprise permission prompts).
 *  • Static Cairo-centre default view (30.0444, 31.2357).
 *
 * Drop-in wiring:
 *  1. import { stationsController } from "./stations.js";  in router.js
 *  2. Add  stations: stationsController  to CONTROLLERS map in router.js
 *  3. Remove / comment-out the stationsController makePage block in index.js
 */

import { models }   from "../models/index.js";
import { BaseView } from "../views/BaseView.js";
import {
  ge, toast, openModal, closeModal, confirmDialog,
  gv, fmtDate, fmtId,
} from "../utils/dom.js";
import { guardRoute } from "../security.js";
import { addGeocoder } from "../utils/geocoder.js";

// ── Shared ─────────────────────────────────────────────────────
const actTd = id => `<td class="action-td">
  <button class="icon-btn edit-btn"   data-id="${id}" title="Edit">✎</button>
  <button class="icon-btn delete-btn" data-id="${id}" title="Delete">⌫</button>
</td>`;

// Default map centre (Cairo)
const DEFAULT_LAT = 30.0444;
const DEFAULT_LNG = 31.2357;
const DEFAULT_ZOOM = 13;

// ── Ensure Leaflet is available ─────────────────────────────────
async function ensureLeaflet() {
  if (window.L) return;
  // CSS
  if (!document.querySelector('link[href*="leaflet"]')) {
    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }
  // JS
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src     = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload  = res;
    s.onerror = () => rej(new Error("Leaflet failed to load"));
    document.head.appendChild(s);
  });
}

// ── Build the modal body HTML ───────────────────────────────────
function stationFormHTML(station = null) {
  const name = station?.name        ?? "";
  const lat  = station?.location_lat ?? "";
  const lng  = station?.location_lng ?? "";

  return `
    <div class="stf-wrap">
      <!-- Name -->
      <div class="form-group full">
        <label class="f-label" for="stf-name">Station Name <span class="req">*</span></label>
        <input class="f-input" id="stf-name" type="text" value="${name}" placeholder="e.g. Tahrir Square">
      </div>

      <!-- Map picker -->
      <div class="stf-map-section">
        <div class="stf-map-label">
          <span>📍 Click the map to place the station</span>
          <button class="btn btn-ghost stf-reset-btn" id="stfReset" type="button">Reset pin</button>
        </div>
        <div id="stfMap" class="stf-map"></div>
      </div>

      <!-- Coord inputs (sync with map) -->
      <div class="stf-coords">
        <div class="form-group">
          <label class="f-label" for="stf-lat">Latitude</label>
          <input class="f-input" id="stf-lat" type="number" step="any"
                 value="${lat}" placeholder="30.044400">
        </div>
        <div class="form-group">
          <label class="f-label" for="stf-lng">Longitude</label>
          <input class="f-input" id="stf-lng" type="number" step="any"
                 value="${lng}" placeholder="31.235700">
        </div>
      </div>
    </div>`;
}

// ── Init the picker map inside the modal ────────────────────────
async function initPickerMap(existingLat, existingLng) {
  await ensureLeaflet();

  // Small delay to let the modal DOM paint
  await new Promise(r => setTimeout(r, 60));

  const el = ge("stfMap");
  if (!el) return null;

  const hasPin = existingLat && existingLng;
  const centerLat = hasPin ? parseFloat(existingLat) : DEFAULT_LAT;
  const centerLng = hasPin ? parseFloat(existingLng) : DEFAULT_LNG;

  const map = window.L.map("stfMap", { zoomControl: true })
    .setView([centerLat, centerLng], hasPin ? 15 : DEFAULT_ZOOM);

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  // Marker (draggable)
  let marker = null;

  function placeMarker(lat, lng) {
    if (marker) marker.setLatLng([lat, lng]);
    else {
      marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        setCoords(p.lat, p.lng);
      });
    }
  }

  function setCoords(lat, lng) {
    const latEl = ge("stf-lat");
    const lngEl = ge("stf-lng");
    if (latEl) latEl.value = lat.toFixed(7);
    if (lngEl) lngEl.value = lng.toFixed(7);
  }

  // If editing, drop pin immediately
  if (hasPin) placeMarker(centerLat, centerLng);

  // ── Geocoder inside the picker ───────────────────────────────
  addGeocoder(map, {
    placeholder: "Search location to navigate map…",
    flyTo: true,
    zoom: 16,
    // Don't auto-place pin on geocode result — user still clicks to confirm
    onResult: null,
  });

  // Click map → move / place pin
  map.on("click", e => {
    placeMarker(e.latlng.lat, e.latlng.lng);
    setCoords(e.latlng.lat, e.latlng.lng);
  });

  // Typing in inputs → move pin
  function onInputChange() {
    const lat = parseFloat(ge("stf-lat")?.value);
    const lng = parseFloat(ge("stf-lng")?.value);
    if (!isNaN(lat) && !isNaN(lng)) {
      placeMarker(lat, lng);
      map.setView([lat, lng], map.getZoom());
    }
  }
  ge("stf-lat")?.addEventListener("change", onInputChange);
  ge("stf-lng")?.addEventListener("change", onInputChange);

  // Reset button
  ge("stfReset")?.addEventListener("click", () => {
    if (marker) { map.removeLayer(marker); marker = null; }
    const latEl = ge("stf-lat"); const lngEl = ge("stf-lng");
    if (latEl) latEl.value = "";
    if (lngEl) lngEl.value = "";
    map.setView([DEFAULT_LAT, DEFAULT_LNG], DEFAULT_ZOOM);
  });

  // Invalidate size once modal is fully visible
  setTimeout(() => map.invalidateSize(), 120);

  return map;
}

// ── Controller ──────────────────────────────────────────────────
export async function stationsController() {
  if (!guardRoute("stations")) return;

  const view = new BaseView({
    title:      "Stations",
    subtitle:   "Bus stops and stations across the network",
    addLabel:   "Add Station",
    cols:       ["ID", "Name", "Latitude", "Longitude", "Created", ""],
    primaryKey: "station_id",

    rowHTML: s => `<tr>
      <td>${fmtId(s.station_id)}</td>
      <td class="name-cell">${s.name ?? "—"}</td>
      <td class="mono sm">${s.location_lat != null ? parseFloat(s.location_lat).toFixed(6) : "—"}</td>
      <td class="mono sm">${s.location_lng != null ? parseFloat(s.location_lng).toFixed(6) : "—"}</td>
      <td class="ts">${fmtDate(s.created_at)}</td>
      ${actTd(s.station_id)}
    </tr>`,

    // We handle modals manually to inject the map
    createFormHTML: null,
    editFormHTML:   null,
    onCreateSubmit: null,
    onEditSubmit:   null,

    onDelete:    id => models.station.delete(id),
    deleteLabel: s  => s?.name ?? `Station #${s?.station_id}`,
    onRefresh:   load,
  });

  function load() {
    view.renderSkeleton();
    models.station.list()
      .then(rows => {
        view.renderRows(rows || []);
        // Wire add button manually (BaseView skips it when createFormHTML is null)
        ge("addBtn")?.addEventListener("click", () => openCreateModal());
        // Wire edit clicks
        ge("tableCard")?.addEventListener("click", e => {
          const eb = e.target.closest(".edit-btn");
          if (!eb) return;
          const row = view._rows.find(r => String(r.station_id) === String(eb.dataset.id));
          if (row) openEditModal(row);
        });
      })
      .catch(e => view.renderError(e.message));
  }

  // ── Create modal ─────────────────────────────────────────────
  async function openCreateModal() {
    openModal({
      title: "New Station",
      size:  "lg",
      body:  stationFormHTML(null),
      footer: `
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="stfSubmit">Create Station</button>`,
    });

    await initPickerMap(null, null);

    ge("stfSubmit")?.addEventListener("click", async () => {
      const name = ge("stf-name")?.value.trim();
      const lat  = parseFloat(ge("stf-lat")?.value);
      const lng  = parseFloat(ge("stf-lng")?.value);
      if (!name) { toast("Station name is required", "error"); return; }

      const btn = ge("stfSubmit");
      btn.disabled = true; btn.textContent = "Creating…";
      try {
        await models.station.create({
          name,
          location_lat: isNaN(lat) ? null : lat,
          location_lng: isNaN(lng) ? null : lng,
        });
        closeModal();
        toast("Station created", "success");
        load();
      } catch (e) { toast(e.message, "error"); }
      finally { if (btn) { btn.disabled = false; btn.textContent = "Create Station"; } }
    });
  }

  // ── Edit modal ───────────────────────────────────────────────
  async function openEditModal(station) {
    openModal({
      title: `Edit Station — ${station.name}`,
      size:  "lg",
      body:  stationFormHTML(station),
      footer: `
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="stfSubmit">Save Changes</button>`,
    });

    await initPickerMap(station.location_lat, station.location_lng);

    ge("stfSubmit")?.addEventListener("click", async () => {
      const name = ge("stf-name")?.value.trim();
      const lat  = parseFloat(ge("stf-lat")?.value);
      const lng  = parseFloat(ge("stf-lng")?.value);
      if (!name) { toast("Station name is required", "error"); return; }

      const btn = ge("stfSubmit");
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        await models.station.update(station.station_id, {
          name,
          location_lat: isNaN(lat) ? null : lat,
          location_lng: isNaN(lng) ? null : lng,
        });
        closeModal();
        toast("Station updated", "success");
        load();
      } catch (e) { toast(e.message, "error"); }
      finally { if (btn) { btn.disabled = false; btn.textContent = "Save Changes"; } }
    });
  }

  load();
}