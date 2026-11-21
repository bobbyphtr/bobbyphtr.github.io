/* App kit — shared by North Star and Glossary.
   Concatenated in front of each app's script inside one IIFE (see AppShell.astro),
   so everything declared here is in scope for the app code. */
"use strict";

const THEME_KEY = "bobby_career_compass_theme";
const SYNC_CONFIG_KEY = "bobby_sync_config";
const SYNC_PUSH_DELAY = 10000;

// ------------------------------------------------------------------ utils
const $ = (sel, root = document) => root.querySelector(sel);
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const pad = (n) => String(n).padStart(2, "0");
const dayString = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dayString();
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const storageGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const storageSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const storageDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } };

// Minimal, safe markdown: headings, bullet lists, `code`, **bold**.
function renderMarkdown(text) {
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const out = [];
  let list = null;
  for (const line of String(text || "").split("\n")) {
    const t = line.trim();
    if (/^[-*] /.test(t)) { (list = list || []).push(`<li>${inline(t.slice(2))}</li>`); continue; }
    if (list) { out.push(`<ul>${list.join("")}</ul>`); list = null; }
    if (!t) continue;
    const h = t.match(/^#{1,4}\s+(.*)$/);
    out.push(h ? `<h4>${inline(h[1])}</h4>` : `<p>${inline(t)}</p>`);
  }
  if (list) out.push(`<ul>${list.join("")}</ul>`);
  return out.join("");
}

// ------------------------------------------------------------------ feedback
let toastTimer;
function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("error", isError);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), isError ? 5000 : 2600);
}

// Resolves "ok", "cancel", or "" when dismissed with Escape.
function askDialog(title, body, okLabel = "Confirm", cancelLabel = "Cancel") {
  const dlg = $("#confirm-modal");
  $("#confirm-title").textContent = title;
  $("#confirm-body").textContent = body;
  $("#confirm-ok").textContent = okLabel;
  $("#confirm-cancel").textContent = cancelLabel;
  dlg.returnValue = "";
  dlg.showModal();
  // Resolve on the button press itself (submit) and fall back to "close" for Escape,
  // so the answer doesn't depend on when the browser dispatches the close event.
  return new Promise((resolve) => {
    const ac = new AbortController();
    const finish = (v) => { ac.abort(); resolve(v); };
    dlg.querySelector("form").addEventListener("submit", (e) => finish(e.submitter ? e.submitter.value : ""), { signal: ac.signal });
    dlg.addEventListener("close", () => finish(dlg.returnValue), { signal: ac.signal });
  });
}
const confirmDialog = async (...args) => (await askDialog(...args)) === "ok";

const openNav = () => $(".app").classList.add("nav-open");
const closeNav = () => $(".app").classList.remove("nav-open");

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  storageSet(THEME_KEY, next);
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------------------------------------------------------------------ binding
// Paths: "identity.title", "projects.#p1.tasks.#t2.done" ("#id" finds by id in an array).
function resolvePath(root, path) {
  const segs = path.split(".");
  let obj = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    obj = s[0] === "#" ? (obj || []).find((x) => x.id === s.slice(1)) : obj?.[s];
    if (obj == null) return [null, null];
  }
  return [obj, segs[segs.length - 1]];
}
const getPath = (root, path) => { const [o, k] = resolvePath(root, path); return o ? o[k] : undefined; };
const setPath = (root, path, v) => { const [o, k] = resolvePath(root, path); if (o) o[k] = v; };
const findById = (list, id) => list.find((x) => x.id === id);
const removeById = (list, id) => { const i = list.findIndex((x) => x.id === id); if (i >= 0) list.splice(i, 1); };

