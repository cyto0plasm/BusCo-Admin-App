/**
 * BusCo — Base Model (models/BaseModel.js)
 * ─────────────────────────────────────────
 * Generic CRUD for a Supabase table.
 * Extend this for every entity.
 */

import { api } from "../utils/api.js";

export class BaseModel {
  constructor(table, primaryKey = "id") {
    this.table      = table;
    this.primaryKey = primaryKey;
  }

  /** List all rows with optional PostgREST params */
  list(params = {}) {
    const defaults = { order: `${this.primaryKey}.asc` };
    return api.list(this.table, { ...defaults, ...params });
  }

  /** Fetch single row by primary key */
  find(id, select = "*") {
    return api.get(this.table, {
      [`${this.primaryKey}`]: `eq.${id}`,
      select,
    });
  }

  /** Create new row */
  create(data) {
    return api.create(this.table, data);
  }

  /** Update row(s) matching filter */
  update(id, data) {
    return api.update(this.table, { [`${this.primaryKey}`]: `eq.${id}` }, data);
  }

  /** Delete row by primary key */
  delete(id) {
    return api.remove(this.table, { [`${this.primaryKey}`]: `eq.${id}` });
  }
}
