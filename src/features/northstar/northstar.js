/* North Star v2 — app code. Runs after shared/app-kit/kit.js in the same scope. */

const DEFAULT_STATE = JSON.parse($("#default-state").textContent);
const VIEWS = { overview: "Overview & Target JD", compass: "Focus Compass", projects: "Projects" };
const COLUMNS = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To Do" },
  { id: "doing", label: "In Progress" },
  { id: "done", label: "Done" },
];
const REQ_STATUSES = ["Gap", "Building", "Proven"];
const PILLARS = [
  { id: "gold", label: "Gold" },
  { id: "silver", label: "Silver" },
  { id: "bronze", label: "Bronze" },
  { id: "", label: "None" },
];
const EMPTY_FILTER = { name: "", gold: false, silver: false, leverage: false, trap: false };

// Links can arrive from imported or synced files, so only http(s) URLs become clickable.
const isWebUrl = (u) => /^https?:\/\//i.test(String(u || ""));
// Snapshot links: escape the link text and percent-encode characters that could end the URL,
// so a crafted label or URL can't smuggle a second (e.g. javascript:) link into the Markdown.
const mdText = (s) => String(s).replace(/[\\[\]]/g, "\\$&").replace(/\s*\n\s*/g, " ");
const mdUrl = (u) => u.replace(/[()<>\s]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
const mdCode = (s) => "`" + String(s).replace(/[`\r\n]+/g, " ") + "`";
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
const fmtDay = (d) => {
  const [y, m, day] = String(d).split("-").map(Number);
  const date = new Date(y, m - 1, day);
  return isNaN(date) ? esc(d) : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

// ---------------------------------------------------------------- state
function validate(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "File is not a JSON object.";
  if (obj.schemaVersion === 1) return "This is a v1 backup (old roadmap format) and can't be imported into North Star v2.";
  if (obj.schemaVersion !== 2) return "Missing or unknown schemaVersion — not a North Star backup.";
  if (!obj.identity || typeof obj.identity !== "object") return "Missing identity section.";
  if (!obj.targetJD || !Array.isArray(obj.targetJD.requirements)) return "Missing target JD requirements.";
  if (!Array.isArray(obj.projects) || obj.projects.some((p) => !p || !Array.isArray(p.tasks))) return "Projects must be a list, each with a tasks list.";
  for (const k of ["pillars", "buildPillars"]) if (obj[k] !== undefined && !Array.isArray(obj[k])) return `"${k}" must be a list.`;
  return null;
}

function normalize(obj) {
  const base = clone(DEFAULT_STATE);
  const out = { ...base, ...obj };
  out.identity = { ...base.identity, ...(obj.identity || {}) };
  out.targetJD = { ...base.targetJD, ...(obj.targetJD || {}) };
  out.pillars = cleanList(out.pillars, "pl");
  out.buildPillars = cleanList(out.buildPillars, "bp");
  out.projects = cleanList(out.projects, "p");
  for (const p of out.projects) {
    p.tasks = cleanList(p.tasks, "t");
    p.links = cleanList(p.links, "l", (l) => isObj(l) && typeof l.url === "string");
    p.notes = p.notes || "";
    p.due = p.due || "";
  }
  out.targetJD.responsibilities = cleanList(out.targetJD.responsibilities, "jr");
  out.targetJD.requirements = cleanList(out.targetJD.requirements, "rq");
  for (const r of out.targetJD.requirements) r.projectIds = Array.isArray(r.projectIds) ? r.projectIds : [];
  return out;
}

const ui = {
  view: "overview",
  filter: { ...EMPTY_FILTER },
  linkMode: false,
  openProject: null,
  notesEdit: false,
  dragId: null,
  md: "",
};

const store = createStore({
  key: "bobby_career_compass_v2",
  defaults: DEFAULT_STATE,
  validate,
  normalize,
  syncFile: "northstar.json",
  appName: "northstar",
  exportPrefix: "career-compass-backup",
  onReplace: () => {
    if (ui.openProject) $("#project-modal").close();
    render();
  },
});
const S = () => store.state;

function commit() {
  store.save();
  render();
  refreshProjectDialog();
}

// ---------------------------------------------------------------- derived
function taskTotals(projects = S().projects) {
  let done = 0, total = 0;
  for (const p of projects) for (const t of p.tasks) { total++; if (t.done) done++; }
  return { done, total };
}

// Pillar wording for the decision filter comes from the user's own data, so the page ships none.
function pillarInfo(id) {
  const p = findById(S().pillars, id) || {};
  const title = String(p.title || "").trim();
  return { title, weight: Number(p.weight) || 0, name: title || `the ${cap(id)} pillar` };
}

function verdictFor(f) {
  const gold = pillarInfo("gold"), silver = pillarInfo("silver"), bronze = pillarInfo("bronze");
  const reasons = [];
  let tier;
  if (f.gold && (f.silver || f.leverage)) tier = 0;
  else if (f.gold || f.silver || f.leverage) tier = 1;
  else tier = 2;
  if (f.gold) reasons.push(`Compounds the Gold pillar${gold.title ? ` — ${gold.title}` : ""} (${gold.weight}%).`);
  if (f.silver) reasons.push(`Strengthens the Silver backbone${silver.title ? ` — ${silver.title}` : ""} (${silver.weight}%).`);
  if (f.leverage) reasons.push("Builds on your existing experience instead of resetting it.");
  if (f.silver && f.leverage && !f.gold) reasons.push("Silver + core leverage together make strong backbone work — keep it scoped to what your projects need.");
  if (!f.gold && !f.silver && !f.leverage) reasons.push("Touches none of the Gold, Silver or core-leverage signals.");
  let warn = "";
  if (f.trap) {
    if (f.gold) {
      tier = Math.min(2, tier + 1);
      warn = `Trap signal present: lean in on the ${gold.name} slice only, and consume the heavy work from specialists (Bronze).`;
    } else {
      tier = 2;
    }
    reasons.push(`Trap signal — ${bronze.title || "this work"} sits in the Bronze/outsourced zone.`);
  }
  const tiers = [
    { key: "lean", label: "High-Priority Lean In", advice: "Give it prime time and ship a portfolio artifact from it." },
    { key: "support", label: "Strategic Support", advice: "Worth doing, time-boxed. Extract only what feeds your projects." },
    { key: "minimum", label: "Minimum-to-Pass / Delegate", advice: "Do what's required to pass, or delegate and consume the outputs. Protect focus for Gold/Silver work." },
  ];
  return { ...tiers[tier], reasons, warn };
}

// ---------------------------------------------------------------- render helpers
const editable = (path, tag = "span", cls = "", single = true) =>
  `<${tag} class="${cls}" contenteditable="plaintext-only" spellcheck="true" data-bind="${esc(path)}"${single ? ' data-single="1"' : ""}>${esc(getPath(S(), path))}</${tag}>`;

const bar = (done, total, label) => {
  const p = pct(done, total);
  return `<div>
    <div class="progress-label"><span>${esc(label)}</span><span class="mono">${done}/${total} · ${p}%</span></div>
    <div class="progress${p === 100 ? " done" : ""}"><span style="width:${p}%"></span></div>
  </div>`;
};

const pillarBadge = (pillar) => (pillar ? `<span class="badge badge-${esc(pillar)}">${esc(cap(pillar))}</span>` : "");

// ---------------------------------------------------------------- views
function viewOverview() {
  const jd = S().targetJD;
  const reqs = jd.requirements;
  const counts = Object.fromEntries(REQ_STATUSES.map((s) => [s, reqs.filter((r) => r.status === s).length]));
  const projects = S().projects;
  const tasks = taskTotals();
  const doing = projects.filter((p) => p.status === "doing");

  return `
  <section class="card hero">
    <div class="hero-owner">
      <span>${editable("identity.owner")}</span>
      <span>${editable("identity.location")}</span>
    </div>
    <div class="eyebrow" style="margin-top:18px">Target identity</div>
    ${editable("identity.targetIdentity", "h2", "hero-identity")}
    ${editable("identity.valueProp", "p", "hero-value", false)}
    <div class="hero-meta">
      <div class="meta-item"><div class="eyebrow">Program</div>${editable("identity.program", "div", "", false)}</div>
      <div class="meta-item"><div class="eyebrow">Track</div>${editable("identity.track", "div", "", false)}</div>
      <div class="meta-item"><div class="eyebrow">Post-graduation plan</div>${editable("identity.postGradPlan", "div", "", false)}</div>
    </div>
    <div class="hero-meta">
      <div class="meta-item"><div class="eyebrow">Experience</div>${editable("identity.experience", "div", "", false)}</div>
      <div class="meta-item"><div class="eyebrow">Engineering DNA</div>${editable("identity.dna", "div", "", false)}</div>
    </div>
  </section>

  <section class="card jd">
    <div class="card-head">
      <span class="eyebrow">Target job description · 2–3 years out</span>
      <button type="button" class="chip" data-action="toggle-link-mode" aria-pressed="${ui.linkMode}">${ui.linkMode ? "Done linking" : "Link projects"}</button>
    </div>
    ${editable("targetJD.title", "h2", "jd-title")}
    ${editable("targetJD.summary", "p", "jd-summary", false)}

    <h3 class="jd-sub">Responsibilities</h3>
    <ul class="resp">
      ${jd.responsibilities.map((r) => `
        <li>
          ${editable(`targetJD.responsibilities.#${r.id}.text`, "span", "resp-text")}
          <button type="button" class="x-btn" data-action="delete-resp" data-id="${esc(r.id)}" aria-label="Delete responsibility">×</button>
        </li>`).join("")}
    </ul>
    <form class="add-inline" data-form="resp">
      <label class="sr-only" for="new-resp">New responsibility</label>
      <input class="input" id="new-resp" name="text" placeholder="Add a responsibility…" required autocomplete="off">
      <button class="btn btn-ghost" type="submit">Add</button>
    </form>

    <div class="jd-req-head">
      <h3 class="jd-sub">Requirements</h3>
      <div class="req-legend">${REQ_STATUSES.map((s) => `<span class="req-key req-${s}"><i></i>${s} <b>${counts[s]}</b></span>`).join("")}</div>
    </div>
    ${bar(counts.Proven, reqs.length, "Readiness — requirements you can already prove")}
    <ul class="reqs">
      ${reqs.map((r) => {
        const linked = r.projectIds.map((pid) => findById(projects, pid)).filter(Boolean);
        const evidence = ui.linkMode
          ? projects.map((p) => `<button type="button" class="chip chip-sm" data-action="toggle-link" data-req="${esc(r.id)}" data-project="${esc(p.id)}" aria-pressed="${r.projectIds.includes(p.id)}">${esc(p.title)}</button>`).join("")
          : linked.map((p) => `<button type="button" class="evidence" data-action="open-project" data-id="${esc(p.id)}">→ ${esc(p.title)}</button>`).join("");
        return `
        <li class="req req-${esc(r.status)}">
          <span class="req-dot" aria-hidden="true"></span>
          <div class="req-main">
            ${editable(`targetJD.requirements.#${r.id}.text`, "span", "req-text")}
            ${evidence ? `<div class="req-evidence">${evidence}</div>` : ""}
          </div>
          <div class="seg seg-sm" role="group" aria-label="Status">
            ${REQ_STATUSES.map((s) => `<button type="button" data-action="set-req-status" data-id="${esc(r.id)}" data-status="${s}" aria-pressed="${r.status === s}">${s}</button>`).join("")}
          </div>
          <button type="button" class="x-btn" data-action="delete-req" data-id="${esc(r.id)}" aria-label="Delete requirement">×</button>
        </li>`;
      }).join("") || '<li class="empty">No requirements yet.</li>'}
    </ul>
    <form class="add-inline" data-form="req">
      <label class="sr-only" for="new-req">New requirement</label>
      <input class="input" id="new-req" name="text" placeholder="Add a requirement from a real JD…" required autocomplete="off">
      <button class="btn btn-ghost" type="submit">Add</button>
    </form>
  </section>

  <section class="card">
    <div class="card-head">
      <h2 class="card-title">Projects</h2>
      <a class="link-btn" href="#projects">Open board →</a>
    </div>
    <div class="stat-row">
      ${COLUMNS.map((c) => `<div class="stat"><strong>${projects.filter((p) => p.status === c.id).length}</strong><span>${c.label}</span></div>`).join("")}
    </div>
    <div style="margin-top:14px">${bar(tasks.done, tasks.total, "Tasks done across all projects")}</div>
    ${doing.length ? `<div class="doing-list">
      ${doing.map((p) => {
        const d = p.tasks.filter((t) => t.done).length;
        return `<button type="button" class="doing-item" data-action="open-project" data-id="${esc(p.id)}">
          ${pillarBadge(p.pillar)}<span class="doing-title">${esc(p.title)}</span><span class="mono">${d}/${p.tasks.length}</span>
        </button>`;
      }).join("")}
    </div>` : ""}
  </section>

  <section class="stack">
    <div class="section-head">
      <div><h2>What I'm building</h2><p>Four core pillars compounding into one codebase.</p></div>
    </div>
    <div class="grid">
      ${S().buildPillars.map((b, i) => `
        <article class="card build-card">
          <div class="no">0${i + 1}</div>
          ${editable(`buildPillars.#${b.id}.title`, "h3")}
          ${editable(`buildPillars.#${b.id}.description`, "p", "", false)}
        </article>`).join("")}
    </div>
  </section>`;
}

function viewCompass() {
  const sum = S().pillars.reduce((a, p) => a + Number(p.weight || 0), 0);
  return `
  <section class="stack">
    <div class="section-head">
      <div><h2>Focus pillars</h2><p>Gold leads, Silver is the backbone, Bronze is integrated — not authored.</p></div>
      <span class="weight-sum mono" id="weight-sum">Total weight ${sum}%</span>
    </div>
    <div class="grid">
      ${S().pillars.map((p) => `
        <article class="card pillar ${esc(p.id)}">
          <div class="row" style="justify-content:space-between">
            <span class="badge badge-${esc(p.id)}">${esc(p.tier)}</span>
            ${editable(`pillars.#${p.id}.role`, "span", "role")}
          </div>
          ${editable(`pillars.#${p.id}.title`, "h3")}
          ${editable(`pillars.#${p.id}.description`, "p", "", false)}
          <label class="weight">
            <span class="sr-only">${esc(p.tier)} focus weight</span>
            <input type="range" min="0" max="100" step="5" value="${Number(p.weight) || 0}" data-bind="pillars.#${esc(p.id)}.weight">
            <output>${Number(p.weight) || 0}%</output>
          </label>
        </article>`).join("")}
    </div>
  </section>

  <section class="card">
    <div class="card-head">
      <div>
        <h2 class="card-title">Opportunity / Course / Project filter</h2>
        <p class="muted" style="font-size:13.5px;margin-top:2px">Run anything competing for your time through the compass before saying yes.</p>
      </div>
    </div>
    <div class="filter-grid">
      <div class="stack">
        <label class="field"><span>Course, paper or project</span>
          <input class="input" id="filter-name" data-filter="name" value="${esc(ui.filter.name)}" placeholder="e.g. an elective, paper or side project" autocomplete="off">
        </label>
        ${[
          ["gold", `Improves ${pillarInfo("gold").name}?`, "Gold"],
          ["silver", `Strengthens ${pillarInfo("silver").name}?`, "Silver"],
          ["leverage", "Builds on your existing experience?", "Core leverage"],
          ["trap", `Mostly ${pillarInfo("bronze").title || "Bronze-pillar"} work you'd rather consume than author?`, "Trap signal"],
        ].map(([k, q, tag]) => `
          <label class="switch${k === "trap" ? " trap" : ""}">
            <input type="checkbox" data-filter="${k}" ${ui.filter[k] ? "checked" : ""}>
            <span class="switch-text"><strong>${esc(q)}</strong><small>${tag}</small></span>
          </label>`).join("")}
      </div>
      <div id="verdict">${verdictHtml()}</div>
    </div>
  </section>`;
}

function verdictHtml() {
  const v = verdictFor(ui.filter);
  const name = ui.filter.name.trim();
  const canAdd = v.key !== "minimum";
  return `
    <div class="verdict ${v.key}" aria-live="polite">
      <div>
        <div class="eyebrow">Recommendation</div>
        <div class="verdict-label">${esc(v.label)}</div>
        <div class="verdict-for">${name ? "for " + esc(name) : canAdd ? "Name the opportunity to add it to your board" : ""}</div>
      </div>
      <p style="font-size:14px">${esc(v.advice)}</p>
      <ul>${v.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
      ${v.warn ? `<p class="warn">${esc(v.warn)}</p>` : ""}
      <div class="row">
        ${canAdd ? `<button class="btn btn-primary" type="button" data-action="add-to-backlog" ${name ? "" : "disabled"}>Add to Backlog</button>` : ""}
        <button class="btn btn-ghost" type="button" data-action="clear-filter">Clear</button>
      </div>
    </div>`;
}

function viewProjects() {
  const projects = S().projects;
  return `
  <p class="muted board-hint">Drag cards between columns or up and down to set priority, or use ◀ ▶. Tap a card to open it.</p>
  <div class="board">
    ${COLUMNS.map((c, ci) => {
      const items = projects.filter((p) => p.status === c.id);
      return `
      <section class="column" data-drop="${c.id}" aria-label="${c.label}">
        <header class="column-head"><h2>${c.label}</h2><span class="badge">${items.length}</span></header>
        ${c.id === "backlog" ? `
          <form class="add-inline" data-form="project">
            <label class="sr-only" for="new-project">New project</label>
            <input class="input" id="new-project" name="title" placeholder="New project…" required autocomplete="off">
            <button class="btn btn-ghost" type="submit">Add</button>
          </form>` : ""}
        <div class="column-cards">
          ${items.map((p) => cardHtml(p, ci)).join("") || '<div class="column-empty">Drop projects here</div>'}
        </div>
      </section>`;
    }).join("")}
  </div>`;
}

function cardHtml(p, ci) {
  const done = p.tasks.filter((t) => t.done).length;
  const total = p.tasks.length;
  const overdue = p.due && p.status !== "done" && p.due < today();
  return `
  <article class="pcard" draggable="true" data-id="${esc(p.id)}" data-action="open-project" tabindex="0" role="button" aria-label="Open ${esc(p.title)}">
    ${p.pillar ? `<div>${pillarBadge(p.pillar)}</div>` : ""}
    <h3 class="pcard-title">${esc(p.title)}</h3>
    ${total ? `<div class="progress${done === total ? " done" : ""}"><span style="width:${pct(done, total)}%"></span></div>` : ""}
    <div class="pcard-foot">
      <div class="pcard-meta">
        <span class="mono">${done}/${total} tasks</span>
        ${p.due ? `<span class="${overdue ? "overdue" : ""}">Due ${fmtDay(p.due)}</span>` : ""}
        ${p.links.length ? `<span>${p.links.length} link${p.links.length > 1 ? "s" : ""}</span>` : ""}
      </div>
      <div class="pcard-move">
        <button type="button" class="move-btn" data-action="move-project" data-id="${esc(p.id)}" data-dir="-1" ${ci === 0 ? "disabled" : ""} aria-label="Move to ${COLUMNS[ci - 1]?.label || ""}">◀</button>
        <button type="button" class="move-btn" data-action="move-project" data-id="${esc(p.id)}" data-dir="1" ${ci === COLUMNS.length - 1 ? "disabled" : ""} aria-label="Move to ${COLUMNS[ci + 1]?.label || ""}">▶</button>
      </div>
    </div>
  </article>`;
}

// ---------------------------------------------------------------- project dialog
function projectDialogHtml(p) {
  const base = `projects.#${p.id}`;
  const done = p.tasks.filter((t) => t.done).length;
  return `
  <div class="pd-head">
    <label class="sr-only" for="pd-title">Project title</label>
    <input class="input pd-title" id="pd-title" data-bind="${esc(base)}.title" value="${esc(p.title)}" autocomplete="off">
    <button type="button" class="x-btn" data-action="close-project" aria-label="Close">×</button>
  </div>
  <div class="form-row">
    <label class="field"><span>Status</span>
      <select class="select" style="width:100%" data-bind="${esc(base)}.status">${COLUMNS.map((c) => `<option value="${c.id}" ${c.id === p.status ? "selected" : ""}>${c.label}</option>`).join("")}</select>
    </label>
    <label class="field"><span>Pillar</span>
      <select class="select" style="width:100%" data-bind="${esc(base)}.pillar">${PILLARS.map((x) => `<option value="${x.id}" ${x.id === p.pillar ? "selected" : ""}>${x.label}</option>`).join("")}</select>
    </label>
    <label class="field"><span>Due date</span>
      <input class="input" type="date" data-bind="${esc(base)}.due" value="${esc(p.due)}">
    </label>
  </div>

  <section class="pd-section">
    <div class="pd-sub"><h3>Tasks</h3><span class="mono">${done}/${p.tasks.length}</span></div>
    <ul class="tasks">
      ${p.tasks.map((t) => `
        <li class="task${t.done ? " done" : ""}" data-id="${esc(t.id)}">
          <button type="button" class="grip" aria-label="Reorder task: drag, or press ↑ ↓">⠿</button>
          <input type="checkbox" class="check" aria-label="Done" data-bind="${esc(base)}.tasks.#${esc(t.id)}.done" ${t.done ? "checked" : ""}>
          ${editable(`${base}.tasks.#${t.id}.text`, "span", "text")}
          <button type="button" class="x-btn" data-action="delete-task" data-id="${esc(t.id)}" aria-label="Delete task">×</button>
        </li>`).join("") || '<li class="muted" style="font-size:14px;padding:6px">No tasks yet.</li>'}
    </ul>
    <form class="add-inline" data-form="task">
      <label class="sr-only" for="new-task">New task</label>
      <input class="input" id="new-task" name="text" placeholder="Add a task…" required autocomplete="off">
      <button class="btn btn-ghost" type="submit">Add</button>
    </form>
  </section>

  <section class="pd-section">
    <div class="pd-sub"><h3>Notes</h3><button type="button" class="link-btn" data-action="toggle-notes">${ui.notesEdit ? "Done" : "Edit"}</button></div>
    ${ui.notesEdit
      ? `<textarea class="textarea" rows="12" data-bind="${esc(base)}.notes" placeholder="Markdown-friendly: ## headings, - bullets, \`code\`, **bold**">${esc(p.notes)}</textarea>`
      : p.notes.trim() ? `<div class="md-body">${renderMarkdown(p.notes)}</div>` : '<p class="muted" style="font-size:14px">No notes yet.</p>'}
  </section>

  <section class="pd-section">
    <div class="pd-sub"><h3>Links</h3></div>
    ${p.links.length ? `<ul class="links">${p.links.map((l) => `
      <li>${isWebUrl(l.url)
        ? `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label || l.url)}</a>`
        : `<span title="Not a web link, so it isn't clickable">${esc(l.label || l.url)}</span>`}
      <span class="muted mono link-url">${esc(l.url.replace(/^https?:\/\//, ""))}</span>
      <button type="button" class="x-btn" data-action="delete-link" data-id="${esc(l.id)}" aria-label="Remove link">×</button></li>`).join("")}</ul>` : ""}
    <form class="form-row" data-form="link">
      <label class="field"><span>Label</span><input class="input" name="label" placeholder="GitHub repo" autocomplete="off"></label>
      <label class="field"><span>URL</span><input class="input" name="url" placeholder="https://github.com/…" required autocomplete="off" inputmode="url"></label>
      <button class="btn btn-ghost" type="submit">Add link</button>
    </form>
  </section>

  <div class="pd-foot">
    <button type="button" class="btn btn-ghost danger-text" data-action="delete-project">Delete project</button>
    <button type="button" class="btn btn-primary" data-action="close-project">Done</button>
  </div>`;
}

function openProject(id) {
  if (!findById(S().projects, id)) return;
  ui.openProject = id;
  ui.notesEdit = false;
  refreshProjectDialog();
  const dlg = $("#project-modal");
  if (!dlg.open) dlg.showModal();
}

function refreshProjectDialog() {
  if (!ui.openProject) return;
  const p = findById(S().projects, ui.openProject);
  if (!p) { $("#project-modal").close(); return; }
  const body = $("#project-body");
  const scroll = body.scrollTop;
  body.innerHTML = projectDialogHtml(p);
  body.scrollTop = scroll;
}

function moveProject(id, status, beforeId) {
  const list = S().projects;
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return;
  const [p] = list.splice(i, 1);
  p.status = status;
  const j = beforeId ? list.findIndex((x) => x.id === beforeId) : -1;
  if (j >= 0) list.splice(j, 0, p);
  else list.push(p);
  commit();
}

// ---------------------------------------------------------------- markdown snapshot
function buildMarkdown() {
  const s = S(), id = s.identity, jd = s.targetJD;
  const proven = jd.requirements.filter((r) => r.status === "Proven").length;
  const L = [];
  L.push(`# North Star Snapshot — ${today()}`, "");
  L.push(`**Owner:** ${id.owner} · ${id.location}  `, `**Program:** ${id.program}  `, `**Track:** ${id.track}`, "");
  L.push("## North Star", "");
  L.push(`- **Target identity:** ${id.targetIdentity}`, `- **Value proposition:** ${id.valueProp}`, `- **Post-graduation plan:** ${id.postGradPlan}`, "");
  L.push(`## Target JD — ${jd.title}`, "", jd.summary, "", "### Responsibilities");
  for (const r of jd.responsibilities) L.push(`- ${r.text}`);
  L.push("", `### Requirements — readiness ${proven}/${jd.requirements.length} proven`);
  for (const r of jd.requirements) {
    const linked = r.projectIds.map((pid) => findById(s.projects, pid)?.title).filter(Boolean);
    L.push(`- **${r.status}** — ${r.text}${linked.length ? ` _(evidence: ${linked.join(", ")})_` : ""}`);
  }
  L.push("", "## Focus Compass", "");
  for (const p of s.pillars) L.push(`- **${p.tier} — ${p.title}** (${p.role}, ${p.weight}%): ${p.description}`);
  const t = taskTotals();
  L.push("", `## Projects — ${t.done}/${t.total} tasks done`, "");
  for (const c of COLUMNS) {
    const items = s.projects.filter((p) => p.status === c.id);
    L.push(`### ${c.label} (${items.length})`, "");
    for (const p of items) {
      const d = p.tasks.filter((x) => x.done).length;
      L.push(`#### ${p.title}${p.pillar ? ` · ${cap(p.pillar)}` : ""} — ${d}/${p.tasks.length}${p.due ? ` · due ${p.due}` : ""}`);
      for (const x of p.tasks) L.push(`- [${x.done ? "x" : " "}] ${x.text}`);
      for (const l of p.links) {
        const text = mdText(l.label || l.url);
        L.push(isWebUrl(l.url) ? `- 🔗 [${text}](${mdUrl(l.url)})` : `- 🔗 ${text}: ${mdCode(l.url)}`);
      }
      L.push("");
    }
  }
  return L.join("\n");
}

// ---------------------------------------------------------------- render & route
const RENDERERS = { overview: viewOverview, compass: viewCompass, projects: viewProjects };

function render() {
  $("#view").innerHTML = RENDERERS[ui.view]();
  $("#view-title").textContent = VIEWS[ui.view];
  document.title = `${VIEWS[ui.view]} · North Star`;
  for (const a of document.querySelectorAll("#nav a[data-view]")) {
    if (a.dataset.view === ui.view) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

function route() {
  const v = location.hash.slice(1);
  const next = VIEWS[v] ? v : "overview";
  const changed = next !== ui.view;
  ui.view = next;
  render();
  closeNav();
  if (changed) window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- actions
const ACTIONS = {
  "export-md": () => {
    ui.md = buildMarkdown();
    $("#md-output").value = ui.md;
    closeNav();
    $("#md-modal").showModal();
  },
  "download-md": () => { download("NORTH_STAR_SNAPSHOT.md", ui.md, "text/markdown"); toast("NORTH_STAR_SNAPSHOT.md downloaded"); },
  "copy-md": async () => {
    try {
      await navigator.clipboard.writeText(ui.md);
      toast("Snapshot copied to clipboard");
    } catch (e) {
      const ta = $("#md-output");
      ta.focus();
      ta.select();
      toast("Clipboard blocked — text selected, press ⌘C", true);
    }
  },
  "toggle-link-mode": () => { ui.linkMode = !ui.linkMode; render(); },
  "toggle-link": (el) => {
    const r = findById(S().targetJD.requirements, el.dataset.req);
    const pid = el.dataset.project;
    r.projectIds = r.projectIds.includes(pid) ? r.projectIds.filter((x) => x !== pid) : [...r.projectIds, pid];
    commit();
  },
  "set-req-status": (el) => { findById(S().targetJD.requirements, el.dataset.id).status = el.dataset.status; commit(); },
  "delete-req": (el) => { removeById(S().targetJD.requirements, el.dataset.id); commit(); },
  "delete-resp": (el) => { removeById(S().targetJD.responsibilities, el.dataset.id); commit(); },
  "add-to-backlog": () => {
    const f = ui.filter, v = verdictFor(f), name = f.name.trim();
    if (!name || v.key === "minimum") return;
    const yn = (b) => (b ? "Yes" : "No");
    const notes = [
      "## Decision filter verdict", `**${v.label}** — ${v.advice}`, "",
      "## Signals",
      `- Gold (${pillarInfo("gold").name}): ${yn(f.gold)}`,
      `- Silver (${pillarInfo("silver").name}): ${yn(f.silver)}`,
      `- Core leverage (existing experience): ${yn(f.leverage)}`,
      `- Trap signal (${pillarInfo("bronze").name}): ${yn(f.trap)}`, "",
      "## Reasoning", ...v.reasons.map((r) => `- ${r}`), ...(v.warn ? ["", v.warn] : []),
    ].join("\n");
    S().projects.push({ id: uid("p"), title: name, pillar: f.gold ? "gold" : f.silver ? "silver" : "", status: "backlog", due: "", notes, links: [], tasks: [] });
    ui.filter = { ...EMPTY_FILTER };
    commit();
    toast(`"${name}" added to Backlog`);
  },
  "clear-filter": () => { ui.filter = { ...EMPTY_FILTER }; render(); },
  "open-project": (el) => openProject(el.dataset.id),
  "close-project": () => $("#project-modal").close(),
  "move-project": (el) => {
    const p = findById(S().projects, el.dataset.id);
    const ci = COLUMNS.findIndex((c) => c.id === p.status) + Number(el.dataset.dir);
    if (COLUMNS[ci]) moveProject(p.id, COLUMNS[ci].id);
  },
  "toggle-notes": () => { ui.notesEdit = !ui.notesEdit; refreshProjectDialog(); },
  "delete-task": (el) => { removeById(findById(S().projects, ui.openProject).tasks, el.dataset.id); commit(); },
  "delete-link": (el) => { removeById(findById(S().projects, ui.openProject).links, el.dataset.id); commit(); },
  "delete-project": async () => {
    const p = findById(S().projects, ui.openProject);
    if (!p || !(await confirmDialog("Delete this project?", `"${p.title}", its tasks, notes and links will be removed.`, "Delete"))) return;
    removeById(S().projects, p.id);
    for (const r of S().targetJD.requirements) r.projectIds = r.projectIds.filter((x) => x !== p.id);
    $("#project-modal").close();
    commit();
    toast("Project deleted");
  },
};

const FORMS = {
  resp: (fd) => { S().targetJD.responsibilities.push({ id: uid("jr"), text: fd.get("text").trim() }); commit(); $("#new-resp")?.focus(); },
  req: (fd) => { S().targetJD.requirements.push({ id: uid("rq"), text: fd.get("text").trim(), status: "Gap", projectIds: [] }); commit(); $("#new-req")?.focus(); },
  project: (fd) => {
    const p = { id: uid("p"), title: fd.get("title").trim(), pillar: "", status: "backlog", due: "", notes: "", links: [], tasks: [] };
    S().projects.push(p);
    commit();
    openProject(p.id);
  },
  task: (fd) => {
    findById(S().projects, ui.openProject).tasks.push({ id: uid("t"), text: fd.get("text").trim(), done: false });
    commit();
    $("#new-task")?.focus();
  },
  link: (fd) => {
    let url = fd.get("url").trim();
    if (!isWebUrl(url)) url = "https://" + url;
    try { new URL(url); } catch (e) { toast("That doesn't look like a valid URL.", true); return; }
    findById(S().projects, ui.openProject).links.push({ id: uid("l"), label: fd.get("label").trim(), url });
    commit();
  },
};

// ---------------------------------------------------------------- events
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || !ACTIONS[el.dataset.action]) return;
  if (el.tagName === "A") e.preventDefault();
  ACTIONS[el.dataset.action](el, e);
});

document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (e.key === "Enter" && t.matches?.("[data-single]")) {
    e.preventDefault();
    t.blur();
  } else if ((e.key === "Enter" || e.key === " ") && t.matches?.('[role="button"][data-action]')) {
    e.preventDefault();
    t.click();
  }
});

