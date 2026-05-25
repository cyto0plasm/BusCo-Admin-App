/**
 * BusCo — Profile Controller (controllers/profile.js)
 * ──────────────────────────────────────────────────────
 * Shows and edits the logged-in admin's profile.
 * Avatar is uploaded to Cloudinary via an unsigned upload preset.
 *
 * ┌─ One-time Cloudinary setup ───────────────────────────────┐
 * │  Dashboard → Settings → Upload → Upload presets           │
 * │  Click "Add upload preset"                                │
 * │  Preset name: busco_profiles                              │
 * │  Signing mode: Unsigned                                   │
 * │  Folder: busco/admins                                     │
 * └───────────────────────────────────────────────────────────┘
 */

import { models }     from "../models/index.js";
import { getSession } from "../auth.js";
import { ge, toast }  from "../utils/dom.js";

// ── Cloudinary config ──────────────────────────────────────────
const CLOUD_NAME    = "dx6krxtgh";
const UPLOAD_URL    = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
const UPLOAD_PRESET = "busco_profiles"; // unsigned preset

async function cloudinaryUpload(file, onProgress) {
  const fd = new FormData();
  fd.append("file",          file);
  fd.append("upload_preset", UPLOAD_PRESET);
  fd.append("folder",        "busco/admins");
  fd.append("tags",          "busco,admin,profile");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", UPLOAD_URL);

    xhr.upload.onprogress = ({ loaded, total, lengthComputable }) => {
      if (lengthComputable && onProgress) onProgress(Math.round(loaded / total * 100));
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText).secure_url);
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText).error?.message || msg; } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(fd);
  });
}

// ── Photo URL is stored in localStorage (no photo col in schema) ──
const CACHE_KEY = "busco_profile_cache";
function getCache()   { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; } }
function setCache(d)  { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); }

