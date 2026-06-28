/**
 * BusCo — Map Controller (controllers/map.js)
 * ─────────────────────────────────────────────
 * Live fleet map with:
 *  • KPI bar (collapsible) + expandable fullscreen map (Esc to exit)
 *  • Pin-style bus markers (ON_TRIP/ACTIVE/IDLE/BROKEN) + station dots
 *  • Hover tooltip (lightweight) + click side panel (full detail + edit)
 *  • Bus/station search pill (top-left map control)
 *  • Status filter pills (on-map overlay)
 *  • Geocoder collapsed to icon button (bottom-right)
 *  • Auto-refresh toggle (30s) with last-refreshed timestamp
 *  • Buses without GPS shown in collapsible card below map
 *  • Optimistic lock on save (updated_at check)
 *  • Confirm dialog on destructive / important operations
 */

import { models }               from "../models/index.js";
import { api }                  from "../utils/api.js";
import { ge, toast, confirmDialog } from "../utils/dom.js";
import { guardRoute, canWrite } from "../security.js";
import { addGeocoder }          from "../utils/geocoder.js";

// ── Constants ──────────────────────────────────────────────────
const GPS_STALE_MS   = null;   // null = warn only when gps_updated_at is null
const REFRESH_MS     = 30_000; // auto-refresh interval

// ── Status colour system ───────────────────────────────────────
const BUS_COLOR = {
  ON_TRIP: "#3DAA6A",
  ACTIVE:  "#4A90D9",
  IDLE:    "#8A9BB0",
  BROKEN:  "#C04848",
};
const BUS_BADGE = {
  ON_TRIP: "badge-green",
  ACTIVE:  "badge-blue",
  IDLE:    "badge-slate",
  BROKEN:  "badge-red",
};
function busColor(status) { return BUS_COLOR[status] ?? "#8A9BB0"; }
function busBadge(status) { return BUS_BADGE[status] ?? "badge-slate"; }

const ROUTE_PALETTE = [
  "#4A90D9","#3DAA6A","#C87830","#8860C8",
  "#2A9C8A","#C04848","#5858B4","#E8A838",
];

// ── GPS staleness ──────────────────────────────────────────────
function isStale(bus) {
  if (!bus.gps_updated_at) return true;
  if (GPS_STALE_MS === null) return false;
  return Date.now() - new Date(bus.gps_updated_at).getTime() > GPS_STALE_MS;
}

function fmtGpsAge(ts) {
  if (!ts) return "Never updated";
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1)   return "Just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── SVG marker factories ───────────────────────────────────────
function busPinSvg(color, stale = false) {
  const opacity = stale ? "0.55" : "0.95";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42" style="opacity:${opacity}">
    <defs>
      <filter id="ps" x="-40%" y="-20%" width="180%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#00000040"/>
      </filter>
    </defs>
    <path d="M16 1C8.27 1 2 7.27 2 15c0 10.5 14 26 14 26S30 25.5 30 15C30 7.27 23.73 1 16 1z"
          fill="${color}" filter="url(#ps)"/>
    <circle cx="16" cy="15" r="8" fill="white" opacity="0.9"/>
    <text x="16" y="19.5" text-anchor="middle" font-size="9"
          font-family="system-ui,sans-serif" font-weight="700"
          fill="${color}" letter-spacing="-0.3">BUS</text>
  </svg>`;
}

function stationDotSvg(color = "#2A9C8A") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="5.5" fill="${color}" stroke="white" stroke-width="2"/>
  </svg>`;
}

function makeIcon(svgStr, type) {
  const isBus = type === "bus";
  return window.L.divIcon({
    html:       svgStr,
    className:  "",
    iconSize:   isBus ? [32, 42] : [16, 16],
    iconAnchor: isBus ? [16, 42] : [8, 8],
    popupAnchor:[0, isBus ? -40 : -10],
  });
}

