/**
 * BusCo — Analytics Controller (controllers/analytics.js)
 * ─────────────────────────────────────────────────────────
 * Bold editorial design: dark canvas, luminous charts, staggered reveals.
 * 11 Chart.js visualisations from live Supabase data.
 */

import { models } from "../models/index.js";
import { ge, toast } from "../utils/dom.js";

// Palette — BusCo brand + chart-optimised
const P = {
  dblue: "#355872", blue: "#7AAACE", lblue: "#9CD5FF",
  cream: "#F7F8F0", cream2: "#DDE0D5",
  green:  "#3DAA6A", amber:  "#C87830", red:    "#C04848",
  teal:   "#2A9C8A", indigo: "#5858B4", slate:  "#7A9BB0",
  purple: "#8860C8",
};

const a = (hex, opacity) =>
  hex + Math.round(opacity * 255).toString(16).padStart(2, "0");

const _charts = {};
function mkChart(id, cfg) {
  _charts[id]?.destroy();
  const canvas = ge(id);
  if (!canvas || !window.Chart) return null;
  return (_charts[id] = new window.Chart(canvas, cfg));
}

// Shared Chart.js defaults — refined, restrained
function applyDefaults() {
  const D = window.Chart.defaults;
  D.font.family  = "'Syne', 'Cormorant Garamond', serif";
  D.font.size    = 11;
  D.color        = "#7A9BB0";
  D.animation.duration = 700;
  D.animation.easing   = "easeOutQuart";
  D.plugins.legend.labels.boxWidth      = 9;
  D.plugins.legend.labels.boxHeight     = 9;
  D.plugins.legend.labels.borderRadius  = 2;
  D.plugins.legend.labels.padding       = 16;
  D.plugins.legend.labels.color         = "#8AAAC0";
  D.plugins.tooltip.backgroundColor     = "#1A2A3A";
  D.plugins.tooltip.titleColor          = "#F0F4F8";
  D.plugins.tooltip.bodyColor           = "#8AAAC0";
  D.plugins.tooltip.padding             = 14;
  D.plugins.tooltip.cornerRadius        = 8;
  D.plugins.tooltip.borderColor         = "rgba(122,170,206,0.2)";
  D.plugins.tooltip.borderWidth         = 1;
  D.plugins.tooltip.displayColors       = true;
  D.plugins.tooltip.boxPadding          = 5;
}

const GRID_COLOR  = "rgba(53,88,114,0.1)";
const TICK_COLOR  = "#4A7090";
const TICK_FONT   = { size: 10, weight: "500" };

function scaleX(extra = {}) {
  return { grid: { display: false, ...extra }, ticks: { color: TICK_COLOR, font: TICK_FONT }, ...extra };
}
function scaleY(extra = {}) {
  return { grid: { color: GRID_COLOR, drawBorder: false }, ticks: { color: TICK_COLOR, font: TICK_FONT }, ...extra };
}

