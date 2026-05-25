/**
 * BusCo — API Utility (utils/api.js)
 * ────────────────────────────────────
 * Thin wrapper around Supabase PostgREST.
 *
 * RLS Session Strategy:
 * Supabase PostgREST exposes request headers to SQL via:
 *   current_setting('request.headers')::json->>'x-admin-role'
 *   current_setting('request.headers')::json->>'x-admin-id'
 *
 * We send the role and admin_id as custom HTTP headers on every request.
 * The RLS helper functions read them directly — no GUC session variables,
 * no options params, no connection-state issues.
 */

import { CONFIG } from "../config.js";

class ApiClient {
  constructor() {
    this.base       = CONFIG.API_BASE;
    this.key        = CONFIG.ANON_KEY;
    this._adminId   = null;
    this._adminRole = null;
  }

  /** Called by auth.js immediately after successful login */
  setSession(adminId, role) {
    this._adminId   = String(adminId);
    this._adminRole = role; // lowercase: super_admin / bus_admin / finance_admin
  }

  clearSession() {
    this._adminId   = null;
    this._adminRole = null;
  }

  _headers(extra = {}) {
    const h = {
      "apikey":        this.key,
      "Authorization": `Bearer ${this.key}`,
      "Content-Type":  "application/json",
      "Prefer":        "return=representation",
      ...extra,
    };
    // Inject session into every request as custom headers
    // PostgREST exposes these via current_setting('request.headers')
    if (this._adminRole) h["x-admin-role"] = this._adminRole;
    if (this._adminId)   h["x-admin-id"]   = this._adminId;
    return h;
  }

  _buildQS(params) {
    if (!params || !Object.keys(params).length) return "";
    return "?" + Object.entries(params)
      .map(([k, v]) => {
        const opMatch = String(v).match(/^([a-z]{1,6}\.)(.*)/s);
        if (opMatch) {
          return `${k}=${opMatch[1]}${encodeURIComponent(opMatch[2])}`;
        }
        return `${k}=${encodeURIComponent(v)}`;
      })
      .join("&");
  }

  async _fetch(method, path, params = {}, body = null) {
    const isRpc = path.startsWith("/rpc/");
    const qs    = isRpc ? "" : this._buildQS(params);
    const url   = this.base + path + qs;
    const opts  = {
      method:  isRpc ? "POST" : method,
      headers: this._headers(),
    };
    if (body || isRpc) opts.body = JSON.stringify(body ?? {});

    const res = await fetch(url, opts);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || err.hint || res.statusText);
    }

    if (res.status === 204) return null;
    return res.json().catch(() => null);
  }

  // ── CRUD ──────────────────────────────────────────
  list(table, params = {})     { return this._fetch("GET",    `/${table}`, params); }
  get(table, params = {})      { return this._fetch("GET",    `/${table}`, params); }
  create(table, data)          { return this._fetch("POST",   `/${table}`, {}, data); }
  update(table, filters, data) { return this._fetch("PATCH",  `/${table}`, filters, data); }
  remove(table, filters)       { return this._fetch("DELETE", `/${table}`, filters); }
  rpc(fn, args = {})           { return this._fetch("POST",   `/rpc/${fn}`, {}, args); }
}

export const api = new ApiClient();