document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-form]");
  if (!form || !FORMS[form.dataset.form]) return;
  e.preventDefault();
  FORMS[form.dataset.form](new FormData(form), form);
});

// Text edits: update state and save without re-rendering (keeps focus and caret).
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.bind) {
    if (t.isContentEditable) setPath(S(), t.dataset.bind, t.textContent);
    else if (t.type === "range") {
      setPath(S(), t.dataset.bind, Number(t.value));
      t.nextElementSibling.textContent = t.value + "%";
      $("#weight-sum").textContent = `Total weight ${S().pillars.reduce((a, p) => a + Number(p.weight || 0), 0)}%`;
    } else if (t.type !== "checkbox" && t.tagName !== "SELECT") setPath(S(), t.dataset.bind, t.value);
    else return;
    store.save();
  } else if (t.dataset.filter === "name") {
    ui.filter.name = t.value;
    $("#verdict").innerHTML = verdictHtml();
  }
});

// Discrete controls: update state, save, re-render derived progress.
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.bind && (t.type === "checkbox" || t.tagName === "SELECT")) {
    setPath(S(), t.dataset.bind, t.type === "checkbox" ? t.checked : t.value);
    commit();
  } else if (t.dataset.filter && t.type === "checkbox") {
    ui.filter[t.dataset.filter] = t.checked;
    $("#verdict").innerHTML = verdictHtml();
  }
});