// ── Controller ─────────────────────────────────────────────────
export async function profileController() {
  const session = getSession();
  if (!session?.admin_id) {
    ge("main").innerHTML = `<div class="page-anim"><p style="padding:40px;color:var(--muted)">Session expired — please sign in again.</p></div>`;
    return;
  }
  const adminId = session.admin_id;

  ge("main").innerHTML = `
  <div class="page-anim">
    <header class="page-header">
      <div class="page-header-text">
        <h1 class="page-title">My Profile</h1>
        <p class="page-sub">Manage your account information and photo</p>
      </div>
    </header>

    <div class="pf-layout">

      <!-- Left: avatar card -->
      <aside class="pf-sidebar">
        <div class="pf-avatar-card">

          <div class="pf-avatar-ring">
            <img  id="pfPhoto"    class="pf-photo"    src="" alt="" style="display:none">
            <div  id="pfFallback" class="pf-fallback">
              <span id="pfInitials">—</span>
            </div>
            <label class="pf-change-btn" title="Upload new photo">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <input type="file" id="pfFile" accept="image/jpeg,image/png,image/webp" style="display:none">
            </label>
          </div>

          <div id="pfUploadArea" style="display:none" class="pf-upload-area">
            <div class="pf-prog-track"><div id="pfProgBar" class="pf-prog-bar" style="width:0%"></div></div>
            <p   id="pfProgLabel"  class="pf-prog-label">Uploading…</p>
          </div>

          <div id="pfDisplayName" class="pf-disp-name">—</div>
          <div id="pfDisplayRole" class="pf-disp-role">—</div>

          <div id="pfMeta" class="pf-meta">
            <div class="skel skel-lbl" style="width:80%;margin:.5rem auto"></div>
            <div class="skel skel-lbl" style="width:55%;margin:.5rem auto"></div>
          </div>
        </div>

        <div class="pf-cloud-badge">
          <span>☁</span>
          Photos on <a href="https://console.cloudinary.com" target="_blank" rel="noopener">Cloudinary</a>
          &nbsp;·&nbsp;<code>dx6krxtgh</code>
        </div>
      </aside>

      <!-- Right: form -->
      <div class="pf-form-card">

        <div class="pf-section">
          <div class="pf-section-head">
            <span class="pf-section-icon">⊙</span>
            <span class="pf-section-title">Account Details</span>
          </div>
          <div class="pf-grid-2">
            <div class="form-group">
              <label class="form-label">Full Name</label>
              <input id="pfName"    type="text"  class="form-input" placeholder="Your full name">
            </div>
            <div class="form-group">
              <label class="form-label">Email Address</label>
              <input id="pfEmail"   type="email" class="form-input" placeholder="admin@busco.eg">
            </div>
            <div class="form-group">
              <label class="form-label">Role</label>
              <input id="pfRoleInp" type="text"  class="form-input pf-ro" readonly tabindex="-1">
            </div>
            <div class="form-group">
              <label class="form-label">Admin ID</label>
              <input id="pfIdInp"   type="text"  class="form-input pf-ro" readonly tabindex="-1">
            </div>
          </div>
        </div>

        <div class="pf-section">
          <div class="pf-section-head">
            <span class="pf-section-icon">◈</span>
            <span class="pf-section-title">Change Password</span>
          </div>
          <p class="pf-hint">Leave both fields empty to keep your current password.</p>
          <div class="pf-grid-2">
            <div class="form-group">
              <label class="form-label">New Password</label>
              <input id="pfPw1" type="password" class="form-input" placeholder="Min. 8 characters" autocomplete="new-password">
            </div>
            <div class="form-group">
              <label class="form-label">Confirm Password</label>
              <input id="pfPw2" type="password" class="form-input" placeholder="Repeat password"   autocomplete="new-password">
            </div>
          </div>
        </div>

        <div class="pf-footer">
          <span id="pfStatus" class="pf-status"></span>
          <button id="pfSave" class="btn btn-primary">Save Changes</button>
        </div>

      </div>
    </div>
  </div>`;

  // ── Hydrate with cached photo immediately ──────────────────
  const cached = getCache();
  if (cached?.admin_id == adminId && cached.photoUrl) showPhoto(cached.photoUrl);
  if (cached?.name) ge("pfDisplayName").textContent = cached.name;

  // ── Fetch admin record ─────────────────────────────────────
  let admin = null;
  try {
    const rows = await models.admin.list({
      select: "admin_id,name,email,role,id_station,created_at",
    });
    admin = (rows || []).find(a => a.admin_id == adminId);
    if (!admin) throw new Error("Admin record not found");
    admin.photoUrl = cached?.admin_id == adminId ? (cached.photoUrl || null) : null;
    populateAll(admin);
  } catch (err) {
    toast("Could not load profile: " + err.message, "error");
  }

  // ── File upload ────────────────────────────────────────────
  ge("pfFile").addEventListener("change", async evt => {
    const file = evt.target.files?.[0];
    evt.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/"))  { toast("Please select an image file", "error"); return; }
    if (file.size > 8 * 1024 * 1024)     { toast("Image must be under 8 MB", "error");     return; }

    // Instant local preview
    const fr = new FileReader();
    fr.onload = e => showPhoto(e.target.result);
    fr.readAsDataURL(file);

    const area  = ge("pfUploadArea");
    const bar   = ge("pfProgBar");
    const label = ge("pfProgLabel");
    area.style.display = "block";
    bar.style.width    = "0%";
    bar.style.background = "";
    label.textContent  = "Uploading…";

    try {
      const url = await cloudinaryUpload(file, pct => {
        bar.style.width   = pct + "%";
        label.textContent = pct < 100 ? `Uploading… ${pct}%` : "Processing…";
      });

      // Persist URL in localStorage
      const profileCache = { admin_id: adminId, name: admin?.name, photoUrl: url };
      setCache(profileCache);
      if (admin) admin.photoUrl = url;

      showPhoto(url);
      label.textContent = "✓ Uploaded to Cloudinary";
      setTimeout(() => { area.style.display = "none"; }, 2500);
      toast("Profile photo updated", "success");

    } catch (err) {
      bar.style.background = "var(--danger)";
      label.textContent    = "✗ Upload failed — " + err.message;
      setTimeout(() => { area.style.display = "none"; bar.style.background = ""; }, 3500);

      // Revert preview
      if (admin?.photoUrl) showPhoto(admin.photoUrl);
      else                 showFallback(admin?.name);
      toast("Upload failed: " + err.message, "error");
    }
  });

  // ── Save details ───────────────────────────────────────────
  ge("pfSave").addEventListener("click", async () => {
    const name  = ge("pfName").value.trim();
    const email = ge("pfEmail").value.trim();
    const pw1   = ge("pfPw1").value;
    const pw2   = ge("pfPw2").value;

    if (!name)                 { toast("Name is required", "error");                       return; }
    if (!email)                { toast("Email is required", "error");                      return; }
    if (pw1 && pw1 !== pw2)    { toast("Passwords do not match", "error");                 return; }
    if (pw1 && pw1.length < 8) { toast("Password must be at least 8 characters", "error"); return; }

    const btn    = ge("pfSave");
    const status = ge("pfStatus");
    btn.disabled    = true;
    btn.textContent = "Saving…";
    status.textContent = "";
    status.className   = "pf-status";

    try {
      const patch = { name, email };
      if (pw1) patch.password_hash = pw1;
      await models.admin.update(adminId, patch);

      if (admin) { admin.name = name; admin.email = email; }
      setCache({ admin_id: adminId, name, photoUrl: admin?.photoUrl || null });

      ge("pfDisplayName").textContent = name;
      ge("pfInitials").textContent    = toInitials(name);

      const topbar = document.getElementById("sessionName");
      if (topbar) topbar.textContent = name;

      ge("pfPw1").value = "";
      ge("pfPw2").value = "";

      status.textContent = "✓ Saved";
      status.classList.add("pf-ok");
      toast("Profile saved", "success");

    } catch (err) {
      status.textContent = "✗ " + err.message;
      status.classList.add("pf-err");
      toast("Save failed: " + err.message, "error");
    } finally {
      btn.disabled    = false;
      btn.textContent = "Save Changes";
    }
  });
}

