# North Star — Career & Study Compass

A personal dashboard for a graduate study plan and career direction.

**Live:** https://bobbyphtr.github.io/northstar/ · sister app: [/glossary/](../glossary/README.md)

## Views

| View | What it's for |
| --- | --- |
| **Overview & Target JD** | Identity card (click any text to edit). The **Target JD** is the job you want in 2–3 years, written as a job description. Each requirement is marked **Gap / Building / Proven**, and *Link projects* lets you attach the projects that prove it. The readiness bar shows the share of requirements you can already prove. Also shows a projects summary and the four "What I'm building" pillars. |
| **Focus Compass** | Gold / Silver / Bronze focus pillars with weight sliders, plus the **decision filter**. Name an opportunity and answer 4 questions to get *Lean In*, *Strategic Support* or *Minimum-to-Pass*. Lean In and Support verdicts can be sent straight to the board with **Add to Backlog**. |
| **Projects** | A Kanban board with Backlog / To Do / In Progress / Done. Drag cards between columns, or up and down within a column to set priority (desktop); on touch, use ◀ ▶. Tap a card to edit its status, pillar, due date, tasks, notes (light Markdown) and links. Drag a task's ⠿ handle (mouse or touch), or focus it and press ↑ ↓, to sort tasks by priority. |

## Files

| File | Purpose |
| --- | --- |
| `NorthstarApp.astro` | Page config: nav, the North Star–specific dialogs, and the inputs passed to the shared shell. |
| `northstar.css` / `northstar.js` | View styles and app logic. |
| `default-state.json` | The starting blueprint and the **single source of truth** for default data. It is embedded in the page and also published at `/northstar/default-state.json`. |

The shell, shared UI, persistence and GitHub sync live in `src/shared/app-kit/`. The build inlines everything, so `dist/northstar/index.html` is one self-contained file that works offline and via `file://`.

```bash
npm run dev     # http://localhost:4321/northstar/
npm run build   # or open dist/northstar/index.html directly
```

## Your data

- **Saved locally:** every edit is saved immediately to this browser's `localStorage` (key `bobby_career_compass_v2`). The status in the top bar shows the save/sync state. Click it to open Sync settings.
- **Sync across devices (recommended):** see [Sync with GitHub](#sync-with-github) below.
- **Export / Import JSON backup:** the sidebar's Data section downloads `career-compass-backup-YYYY-MM-DD.json` or restores one. v1 backups (from the old roadmap version) are rejected.
- **Markdown snapshot:** `NORTH_STAR_SNAPSHOT.md` covers identity, Target JD readiness, focus pillars and projects with task checklists. It's ready to paste into Obsidian, Gemini Notebooks or a `CLAUDE.md`.

## Sync with GitHub

GitHub Pages is static hosting, so there's no server. Instead, the app saves a JSON file into a **private repo you own**, using a GitHub token that can access only that repo. One setup per device covers both North Star and the Glossary.

1. **Create the data repo:** on GitHub, create a new **private** repository, e.g. `northstar-data`. Tick **Add a README file** so the `main` branch exists.
2. **Create a fine-grained token:** GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
   - **Repository access:** *Only select repositories* → `northstar-data`
   - **Permissions → Repository permissions → Contents:** *Read and write*
   - Pick an expiry. You'll need to paste a new token when it expires.
3. **Connect each device:** open the app → sidebar **Sync settings…** → enter `your-username/northstar-data`, branch `main`, paste the token → **Test**, then **Save & sync**. Repeat on your iPhone.

How it behaves:
- It pulls when the page opens or regains focus, and pushes about 10 s after your last edit and when you leave the page. **Sync now** forces a sync.
- Files are written as `northstar.json` and `glossary.json`. Every sync is a commit, so the repo's history doubles as version history.
- If both devices changed since the last sync, you're asked which version to keep. The other version stays in the commit history.
- Offline, it keeps saving locally and syncs when you're back online.
- The token is stored only in that browser's `localStorage`. It is never included in exports. Don't set up sync on shared computers. **Turn off** in the dialog removes the token.

## Deploy

Push to `main`. `.github/workflows/deploy.yml` builds the Astro site and publishes it to GitHub Pages (repo **Settings → Pages → Source: GitHub Actions**).

The page is marked `noindex`, so search engines won't list it. The blueprint itself is still readable by anyone who has the URL.