// ── Skeleton ───────────────────────────────────────────────────
function renderSkeleton() {
  ge("main").innerHTML = `
<div class="an-page">
  <!-- Header -->
  <div class="an-hero">
    <div class="an-hero-left">
      <div class="an-hero-eyebrow">BusCo · Live Intelligence</div>
      <h1 class="an-hero-title">Analytics</h1>
      <p class="an-hero-sub">Revenue trends · Fleet health · Operational insights</p>
    </div>
    <div class="an-hero-right" id="heroKpi">
      <div class="an-hero-kpi loading-card"><div class="skel skel-val"></div></div>
      <div class="an-hero-kpi loading-card"><div class="skel skel-val"></div></div>
      <div class="an-hero-kpi loading-card"><div class="skel skel-val"></div></div>
      <div class="an-hero-kpi loading-card"><div class="skel skel-val"></div></div>
    </div>
  </div>

  <!-- Row 1: Revenue wide + Fleet donut -->
  <div class="an-row an-row-7-3">
    <div class="an-card an-card-dark" data-anim="0">
      <div class="an-card-header">
        <div>
          <div class="an-card-label">Revenue Trend</div>
          <div class="an-card-title-sm">Cumulative & Daily Earnings</div>
        </div>
        <div class="an-card-badge">LIVE</div>
      </div>
      <div class="an-canvas-wrap" style="height:240px"><canvas id="cRevenue"></canvas></div>
    </div>
    <div class="an-card" data-anim="1">
      <div class="an-card-header">
        <div>
          <div class="an-card-label">Fleet</div>
          <div class="an-card-title-sm">Operational Status</div>
        </div>
      </div>
      <div class="an-canvas-wrap" style="height:200px"><canvas id="cFleet"></canvas></div>
    </div>
  </div>

  <!-- Row 2: Trips activity + Payment methods -->
  <div class="an-row an-row-5-5">
    <div class="an-card an-card-dark" data-anim="2">
      <div class="an-card-header">
        <div>
          <div class="an-card-label">Trips</div>
          <div class="an-card-title-sm">Active vs Completed per Bus</div>
        </div>
      </div>
      <div class="an-canvas-wrap" style="height:220px"><canvas id="cTrips"></canvas></div>
    </div>
    <div class="an-card" data-anim="3">
      <div class="an-card-header">
        <div>
          <div class="an-card-label">Payment Methods</div>
          <div class="an-card-title-sm">Transaction distribution</div>
        </div>
      </div>
      <div class="an-canvas-wrap" style="height:220px"><canvas id="cPayments"></canvas></div>
    </div>
  </div>

  <!-- Row 3: 3-column small donuts -->
  <div class="an-row an-row-3">
    <div class="an-card" data-anim="4">
      <div class="an-card-header"><div class="an-card-label">Incidents</div><div class="an-card-title-sm">By Severity</div></div>
      <div class="an-canvas-wrap" style="height:180px"><canvas id="cIncidents"></canvas></div>
    </div>
    <div class="an-card" data-anim="5">
      <div class="an-card-header"><div class="an-card-label">Transactions</div><div class="an-card-title-sm">Debit vs Credit</div></div>
      <div class="an-canvas-wrap" style="height:180px"><canvas id="cTxTypes"></canvas></div>
    </div>
    <div class="an-card" data-anim="6">
      <div class="an-card-header"><div class="an-card-label">Recharges</div><div class="an-card-title-sm">Status breakdown</div></div>
      <div class="an-canvas-wrap" style="height:180px"><canvas id="cRecharge"></canvas></div>
    </div>
  </div>

  <!-- Row 4: Wallet histogram -->
  <div class="an-card an-card-dark an-card-full" data-anim="7">
    <div class="an-card-header">
      <div>
        <div class="an-card-label">Wallet Health</div>
        <div class="an-card-title-sm">Balance distribution across passenger wallets</div>
      </div>
    </div>
    <div class="an-canvas-wrap" style="height:220px"><canvas id="cWallets"></canvas></div>
  </div>

  <!-- Row 5: Top trips fare rate -->
  <div class="an-card an-card-full" data-anim="8">
    <div class="an-card-header">
      <div>
        <div class="an-card-label">Top Trips</div>
        <div class="an-card-title-sm">Highest fare-per-km across the network</div>
      </div>
    </div>
    <div class="an-canvas-wrap" style="height:260px"><canvas id="cTopTrips"></canvas></div>
  </div>

  <!-- Row 6: Driver leaderboard -->
  <div class="an-card an-card-dark an-card-full" data-anim="9">
    <div class="an-card-header">
      <div>
        <div class="an-card-label">Driver Leaderboard</div>
        <div class="an-card-title-sm">Daily trips completed — ranked</div>
      </div>
    </div>
    <div class="an-canvas-wrap" style="height:280px"><canvas id="cDrivers"></canvas></div>
  </div>
</div>`;
}