// ------------------------------------------------------------------ GitHub sync
function getSyncConfig() {
  try {
    const c = JSON.parse(storageGet(SYNC_CONFIG_KEY) || "null");
    return c && c.repo && c.token ? c : null;
  } catch (e) { return null; }
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

class SyncError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function gh(cfg, path, init = {}) {
  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${cfg.repo}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${cfg.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch (e) {
    throw new SyncError(navigator.onLine === false ? "offline" : "network error", 0);
  }
  if (res.ok) return res.json();
  if (res.status === 404 && init.allow404) return null;
  const reasons = {
    401: "token rejected — check or replace it",
    403: "token lacks permission (needs Contents: Read and write)",
    404: "repository not found, or the token can't access it",
    409: "remote changed",
    422: "remote changed",
  };
  throw new SyncError(reasons[res.status] || `GitHub error ${res.status}`, res.status);
}

const contentsPath = (cfg, file) => `/contents/${encodeURIComponent(file)}`;

async function testSyncConnection(cfg) {
  const repo = await gh(cfg, "");
  return `Connected to ${repo.full_name}${repo.private ? " (private)" : " — warning: this repo is PUBLIC"}`;
}

// ------------------------------------------------------------------ store (state + persistence + sync)
/*
  opts: {
    key, defaults, validate(obj) -> error|null, normalize(obj) -> obj,
    syncFile, appName, exportPrefix, onReplace()
  }
*/
function createStore(opts) {
  const SAVED_AT_KEY = opts.key + ":savedAt";
  const META_KEY = opts.key + ":sync";
  const normalize = opts.normalize || ((o) => o);

  let state = load();
  let meta = readMeta();
  let version = 0; // bumps on every local edit, used to detect edits during a push
  let busy = false;
  let rerun = false;
  let lastError = "";
  let pushTimer = null;

  function load() {
    try {
      const raw = storageGet(opts.key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!opts.validate(parsed)) return normalize(parsed);
      }
    } catch (e) { /* fall back to defaults */ }
    return clone(opts.defaults);
  }
  function readMeta() {
    try { return { sha: null, dirty: false, syncedAt: null, ...JSON.parse(storageGet(META_KEY) || "{}") }; }
    catch (e) { return { sha: null, dirty: false, syncedAt: null }; }
  }
  const writeMeta = () => storageSet(META_KEY, JSON.stringify(meta));

  function persistLocal() {
    const ok = storageSet(opts.key, JSON.stringify(state));
    if (ok) storageSet(SAVED_AT_KEY, new Date().toISOString());
    return ok;
  }

  // Local edit: persist, mark dirty, schedule a push.
  function save() {
    if (!persistLocal()) { lastError = "storage unavailable"; renderStatus(); return; }
    version++;
    meta.dirty = true;
    writeMeta();
    schedulePush();
    renderStatus(true);
  }

  function replace(obj, fromRemote = false) {
    state = normalize(obj);
    if (fromRemote) persistLocal();
    else save();
    opts.onReplace && opts.onReplace();
  }

  function schedulePush() {
    if (!getSyncConfig()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => sync(), SYNC_PUSH_DELAY);
  }

  async function push(cfg, sha) {
    const startVersion = version;
    const body = JSON.stringify(state, null, 2) + "\n";
    const res = await gh(cfg, contentsPath(cfg, opts.syncFile), {
      method: "PUT",
      body: JSON.stringify({
        message: `${opts.appName}: update ${new Date().toISOString()}`,
        content: b64encode(body),
        branch: cfg.branch || "main",
        ...(sha ? { sha } : {}),
      }),
    });
    meta.sha = res.content.sha;
    meta.dirty = version !== startVersion;
    meta.syncedAt = new Date().toISOString();
    writeMeta();
  }

  async function sync(attempt = 0) {
    const cfg = getSyncConfig();
    if (!cfg) { renderStatus(); return; }
    if (busy) { rerun = true; return; }
    clearTimeout(pushTimer);
    busy = true;
    lastError = "";
    renderStatus();
    try {
      const branch = encodeURIComponent(cfg.branch || "main");
      const remote = await gh(cfg, `${contentsPath(cfg, opts.syncFile)}?ref=${branch}`, { allow404: true });
      if (!remote) {
        await push(cfg, null);
      } else if (remote.sha === meta.sha) {
        if (meta.dirty) await push(cfg, remote.sha);
      } else {
        if (remote.encoding !== "base64" || !remote.content) throw new SyncError("synced file is too large to read (>1 MB)");
        let parsed;
        try { parsed = JSON.parse(b64decode(remote.content)); } catch (e) { throw new SyncError(`${opts.syncFile} in the repo is not valid JSON`); }
        const err = opts.validate(parsed);
        if (err) throw new SyncError(`${opts.syncFile} in the repo is invalid: ${err}`);
        let useRemote = !meta.dirty;
        if (meta.dirty) {
          const choice = await askDialog(
            "Sync conflict",
            "This device and the synced copy both changed since the last sync. Which version do you want to keep? The other one stays in the repo's commit history.",
            "Keep this device's version",
            "Use synced version",
          );
          if (!choice) throw new SyncError("conflict not resolved — press Sync now to choose");
          useRemote = choice === "cancel";
        }
        if (useRemote) {
          state = normalize(parsed);
          persistLocal();
          meta.sha = remote.sha;
          meta.dirty = false;
          meta.syncedAt = new Date().toISOString();
          writeMeta();
          opts.onReplace && opts.onReplace();
          toast("Pulled the latest synced version");
        } else {
          await push(cfg, remote.sha);
        }
      }
    } catch (e) {
      if ((e.status === 409 || e.status === 422) && attempt < 1) {
        busy = false;
        return sync(attempt + 1);
      }
      lastError = e.message || String(e);
    } finally {
      busy = false;
      renderStatus();
    }
    if (rerun) { rerun = false; sync(); }
  }

  function renderStatus(pulse = false) {
    const el = $("#saved"), text = $("#saved-text");
    if (!el) return;
    const cfg = getSyncConfig();
    let label, cls = "";
    if (lastError === "storage unavailable") { label = "Not saved — storage unavailable"; cls = "error"; }
    else if (!cfg) {
      const at = storageGet(SAVED_AT_KEY);
      label = at && storageGet(opts.key) ? `Saved locally · ${hhmm(new Date(at))}` : "Blueprint · not yet edited";
    }
    else if (busy) { label = "Syncing…"; cls = "pending"; }
    else if (lastError === "offline") { label = "Offline — will sync"; cls = "pending"; }
    else if (lastError) { label = `Sync error: ${lastError}`; cls = "error"; }
    else if (meta.dirty) { label = "Saved locally · sync pending"; cls = "pending"; }
    else if (meta.syncedAt) { label = `Synced · ${hhmm(new Date(meta.syncedAt))}`; }
    else { label = "Sync ready"; cls = "pending"; }
    el.className = "saved " + cls;
    el.title = label;
    text.textContent = label;
    if (pulse) {
      el.classList.add("pulse");
      setTimeout(() => el.classList.remove("pulse"), 700);
    }
  }

  // --- export / import
  function exportJSON() {
    download(`${opts.exportPrefix}-${today()}.json`, JSON.stringify(state, null, 2) + "\n", "application/json");
    toast("Backup downloaded");
  }
  async function importFile(file) {
    let parsed;
    try { parsed = JSON.parse(await file.text()); }
    catch (e) { toast(`Import failed: ${file.name} is not valid JSON.`, true); return; }
    const err = opts.validate(parsed);
    if (err) { toast("Import failed: " + err, true); return; }
    const ok = await confirmDialog("Restore this backup?", `Your current data will be replaced by "${file.name}". Export a backup first if you want to keep it.`, "Restore");
    if (!ok) return;
    replace(parsed);
    toast(`Restored from ${file.name}`);
  }

  return {
    get state() { return state; },
    save, replace, sync, renderStatus, exportJSON, importFile,
    get dirty() { return meta.dirty; },
  };
}

// ------------------------------------------------------------------ sync dialog (shared markup in AppShell)
function openSyncDialog(store) {
  const cfg = getSyncConfig() || JSON.parse(storageGet(SYNC_CONFIG_KEY) || "null") || {};
  const form = $("#sync-form");
  form.repo.value = cfg.repo || "";
  form.branch.value = cfg.branch || "main";
  form.token.value = "";
  form.token.placeholder = cfg.token ? "•••••••• saved — leave blank to keep" : "github_pat_…";
  $("#sync-result").textContent = cfg.token ? "Sync is on for this device." : "Sync is off. Data is saved only in this browser.";
  $("#sync-modal").showModal();
}

function readSyncForm() {
  const form = $("#sync-form");
  const prev = JSON.parse(storageGet(SYNC_CONFIG_KEY) || "null") || {};
  const repo = form.repo.value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  return { repo, branch: form.branch.value.trim() || "main", token: form.token.value.trim() || prev.token || "" };
}

async function handleSyncAction(action, store) {
  const result = $("#sync-result");
  if (action === "sync-test" || action === "sync-save") {
    const cfg = readSyncForm();
    if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) { result.textContent = "Repository must look like owner/name."; return; }
    if (!cfg.token) { result.textContent = "Paste a fine-grained token first."; return; }
    result.textContent = "Checking…";
    try {
      const msg = await testSyncConnection(cfg);
      result.textContent = msg;
      if (action === "sync-save") {
        storageSet(SYNC_CONFIG_KEY, JSON.stringify(cfg));
        $("#sync-modal").close();
        toast("Sync turned on");
        store.sync();
      }
    } catch (e) {
      result.textContent = "Couldn't connect: " + e.message;
    }
  } else if (action === "sync-disconnect") {
    storageDel(SYNC_CONFIG_KEY);
    $("#sync-modal").close();
    store.renderStatus();
    toast("Sync turned off — token removed from this browser");
  } else if (action === "sync-now") {
    if (!getSyncConfig()) { openSyncDialog(store); return; }
    await store.sync();
  }
}

// ------------------------------------------------------------------ shared wiring
function wireShell(store, onRoute) {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-kit]");
    if (!el) return;
    const a = el.dataset.kit;
    if (a === "open-nav") openNav();
    else if (a === "close-nav") closeNav();
    else if (a === "toggle-theme") toggleTheme();
    else if (a === "export-json") store.exportJSON();
    else if (a === "import-json") $("#import-file").click();
    else if (a === "sync-open") { closeNav(); openSyncDialog(store); }
    else handleSyncAction(a, store);
  });
  $("#import-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (file) store.importFile(file);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNav(); });
  window.addEventListener("hashchange", onRoute);

  // Sync triggers: load, focus, back online, page hidden.
  let lastFocusSync = 0;
  const maybeSync = () => {
    if (!getSyncConfig() || Date.now() - lastFocusSync < 30000) return;
    lastFocusSync = Date.now();
    store.sync();
  };
  window.addEventListener("focus", maybeSync);
  window.addEventListener("online", () => store.sync());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && getSyncConfig() && store.dirty) store.sync();
    else if (document.visibilityState === "visible") maybeSync();
  });

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  store.renderStatus();
  onRoute();
  if (getSyncConfig()) { lastFocusSync = Date.now(); store.sync(); }
}
