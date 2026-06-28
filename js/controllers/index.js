/**
 * BusCo — Page Controllers (controllers/index.js)
 * One controller per route. Each fetches data and renders via BaseView.
 */

import { models }   from "../models/index.js";
import { BaseView } from "../views/BaseView.js";
import {
  ge, toast, openModal, closeModal, confirmDialog,
  gv, fmtDate, fmtId, fmtMoney, badge, emptyRow, formField,
} from "../utils/dom.js";

 //Hashing 
  async function sha256(str) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str)
  );

  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Shared action buttons ──────────────────────────────────────
const actTd = id => `<td class="action-td">
  <button class="icon-btn edit-btn"   data-id="${id}" title="Edit">✎</button>
  <button class="icon-btn delete-btn" data-id="${id}" title="Delete">⌫</button>
</td>`;

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════
export async function dashboardController() {
  ge("main").innerHTML = `<div class="page-anim">
    <header class="page-header">
      <div class="page-header-text">
        <h1 class="page-title">Dashboard</h1>
        <p class="page-sub">Live network overview — <span id="dashTime" class="dash-time"></span></p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" onclick="navigate('analytics')" style="font-size:12px">
          View Full Analytics →
        </button>
      </div>
    </header>

    <!-- KPI Stats -->
    <div class="stats-grid" id="statsGrid">
      ${[...Array(6)].map(() => `<div class="stat-card loading-card"><div class="skel skel-val"></div><div class="skel skel-lbl"></div></div>`).join("")}
    </div>

    <!-- Tables -->
    <div class="dash-grid">
      <div class="tcard">
        <div class="tcard-head">
          <span class="tcard-title">Recent Transactions</span>
          <span class="badge badge-slate" id="txCount">—</span>
        </div>
        <div class="table-scroll"><table class="data-table">
          <thead><tr><th>ID</th><th>Fare</th><th>Type</th><th>Method</th><th>Time</th></tr></thead>
          <tbody id="txBody"><tr><td colspan="5" class="loading-cell"><span class="spinner dark"></span></td></tr></tbody>
        </table></div>
      </div>
      <div class="tcard">
        <div class="tcard-head">
          <span class="tcard-title">Latest Incidents</span>
          <span class="badge badge-slate" id="incCount">—</span>
        </div>
        <div class="table-scroll"><table class="data-table">
          <thead><tr><th>Bus</th><th>Severity</th><th>Reporter</th></tr></thead>
          <tbody id="incBody"><tr><td colspan="3" class="loading-cell"><span class="spinner dark"></span></td></tr></tbody>
        </table></div>
      </div>
    </div>
  </div>`;

 

  // Live clock
  const dashTime = ge("dashTime");
  if (dashTime) {
    const tick = () => dashTime.textContent = new Date().toLocaleTimeString("en-GB");
    tick(); setInterval(tick, 1000);
  }

  try {
    const [users, buses, trips, txns, incs, wallets] = await Promise.all([
      models.user.list({ select: "id" }),

      models.bus.list({ select: "bus_id,status" }),
      models.trip.list({ select: "trip_id,active" }),
      models.transaction.totalRevenue(300),
      models.incident.list({ select: "incident_id,severity_level" }),
      models.wallet.list({ select: "wallet_id,balance" }),
    ]);

    const activeBuses  = (buses  || []).filter(b => b.status === "ACTIVE").length;
    const activeTrips  = (trips  || []).filter(t => t.active).length;
    const revenue      = (txns   || []).filter(t => t.type === "DEBIT").reduce((s, t) => s + parseFloat(t.fare ?? 0), 0);
    const highInc      = (incs   || []).filter(i => i.severity_level === "HIGH").length;
    const totalWallet  = (wallets|| []).reduce((s, w) => s + parseFloat(w.balance ?? 0), 0);

    ge("statsGrid").innerHTML = [
      { icon:"⊙", label:"Total Users",      val:(users||[]).length,                          note:"Registered passengers", mod:"" },
      { icon:"▷", label:"Active Buses",     val:`${activeBuses} / ${(buses||[]).length}`,    note:"Currently on route",    mod:"green" },
      { icon:"⌖", label:"Active Trips",     val:activeTrips,                                 note:"In progress now",       mod:"" },
      { icon:"⇄", label:"Revenue",          val:revenue.toFixed(0)+" EGP",                  note:"Last 300 transactions", mod:"amber" },
      { icon:"△", label:"High Incidents",   val:highInc,                                     note:"Require attention",     mod:"red" },
      { icon:"◎", label:"Wallet Balance",   val:totalWallet.toFixed(0)+" EGP",              note:"Total across network",  mod:"" },
    ].map(s => `<div class="stat-card ${s.mod?"stat-"+s.mod:""}">
      <div class="stat-icon">${s.icon}</div>
      <div class="stat-val">${s.val}</div>
      <div class="stat-lbl">${s.label}</div>
      <div class="stat-note">${s.note}</div>
    </div>`).join("");

    const [recentTx, recentInc] = await Promise.all([
      models.transaction.listRecent(8),
      models.incident.listRecent(),
    ]);

    const txList  = (recentTx  || []).slice(0, 8);
    const incList = (recentInc || []).slice(0, 6);
    ge("txCount").textContent  = txList.length;
    ge("incCount").textContent = incList.length;

    ge("txBody").innerHTML = txList.map(t => `<tr>
      <td>${fmtId(t.transaction_id)}</td>
      <td>${fmtMoney(t.fare)}</td>
      <td>${badge(t.type)}</td>
      <td><span class="badge badge-slate">${t.method_payment ?? "—"}</span></td>
      <td class="ts">${fmtDate(t.timestamp)}</td>
    </tr>`).join("") || emptyRow(5);

    ge("incBody").innerHTML = incList.map(i => `<tr>
      <td>${i.bus_id ? `<span class="badge badge-blue">Bus #${i.bus_id}</span>` : '<span class="nil">—</span>'}</td>
      <td>${badge(i.severity_level)}</td>
      <td class="sm">${i.by_reported ?? "—"}</td>
    </tr>`).join("") || emptyRow(3);

  } catch (e) {
    toast("Dashboard error: " + e.message, "error");
  }
}


// ═══════════════════════════════════════════════════════════════
//  FACTORY — creates a load() fn for standard CRUD pages
// ═══════════════════════════════════════════════════════════════
function makePage({ title, subtitle, model, cols, rowFn, addLabel, createFormFn, editFormFn, createFn, updateFn, deleteLabel }) {
  return function load() {
    const view = new BaseView({
      title, subtitle, addLabel,
      cols,
      primaryKey:     model.primaryKey,
      rowHTML:        rowFn,
      createFormHTML: createFormFn || null,
      editFormHTML:   editFormFn   || null,
      onCreateSubmit: createFn     || null,
      onEditSubmit:   updateFn     || null,
      onDelete:       id => model.delete(id),
      deleteLabel:    deleteLabel  || null,
      onRefresh:      load,
    });

    view.renderSkeleton();
    model.list().then(rows => view.renderRows(rows || [])).catch(e => view.renderError(e.message));
  };
}

// ═══════════════════════════════════════════════════════════════
//  USERS
// ═══════════════════════════════════════════════════════════════
export const usersController = makePage({
  title:"Users", subtitle:"Registered passengers and accounts",
  model: models.user, addLabel: null,

  cols:["ID","Name","Email","Phone","Daily Trips","Pref. Bus","Created",""],
  rowFn: u => `<tr>
    <td>${fmtId(u.user_id)}</td>
    <td class="name-cell">${u.name ?? "—"}</td>
    <td class="sm">${u.email ?? "—"}</td>
    <td class="mono sm">${u.phone ?? "—"}</td>
    <td><span class="badge badge-blue">${u.count_trips_daily ?? 0}</span></td>
    <td>${u.id_bus_preferred ? `<span class="badge badge-slate">Bus #${u.id_bus_preferred}</span>` : '<span class="nil">—</span>'}</td>
    <td class="ts">${fmtDate(u.created_at)}</td>
    ${actTd(u.user_id)}
  </tr>`,
  createFormFn: () => `
    ${formField({id:"f0",label:"Full Name",placeholder:"Ali Mahmoud",required:true})}
    ${formField({id:"f1",label:"Email",type:"email",placeholder:"ali@mail.eg"})}
    ${formField({id:"f2",label:"Phone",placeholder:"01011111111"})}
    ${formField({id:"f3",label:"Password Hash",placeholder:"SHA-256 hash"})}`,
  editFormFn: u => `
    ${formField({id:"f0",label:"Full Name",value:u.name,required:true})}
    ${formField({id:"f1",label:"Email",type:"email",value:u.email})}
    ${formField({id:"f2",label:"Phone",value:u.phone})}
    ${formField({id:"f3",label:"Daily Trips",type:"number",value:u.count_trips_daily??0})}`,
createFn: null,
  updateFn: id => models.user.update(id,{name:gv("f0"),email:gv("f1"),phone:gv("f2"),count_trips_daily:parseInt(gv("f3"))||0}),
  deleteLabel: u => u?.name ?? `User #${u?.user_id}`,
});

// ═══════════════════════════════════════════════════════════════
//  CARDS
// ═══════════════════════════════════════════════════════════════
export function cardsController() {
  const model = models.card;
  let _rows = [];

  const view = new BaseView({
    title:"Cards", subtitle:"NFC cards — register, block, assign",
    addLabel:"Register Card", cols:["ID","UID","Profile ID","Status","Created",""],
    primaryKey:"card_id",
    rowHTML: c => `<tr>
      <td>${fmtId(c.card_id)}</td>
      <td class="mono sm">${c.uid ?? "—"}</td>
      <td class="mono sm">${c.profile_id ?? "—"}</td>
      <td>${c.blocked ? badge("FAILED") : badge("SUCCESS")}</td>
      <td class="ts">${fmtDate(c.created_at)}</td>
      <td class="action-td">
        <button class="icon-btn toggle-btn ${c.blocked?"unblock":"block"}" data-id="${c.card_id}" data-blocked="${c.blocked}">${c.blocked?"↑":"⊘"}</button>
        <button class="icon-btn delete-btn" data-id="${c.card_id}">⌫</button>
      </td>
    </tr>`,
    createFormHTML: () => `
      ${formField({id:"f0",label:"Card UID",placeholder:"CARD-UID-001",required:true})}
${formField({id:"f1",label:"Profile ID",placeholder:"uuid...",required:true})}`,
    editFormHTML: null,
onCreateSubmit: () => model.create({uid:gv("f0"),profile_id:gv("f1"),secret:"secret_"+Date.now(),blocked:false}),
    onDelete: id => model.delete(id),
    deleteLabel: null,
    onRefresh: load,
  });

  function load() {
    view.renderSkeleton();
    model.list().then(rows => {
      _rows = rows || [];
      view.renderRows(_rows);
      // Extra toggle handler
      ge("tableCard")?.addEventListener("click", async e => {
        const tb = e.target.closest(".toggle-btn");
        if (!tb) return;
        const id      = tb.dataset.id;
        const blocked = tb.dataset.blocked === "true";
        try {
          await model.update(id, { blocked: !blocked });
          toast(blocked ? "Card unblocked" : "Card blocked", "success");
          load();
        } catch (err) { toast(err.message, "error"); }
      });
    }).catch(e => view.renderError(e.message));
  }
  load();
}

// ═══════════════════════════════════════════════════════════════
//  WALLETS
// ═══════════════════════════════════════════════════════════════
export function walletsController() {
  const model = models.wallet;

  const view = new BaseView({
    title:"Wallets", subtitle:"Passenger digital wallets and balances",
    cols:["Wallet ID","Profile ID","Balance","Currency","Last Updated",""],

    primaryKey:"wallet_id",
    rowHTML: w => {
      const bal = parseFloat(w.balance ?? 0);
      return `<tr>
        <td>${fmtId(w.wallet_id)}</td>
        <td class="mono sm">${w.profile_id ?? "—"}</td>

        <td><span class="money ${bal<20?"money-low":"money-ok"}">${bal.toFixed(2)} <span class="currency">EGP</span></span></td>
        <td><span class="badge badge-blue">${w.currency ?? "EGP"}</span></td>
        <td class="ts">${fmtDate(w.last_updated)}</td>
        <td class="action-td"><button class="icon-btn topup-btn" data-id="${w.wallet_id}" data-bal="${w.balance}">+</button></td>
      </tr>`;
    },
    onDelete: null,
    onRefresh: load,
  });

  function load() {
    view.renderSkeleton();
    model.list().then(rows => {
      view.renderRows(rows || []);
      ge("tableCard")?.addEventListener("click", e => {
        const tb = e.target.closest(".topup-btn");
        if (!tb) return;
        const id = tb.dataset.id, bal = parseFloat(tb.dataset.bal ?? 0);
        openModal({
          title: `Top Up Wallet #${id}`,
          body: `<div class="topup-current">Current balance: <strong>${bal.toFixed(2)} EGP</strong></div>
                 <div class="form-grid">${formField({id:"fa0",label:"Amount to Add (EGP)",type:"number",placeholder:"50.00"})}</div>`,
          footer: `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
                   <button class="btn btn-primary" id="topupOk">Add Balance</button>`,
        });
        ge("topupOk")?.addEventListener("click", async () => {
          const amt = parseFloat(gv("fa0"));
          if (!amt || amt <= 0) { toast("Enter a valid amount","error"); return; }
          try {
            await model.update(id, { balance: bal + amt });
            closeModal(); toast(`Added ${amt.toFixed(2)} EGP`,"success"); load();
          } catch (err) { toast(err.message,"error"); }
        });
      });
    }).catch(e => view.renderError(e.message));
  }
  load();
}

// ═══════════════════════════════════════════════════════════════
//  DRIVERS
// ═══════════════════════════════════════════════════════════════
export const driversController = makePage({
  title:"Drivers", subtitle:"Bus drivers and their assignments",
  model:models.driver, addLabel:"Add Driver",
  cols:["ID","Name","Phone","Email","Bus","Daily Trips",""],
  rowFn: d => `<tr>
    <td>${fmtId(d.driver_id)}</td>
    <td class="name-cell">${d.name ?? "—"}</td>
    <td class="mono sm">${d.phone ?? "—"}</td>
    <td class="sm">${d.email ?? "—"}</td>
    <td>${d.current_bus_id ? `<span class="badge badge-green">Bus #${d.current_bus_id}</span>` : '<span class="nil">Unassigned</span>'}</td>
    <td><span class="badge badge-blue">${d.count_trips_daily ?? 0}</span></td>
    ${actTd(d.driver_id)}
  </tr>`,
  createFormFn: () => `
    ${formField({id:"f0",label:"Full Name",placeholder:"Hassan Ali",required:true})}
    ${formField({id:"f1",label:"Phone",placeholder:"01055555551"})}
    ${formField({id:"f2",label:"Email",type:"email",placeholder:"hassan@driver.eg"})}
    ${formField({id:"f3",label:"Password Hash",placeholder:"hashed_password"})}
    ${formField({id:"f4",label:"Assign Bus ID",type:"number",placeholder:"(optional)"})}
    ${formField({id:"f5",label:"Device ID",placeholder:"DEV-TAB-001"})}`,
  editFormFn: d => `
    ${formField({id:"f0",label:"Full Name",value:d.name,required:true})}
    ${formField({id:"f1",label:"Phone",value:d.phone})}
    ${formField({id:"f2",label:"Email",type:"email",value:d.email})}
    ${formField({id:"f4",label:"Assign Bus ID",type:"number",value:d.current_bus_id??''})}`,
  createFn: () => models.driver.create({name:gv("f0"),phone:gv("f1"),email:gv("f2"),password_hash:gv("f3")||"placeholder",current_bus_id:parseInt(gv("f4"))||null,id_device_driver:gv("f5")||null,count_trips_daily:0}),
  updateFn: id => models.driver.update(id,{name:gv("f0"),phone:gv("f1"),email:gv("f2"),current_bus_id:parseInt(gv("f4"))||null}),
  deleteLabel: d => d?.name ?? `Driver #${d?.driver_id}`,
});

// ═══════════════════════════════════════════════════════════════
//  BUSES
// ═══════════════════════════════════════════════════════════════
// const BUS_STATUS = [
//   {value:"IDLE",   label:"IDLE"},
//   {value:"ACTIVE", label:"ACTIVE"},
//   {value:"BROKEN", label:"BROKEN"},
//   {value:"ON_TRIP",label:"ON_TRIP"},
// ];
// export const busesController = makePage({
//   title:"Buses", subtitle:"Fleet — status, GPS, assignments",
//   model:models.bus, addLabel:"Add Bus",
//   cols:["ID","Bus No.","Line","Driver","Status","Today","GPS",""],
//   rowFn: b => `<tr>
//     <td>${fmtId(b.bus_id)}</td>
//     <td class="name-cell">${b.number_bus ?? "—"}</td>
//     <td>${b.id_driver ? fmtId(b.id_driver) : '<span class="nil">—</span>'}</td>
//     <td>${badge(b.status)}</td>
//     <td><span class="badge badge-slate">${b.count_today_trips ?? 0}</span></td>
//     <td class="mono sm">${b.gps_lat ? `${parseFloat(b.gps_lat).toFixed(4)}, ${parseFloat(b.gps_lng).toFixed(4)}` : '<span class="nil">—</span>'}</td>
//     ${actTd(b.bus_id)}
//   </tr>`,
// createFormFn: () => `
//     ${formField({id:"f0",label:"Bus Number",placeholder:"BUS-003",required:true})}
//     ${formField({id:"f2",label:"Driver ID",type:"number",placeholder:"(optional)"})}
//     ${formField({id:"f3",label:"Status",options:BUS_STATUS,value:"IDLE"})}
//     ${formField({id:"f4",label:"Route ID",type:"number",placeholder:"(optional)"})}`,
// editFormFn: b => `
//     ${formField({id:"f0",label:"Bus Number",value:b.number_bus,required:true})}
//     ${formField({id:"f2",label:"Driver ID",type:"number",value:b.id_driver??''})}
//     ${formField({id:"f3",label:"Status",options:BUS_STATUS,value:b.status})}
//     ${formField({id:"f4",label:"Route ID",type:"number",value:b.route_id??''})}
//     ${formField({id:"f5",label:"Today Trips",type:"number",value:b.count_today_trips??0})}`,

// createFn: () => models.bus.create({
//     number_bus:        gv("f0"),
//     id_driver:         parseInt(gv("f2")) || null,
//     status:            gv("f3") || "IDLE",
//     route_id:          parseInt(gv("f4")) || null,
//     count_today_trips: 0,
// }),
// updateFn: id => models.bus.update(id, {
//     number_bus:        gv("f0"),
//     id_driver:         parseInt(gv("f2")) || null,
//     status:            gv("f3"),
//     route_id:          parseInt(gv("f4")) || null,
//     count_today_trips: parseInt(gv("f5")) || 0,
// }),
//   deleteLabel: b => b?.number_bus ?? `Bus #${b?.bus_id}`,
// });

// ═══════════════════════════════════════════════════════════════
//  TRIPS
// ═══════════════════════════════════════════════════════════════
const TRIP_STATUS = [{value:"true",label:"Active"},{value:"false",label:"Completed"}];

export const tripsController = makePage({
  title:"Trips", subtitle:"All trips — active, completed, historical",
  model:models.trip, addLabel:"Start Trip",
  cols:["ID","Bus","Driver","Status","Fare/KM","Distance","Started","Ended",""],
  rowFn: t => `<tr>
    <td>${fmtId(t.trip_id)}</td>
    <td>${t.bus_id ? `<span class="badge badge-blue">Bus #${t.bus_id}</span>` : '<span class="nil">—</span>'}</td>
    <td>${fmtId(t.driver_id)}</td>
    <td>${t.active ? badge("ACTIVE") : badge("IDLE")}</td>
    <td class="mono sm">${t.fare ?? "—"} EGP</td>
    <td class="mono sm">${t.distance_total ? t.distance_total+" km" : '<span class="nil">—</span>'}</td>
    <td class="ts">${fmtDate(t.start_time)}</td>
    <td class="ts">${t.end_time ? fmtDate(t.end_time) : '<span class="badge badge-green">Ongoing</span>'}</td>
    ${actTd(t.trip_id)}
  </tr>`,
  createFormFn: () => `
    ${formField({id:"f0",label:"Bus ID",type:"number",placeholder:"1",required:true})}
    ${formField({id:"f1",label:"Driver ID",type:"number",placeholder:"1"})}
    ${formField({id:"f2",label:"Fare per KM",type:"number",placeholder:"0.75",value:"0.75"})}
    ${formField({id:"f3",label:"Tablet Device",placeholder:"TABLET-BUS-001"})}`,
 editFormFn: t => `
    ${formField({id:"f0",label:"Bus ID",type:"number",value:t.bus_id??''})}
    ${formField({id:"f1",label:"Driver ID",type:"number",value:t.driver_id??''})}
    ${formField({id:"f2",label:"Fare (EGP)",type:"number",value:t.fare??5})}
    ${formField({id:"f3",label:"Distance (km)",type:"number",value:t.distance_total??''})}
    ${formField({id:"f4",label:"Status",options:TRIP_STATUS,value:String(t.active)})}
    ${formField({id:"f5",label:"End Time",type:"datetime-local",value:t.end_time?t.end_time.slice(0,16):''})}`,

createFn: () => models.trip.create({
    bus_id: parseInt(gv("f0")),
    driver_id: parseInt(gv("f1")) || null,
    fare: parseFloat(gv("f2")) || 5,
    id_tablet_trip: gv("f3") || null,
    active: true,
}),  updateFn: id => models.trip.update(id, {
    bus_id: parseInt(gv("f0")) || null,
    driver_id: parseInt(gv("f1")) || null,
    fare: parseFloat(gv("f2")) || 5,
    distance_total: parseFloat(gv("f3")) || null,
    active: gv("f4") === "true",
    end_time: gv("f5") || null,
}),
  deleteLabel: t => `Trip #${t?.trip_id}`,
});

// ═══════════════════════════════════════════════════════════════
//  STATIONS
// ═══════════════════════════════════════════════════════════════
// export const stationsController = makePage({
//   title:"Stations", subtitle:"Bus stops and stations across the network",
//   model:models.station, addLabel:"Add Station",
//   cols:["ID","Name","Latitude","Longitude","Created",""],
//   rowFn: s => `<tr>
//     <td>${fmtId(s.station_id)}</td>
//     <td class="name-cell">${s.name ?? "—"}</td>
//     <td class="mono sm">${s.location_lat ?? "—"}</td>
//     <td class="mono sm">${s.location_lng ?? "—"}</td>
//     <td class="ts">${fmtDate(s.created_at)}</td>
//     ${actTd(s.station_id)}
//   </tr>`,
//   createFormFn: () => `
//     ${formField({id:"f0",label:"Station Name",placeholder:"Tahrir Square",required:true,fullWidth:true})}
//     ${formField({id:"f1",label:"Latitude",type:"number",placeholder:"30.0444196"})}
//     ${formField({id:"f2",label:"Longitude",type:"number",placeholder:"31.2357116"})}`,
//   editFormFn: s => `
//     ${formField({id:"f0",label:"Station Name",value:s.name,required:true,fullWidth:true})}
//     ${formField({id:"f1",label:"Latitude",type:"number",value:s.location_lat??''})}
//     ${formField({id:"f2",label:"Longitude",type:"number",value:s.location_lng??''})}`,
//   createFn: () => models.station.create({name:gv("f0"),location_lat:parseFloat(gv("f1"))||null,location_lng:parseFloat(gv("f2"))||null}),
//   updateFn: id => models.station.update(id,{name:gv("f0"),location_lat:parseFloat(gv("f1"))||null,location_lng:parseFloat(gv("f2"))||null}),
//   deleteLabel: s => s?.name ?? `Station #${s?.station_id}`,
// });

// ═══════════════════════════════════════════════════════════════
//  TRANSACTIONS (read-only)
// ═══════════════════════════════════════════════════════════════
export function transactionsController() {
  const view = new BaseView({
    title:"Transactions", subtitle:"All payments and credits — last 100",
    cols:["ID","Wallet","Trip","Fare","Type","Method","Time"],
    rowHTML: t => `<tr>
      <td>${fmtId(t.transaction_id)}</td>
      <td>${fmtId(t.wallet_id)}</td>
      <td>${t.trip_id ? fmtId(t.trip_id) : '<span class="nil">—</span>'}</td>
      <td>${fmtMoney(t.fare)}</td>
      <td>${badge(t.type)}</td>
      <td><span class="badge badge-slate">${t.method_payment ?? "—"}</span></td>
      <td class="ts">${fmtDate(t.ts)}</td>

    </tr>`,
  });
  view.renderSkeleton();
  models.transaction.listRecent(100).then(r => view.renderRows(r||[])).catch(e => view.renderError(e.message));
}

// ═══════════════════════════════════════════════════════════════
//  RECHARGE (read-only)
// ═══════════════════════════════════════════════════════════════
export function rechargeController() {
  const view = new BaseView({
    title:"Recharges", subtitle:"Wallet top-up operations by shippers",
    cols:["ID","Shipper","Wallet","Amount","Method","Status","Time"],
    rowHTML: r => `<tr>
      <td>${fmtId(r.recharge_id)}</td>
      <td>${fmtId(r.shipper_id)}</td>
      <td>${fmtId(r.wallet_id)}</td>
      <td>${fmtMoney(r.amount)}</td>
      <td><span class="badge badge-slate">${r.method_payment ?? "—"}</span></td>
      <td>${badge(r.status)}</td>
      <td class="ts">${fmtDate(r.ts)}</td>

    </tr>`,
  });
  view.renderSkeleton();
  models.recharge.listRecent().then(r => view.renderRows(r||[])).catch(e => view.renderError(e.message));
}

// ═══════════════════════════════════════════════════════════════
//  TRANSFERS (read-only)
// ═══════════════════════════════════════════════════════════════
export function transfersController() {
  const view = new BaseView({
    title:"Transfers", subtitle:"Peer-to-peer wallet balance transfers",
    cols:["ID","From Wallet","To Wallet","Amount","Status","Time"],
    rowHTML: t => `<tr>
      <td>${fmtId(t.transfer_id)}</td>
      <td>${fmtId(t.sender_wallet_id)}</td>
      <td>${fmtId(t.receiver_wallet_id)}</td>
      <td>${fmtMoney(t.amount)}</td>
      <td>${badge(t.status)}</td>
      <td class="ts">${fmtDate(t.created_at)}</td>
    </tr>`,
  });
  view.renderSkeleton();
  models.transfer.listRecent().then(r => view.renderRows(r||[])).catch(e => view.renderError(e.message));
}

// ═══════════════════════════════════════════════════════════════
//  INCIDENTS
// ═══════════════════════════════════════════════════════════════
const SEV = [{value:"LOW",label:"LOW"},{value:"MEDIUM",label:"MEDIUM"},{value:"HIGH",label:"HIGH"}];

export const incidentsController = makePage({
  title:"Incidents", subtitle:"Bus breakdowns and incident reports",
  model:models.incident, addLabel:"Report Incident",
  cols:["ID","Bus","Trip","Description","Reporter","Severity","Time",""],
  rowFn: i => `<tr>
    <td>${fmtId(i.incident_id)}</td>
    <td>${i.bus_id ? `<span class="badge badge-blue">Bus #${i.bus_id}</span>` : '<span class="nil">—</span>'}</td>
    <td>${i.trip_id ? fmtId(i.trip_id) : '<span class="nil">—</span>'}</td>
    <td class="desc-cell">${i.description ?? "—"}</td>
    <td class="sm">${i.by_reported ?? "—"}</td>
    <td>${badge(i.severity_level)}</td>
    <td class="ts">${fmtDate(i.timestamp)}</td>
    ${actTd(i.incident_id)}
  </tr>`,
  createFormFn: () => `
    ${formField({id:"f0",label:"Bus ID",type:"number",placeholder:"1",required:true})}
    ${formField({id:"f1",label:"Trip ID",type:"number",placeholder:"(optional)"})}
    ${formField({id:"f2",label:"Description",type:"textarea",placeholder:"Describe…",fullWidth:true})}
    ${formField({id:"f3",label:"Reported By",placeholder:"Name"})}
    ${formField({id:"f4",label:"Severity",options:SEV,value:"LOW"})}`,
  editFormFn: i => `
    ${formField({id:"f2",label:"Description",type:"textarea",value:i.description??'',fullWidth:true})}
    ${formField({id:"f3",label:"Reported By",value:i.by_reported??''})}
    ${formField({id:"f4",label:"Severity",options:SEV,value:i.severity_level})}`,
  createFn: () => models.incident.create({bus_id:parseInt(gv("f0")),trip_id:parseInt(gv("f1"))||null,description:gv("f2"),by_reported:gv("f3"),severity_level:gv("f4")||"LOW"}),
  updateFn: id => models.incident.update(id,{description:gv("f2"),by_reported:gv("f3"),severity_level:gv("f4")}),
  deleteLabel: i => `Incident #${i?.incident_id}`,
});

// ═══════════════════════════════════════════════════════════════
//  LOGS (read-only)
// ═══════════════════════════════════════════════════════════════
export function logsController() {
  const view = new BaseView({
    title:"System Logs", subtitle:"Immutable audit trail — last 100 events",
    cols:["ID","Action","User","Bus","Trip","Message","Time"],
    rowHTML: l => `<tr>
      <td>${fmtId(l.log_id)}</td>
      <td><span class="badge badge-blue">${l.action ?? "—"}</span></td>
      <td class="mono sm">${l.profile_id ?? "—"}</td>

      <td>${l.bus_id  ? fmtId(l.bus_id)  : '<span class="nil">—</span>'}</td>
      <td>${l.trip_id ? fmtId(l.trip_id) : '<span class="nil">—</span>'}</td>
      <td class="desc-cell sm">${l.message ?? "—"}</td>
      <td class="ts">${fmtDate(l.created_at)}</td>
    </tr>`,
  });
  view.renderSkeleton();
  models.log.listRecent(100).then(r => view.renderRows(r||[])).catch(e => view.renderError(e.message));
}

// ═══════════════════════════════════════════════════════════════
//  ADMINS
// ═══════════════════════════════════════════════════════════════
const ROLES = [
  {value:"SUPER_ADMIN",label:"Super Admin"},
  {value:"BUS_ADMIN",label:"Bus Admin"},
  {value:"FINANCE_ADMIN",label:"Finance Admin"},
  {value:"TOPUP_OPERATOR",label:"Topup Operator"},
];

export const adminsController = makePage({
  title:"Administrators", subtitle:"System admin accounts and roles",
  model:models.admin, addLabel:"Add Admin",
  cols:["ID","Name","Email","Role","Station","Created",""],
  rowFn: a => `<tr>
    <td>${fmtId(a.admin_id)}</td>
    <td class="name-cell">${a.name ?? "—"}</td>
    <td class="sm">${a.email ?? "—"}</td>
    <td>${badge(a.role)}</td>
    <td>${a.id_station ? `Station #${a.id_station}` : '<span class="nil">—</span>'}</td>
    <td class="ts">${fmtDate(a.created_at)}</td>
    ${actTd(a.admin_id)}
  </tr>`,
  createFormFn: () => `
    ${formField({id:"f0",label:"Full Name",placeholder:"Admin Name",required:true})}
    ${formField({id:"f1",label:"Email",type:"email",placeholder:"admin@busco.eg",required:true})}
    ${formField({id:"f2",label:"Password",type:"password",required:true})}
    ${formField({id:"f3",label:"Role",options:ROLES,value:"BUS_ADMIN"})}
    ${formField({id:"f4",label:"Station ID",type:"number",placeholder:"(optional)"})}`,
  editFormFn: a => `
    ${formField({id:"f0",label:"Full Name",value:a.name,required:true})}
    ${formField({id:"f1",label:"Email",type:"email",value:a.email})}
    ${formField({id:"f3",label:"Role",options:ROLES,value:a.role})}
    ${formField({id:"f4",label:"Station ID",type:"number",value:a.id_station??''})}`,
 createFn: async () => {
  const password = gv("f2");

  return models.admin.create({
    name: gv("f0"),
    email: gv("f1"),
    password_hash: await sha256(password),
    role: gv("f3"),
    id_station: parseInt(gv("f4")) || null
  });
},
  updateFn: id => models.admin.update(id,{name:gv("f0"),email:gv("f1"),role:gv("f3"),id_station:parseInt(gv("f4"))||null}),
  deleteLabel: a => a?.name ?? `Admin #${a?.admin_id}`,
});