// ── Main entry ─────────────────────────────────────────────────
export async function analyticsController() {
  renderSkeleton();

  // Wait for Chart.js (loaded from CDN in index.html)
  if (!window.Chart) {
    await new Promise(res => {
      const t = setInterval(() => { if (window.Chart) { clearInterval(t); res(); } }, 50);
      setTimeout(() => { clearInterval(t); res(); }, 6000);
    });
  }
  if (!window.Chart) { toast("Chart.js unavailable", "error"); return; }
  applyDefaults();

  // Stagger card entry animations
  document.querySelectorAll("[data-anim]").forEach(el => {
    el.style.opacity = "0";
    el.style.transform = "translateY(16px)";
  });

  try {
    // ── Fetch all data in parallel ─────────────────────────────
    const [txns, buses, trips, incidents, wallets, recharges, drivers] = await Promise.all([
      models.transaction.listRecent(300),
      models.bus.list({ select: "bus_id,status,number_bus,count_today_trips" }),
      models.trip.list({ select: "trip_id,active,km_per_fare,distance_total,driver_id,bus_id" }),
      models.incident.list({ select: "incident_id,severity_level" }),
      models.wallet.list({ select: "wallet_id,balance" }),
      models.recharge.listRecent(),
      models.driver.list({ select: "driver_id,name,count_trips_daily" }),
    ]);

    const tx  = txns      || [];
    const bus = buses     || [];
    const tr  = trips     || [];
    const inc = incidents || [];
    const wal = wallets   || [];
    const rch = recharges || [];
    const drv = drivers   || [];

    // ── Hero KPIs ──────────────────────────────────────────────
    const totalRev   = tx.filter(t => t.type === "DEBIT").reduce((s, t) => s + parseFloat(t.fare ?? 0), 0);
    const activeBus  = bus.filter(b => b.status === "ACTIVE").length;
    const activeTr   = tr.filter(t => t.active).length;
    const walletSum  = wal.reduce((s, w) => s + parseFloat(w.balance ?? 0), 0);

    ge("heroKpi").innerHTML = [
      { label: "Revenue",       val: totalRev.toFixed(0) + " EGP", sub: `${tx.filter(t=>t.type==="DEBIT").length} transactions` },
      { label: "Active Buses",  val: `${activeBus}/${bus.length}`,  sub: "on route now" },
      { label: "Active Trips",  val: activeTr,                       sub: `${tr.length - activeTr} completed` },
      { label: "Wallet Pool",   val: walletSum.toFixed(0) + " EGP", sub: `${wal.length} wallets` },
    ].map(k => `
      <div class="an-hero-kpi">
        <div class="an-kpi-val">${k.val}</div>
        <div class="an-kpi-lbl">${k.label}</div>
        <div class="an-kpi-sub">${k.sub}</div>
      </div>`).join("");

    // Trigger staggered animations now that data loaded
    document.querySelectorAll("[data-anim]").forEach((el, i) => {
      setTimeout(() => {
        el.style.transition = "opacity 0.45s ease, transform 0.45s ease";
        el.style.opacity    = "1";
        el.style.transform  = "translateY(0)";
      }, i * 80);
    });

    // ── 1. Revenue trend — area + dashed daily ────────────────
    {
      const debitsByDate = {};
      tx.filter(t => t.type === "DEBIT" && t.timestamp)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .forEach(t => {
          const d = t.timestamp.slice(0, 10);
          debitsByDate[d] = (debitsByDate[d] || 0) + parseFloat(t.fare ?? 0);
        });

      const labels  = Object.keys(debitsByDate);
      const daily   = Object.values(debitsByDate);
      const cumul   = daily.reduce((acc, v, i) => { acc.push((acc[i-1]||0)+v); return acc; }, []);

      mkChart("cRevenue", {
        type: "line",
        data: { labels, datasets: [
          {
            label: "Cumulative EGP",
            data: cumul,
            borderColor: P.blue,
            backgroundColor: `url(#grad-blue)`,
            fill: true,
            tension: 0.42,
            borderWidth: 2,
            pointRadius: labels.length > 15 ? 0 : 3,
            pointHoverRadius: 5,
            pointBackgroundColor: P.blue,
            pointBorderColor: "#1A2A3A",
            pointBorderWidth: 2,
          },
          {
            label: "Daily EGP",
            data: daily,
            borderColor: a(P.amber, 0.8),
            backgroundColor: "transparent",
            borderWidth: 1.5,
            borderDash: [5, 4],
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 4,
          },
        ]},
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { position: "top", align: "end" },
            tooltip: { callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} EGP`
            }}
          },
          scales: {
            x: { ...scaleX(), ticks: { ...scaleX().ticks, maxTicksLimit: 7 } },
            y: { ...scaleY(), ticks: { ...scaleY().ticks, callback: v => v >= 1000 ? (v/1000).toFixed(1)+"k" : v } },
          },
        },
      });

      // Fill gradient via offscreen canvas trick
      requestAnimationFrame(() => {
        const canvas = ge("cRevenue");
        if (canvas) {
          const ctx  = canvas.getContext("2d");
          const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
          grad.addColorStop(0,   a(P.blue, 0.25));
          grad.addColorStop(0.7, a(P.blue, 0.03));
          grad.addColorStop(1,   a(P.blue, 0));
          const ch = _charts["cRevenue"];
          if (ch) {
            ch.data.datasets[0].backgroundColor = grad;
            ch.update("none");
          }
        }
      });
    }

    // ── 2. Fleet doughnut ─────────────────────────────────────
    {
      const fc = { ACTIVE: 0, IDLE: 0, BROKEN: 0 };
      bus.forEach(b => { fc[b.status] = (fc[b.status] || 0) + 1; });

      mkChart("cFleet", {
        type: "doughnut",
        data: {
          labels: ["Active", "Idle", "Broken"],
          datasets: [{ data: [fc.ACTIVE, fc.IDLE, fc.BROKEN],
            backgroundColor: [a(P.green, 0.85), a(P.blue, 0.75), a(P.red, 0.80)],
            borderColor: "#1A2A3A", borderWidth: 3, hoverOffset: 10 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          cutout: "72%",
          plugins: {
            legend: { position: "bottom" },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} buses` }},
          },
        },
      });
    }

    // ── 3. Trips per bus grouped bar ──────────────────────────
    {
      const perBus = {};
      tr.forEach(t => {
        if (!t.bus_id) return;
        if (!perBus[t.bus_id]) perBus[t.bus_id] = { active: 0, completed: 0 };
        t.active ? perBus[t.bus_id].active++ : perBus[t.bus_id].completed++;
      });
      const labels    = Object.keys(perBus).map(id => `Bus #${id}`);
      const active    = Object.values(perBus).map(v => v.active);
      const completed = Object.values(perBus).map(v => v.completed);

      mkChart("cTrips", {
        type: "bar",
        data: { labels, datasets: [
          { label: "Active",    data: active,    backgroundColor: a(P.green, 0.78), borderRadius: 4, borderSkipped: false },
          { label: "Completed", data: completed, backgroundColor: a(P.blue,  0.65), borderRadius: 4, borderSkipped: false },
        ]},
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "top", align: "end" }},
          scales: {
            x: scaleX(),
            y: { ...scaleY(), beginAtZero: true, ticks: { ...scaleY().ticks, stepSize: 1 } },
          },
        },
      });
    }

    // ── 4. Payment methods horizontal bar ─────────────────────
    {
      const methods = {};
      tx.forEach(t => { const m = t.method_payment || "Unknown"; methods[m] = (methods[m]||0)+1; });
      const sorted = Object.entries(methods).sort((a, b) => b[1]-a[1]);
      const palette = [P.dblue, P.blue, P.lblue, P.teal, P.slate, P.indigo];

      mkChart("cPayments", {
        type: "bar",
        data: { labels: sorted.map(([m]) => m), datasets: [{
          label: "Transactions",
          data: sorted.map(([, c]) => c),
          backgroundColor: sorted.map((_, i) => a(palette[i % palette.length], 0.82)),
          borderRadius: 6, borderSkipped: false,
        }]},
        options: {
          indexAxis: "y",
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }},
          scales: { x: { ...scaleY(), beginAtZero: true }, y: scaleX() },
        },
      });
    }

    // ── 5. Incident severity polar area ───────────────────────
    {
      const sev = { LOW: 0, MEDIUM: 0, HIGH: 0 };
      inc.forEach(i => sev[i.severity_level] = (sev[i.severity_level]||0)+1);

      mkChart("cIncidents", {
        type: "doughnut",
        data: { labels: ["Low", "Medium", "High"], datasets: [{
          data: [sev.LOW, sev.MEDIUM, sev.HIGH],
          backgroundColor: [a(P.green, 0.8), a(P.amber, 0.8), a(P.red, 0.82)],
          borderColor: "#1A2A3A", borderWidth: 3, hoverOffset: 8,
        }]},
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "65%",
          plugins: { legend: { position: "bottom" }},
        },
      });
    }

    // ── 6. Transaction type split ──────────────────────────────
    {
      const debit  = tx.filter(t => t.type === "DEBIT").length;
      const credit = tx.filter(t => t.type === "CREDIT").length;

      mkChart("cTxTypes", {
        type: "doughnut",
        data: { labels: ["Debit", "Credit"], datasets: [{
          data: [debit, credit],
          backgroundColor: [a(P.red, 0.80), a(P.green, 0.80)],
          borderColor: "#1A2A3A", borderWidth: 3, hoverOffset: 8,
        }]},
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "65%",
          plugins: {
            legend: { position: "bottom" },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} (${(ctx.raw/(debit+credit)*100).toFixed(1)}%)` }},
          },
        },
      });
    }

    // ── 7. Recharge status ─────────────────────────────────────
    {
      const rs = {};
      rch.forEach(r => { rs[r.status||"UNKNOWN"] = (rs[r.status||"UNKNOWN"]||0)+1; });
      const colMap = { SUCCESS: P.green, PENDING: P.amber, FAILED: P.red };

      mkChart("cRecharge", {
        type: "doughnut",
        data: { labels: Object.keys(rs), datasets: [{
          data: Object.values(rs),
          backgroundColor: Object.keys(rs).map(k => a(colMap[k]||P.slate, 0.82)),
          borderColor: "#1A2A3A", borderWidth: 3, hoverOffset: 8,
        }]},
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "65%",
          plugins: { legend: { position: "bottom" }},
        },
      });
    }

    // ── 8. Wallet balance histogram ────────────────────────────
    {
      const brackets = [
        { label: "0–10 EGP",     min: 0,    max: 10   },
        { label: "10–50 EGP",    min: 10,   max: 50   },
        { label: "50–100 EGP",   min: 50,   max: 100  },
        { label: "100–200 EGP",  min: 100,  max: 200  },
        { label: "200–500 EGP",  min: 200,  max: 500  },
        { label: "500+ EGP",     min: 500,  max: Infinity },
      ];
      const BPAL = [P.red, P.amber, P.amber, P.green, P.blue, P.dblue];
      const counts = brackets.map(b =>
        wal.filter(w => { const bal = parseFloat(w.balance||0); return bal >= b.min && bal < b.max; }).length
      );

      mkChart("cWallets", {
        type: "bar",
        data: { labels: brackets.map(b => b.label), datasets: [{
          data: counts,
          backgroundColor: brackets.map((_, i) => a(BPAL[i], 0.80)),
          borderRadius: 6, borderSkipped: false,
        }]},
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.raw} wallets` }}
          },
          scales: {
            x: scaleX(),
            y: { ...scaleY(), beginAtZero: true, ticks: { ...scaleY().ticks, stepSize: 1 } },
          },
        },
      });
    }

    // ── 9. Top 15 trips by fare rate ──────────────────────────
    {
      const top = tr.filter(t => t.km_per_fare)
        .sort((a, b) => parseFloat(b.km_per_fare) - parseFloat(a.km_per_fare))
        .slice(0, 15);

      mkChart("cTopTrips", {
        type: "bar",
        data: { labels: top.map(t => `#${t.trip_id}`), datasets: [{
          label: "Fare/KM (EGP)",
          data: top.map(t => parseFloat(t.km_per_fare)),
          backgroundColor: top.map((_, i) => {
            const r = i / top.length;
            return a(r < 0.33 ? P.dblue : r < 0.66 ? P.blue : P.lblue, 0.82);
          }),
          borderRadius: 5, borderSkipped: false,
        }]},
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(4)} EGP/km` }}
          },
          scales: {
            x: scaleX(),
            y: { ...scaleY(), ticks: { ...scaleY().ticks, callback: v => v + " EGP" } },
          },
        },
      });
    }

    // ── 10. Driver leaderboard horizontal bar ──────────────────
    {
      const sorted = drv.filter(d => d.name)
        .sort((a, b) => parseInt(b.count_trips_daily||0) - parseInt(a.count_trips_daily||0))
        .slice(0, 15);
      const maxV = Math.max(...sorted.map(d => parseInt(d.count_trips_daily||0)), 1);

      mkChart("cDrivers", {
        type: "bar",
        data: { labels: sorted.map(d => d.name), datasets: [{
          label: "Daily Trips",
          data: sorted.map(d => parseInt(d.count_trips_daily||0)),
          backgroundColor: sorted.map(d => {
            const r = parseInt(d.count_trips_daily||0) / maxV;
            return a(r > 0.7 ? P.green : r > 0.4 ? P.blue : P.slate, 0.80);
          }),
          borderRadius: 5, borderSkipped: false,
        }]},
        options: {
          indexAxis: "y",
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }},
          scales: {
            x: { ...scaleY(), beginAtZero: true, ticks: { ...scaleY().ticks, stepSize: 1 } },
            y: { ...scaleX(), ticks: { ...scaleX().ticks, font: { size: 11 } } },
          },
        },
      });
    }

  } catch (err) {
    toast("Analytics: " + err.message, "error");
  }
}
