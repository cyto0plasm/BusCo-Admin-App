/**
 * BusCo — Geocoder Search (utils/geocoder.js)
 * ─────────────────────────────────────────────
 * Adds a Google-Maps-style search box to any Leaflet map.
 * Uses Nominatim (OpenStreetMap) — free, no API key.
 *
 * Usage:
 *   import { addGeocoder } from "../utils/geocoder.js";
 *   addGeocoder(map, { onResult: (lat, lng, displayName) => {} });
 *
 * Options:
 *   containerId  — id of element to append the box into (default: appended to map container)
 *   placeholder  — input placeholder text
 *   onResult     — callback(lat, lng, displayName) fired when user picks a result
 *   flyTo        — if true (default), map flies to the result
 *   zoom         — zoom level to fly to (default: 16)
 */

export function addGeocoder(map, opts = {}) {
  const {
    placeholder = "Search location…",
    onResult    = null,
    flyTo       = true,
    zoom        = 16,
    containerId = null,
  } = opts;

  // ── Build DOM ───────────────────────────────────────────────
  const wrap = document.createElement("div");
  wrap.className = "gc-wrap";
  wrap.innerHTML = `
    <div class="gc-input-row">
      <span class="gc-icon">⌕</span>
      <input class="gc-input" type="text" placeholder="${placeholder}" autocomplete="off" spellcheck="false">
      <button class="gc-clear" style="display:none" title="Clear">✕</button>
      <div class="gc-spinner" style="display:none"></div>
    </div>
    <ul class="gc-results" style="display:none"></ul>`;

  const input    = wrap.querySelector(".gc-input");
  const clearBtn = wrap.querySelector(".gc-clear");
  const spinner  = wrap.querySelector(".gc-spinner");
  const results  = wrap.querySelector(".gc-results");

  // Inject into container or map element
  const parent = containerId
    ? document.getElementById(containerId)
    : map.getContainer();
  if (!parent) return;
  parent.appendChild(wrap);

  // ── State ───────────────────────────────────────────────────
  let debounceTimer = null;
  let activeIndex   = -1;
  let lastResults   = [];

  // ── Helpers ─────────────────────────────────────────────────
  function showSpinner(v) { spinner.style.display = v ? "block" : "none"; }
  function showResults(v) { results.style.display = v ? "block" : "none"; }

  function setActive(idx) {
    const items = results.querySelectorAll("li");
    items.forEach((li, i) => li.classList.toggle("gc-active", i === idx));
    activeIndex = idx;
  }

  function clearResults() {
    results.innerHTML = "";
    showResults(false);
    lastResults = [];
    activeIndex = -1;
  }

  function pickResult(item) {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    input.value = item.display_name;
    clearBtn.style.display = "block";
    clearResults();
    if (flyTo) map.flyTo([lat, lng], zoom, { animate: true, duration: 0.8 });
    onResult?.(lat, lng, item.display_name);
  }

  function renderResults(items) {
    lastResults = items;
    results.innerHTML = "";

    if (!items.length) {
      results.innerHTML = `<li class="gc-no-results">No results found</li>`;
      showResults(true);
      return;
    }

    items.forEach((item, i) => {
      const li = document.createElement("li");
      // Split display_name into main + secondary
      const parts = item.display_name.split(", ");
      const main  = parts.slice(0, 2).join(", ");
      const sub   = parts.slice(2).join(", ");
      li.innerHTML = `<span class="gc-res-main">${main}</span>${sub ? `<span class="gc-res-sub">${sub}</span>` : ""}`;
      li.addEventListener("mousedown", e => { e.preventDefault(); pickResult(item); });
      li.addEventListener("mouseover", () => setActive(i));
      results.appendChild(li);
    });

    showResults(true);
    activeIndex = -1;
  }

  // ── Nominatim search ─────────────────────────────────────────
  async function search(q) {
    if (!q || q.length < 2) { clearResults(); showSpinner(false); return; }
    showSpinner(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=0&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      const data = await res.json();
      renderResults(data);
    } catch {
      clearResults();
    } finally {
      showSpinner(false);
    }
  }

  // ── Events ───────────────────────────────────────────────────
  input.addEventListener("input", e => {
    const q = e.target.value.trim();
    clearBtn.style.display = q ? "block" : "none";
    clearTimeout(debounceTimer);
    if (!q) { clearResults(); showSpinner(false); return; }
    showSpinner(true);
    debounceTimer = setTimeout(() => search(q), 350);
  });

  input.addEventListener("keydown", e => {
    const items = results.querySelectorAll("li:not(.gc-no-results)");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && lastResults[activeIndex]) {
        pickResult(lastResults[activeIndex]);
      } else if (lastResults.length) {
        pickResult(lastResults[0]);
      } else {
        search(input.value.trim());
      }
    } else if (e.key === "Escape") {
      clearResults();
    }
  });

  input.addEventListener("focus", () => {
    if (lastResults.length) showResults(true);
  });

  input.addEventListener("blur", () => {
    // Delay so mousedown on result fires first
    setTimeout(() => showResults(false), 150);
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    clearBtn.style.display = "none";
    clearResults();
    input.focus();
  });

  // Stop Leaflet intercepting keyboard inside the search box
  window.L.DomEvent.disableClickPropagation(wrap);
  window.L.DomEvent.disableScrollPropagation(wrap);

  return { wrap, input };
}