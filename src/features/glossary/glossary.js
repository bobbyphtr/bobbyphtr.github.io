/* Glossary — Mandarin vocab with pinyin and spaced repetition.
   Runs after shared/app-kit/kit.js in the same scope. */

const DEFAULT_STATE = JSON.parse($("#default-state").textContent);
const VIEWS = { review: "Review", words: "Words", import: "Import" };
const NEW_PER_DAY = 15;
const TYPES = ["noun", "verb", "noun, verb", "adjective", "adverb", "measure word", "phrase"];
const RATINGS = [
  { id: "again", label: "Again", key: "1" },
  { id: "hard", label: "Hard", key: "2" },
  { id: "good", label: "Good", key: "3" },
  { id: "easy", label: "Easy", key: "4" },
];
const AI_PROMPT = `Create a Mandarin vocabulary table for: [TOPIC, OR PASTE THE TEXT / NOTES HERE]

Return ONLY a markdown table with exactly these columns:
| Word | Pinyin | Type | Meaning | Tags |

Rules:
- Word: Traditional Chinese characters, as used in Taiwan.
- Pinyin: tone marks (e.g. bìnglì), syllables of one word written together.
- Type: part of speech — noun, verb, adjective, adverb, measure word or phrase. If the word works as more than one, list them, e.g. "noun, verb".
- Meaning: concise English meaning; add short usage context in parentheses when helpful.
- Tags: 1–3 comma-separated topics, e.g. Clinical, Public Health, Engineering, Privacy & UX, Daily life.
- One word or phrase per row, no duplicates, no commentary before or after the table.`;