document.addEventListener("paste", (e) => {
  const t = e.target.closest?.("[contenteditable]");
  if (!t) return;
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData("text/plain");
  document.execCommand("insertText", false, t.dataset.single ? text.replace(/\s*\n\s*/g, " ") : text);
});

// Kanban drag and drop (desktop).
document.addEventListener("dragstart", (e) => {
  const card = e.target.closest?.(".pcard");
  if (!card) return;
  ui.dragId = card.dataset.id;
  e.dataTransfer.setData("text/plain", card.dataset.id);
  e.dataTransfer.effectAllowed = "move";
  card.classList.add("dragging");
});
document.addEventListener("dragend", () => {
  ui.dragId = null;
  document.querySelectorAll(".dragging, .drop-target").forEach((el) => el.classList.remove("dragging", "drop-target"));
});
document.addEventListener("dragover", (e) => {
  const col = e.target.closest?.("[data-drop]");
  if (!col || !ui.dragId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".drop-target").forEach((x) => x !== col && x.classList.remove("drop-target"));
  col.classList.add("drop-target");
});
document.addEventListener("drop", (e) => {
  const col = e.target.closest?.("[data-drop]");
  if (!col || !ui.dragId) return;
  e.preventDefault();
  const before = e.target.closest(".pcard");
  const id = ui.dragId;
  ui.dragId = null;
  moveProject(id, col.dataset.drop, before && before.dataset.id !== id ? before.dataset.id : null);
});