// ── Helpers ────────────────────────────────────────────────────
function toInitials(name = "") {
  return (name || "").split(" ").slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "").join("") || "?";
}
function showPhoto(src) {
  ge("pfPhoto").src           = src;
  ge("pfPhoto").style.display = "block";
  ge("pfFallback").style.display = "none";
}
function showFallback(name) {
  ge("pfPhoto").style.display    = "none";
  ge("pfFallback").style.display = "flex";
  ge("pfInitials").textContent   = toInitials(name);
}
function populateAll(admin) {
  ge("pfDisplayName").textContent = admin.name || "—";
  ge("pfDisplayRole").textContent = admin.role || "—";
  ge("pfInitials").textContent    = toInitials(admin.name);
  if (admin.photoUrl) showPhoto(admin.photoUrl);
  else                showFallback(admin.name);

  ge("pfName").value    = admin.name  || "";
  ge("pfEmail").value   = admin.email || "";
  ge("pfRoleInp").value = admin.role  || "";
  ge("pfIdInp").value   = "#" + admin.admin_id;

  const joined = admin.created_at
    ? new Date(admin.created_at).toLocaleDateString("en-GB", { year: "numeric", month: "long" })
    : "—";

  ge("pfMeta").innerHTML = `
    <div class="pf-meta-row">
      <span class="pf-meta-ic">⊕</span>
      <span class="pf-meta-lbl">Station</span>
      <span class="pf-meta-val">${admin.id_station ? "#" + admin.id_station : "None"}</span>
    </div>
    <div class="pf-meta-row">
      <span class="pf-meta-ic">◈</span>
      <span class="pf-meta-lbl">Member since</span>
      <span class="pf-meta-val">${joined}</span>
    </div>`;
}
