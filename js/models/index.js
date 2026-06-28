/**
 * BusCo — Entity Models (models/index.js)
 * ─────────────────────────────────────────
 * One model class per database table, each extending BaseModel.
 * Custom queries are added as methods on the relevant class.
 */

import { BaseModel } from "./BaseModel.js";
import { api }       from "../utils/api.js";

// ── Auth / Admin ───────────────────────────────────────────────
export class AdminModel extends BaseModel {
  constructor() { super("admins", "admin_id"); }

  findByEmail(email) {
    // Returns password_hash so auth.js can compare — hash is stripped from
    // _session immediately after verification and never stored client-side.
    return api.get("admins", {
      email: `eq.${email}`,
      select: "admin_id,name,email,role,id_station,password_hash",
    });
  }

  list(params = {}) {
    return super.list({
      select: "admin_id,name,email,role,id_station,created_at",
      order: "admin_id.asc",
      ...params,
    });
  }
}

// ── People ─────────────────────────────────────────────────────
export class UserModel extends BaseModel {
  constructor() { super("profiles", "id"); }
}

export class CardModel extends BaseModel {
  constructor() { super("cards", "card_id"); }

  toggleBlock(id, blocked) {
    return this.update(id, { blocked: !blocked });
  }
}

export class WalletModel extends BaseModel {
  constructor() { super("wallets", "wallet_id"); }

  topup(id, currentBalance, amount) {
    const newBalance = parseFloat(currentBalance ?? 0) + parseFloat(amount);
    return this.update(id, { balance: newBalance });
  }
}

export class DriverModel extends BaseModel {
  constructor() { super("drivers", "driver_id"); }
}

// ── Fleet ──────────────────────────────────────────────────────
export class BusModel extends BaseModel {
  constructor() { super("buses", "bus_id"); }
}

export class TripModel extends BaseModel {
  constructor() { super("trips", "trip_id"); }

  listRecent(limit = 100) {
    return this.list({ order: "trip_id.desc", limit: String(limit) });
  }

  endTrip(id) {
    return this.update(id, {
      active:   false,
      end_time: new Date().toISOString(),
    });
  }
}

export class StationModel extends BaseModel {
  constructor() { super("stations", "station_id"); }
}

// ── Finance ────────────────────────────────────────────────────
export class TransactionModel extends BaseModel {
  constructor() { super("transactions", "transaction_id"); }

  listRecent(limit = 100) {
    return this.list({ order: "ts.desc", limit: String(limit) });
  }

  totalRevenue(limit = 300) {
    return this.list({ select: "fare,type", order: "ts.desc", limit: String(limit) });
  }
}

export class RechargeModel extends BaseModel {
  constructor() { super("transactions_recharge", "recharge_id"); }

  listRecent() {
    return this.list({ order: "ts.desc" });
  }
}

export class TransferModel extends BaseModel {
  constructor() { super("transfers", "transfer_id"); }

  listRecent() {
    return this.list({ order: "created_at.desc" });
  }
}

// ── Operations ─────────────────────────────────────────────────
export class IncidentModel extends BaseModel {
  constructor() { super("bus_incidents", "incident_id"); }

  listRecent() {
    // Use primary key ordering to avoid ts column name issues across deployments
    return this.list({ order: "incident_id.desc" });
  }
}

export class LogModel extends BaseModel {
  constructor() { super("logs", "log_id"); }

  listRecent(limit = 100) {
    return this.list({ order: "created_at.desc", limit: String(limit) });
  }
}

export class RouteModel extends BaseModel {
  constructor() { super("routes", "route_id"); }

  listWithStopCount() {
    return api.get("routes", {
      select: "route_id,name,number_line,fare,route_stops(count)",
      order: "route_id.asc",
    });
  }
}

export class RouteStopModel extends BaseModel {
  constructor() { super("route_stops", "id"); }

  listByRoute(routeId) {
    return api.list("route_stops", {
      route_id: `eq.${routeId}`,
      select: "id,route_id,station_id,stop_order,estimated_minutes,stations(name,location_lat,location_lng)",
      order: "stop_order.asc",
    });
  }

  reorder(id, newOrder) {
    return this.update(id, { stop_order: newOrder });
  }
}

// ── Singleton exports ──────────────────────────────────────────
export const models = {
  admin:       new AdminModel(),
  user:        new UserModel(),
  card:        new CardModel(),
  wallet:      new WalletModel(),
  driver:      new DriverModel(),
  bus:         new BusModel(),
  trip:        new TripModel(),
  station:     new StationModel(),
  route:       new RouteModel(),       
  routeStop:   new RouteStopModel(),
  transaction: new TransactionModel(),
  recharge:    new RechargeModel(),
  transfer:    new TransferModel(),
  incident:    new IncidentModel(),
  log:         new LogModel(),
};