// ── Tooltip HTML (hover) ───────────────────────────────────────
function busTooltipHTML(bus, tripData) {
  const stale    = isStale(bus);
  const gpsAge   = fmtGpsAge(bus.gps_updated_at);
  const driver   = tripData?.driver_name ?? (bus.id_driver ? `Driver #${bus.id_driver}` : "—");
  const route    = tripData?.route_name  ?? (bus.route_id  ? `Route #${bus.route_id}`  : "—");

  return `<div class="mp-tooltip">
    <div class="mp-tt-header">
      <span class="mp-tt-num">${bus.number_bus ?? `Bus #${bus.bus_id}`}</span>
      <span class="badge ${busBadge(bus.status)} mp-tt-badge">${bus.status}</span>
    </div>
    <div class="mp-tt-rows">
      <div class="mp-tt-row"><span>Driver</span><span>${driver}</span></div>
      <div class="mp-tt-row"><span>Route</span><span>${route}</span></div>
      <div class="mp-tt-row"><span>Trips today</span><span>${bus.count_today_trips ?? 0}</span></div>
      <div class="mp-tt-row ${stale ? "mp-tt-stale" : ""}">
        <span>GPS</span><span>${stale ? "⚠ " : ""}${gpsAge}</span>
      </div>
    </div>
  </div>`;
}

function stationTooltipHTML(station, passingRoutes) {
  return `<div class="mp-tooltip">
    <div class="mp-tt-header">
      <span class="mp-tt-num">${station.name}</span>
      <span class="badge badge-teal mp-tt-badge">Station</span>
    </div>
    <div class="mp-tt-rows">
      <div class="mp-tt-row"><span>Routes</span><span>${passingRoutes.length ? passingRoutes.map(r => r.number_line ?? r.name).join(", ") : "—"}</span></div>
      <div class="mp-tt-row"><span>Coords</span><span class="mp-tt-mono">${parseFloat(station.location_lat).toFixed(4)}, ${parseFloat(station.location_lng).toFixed(4)}</span></div>
    </div>
  </div>`;
}

// ── Side panel HTML ────────────────────────────────────────────
function renderBusPanel(bus, routes, drivers, tripData) {
  const write  = canWrite("map");
  const color  = busColor(bus.status);
  const stale  = isStale(bus);
  const gpsAge = fmtGpsAge(bus.gps_updated_at);

  const statusOpts = ["IDLE","ACTIVE","ON_TRIP","BROKEN"]
    .map(s => `<option value="${s}" ${bus.status === s ? "selected" : ""}>${s}</option>`).join("");

  const routeSel = [
    `<option value="">— No route —</option>`,
    ...routes.map(r => `<option value="${r.route_id}" ${String(bus.route_id ?? "") === String(r.route_id) ? "selected" : ""}>#${r.route_id} · ${r.name ?? r.number_line}</option>`),
  ].join("");

  const driverSel = [
    `<option value="">— Unassigned —</option>`,
    ...drivers.map(d => `<option value="${d.driver_id}" ${String(bus.id_driver ?? "") === String(d.driver_id) ? "selected" : ""}>#${d.driver_id} · ${d.name}</option>`),
  ].join("");

  const gpsStr = `${parseFloat(bus.gps_lat).toFixed(5)}, ${parseFloat(bus.gps_lng).toFixed(5)}`;

  const tripBlock = tripData ? `
    <div class="mp-section-title">Active Trip</div>
    <div class="mp-info-row"><span class="mp-info-label">Trip ID</span><span class="mp-info-val">#${tripData.trip_id}</span></div>
    <div class="mp-info-row"><span class="mp-info-label">Line</span><span class="mp-info-val">${tripData.number_line ?? "—"}</span></div>
    <div class="mp-info-row"><span class="mp-info-label">Driver</span><span class="mp-info-val">${tripData.driver_name ?? "—"}</span></div>
    <div class="mp-info-row"><span class="mp-info-label">Phone</span><span class="mp-info-val">${tripData.driver_phone ?? "—"}</span></div>
    <div class="mp-info-row"><span class="mp-info-label">Fare</span><span class="mp-info-val">${tripData.fare ? tripData.fare + " EGP/km" : "—"}</span></div>
  ` : "";

  return `
    <div class="mp-panel-header" style="border-left:4px solid ${color}">
      <div class="mp-panel-icon" style="background:${color}20;color:${color}">▷</div>
      <div class="mp-panel-titles">
        <div class="mp-panel-title">${bus.number_bus ?? `Bus #${bus.bus_id}`}</div>
        <div class="mp-panel-sub">ID #${bus.bus_id} · <span class="badge ${busBadge(bus.status)}">${bus.status}</span></div>
      </div>
      <button class="mp-panel-close" id="mpClose">✕</button>
    </div>

    <div class="mp-panel-body">
      <div class="mp-section-title">Position</div>
      <div class="mp-info-row"><span class="mp-info-label">Coords</span><span class="mp-info-val mp-mono">${gpsStr}</span></div>
      <div class="mp-info-row ${stale ? "mp-stale-row" : ""}">
        <span class="mp-info-label">GPS age</span>
        <span class="mp-info-val">${stale ? "⚠ " : ""}${gpsAge}</span>
      </div>
      <div class="mp-info-row"><span class="mp-info-label">Trips today</span><span class="mp-info-val">${bus.count_today_trips ?? 0}</span></div>

      ${tripBlock}

      ${write ? `
        <div class="mp-section-title mp-edit-title">Edit Bus</div>
        <div class="mp-edit-form">
          <div class="mp-field">
            <label class="mp-label">Bus Number</label>
            <input class="mp-input" id="mf0" value="${bus.number_bus ?? ""}">
          </div>
          <div class="mp-field">
            <label class="mp-label">Status</label>
            <select class="mp-select" id="mf1">${statusOpts}</select>
          </div>
          <div class="mp-field mp-full">
            <label class="mp-label">Route</label>
            <select class="mp-select" id="mf2">${routeSel}</select>
          </div>
          <div class="mp-field mp-full">
            <label class="mp-label">Driver</label>
            <select class="mp-select" id="mf3">${driverSel}</select>
          </div>
          <button class="btn btn-primary mp-save-btn" id="mpSave">Save Changes</button>
        </div>
      ` : `<p class="mp-readonly-note">Read-only — insufficient role.</p>`}
    </div>`;
}

function renderStationPanel(station, routeStops, routes) {
  const write = canWrite("stations");
  const passingRoutes = routeStops
    .filter(rs => rs.station_id === station.station_id)
    .map(rs => routes.find(r => r.route_id === rs.route_id))
    .filter(Boolean);

  return `
    <div class="mp-panel-header" style="border-left:4px solid #2A9C8A">
      <div class="mp-panel-icon" style="background:#2A9C8A20;color:#2A9C8A">⊕</div>
      <div class="mp-panel-titles">
        <div class="mp-panel-title">${station.name}</div>
        <div class="mp-panel-sub">Station #${station.station_id}</div>
      </div>
      <button class="mp-panel-close" id="mpClose">✕</button>
    </div>

    <div class="mp-panel-body">
      <div class="mp-section-title">Location</div>
      <div class="mp-info-row"><span class="mp-info-label">Latitude</span><span class="mp-info-val mp-mono">${parseFloat(station.location_lat).toFixed(6)}</span></div>
      <div class="mp-info-row"><span class="mp-info-label">Longitude</span><span class="mp-info-val mp-mono">${parseFloat(station.location_lng).toFixed(6)}</span></div>
      <div class="mp-info-row">
        <span class="mp-info-label">Routes</span>
        <span class="mp-info-val">
          ${passingRoutes.length
            ? passingRoutes.map(r => `<span class="badge badge-blue">${r.number_line ?? r.name}</span>`).join(" ")
            : '<span class="nil">No routes</span>'}
        </span>
      </div>

      ${write ? `
        <div class="mp-section-title mp-edit-title">Edit Station</div>
        <div class="mp-edit-form">
          <div class="mp-field mp-full">
            <label class="mp-label">Station Name</label>
            <input class="mp-input" id="sf0" value="${station.name ?? ""}">
          </div>
          <div class="mp-field">
            <label class="mp-label">Latitude</label>
            <input class="mp-input" id="sf1" type="number" step="any" value="${station.location_lat ?? ""}">
          </div>
          <div class="mp-field">
            <label class="mp-label">Longitude</label>
            <input class="mp-input" id="sf2" type="number" step="any" value="${station.location_lng ?? ""}">
          </div>
          <button class="btn btn-primary mp-save-btn" id="mpSave">Save Changes</button>
        </div>
      ` : `<p class="mp-readonly-note">Read-only — insufficient role.</p>`}
    </div>`;
}

// ── No-GPS list item ───────────────────────────────────────────
function noGpsRowHTML(bus) {
  return `<div class="mp-nogps-row">
    <div class="mp-nogps-left">
      <span class="badge ${busBadge(bus.status)}">${bus.status}</span>
      <span class="mp-nogps-name">${bus.number_bus ?? `Bus #${bus.bus_id}`}</span>
      ${bus.id_driver ? `<span class="mp-nogps-meta">Driver #${bus.id_driver}</span>` : ""}
    </div>
    <div class="mp-nogps-right">
      <span class="mp-nogps-meta nil">No GPS signal</span>
    </div>
  </div>`;
}

// ── KPI bar HTML ───────────────────────────────────────────────
function kpiBarHTML(buses, stations, routes, lastRefresh, autoRefresh) {
  const total    = buses.length;
  const onTrip   = buses.filter(b => b.status === "ON_TRIP").length;
  const active   = buses.filter(b => b.status === "ACTIVE").length;
  const idle     = buses.filter(b => b.status === "IDLE").length;
  const broken   = buses.filter(b => b.status === "BROKEN").length;
  const noGps    = buses.filter(b => !b.gps_lat).length;

  const timeStr = lastRefresh
    ? new Date(lastRefresh).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return `
    <div class="mp-kpi-inner">
      <div class="mp-kpi-stats">
        <div class="mp-kpi-stat">
          <span class="mp-kpi-val">${total}</span>
          <span class="mp-kpi-lbl">Total Buses</span>
        </div>
        <div class="mp-kpi-divider"></div>
        <div class="mp-kpi-stat mp-kpi-green">
          <span class="mp-kpi-val">${onTrip}</span>
          <span class="mp-kpi-lbl">On Trip</span>
        </div>
        <div class="mp-kpi-stat mp-kpi-blue">
          <span class="mp-kpi-val">${active}</span>
          <span class="mp-kpi-lbl">Active</span>
        </div>
        <div class="mp-kpi-stat">
          <span class="mp-kpi-val">${idle}</span>
          <span class="mp-kpi-lbl">Idle</span>
        </div>
        ${broken > 0 ? `<div class="mp-kpi-stat mp-kpi-red">
          <span class="mp-kpi-val">${broken}</span>
          <span class="mp-kpi-lbl">Broken</span>
        </div>` : ""}
        <div class="mp-kpi-divider"></div>
        <div class="mp-kpi-stat">
          <span class="mp-kpi-val">${stations.length}</span>
          <span class="mp-kpi-lbl">Stations</span>
        </div>
        <div class="mp-kpi-stat">
          <span class="mp-kpi-val">${routes.length}</span>
          <span class="mp-kpi-lbl">Routes</span>
        </div>
        ${noGps > 0 ? `<div class="mp-kpi-stat mp-kpi-warn">
          <span class="mp-kpi-val">${noGps}</span>
          <span class="mp-kpi-lbl">No GPS</span>
        </div>` : ""}
      </div>
      <div class="mp-kpi-controls">
        <span class="mp-refresh-time">Updated ${timeStr}</span>
        <button class="mp-kpi-btn ${autoRefresh ? "mp-kpi-btn-active" : ""}" id="mpAutoRefreshBtn"
                title="${autoRefresh ? "Auto-refresh ON — click to disable" : "Auto-refresh OFF — click to enable"}">
          ⟳ ${autoRefresh ? "Live" : "Auto"}
        </button>
        <button class="mp-kpi-btn" id="mpRefreshNowBtn" title="Refresh now">Refresh</button>
        <button class="mp-kpi-collapse" id="mpKpiCollapse" title="Collapse stats">▲</button>
      </div>
    </div>`;
}

// ── Main controller ────────────────────────────────────────────
export async function mapController() {
  if (!guardRoute("map")) return;

  // Module state
  let _buses      = [];
  let _stations   = [];
  let _routes     = [];
  let _routeStops = [];
  let _drivers    = [];
  let _tripMap    = {};
  let _busMarkers = {};
  let _stationMarkers = {};
  let _map        = null;
  let _filter     = "ALL";
  let _searchQ    = "";
  let _kpiVisible = true;
  let _fullscreen = false;
  let _autoRefresh = false;
  let _autoTimer   = null;
  let _lastRefresh = null;
  let _geocoderOpen = false;

  // ── Shell ──────────────────────────────────────────────────
  ge("main").innerHTML = `
  <div class="mp-root" id="mpRoot">

    <!-- Page header -->
    <header class="page-header mp-page-header" id="mpPageHeader">
      <div class="page-header-text">
        <h1 class="page-title">Live Map</h1>
        <p class="page-sub">Real-time fleet positions </p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost mp-fs-btn" id="mpFsBtn" title="Expand map">⛶ Expand</button>
      </div>
    </header>

    <!-- KPI bar -->
    <div class="mp-kpi-bar" id="mpKpiBar">
      <div class="mp-kpi-loading">
        ${[...Array(6)].map(() => `<div class="mp-kpi-skel"></div>`).join("")}
      </div>
    </div>

    <!-- Map area -->
    <div class="mp-map-wrap" id="mpMapWrap">

      <!-- On-map: search pill (top-left) -->
      <div class="mp-search-control" id="mpSearchControl">
        <span class="mp-search-icon-inner">⌕</span>
        <input class="mp-search-input" id="mpSearch"
               placeholder="Bus number or station…" autocomplete="off">
        <button class="mp-search-clear" id="mpSearchClear" style="display:none">✕</button>
      </div>

      <!-- On-map: status filter pills (top-center) -->
      <div class="mp-filter-pills" id="mpFilterPills">
        <button class="mp-pill" data-filter="ALL">All</button>
        <button class="mp-pill mp-pill-on-trip" data-filter="ON_TRIP">On Trip</button>
        <button class="mp-pill mp-pill-active-b" data-filter="ACTIVE">Active</button>
        <button class="mp-pill" data-filter="IDLE">Idle</button>
        <button class="mp-pill mp-pill-broken" data-filter="BROKEN">Broken</button>
      </div>

      <!-- On-map: fullscreen collapse button (top-right, only visible in fullscreen) -->
      <button class="mp-fs-collapse" id="mpFsCollapse" style="display:none" title="Exit fullscreen (Esc)">⛶ Collapse</button>

      <!-- On-map: geocoder toggle (bottom-right, above zoom) -->
      <div class="mp-geocoder-wrap" id="mpGeocoderWrap">
        <button class="mp-geocoder-btn" id="mpGeocoderBtn" title="Search location">⌕</button>
        <div class="mp-geocoder-box" id="mpGeocoderBox" style="display:none"></div>
      </div>

      <!-- On-map: legend (bottom-left) -->
      <div class="mp-legend">
        <div class="mp-legend-item"><span class="mp-legend-dot" style="background:#3DAA6A"></span>On Trip</div>
        <div class="mp-legend-item"><span class="mp-legend-dot" style="background:#4A90D9"></span>Active</div>
        <div class="mp-legend-item"><span class="mp-legend-dot" style="background:#8A9BB0"></span>Idle</div>
        <div class="mp-legend-item"><span class="mp-legend-dot" style="background:#C04848"></span>Broken</div>
        <div class="mp-legend-item"><span class="mp-legend-dot mp-legend-station"></span>Station</div>
      </div>

      <!-- Leaflet map -->
      <div id="mpMap" class="mp-map"></div>

      <!-- Side panel -->
      <div class="mp-panel" id="mpPanel" style="display:none"></div>
    </div>

    <!-- No-GPS list -->
    <details class="mp-nogps-section" id="mpNoGpsSection" style="display:none">
      <summary class="mp-nogps-summary">
        <span class="mp-nogps-summary-icon">⚠</span>
        <span class="mp-nogps-summary-text" id="mpNoGpsLabel">Buses without GPS signal</span>
        <span class="mp-nogps-count" id="mpNoGpsCount">0</span>
      </summary>
      <div class="mp-nogps-list" id="mpNoGpsList"></div>
    </details>

  </div>`;

  // ── Wait for Leaflet ───────────────────────────────────────
  if (!window.L) {
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel  = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src     = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload  = res;
      s.onerror = () => rej(new Error("Leaflet failed to load"));
      document.head.appendChild(s);
    }).catch(e => { toast(e.message, "error"); });
  }
  if (!window.L) return;

  // ── Init map ───────────────────────────────────────────────
  _map = window.L.map("mpMap", {
    zoomControl: true,
    attributionControl: true,
  }).setView([30.0444, 31.2357], 12);

  window.L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> © <a href="https://carto.com">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    }
  ).addTo(_map);

  _map.zoomControl.setPosition("topright");

  // ── Fullscreen helpers ─────────────────────────────────────
  function enterFullscreen() {
    _fullscreen = true;
    ge("mpRoot").classList.add("mp-fullscreen");
    ge("mpPageHeader").classList.add("mp-header-hidden");
    ge("mpKpiBar").classList.add("mp-kpi-hidden");
    ge("mpFsBtn").textContent = "⛶ Collapse";
    ge("mpFsBtn").title = "Exit fullscreen";
    ge("mpFsCollapse").style.display = "flex";
    setTimeout(() => _map?.invalidateSize(), 320);
  }

  function exitFullscreen() {
    _fullscreen = false;
    ge("mpRoot").classList.remove("mp-fullscreen");
    ge("mpPageHeader").classList.remove("mp-header-hidden");
    if (_kpiVisible) ge("mpKpiBar").classList.remove("mp-kpi-hidden");
    ge("mpFsBtn").textContent = "⛶ Expand";
    ge("mpFsBtn").title = "Expand map";
    ge("mpFsCollapse").style.display = "none";
    setTimeout(() => _map?.invalidateSize(), 320);
  }

  ge("mpFsBtn")?.addEventListener("click", () => {
    _fullscreen ? exitFullscreen() : enterFullscreen();
  });

  ge("mpFsCollapse")?.addEventListener("click", exitFullscreen);

  // Esc key to exit fullscreen
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && _fullscreen) exitFullscreen();
  });

  // ── Geocoder (collapsed) ───────────────────────────────────
  const geocoderBox = ge("mpGeocoderBox");
  ge("mpGeocoderBtn")?.addEventListener("click", () => {
    _geocoderOpen = !_geocoderOpen;
    geocoderBox.style.display = _geocoderOpen ? "block" : "none";
    ge("mpGeocoderBtn").classList.toggle("mp-geocoder-btn-active", _geocoderOpen);
    if (_geocoderOpen && !geocoderBox._geocoderInit) {
      addGeocoder(_map, {
        containerId: "mpGeocoderBox",
        placeholder: "Search location…",
        flyTo: true,
        zoom: 16,
      });
      geocoderBox._geocoderInit = true;
    }
  });

  // Close geocoder on Esc (if not in fullscreen)
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && _geocoderOpen && !_fullscreen) {
      _geocoderOpen = false;
      geocoderBox.style.display = "none";
      ge("mpGeocoderBtn").classList.remove("mp-geocoder-btn-active");
    }
  });

  // ── Data fetch ─────────────────────────────────────────────
  async function fetchData() {
    const [buses, activeTrips, stations, routes, routeStops, drivers] = await Promise.all([
      models.bus.list({
        select: "bus_id,number_bus,status,route_id,id_driver,gps_lat,gps_lng,gps_updated_at,updated_at,count_today_trips,current_trip_id",
      }),
      api.list("vw_active_trips", {
        select: "trip_id,bus_id,driver_name,driver_phone,number_line,route_name,start_time,fare",
      }).catch(() => []),
      models.station.list({ select: "station_id,name,location_lat,location_lng" }),
      models.route.list({ select: "route_id,name,number_line,fare" }),
      api.list("route_stops", {
        select: "id,route_id,station_id,stop_order",
        order: "stop_order.asc",
      }).catch(() => []),
      models.driver.list({ select: "driver_id,name" }),
    ]);

    _buses      = buses      || [];
    _stations   = stations   || [];
    _routes     = routes     || [];
    _routeStops = routeStops || [];
    _drivers    = drivers    || [];

    _tripMap = {};
    (activeTrips || []).forEach(t => { _tripMap[t.bus_id] = t; });

    _lastRefresh = Date.now();
  }

  // ── Render markers ─────────────────────────────────────────
  function getFilteredBuses() {
    return _buses.filter(b => {
      if (!b.gps_lat || !b.gps_lng) return false;
      if (_filter !== "ALL" && b.status !== _filter) return false;
      if (_searchQ) {
        const q = _searchQ.toLowerCase();
        return (b.number_bus ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }

  function getFilteredStations() {
    if (!_searchQ) return _stations.filter(s => s.location_lat && s.location_lng);
    const q = _searchQ.toLowerCase();
    return _stations.filter(s => s.location_lat && s.location_lng &&
      s.name.toLowerCase().includes(q));
  }

  let _routeLines = [];

  function renderRouteLines() {
    _routeLines.forEach(l => l.remove());
    _routeLines = [];

    _routes.forEach((route, idx) => {
      const stops = _routeStops
        .filter(rs => rs.route_id === route.route_id)
        .sort((a, b) => a.stop_order - b.stop_order);

      const coords = stops
        .map(rs => _stations.find(s => s.station_id === rs.station_id))
        .filter(s => s?.location_lat && s?.location_lng)
        .map(s => [parseFloat(s.location_lat), parseFloat(s.location_lng)]);

      if (coords.length < 2) return;
      const line = window.L.polyline(coords, {
        color:   ROUTE_PALETTE[idx % ROUTE_PALETTE.length],
        weight:  3.5,
        opacity: 0.6,
      }).addTo(_map)
        .bindTooltip(`${route.number_line ?? ""} · ${route.name ?? ""}`, { sticky: true });
      _routeLines.push(line);
    });
  }

  function renderMarkers() {
    Object.values(_busMarkers).forEach(m => m.remove());
    Object.values(_stationMarkers).forEach(m => m.remove());
    _busMarkers     = {};
    _stationMarkers = {};

    const stIcon = makeIcon(stationDotSvg(), "station");
    getFilteredStations().forEach(s => {
      const m = window.L.marker(
        [parseFloat(s.location_lat), parseFloat(s.location_lng)],
        { icon: stIcon, title: s.name, zIndexOffset: 0 }
      ).addTo(_map);

      const passingRoutes = _routeStops
        .filter(rs => rs.station_id === s.station_id)
        .map(rs => _routes.find(r => r.route_id === rs.route_id))
        .filter(Boolean);

      m.bindTooltip(stationTooltipHTML(s, passingRoutes), {
        permanent: false, direction: "top", className: "mp-tt-container",
      });
      m.on("click", () => openPanel("station", s));
      _stationMarkers[s.station_id] = m;
    });

    getFilteredBuses().forEach(b => {
      const stale = isStale(b);
      const icon  = makeIcon(busPinSvg(busColor(b.status), stale), "bus");
      const m = window.L.marker(
        [parseFloat(b.gps_lat), parseFloat(b.gps_lng)],
        { icon, title: b.number_bus ?? `Bus #${b.bus_id}`, zIndexOffset: 100 }
      ).addTo(_map);

      m.bindTooltip(busTooltipHTML(b, _tripMap[b.bus_id]), {
        permanent: false, direction: "top", className: "mp-tt-container",
        offset: [0, -38],
      });
      m.on("click", () => openPanel("bus", b));
      m._busId = b.bus_id;
      _busMarkers[b.bus_id] = m;
    });
  }

  // ── No-GPS list ────────────────────────────────────────────
  function renderNoGpsList() {
    const noGps   = _buses.filter(b => !b.gps_lat || !b.gps_lng);
    const section = ge("mpNoGpsSection");
    const list    = ge("mpNoGpsList");
    const count   = ge("mpNoGpsCount");
    const label   = ge("mpNoGpsLabel");

    if (!noGps.length) { section.style.display = "none"; return; }

    section.style.display = "block";
    count.textContent     = noGps.length;
    label.textContent     = `${noGps.length} bus${noGps.length !== 1 ? "es" : ""} without GPS signal`;
    list.innerHTML        = noGps.map(noGpsRowHTML).join("");
  }

  // ── KPI bar ────────────────────────────────────────────────
  function renderKpi() {
    const bar = ge("mpKpiBar");
    if (!bar) return;
    bar.innerHTML = kpiBarHTML(_buses, _stations, _routes, _lastRefresh, _autoRefresh);
    _bindKpiEvents();
  }

  function _bindKpiEvents() {
    ge("mpKpiCollapse")?.addEventListener("click", () => {
      _kpiVisible = false;
      const bar = ge("mpKpiBar");
      bar.classList.add("mp-kpi-collapsed");
      bar.innerHTML = `<div class="mp-kpi-expand-row">
        <span class="mp-kpi-expand-hint">Fleet stats hidden</span>
        <button class="mp-kpi-btn" id="mpKpiExpand">▼ Show stats</button>
      </div>`;
      ge("mpKpiExpand")?.addEventListener("click", () => {
        _kpiVisible = true;
        bar.classList.remove("mp-kpi-collapsed");
        renderKpi();
      });
    });

    ge("mpAutoRefreshBtn")?.addEventListener("click", () => {
      _autoRefresh = !_autoRefresh;
      if (_autoRefresh) {
        _autoTimer = setInterval(doRefresh, REFRESH_MS);
        toast("Auto-refresh enabled (30s)", "info");
      } else {
        clearInterval(_autoTimer);
        _autoTimer = null;
        toast("Auto-refresh disabled", "info");
      }
      renderKpi();
    });

    ge("mpRefreshNowBtn")?.addEventListener("click", doRefresh);
  }

  // ── Full refresh ───────────────────────────────────────────
  async function doRefresh() {
    const btn = ge("mpRefreshNowBtn");
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      await fetchData();
      renderKpi();
      renderMarkers();
      renderNoGpsList();
    } catch (e) {
      toast("Refresh failed: " + e.message, "error");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Refresh"; }
    }
  }

  // ── Panel ──────────────────────────────────────────────────
  function openPanel(type, data) {
    const panel = ge("mpPanel");
    panel.style.display = "flex";

    if (type === "bus") {
      panel.innerHTML = renderBusPanel(data, _routes, _drivers, _tripMap[data.bus_id]);
      ge("mpClose")?.addEventListener("click", closePanel);
      ge("mpSave")?.addEventListener("click", () => saveBus(data));
    } else {
      panel.innerHTML = renderStationPanel(data, _routeStops, _routes);
      ge("mpClose")?.addEventListener("click", closePanel);
      ge("mpSave")?.addEventListener("click", () => saveStation(data));
    }

    requestAnimationFrame(() => panel.classList.add("mp-panel-open"));
    setTimeout(() => _map.invalidateSize(), 320);
  }

  function closePanel() {
    const panel = ge("mpPanel");
    panel.classList.remove("mp-panel-open");
    setTimeout(() => { panel.style.display = "none"; _map?.invalidateSize(); }, 300);
  }

  // ── Save bus (optimistic lock + confirm on BROKEN) ─────────
  async function saveBus(originalData) {
    const newStatus = ge("mf1")?.value;
    const isBroken  = newStatus === "BROKEN" && originalData.status !== "BROKEN";

    const doSave = async () => {
      const btn = ge("mpSave");
      if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
      try {
        const fresh = await api.list("buses", {
          select: "updated_at",
          bus_id: `eq.${originalData.bus_id}`,
        });
        const freshTs = fresh?.[0]?.updated_at;

        if (freshTs && freshTs !== originalData.updated_at) {
          const proceed = await new Promise(resolve => {
            confirmDialog({
              title:   "Record changed",
              message: "This bus was modified by someone else since you opened it. Save anyway and overwrite?",
              danger:  true,
              onConfirm: () => resolve(true),
            });
            const overlay = ge("confirmOverlay");
            const cancelBtn = overlay?.querySelector(".btn-ghost");
            cancelBtn?.addEventListener("click", () => resolve(false), { once: true });
          });
          if (!proceed) {
            if (btn) { btn.disabled = false; btn.textContent = "Save Changes"; }
            return;
          }
        }

        await models.bus.update(originalData.bus_id, {
          number_bus: ge("mf0")?.value.trim(),
          status:     newStatus,
          route_id:   parseInt(ge("mf2")?.value) || null,
          id_driver:  parseInt(ge("mf3")?.value) || null,
        });

        toast("Bus updated", "success");

        originalData.number_bus = ge("mf0")?.value.trim();
        originalData.status     = newStatus;
        originalData.route_id   = parseInt(ge("mf2")?.value) || null;
        originalData.id_driver  = parseInt(ge("mf3")?.value) || null;

        const mk = _busMarkers[originalData.bus_id];
        if (mk) mk.setIcon(makeIcon(busPinSvg(busColor(newStatus)), "bus"));

        openPanel("bus", originalData);
      } catch (e) {
        toast(e.message, "error");
      } finally {
        const b = ge("mpSave");
        if (b) { b.disabled = false; b.textContent = "Save Changes"; }
      }
    };

    if (isBroken) {
      confirmDialog({
        title:   "Mark as Broken?",
        message: `Set ${originalData.number_bus} to BROKEN? This will flag the bus as offline for the entire fleet.`,
        danger:  true,
        onConfirm: doSave,
      });
    } else {
      doSave();
    }
  }

  // ── Save station ───────────────────────────────────────────
  async function saveStation(originalData) {
    const btn = ge("mpSave");
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    try {
      const newName = ge("sf0")?.value.trim();
      const newLat  = parseFloat(ge("sf1")?.value);
      const newLng  = parseFloat(ge("sf2")?.value);

      if (!newName) { toast("Station name is required", "error"); return; }

      await models.station.update(originalData.station_id, {
        name:         newName,
        location_lat: isNaN(newLat) ? originalData.location_lat : newLat,
        location_lng: isNaN(newLng) ? originalData.location_lng : newLng,
      });

      toast("Station updated", "success");

      originalData.name         = newName;
      originalData.location_lat = isNaN(newLat) ? originalData.location_lat : newLat;
      originalData.location_lng = isNaN(newLng) ? originalData.location_lng : newLng;

      const mk = _stationMarkers[originalData.station_id];
      if (mk && !isNaN(newLat) && !isNaN(newLng)) mk.setLatLng([newLat, newLng]);

      openPanel("station", originalData);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      const b = ge("mpSave");
      if (b) { b.disabled = false; b.textContent = "Save Changes"; }
    }
  }

  // ── Search ─────────────────────────────────────────────────
  ge("mpSearch")?.addEventListener("input", e => {
    _searchQ = e.target.value.trim();
    ge("mpSearchClear").style.display = _searchQ ? "" : "none";
    renderMarkers();
  });

  ge("mpSearchClear")?.addEventListener("click", () => {
    ge("mpSearch").value = "";
    _searchQ = "";
    ge("mpSearchClear").style.display = "none";
    renderMarkers();
  });

  ge("mpSearchControl")?.addEventListener("mousedown", e => e.stopPropagation());

  // ── Filter pills ───────────────────────────────────────────
  ge("mpFilterPills")?.addEventListener("click", e => {
    const pill = e.target.closest("[data-filter]");
    if (!pill) return;
    _filter = pill.dataset.filter;
    ge("mpFilterPills").querySelectorAll("[data-filter]").forEach(p => {
      p.classList.toggle("mp-pill-selected", p === pill);
    });
    renderMarkers();
  });
  ge("mpFilterPills")?.querySelector('[data-filter="ALL"]')?.classList.add("mp-pill-selected");

  // ── Initial load ───────────────────────────────────────────
  try {
    await fetchData();
  } catch (e) {
    toast("Map data error: " + e.message, "error");
  }

  renderKpi();
  renderRouteLines();
  renderMarkers();
  renderNoGpsList();

  const allCoords = _buses
    .filter(b => b.gps_lat && b.gps_lng)
    .map(b => [parseFloat(b.gps_lat), parseFloat(b.gps_lng)]);

  if (allCoords.length) {
    try { _map.fitBounds(allCoords, { padding: [60, 60] }); } catch {}
  }
}