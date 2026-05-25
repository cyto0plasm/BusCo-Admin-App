/**
 * BusCo — Base View (views/BaseView.js)
 * Renders page skeleton, table rows, modals.
 */

import {
  ge, toast, openModal, closeModal, confirmDialog, gv,
  emptyRow, loadingRow,
} from "../utils/dom.js";

export class BaseView {
  constructor(opts) {
    this.opts = opts;
    // keep current data reference for edit lookups
    this._rows = [];
  }

  renderSkeleton() {
    const { title, subtitle, addLabel, cols } = this.opts;
    const addBtn = addLabel
      ? `<button class="btn btn-primary" id="addBtn">+ ${addLabel}</button>`
      : "";

    ge("main").innerHTML = `
      <div class="page-anim">
        <header class="page-header">
          <div class="page-header-text">
            <h1 class="page-title">${title}</h1>
            <p class="page-sub">${subtitle}</p>
          </div>
          <div class="page-actions">${addBtn}</div>
        </header>

        <div class="table-card" id="tableCard">
          <div class="table-toolbar">
            <div class="table-meta">
              <span class="table-title-sm">${title}</span>
              <span class="row-count" id="rowCount">—</span>
            </div>
            <div class="toolbar-right">
              <div class="search-wrap">
                <span class="search-icon">⌕</span>
                <input class="search-input" id="searchInput" placeholder="Search…" autocomplete="off">
              </div>
            </div>
          </div>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead>
              <tbody id="tableBody">${loadingRow(cols.length)}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    // Search
    ge("searchInput")?.addEventListener("input", e => {
      const q = e.target.value.toLowerCase();
      ge("tableBody")?.querySelectorAll("tr").forEach(r => {
        r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    });

    // Add button
    if (addLabel && this.opts.createFormHTML) {
      ge("addBtn")?.addEventListener("click", () => this._openCreateModal());
    }

    // Delegated click for edit/delete — attached once to the stable card
    ge("tableCard")?.addEventListener("click", e => this._handleTableClick(e));
  }

  renderRows(rows) {
    this._rows = rows;
    const tbody = ge("tableBody");
    if (!tbody) return;
    ge("rowCount").textContent = rows.length;
    tbody.innerHTML = rows.length
      ? rows.map(r => this.opts.rowHTML(r)).join("")
      : emptyRow(this.opts.cols.length);
  }

  renderError(msg) {
    const tbody = ge("tableBody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="${this.opts.cols.length}" class="error-cell">⚠ ${msg}</td></tr>`;
    const rc = ge("rowCount");
    if (rc) rc.textContent = "error";
  }

  _handleTableClick(e) {
    const editB = e.target.closest(".edit-btn");
    const delB  = e.target.closest(".delete-btn");
    const pk    = this.opts.primaryKey;

    if (editB && this.opts.editFormHTML && this.opts.onEditSubmit) {
      const id  = editB.dataset.id;
      const row = this._rows.find(r => String(r[pk]) === String(id));
      if (row) this._openEditModal(row);
    }

    if (delB) {
      const id  = delB.dataset.id;
      const row = this._rows.find(r => String(r[pk]) === String(id));
      const lbl = this.opts.deleteLabel ? this.opts.deleteLabel(row) : `#${id}`;
      confirmDialog({
        title: `Delete ${lbl}`,
        message: `Delete "${lbl}"? This cannot be undone.`,
        onConfirm: async () => {
          try {
            await this.opts.onDelete(id);
            toast(`${lbl} deleted`, "success");
            this.opts.onRefresh?.();
          } catch (err) { toast(err.message, "error"); }
        },
      });
    }
  }

  _openCreateModal() {
    openModal({
      title:  `New ${this.opts.addLabel ?? "Record"}`,
      body:   `<div class="form-grid">${this.opts.createFormHTML()}</div>`,
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
               <button class="btn btn-primary" id="submitCreate">Create</button>`,
    });
    ge("submitCreate")?.addEventListener("click", async () => {
      const btn = ge("submitCreate");
      btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span>';
      try {
        await this.opts.onCreateSubmit();
        closeModal();
        toast(`${this.opts.addLabel} created`, "success");
        this.opts.onRefresh?.();
      } catch (e) { toast(e.message, "error"); }
      finally { btn.disabled = false; btn.innerHTML = "Create"; }
    });
  }

  _openEditModal(record) {
    const pk = this.opts.primaryKey;
    openModal({
      title:  `Edit ${this.opts.addLabel ?? "Record"}`,
      body:   `<div class="form-grid">${this.opts.editFormHTML(record)}</div>`,
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
               <button class="btn btn-primary" id="submitEdit">Save Changes</button>`,
    });
    ge("submitEdit")?.addEventListener("click", async () => {
      const btn = ge("submitEdit");
      btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span>';
      try {
        await this.opts.onEditSubmit(record[pk]);
        closeModal();
        toast("Changes saved", "success");
        this.opts.onRefresh?.();
      } catch (e) { toast(e.message, "error"); }
      finally { btn.disabled = false; btn.innerHTML = "Save Changes"; }
    });
  }

  // Public method for custom controllers that need to open edit externally
  openEditModal(record) { this._openEditModal(record); }
}