// ---------------------------------------------------------------- dates
const parseDay = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return dayString(d); };
const daysUntil = (s) => Math.round((parseDay(s) - parseDay(today())) / 86400000);
const fmtInterval = (n) => (n <= 0 ? "<1d" : n < 30 ? `${n}d` : n < 365 ? `${Math.round(n / 30)}mo` : `${(n / 365).toFixed(1)}y`);
const fmtDay = (s) => parseDay(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// ---------------------------------------------------------------- state
function validate(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "File is not a JSON object.";
  if (obj.schemaVersion !== 1) return "Missing or unknown schemaVersion — not a Glossary backup.";
  if (!Array.isArray(obj.words)) return "Missing words list.";
  if (obj.words.some((w) => !w || typeof w.word !== "string")) return "Every word needs a \"word\" field.";
  return null;
}

function normalize(obj) {
  const out = { ...clone(DEFAULT_STATE), ...obj };
  out.stats = { day: "", newSeen: 0, ...(obj.stats || {}) };
  out.words = cleanList(obj.words.map((w) => ({
    id: w.id,
    word: w.word,
    pinyin: w.pinyin || "",
    type: w.type || "",
    meaning: w.meaning || "",
    tags: Array.isArray(w.tags) ? w.tags : [],
    srs: w.srs && typeof w.srs === "object" ? w.srs : null,
    added: w.added || today(),
  })), "g");
  return out;
}

const ui = {
  view: "review",
  queue: [],
  revealed: false,
  reviewTag: "All",
  q: "",
  wordTag: "All",
  paste: "",
};

const store = createStore({
  key: "bobby_glossary_v1",
  defaults: DEFAULT_STATE,
  validate,
  normalize,
  syncFile: "glossary.json",
  appName: "glossary",
  exportPrefix: "glossary-backup",
  onReplace: () => { buildSession(); render(); },
});
const S = () => store.state;

// ---------------------------------------------------------------- spaced repetition (SM-2 variant)
function schedule(srs, rating) {
  const s = srs ? { ...srs } : { interval: 0, ease: 2.5, reps: 0, lapses: 0 };
  const base = Math.max(1, s.interval);
  const good = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.round(s.interval * s.ease);
  if (rating === "again") {
    if (s.reps > 0) s.lapses++;
    s.reps = 0;
    s.interval = 0;
    s.ease = Math.max(1.3, s.ease - 0.2);
  } else if (rating === "hard") {
    s.interval = Math.max(1, Math.round(base * 1.2));
    s.ease = Math.max(1.3, s.ease - 0.15);
    s.reps++;
  } else if (rating === "good") {
    s.interval = good;
    s.reps++;
  } else {
    s.interval = Math.max(good + 1, Math.round(base * s.ease * 1.3));
    s.ease += 0.15;
    s.reps++;
  }
  s.ease = Math.round(s.ease * 100) / 100;
  s.last = today();
  s.due = addDays(today(), s.interval);
  return s;
}

const newSeenToday = () => (S().stats.day === today() ? S().stats.newSeen : 0);
const isDue = (w) => w.srs && w.srs.due <= today();
const matchesTag = (w, tag) => tag === "All" || w.tags.includes(tag);
const allTags = () => [...new Set(S().words.flatMap((w) => w.tags))].sort((a, b) => a.localeCompare(b));

function buildSession() {
  const words = S().words.filter((w) => matchesTag(w, ui.reviewTag));
  const due = words.filter(isDue).sort((a, b) => a.srs.due.localeCompare(b.srs.due));
  const fresh = words.filter((w) => !w.srs).slice(0, Math.max(0, NEW_PER_DAY - newSeenToday()));
  ui.queue = [...due, ...fresh].map((w) => w.id);
  ui.revealed = false;
}

function rate(rating) {
  const id = ui.queue.shift();
  const w = findById(S().words, id);
  if (!w) return;
  if (!w.srs) {
    const st = S().stats;
    if (st.day !== today()) { st.day = today(); st.newSeen = 0; }
    st.newSeen++;
  }
  w.srs = schedule(w.srs, rating);
  if (rating === "again") ui.queue.push(id);
  ui.revealed = false;
  store.save();
  render();
}

// ---------------------------------------------------------------- markdown table import
const HEADER_MATCHERS = {
  word: ["word", "term", "詞", "詞彙", "漢字", "汉字", "中文", "character", "chinese", "hanzi", "traditional"],
  pinyin: ["pinyin", "拼音"],
  type: ["type", "pos", "part of speech", "word class", "class", "詞性"],
  meaning: ["meaning", "english", "definition", "translation", "gloss", "意思", "英文"],
  tags: ["tag", "topic", "category", "categories", "標籤"],
};
const cleanCell = (c) => c.replace(/\\\|/g, "|").replace(/\*\*|__|`/g, "").trim();
const splitTags = (s) => String(s || "").split(/[,，、;]/).map((t) => t.trim()).filter(Boolean);

function splitRow(line) {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map(cleanCell);
}

function mapHeader(cells) {
  const map = {};
  cells.forEach((c, i) => {
    const h = c.toLowerCase();
    for (const [field, keys] of Object.entries(HEADER_MATCHERS)) {
      if (map[field] === undefined && keys.some((k) => h.startsWith(k))) { map[field] = i; break; }
    }
  });
  return map.word !== undefined && map.meaning !== undefined ? map : null;
}

function parseTable(text) {
  const rows = [], skipped = [];
  let cols = null;
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line.includes("|")) return; // ignore prose around the table
    const cells = splitRow(line);
    if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) return; // separator row
    if (!cols) {
      cols = mapHeader(cells);
      if (cols) return;
      // No recognised header: read by position (5 columns = Word, Pinyin, Type, Meaning, Tags).
      cols = cells.length >= 5 ? { word: 0, pinyin: 1, type: 2, meaning: 3, tags: 4 } : { word: 0, pinyin: 1, meaning: 2, tags: 3 };
    }
    const get = (f) => (cols[f] !== undefined ? cells[cols[f]] || "" : "");
    const row = { word: get("word"), pinyin: get("pinyin"), type: get("type").toLowerCase(), meaning: get("meaning"), tags: splitTags(get("tags")) };
    if (!row.word) return skipped.push({ line: i + 1, reason: "missing word" });
    if (!/\p{Script=Han}/u.test(row.word)) return skipped.push({ line: i + 1, reason: `"${row.word}" has no Chinese characters` });
    if (!row.meaning) return skipped.push({ line: i + 1, reason: `"${row.word}" has no meaning` });
    const dup = rows.findIndex((r) => r.word === row.word);
    if (dup >= 0) rows.splice(dup, 1);
    rows.push(row);
  });
  const withStatus = rows.map((r) => {
    const existing = S().words.find((w) => w.word === r.word);
    let status = "new";
    if (existing) {
      const same = existing.pinyin === r.pinyin && existing.meaning === r.meaning &&
        (!r.type || existing.type === r.type) && (!r.tags.length || existing.tags.join(",") === r.tags.join(","));
      status = same ? "unchanged" : "update";
    }
    return { ...r, status };
  });
  return { rows: withStatus, skipped };
}

function importRows(rows) {
  let added = 0, updated = 0;
  for (const r of rows) {
    const existing = S().words.find((w) => w.word === r.word);
    if (existing) {
      if (r.status !== "update") continue;
      existing.pinyin = r.pinyin;
      existing.meaning = r.meaning;
      if (r.type) existing.type = r.type;
      if (r.tags.length) existing.tags = r.tags;
      updated++;
    } else {
      S().words.push({ id: uid("g"), word: r.word, pinyin: r.pinyin, type: r.type, meaning: r.meaning, tags: r.tags, srs: null, added: today() });
      added++;
    }
  }
  return { added, updated };
}

// ---------------------------------------------------------------- views
const editable = (path, cls = "", lang = "") =>
  `<span class="${cls}" contenteditable="plaintext-only" spellcheck="false" data-single="1" data-bind="${esc(path)}"${lang ? ` lang="${lang}"` : ""}>${esc(getPath(S(), path))}</span>`;
const tagsEditable = (w) =>
  `<span class="w-tags" contenteditable="plaintext-only" spellcheck="false" data-single="1" data-tags="${esc(w.id)}" aria-label="Tags (comma separated)">${esc(w.tags.join(", "))}</span>`;
const tagBadges = (tags) => tags.map((t) => `<span class="badge">${esc(t)}</span>`).join("");

function counts() {
  const words = S().words;
  const fresh = words.filter((w) => !w.srs).length;
  return {
    due: words.filter(isDue).length,
    newToday: Math.min(fresh, Math.max(0, NEW_PER_DAY - newSeenToday())),
    newWaiting: fresh,
    learned: words.filter((w) => w.srs && w.srs.interval >= 21).length,
    total: words.length,
  };
}

function viewReview() {
  const c = counts();
  const tags = allTags();
  const current = ui.queue.length ? findById(S().words, ui.queue[0]) : null;
  let card;
  if (!S().words.length) {
    card = `<div class="card review-done"><h2>No words yet</h2><p>Paste a table on the Import tab to get started.</p><a class="btn btn-primary" href="#import">Import words</a></div>`;
  } else if (!current) {
    const next = S().words.filter((w) => w.srs && matchesTag(w, ui.reviewTag)).map((w) => w.srs.due).sort()[0];
    const waiting = c.newWaiting - c.newToday;
    card = `<div class="card review-done">
      <div class="done-mark" aria-hidden="true">✓</div>
      <h2>All caught up${ui.reviewTag !== "All" ? ` for ${esc(ui.reviewTag)}` : ""}</h2>
      <p>${next ? `Next review ${daysUntil(next) <= 0 ? "is due now" : `on ${fmtDay(next)} (in ${daysUntil(next)}d)`}.` : "Nothing scheduled yet."}</p>
      ${waiting > 0 ? `<p class="muted">${waiting} new word${waiting > 1 ? "s are" : " is"} waiting — the daily limit of ${NEW_PER_DAY} new words resets tomorrow.</p>` : ""}
    </div>`;
  } else {
    const isNew = !current.srs;
    card = `<section class="card review-card" aria-live="polite">
      <div class="review-meta">
        <span class="badge ${isNew ? "badge-accent" : ""}">${isNew ? "New" : "Review"}</span>
        <span class="mono">${ui.queue.length} left</span>
      </div>
      <div class="hanzi" lang="zh-Hant">${esc(current.word)}</div>
      ${ui.revealed ? `
        <div class="answer">
          <div class="pinyin">${esc(current.pinyin)}</div>
          ${current.type ? `<div class="w-type-tag">${esc(current.type)}</div>` : ""}
          <div class="meaning">${esc(current.meaning)}</div>
          <div class="chips" style="justify-content:center">${tagBadges(current.tags)}</div>
        </div>
        <div class="rate-row">
          ${RATINGS.map((r) => {
            const next = schedule(current.srs, r.id).interval;
            return `<button type="button" class="rate rate-${r.id}" data-action="rate" data-rating="${r.id}">
              <span class="rate-label">${r.label}</span>
              <span class="rate-int mono">${r.id === "again" ? "today" : fmtInterval(next)}</span>
              <kbd>${r.key}</kbd>
            </button>`;
          }).join("")}
        </div>`
      : `<button type="button" class="btn btn-primary show-btn" data-action="show">Show answer <kbd>Space</kbd></button>`}
    </section>`;
  }
  return `
  <section class="stat-row">
    <div class="stat"><strong>${c.due}</strong><span>Due today</span></div>
    <div class="stat"><strong>${c.newToday}</strong><span>New today</span></div>
    <div class="stat"><strong>${c.learned}</strong><span>Learned (21d+)</span></div>
    <div class="stat"><strong>${c.total}</strong><span>Total words</span></div>
  </section>
  ${tags.length ? `<label class="field review-filter"><span>Review tag</span>
    <select class="select" data-ui="reviewTag">${["All", ...tags].map((t) => `<option ${t === ui.reviewTag ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
  </label>` : ""}
  ${card}`;
}

function viewWords() {
  const tags = allTags();
  return `
  <section class="card stack">
    <div class="form-row">
      <label class="field"><span>Search</span><input class="input" data-ui="q" value="${esc(ui.q)}" placeholder="漢字, pinyin or meaning" autocomplete="off"></label>
    </div>
    <div class="chips" role="group" aria-label="Filter by tag">
      ${["All", ...tags].map((t) => {
        const n = t === "All" ? S().words.length : S().words.filter((w) => w.tags.includes(t)).length;
        return `<button type="button" class="chip" data-action="word-tag" data-tag="${esc(t)}" aria-pressed="${ui.wordTag === t}">${esc(t)} <span class="count">${n}</span></button>`;
      }).join("")}
    </div>
  </section>
  <section class="card">
    <div id="word-list">${wordListHtml()}</div>
  </section>
  <form class="card form-row" data-form="word">
    <label class="field" style="flex:1 1 120px"><span>Word</span><input class="input" name="word" required placeholder="轉診" lang="zh-Hant" autocomplete="off"></label>
    <label class="field" style="flex:1 1 120px"><span>Pinyin</span><input class="input" name="pinyin" placeholder="zhuǎnzhěn" autocomplete="off"></label>
    <label class="field" style="flex:1 1 120px"><span>Type</span><input class="input" name="type" placeholder="noun" list="type-list" autocomplete="off"></label>
    <datalist id="type-list">${TYPES.map((t) => `<option value="${t}">`).join("")}</datalist>
    <label class="field"><span>Meaning</span><input class="input" name="meaning" required placeholder="Referral" autocomplete="off"></label>
    <label class="field" style="flex:1 1 140px"><span>Tags</span><input class="input" name="tags" placeholder="Clinical" list="tag-list" autocomplete="off"></label>
    <datalist id="tag-list">${tags.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
    <button class="btn btn-primary" type="submit">Add word</button>
  </form>`;
}

function wordListHtml() {
  const q = ui.q.trim().toLowerCase();
  const items = S().words.filter((w) => matchesTag(w, ui.wordTag) &&
    (!q || `${w.word} ${w.pinyin} ${w.meaning}`.toLowerCase().includes(q)));
  if (!items.length) return `<div class="empty">${S().words.length ? "No matching words." : "No words yet — add one below or import a table."}</div>`;
  return `<div class="list-count muted">${items.length} of ${S().words.length} words</div>` + items.map((w) => {
    let due = '<span class="badge badge-accent">New</span>';
    if (w.srs) {
      const d = daysUntil(w.srs.due);
      due = d <= 0 ? '<span class="badge badge-amber">Due</span>' : `<span class="mono muted">in ${fmtInterval(d)}</span>`;
    }
    return `
    <div class="word-row">
      <div class="w-head">
        ${editable(`words.#${w.id}.word`, "w-word", "zh-Hant")}
        ${editable(`words.#${w.id}.pinyin`, "w-pinyin")}
        ${editable(`words.#${w.id}.type`, "w-type")}
      </div>
      ${editable(`words.#${w.id}.meaning`, "w-meaning")}
      ${tagsEditable(w)}
      <span class="w-due">${due}</span>
      <button type="button" class="x-btn" data-action="delete-word" data-id="${esc(w.id)}" aria-label="Delete ${esc(w.word)}">×</button>
    </div>`;
  }).join("");
}

function viewImport() {
  return `
  <section class="card stack">
    <div class="card-head" style="margin-bottom:0">
      <div>
        <h2 class="card-title">Paste a markdown table</h2>
        <p class="muted" style="font-size:13.5px;margin-top:2px">Columns: Word | Pinyin | Type | Meaning | Tags. Existing words are updated and keep their review history.</p>
      </div>
      <button type="button" class="btn btn-ghost" data-action="copy-prompt">Copy AI prompt</button>
    </div>
    <details class="prompt">
      <summary>Show the AI prompt</summary>
      <pre id="ai-prompt">${esc(AI_PROMPT)}</pre>
    </details>
    <label class="sr-only" for="paste">Markdown table</label>
    <textarea class="textarea paste" id="paste" data-ui="paste" rows="9" spellcheck="false" placeholder="| Word | Pinyin | Type | Meaning | Tags |
| --- | --- | --- | --- | --- |
| 轉診 | zhuǎnzhěn | noun, verb | Referral; to refer a patient | Clinical |">${esc(ui.paste)}</textarea>
  </section>
  <div id="import-preview">${previewHtml()}</div>`;
}

function previewHtml() {
  if (!ui.paste.trim()) return "";
  const { rows, skipped } = parseTable(ui.paste);
  const n = (s) => rows.filter((r) => r.status === s).length;
  const actionable = n("new") + n("update");
  return `
  <section class="card stack">
    <div class="card-head" style="margin-bottom:0">
      <div class="chips">
        <span class="badge badge-emerald">${n("new")} new</span>
        <span class="badge badge-accent">${n("update")} updated</span>
        <span class="badge">${n("unchanged")} unchanged</span>
        ${skipped.length ? `<span class="badge badge-amber">${skipped.length} skipped</span>` : ""}
      </div>
      <button type="button" class="btn btn-primary" data-action="do-import" ${actionable ? "" : "disabled"}>Import ${actionable} word${actionable === 1 ? "" : "s"}</button>
    </div>
    ${rows.length ? `<div class="preview-table"><table>
      <thead><tr><th>Word</th><th>Pinyin</th><th>Type</th><th>Meaning</th><th>Tags</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td lang="zh-Hant" class="w-word-sm">${esc(r.word)}</td><td>${esc(r.pinyin)}</td><td class="muted">${esc(r.type)}</td><td>${esc(r.meaning)}</td>
        <td>${esc(r.tags.join(", "))}</td>
        <td><span class="badge ${r.status === "new" ? "badge-emerald" : r.status === "update" ? "badge-accent" : ""}">${r.status}</span></td>
      </tr>`).join("")}</tbody></table></div>` : '<p class="muted">No table rows found yet.</p>'}
    ${skipped.length ? `<ul class="skipped">${skipped.map((s) => `<li>Line ${s.line}: ${esc(s.reason)}</li>`).join("")}</ul>` : ""}
  </section>`;
}

const RENDERERS = { review: viewReview, words: viewWords, import: viewImport };

function render() {
  $("#view").innerHTML = RENDERERS[ui.view]();
  $("#view-title").textContent = VIEWS[ui.view];
  document.title = `${VIEWS[ui.view]} · Mandarin Glossary`;
  for (const a of document.querySelectorAll("#nav a[data-view]")) {
    if (a.dataset.view === ui.view) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

function route() {
  const v = location.hash.slice(1);
  const next = VIEWS[v] ? v : "review";
  const changed = next !== ui.view;
  ui.view = next;
  if (next === "review" && (changed || !ui.queue.length)) buildSession();
  render();
  closeNav();
  if (changed) window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- actions
const ACTIONS = {
  show: () => { ui.revealed = true; render(); },
  rate: (el) => rate(el.dataset.rating),
  "word-tag": (el) => { ui.wordTag = el.dataset.tag; render(); },
  "delete-word": (el) => {
    const w = findById(S().words, el.dataset.id);
    removeById(S().words, el.dataset.id);
    ui.queue = ui.queue.filter((id) => id !== el.dataset.id);
    store.save();
    $("#word-list").innerHTML = wordListHtml();
    toast(`Deleted ${w ? w.word : "word"}`);
  },
  "copy-prompt": async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      toast("AI prompt copied — add your topic and paste it into your AI tool");
    } catch (e) {
      const d = $(".prompt");
      d.open = true;
      getSelection().selectAllChildren($("#ai-prompt"));
      toast("Clipboard blocked — prompt selected, press ⌘C", true);
    }
  },
  "do-import": () => {
    const { rows } = parseTable(ui.paste);
    const { added, updated } = importRows(rows);
    ui.paste = "";
    store.save();
    buildSession();
    render();
    toast(`Imported ${added} new, updated ${updated}`);
  },
};

const FORMS = {
  word: (fd) => {
    const word = fd.get("word").trim();
    if (S().words.some((w) => w.word === word)) { toast(`${word} is already in your glossary`, true); return; }
    S().words.push({ id: uid("g"), word, pinyin: fd.get("pinyin").trim(), type: fd.get("type").trim().toLowerCase(), meaning: fd.get("meaning").trim(), tags: splitTags(fd.get("tags")), srs: null, added: today() });
    store.save();
    render();
    $('[data-form="word"] [name="word"]')?.focus();
    toast(`Added ${word}`);
  },
};

// ---------------------------------------------------------------- events
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || !ACTIONS[el.dataset.action]) return;
  ACTIONS[el.dataset.action](el, e);
});

document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-form]");
  if (!form || !FORMS[form.dataset.form]) return;
  e.preventDefault();
  FORMS[form.dataset.form](new FormData(form), form);
});