// Task reordering in the project dialog: drag the grip (mouse or touch), or ↑ ↓ on a focused grip.
function reorderTask(id, to) {
  const tasks = findById(S().projects, ui.openProject).tasks;
  const from = tasks.findIndex((t) => t.id === id);
  if (from < 0 || to < 0 || to >= tasks.length || to === from) return;
  tasks.splice(to, 0, tasks.splice(from, 1)[0]);
  commit();
}
let taskDrag = null;
document.addEventListener("pointerdown", (e) => {
  const grip = e.target.closest?.(".grip");
  if (!grip || e.button !== 0) return;
  e.preventDefault();
  grip.setPointerCapture(e.pointerId);
  const li = grip.closest(".task");
  li.classList.add("dragging");
  taskDrag = { li, pointerId: e.pointerId };
});
document.addEventListener("pointermove", (e) => {
  if (!taskDrag || e.pointerId !== taskDrag.pointerId) return;
  const { li } = taskDrag;
  for (const other of li.parentElement.querySelectorAll(".task")) {
    if (other === li) continue;
    const r = other.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom) continue;
    li.parentElement.insertBefore(li, e.clientY > r.top + r.height / 2 ? other.nextSibling : other);
    break;
  }
});
const endTaskDrag = (e) => {
  if (!taskDrag || e.pointerId !== taskDrag.pointerId) return;
  const { li } = taskDrag;
  taskDrag = null;
  li.classList.remove("dragging");
  reorderTask(li.dataset.id, [...li.parentElement.querySelectorAll(".task")].indexOf(li));
};
document.addEventListener("pointerup", endTaskDrag);
document.addEventListener("pointercancel", endTaskDrag);
document.addEventListener("keydown", (e) => {
  const grip = e.target.closest?.(".grip");
  if (!grip || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
  e.preventDefault();
  const li = grip.closest(".task");
  const i = [...li.parentElement.querySelectorAll(".task")].indexOf(li);
  reorderTask(li.dataset.id, i + (e.key === "ArrowUp" ? -1 : 1));
  $(`#project-body .task[data-id="${li.dataset.id}"] .grip`)?.focus();
});

$("#project-modal").addEventListener("close", () => {
  ui.openProject = null;
  render();
});

// ---------------------------------------------------------------- boot
wireShell(store, route);