document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.bind && t.isContentEditable) {
    setPath(S(), t.dataset.bind, t.textContent.trim());
    store.save();
  } else if (t.dataset.tags && t.isContentEditable) {
    const w = findById(S().words, t.dataset.tags);
    if (w) { w.tags = splitTags(t.textContent); store.save(); }
  } else if (t.dataset.ui === "q") {
    ui.q = t.value;
    $("#word-list").innerHTML = wordListHtml();
  } else if (t.dataset.ui === "paste") {
    ui.paste = t.value;
    $("#import-preview").innerHTML = previewHtml();
  }
});

document.addEventListener("change", (e) => {
  if (e.target.dataset.ui === "reviewTag") {
    ui.reviewTag = e.target.value;
    buildSession();
    render();
  }
});

document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (e.key === "Enter" && t.matches?.("[data-single]")) { e.preventDefault(); t.blur(); return; }
  if (ui.view !== "review" || document.querySelector("dialog[open]")) return;
  if (t.closest?.("input, textarea, select, [contenteditable]")) return;
  if (!ui.queue.length || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!ui.revealed && (e.key === " " || e.key === "Enter")) {
    e.preventDefault();
    ui.revealed = true;
    render();
  } else if (ui.revealed) {
    const r = RATINGS.find((x) => x.key === e.key);
    if (r) { e.preventDefault(); rate(r.id); }
  }
});

document.addEventListener("paste", (e) => {
  const t = e.target.closest?.("[contenteditable]");
  if (!t) return;
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData("text/plain");
  document.execCommand("insertText", false, text.replace(/\s*\n\s*/g, " "));
});

// ---------------------------------------------------------------- boot
wireShell(store, route);
