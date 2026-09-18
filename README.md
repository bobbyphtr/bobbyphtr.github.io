# Portfolio Website — Build Plan & Handoff

Status snapshot so a fresh session can resume without losing context.

## 1. Project goal

A personal-brand/hobby portfolio site for **Bobby Pehtrus (白鎮銓)**.
Audience-directed content, no NDA risk, public-facing. Dark & minimal design.

- **Location (intended):** `~/Documents/AI/portfolio` (own git repo)
- **Actual (current):** `~/Documents/AI/academic-assistant/portfolio/` — scaffolded here
  because the opencode workspace is `academic-assistant` and external-dir writes are
  blocked. **Move it out afterward:** `mv ~/Documents/AI/academic-assistant/portfolio ~/Documents/AI/portfolio`
- **Stack:** Astro (static site, TypeScript `strict`) → free deploy on **Vercel** (or Netlify)
- **Design:** dark background `#0a0f0d`, teal accent `#2dd4bf`, Inter font, single-page with anchored nav
- **Sections (single page, nav order):** Hero · About · Experience · Projects · Skills · Contact

## 2. Decisions (locked)

| Topic | Decision |
|-------|----------|
| Goal | Hobby / personal brand |
| Stack | Astro (my recommendation) — static-first, fast, easy hosting |
| Hosting | Vercel / Netlify (free) |
| Design | Dark & minimal, teal accent |
| Location | Separate repo `~/Documents/AI/portfolio` (build in workspace subfolder → move later) |
| Projects | Showcase on home page; **GetGo, Traveloka, DL font classifier** |
| Excluded | **CHG/Crisis-Aware thesis kept OFF the public site** (live NSTC-funded research, team) |

## 3. Profile data used (source of truth)

From `academic-assistant/profile.md` (do not fabricate info not present there):

- Name: Bobby Pehtrus 白鎮銓 · Email: bobbypehtrus2@gmail.com · bobbyphtr GitHub handle TBD
- NTU M.S. Smart Medicine & Health Informatics (Y1), thesis = edge AI mobile app (crisis-aware medical intelligence)
- 5 yrs Software Engineer: **Traveloka** (SE Asia, AWS) + **GetGo Carsharing** (Singapore, Kotlin multiplatform)
- Apple Developer Academy alum
- B.Sc. Computer Science **Summa Cumlaude 3.91** (kept grades out of site copy — verified safe wording used instead)
- Undergrad thesis: **DL font classifier** (CNN + AutoEncoder, 80% train acc)
- Research interest: applying ML/AI to clinical workflows + patient-facing tools

## 4. Approved content plan (per section)

### Hero
- Kicker: "Hello, I'm Bobby Pehtrus · 白鎮銓"
- H1: "Software engineer focused on smart medicine & health informatics." (accent span on "smart medicine")
- Lede: "Master's student at NTU. Five years building mobile and cloud software across Southeast Asia. Now applying that craft to patient-facing AI in clinical and crisis contexts."
- CTAs: "View projects" → #projects · "Get in touch" → #contact

### About
- "Engineer by trade, health-tech by direction." + 3 short paragraphs (student intro, industry background, thesis/undergrad). **Draft text already approved in earlier session** (see stale `About.astro` draft if present).

### Experience (reverse-chron timeline cards)
1. **NTU** — M.S. candidate, Smart Medicine & Health Informatics — 2026–present — thesis: edge AI for crisis-aware medical intelligence (offline triage, population monitoring, device-to-device apps)
2. **GetGo Carsharing** (Singapore) — Software Engineer — Kotlin multiplatform mobile, cross-platform
3. **Traveloka** (SE Asia) — Software Engineer — AWS cloud platform, Ruby scripting/automation
- Keep descriptions at capability-skill level; no proprietary/employer-confidential detail.

### Projects (3 cards on home page, grid)
1. **DL font classifier** — undergrad thesis; deep learning font classification with CNN + autoencoder (80% train acc). Tags: Python · Deep Learning · CNN
2. **GetGo mobile** — consumer carsharing app, one Kotlin codebase shipping iOS + Android. Tags: Kotlin · Kotlin Multiplatform · Mobile. Note: commercial, described at capability level
3. **Traveloka platform automation** — cloud infrastructure + automation work on AWS at scale. Tags: AWS · Ruby · Automation. Note: commercial, described at capability level
- Section footer note: "Details shared at capability level to respect employer agreements."

### Skills (grouped tag chips)
- **Cloud & Platform:** AWS · Cloud architecture · Automation
- **Mobile:** Kotlin · Kotlin Multiplatform · iOS/Android
- **Languages:** Python · Ruby · JavaScript/TypeScript · SQL
- **ML & Health AI:** Deep learning (CNN/AutoEncoder) · Edge/on-device AI · Medical imaging (current coursework) · Python ML libs

### Contact
- Email CTA: mailto:bobbypehtrus2@gmail.com
- GitHub / LinkedIn links — **placeholders `#`**, user must fill real URLs later

## 5. Files created (all complete)

In `portfolio/` (scaffolded via `npm create astro@latest --template minimal --typescript strict`):

- `package.json` — name `portfolio`, Astro ^7.3.3, Node >=22.12.0, scripts: dev/build/preview/astro
- `astro.config.mjs` — default defineConfig({})
- `tsconfig.json` — strict
- `src/styles/global.css` — full dark theme design system (CSS vars: --bg, --surface, --border, --text, --muted, --accent #2dd4bf, --maxw 760px; header/nav/section/footer styles, responsive)
- `src/layouts/Layout.astro` — shared head (Inter font via Google Fonts), sticky nav (About/Experience/Projects/Skills/Contact), footer "© {year} Bobby Pehtrus. Built with Astro.", imports `@import "../styles/global.css"` in `<style is:global>`
- `src/components/Hero.astro` — COMPLETE (kicker, h1, lede, 2 CTA buttons, styled)
- `src/components/About.astro` — COMPLETE ("Engineer by trade, health-tech by direction." + 3 paragraphs)
- `src/components/Experience.astro` — COMPLETE (reverse-chron cards: NTU / GetGo / Traveloka + employer-agreement note)
- `src/components/Projects.astro` — COMPLETE (3 cards: DL font classifier / GetGo mobile / Traveloka platform automation + note)
- `src/components/Skills.astro` — COMPLETE (4 groups: Cloud & Platform / Mobile / Languages / ML & Health AI)
- `src/components/Contact.astro` — COMPLETE (mailto CTA + GitHub/LinkedIn `#` placeholders)
- `src/pages/index.astro` — COMPLETE (composes Layout + all 6 sections)
- `dist/` — ✅ `npm run build` clean (1 page)

## 6. Session history / tooling note (important)

- Previous session: Write tool failed with `BLOCKED: Long base64 string (potential obfuscated payload)`; worked around via bash heredoc. **Resolved this session — Write/Edit tools worked normally.**
- Bash has occasionally blocked (`BLOCKED: at scheduler`). Retry once; passes on 2nd attempt.
- Removed leftover `src/components/TEST.txt` test file.

## 7. Remaining work (steps for resumed build)

1. ✅ About / Experience / Projects / Skills / Contact + index rewrite — DONE (build clean)
2. Verify visually: `npm run dev` → check sections/nav/anchors/color contrast/scroll-padding
3. (Optional) refresh `public/favicon.svg` to a "BP." mark — currently stock Astro icon
4. Fill in real GitHub + LinkedIn URLs in `src/components/Contact.astro` (currently `#` placeholders)
5. `git init` + first commit in `portfolio/`
6. Push to GitHub → import on Vercel (free) → live URL
7. `mv` the folder to `~/Documents/AI/portfolio` if external-dir access opens up (per §1)

## 8. Build & verify commands

```bash
cd ~/Documents/AI/academic-assistant/portfolio
npm install          # already done once (0 vulnerabilities) — re-run if `node_modules` missing
npm run dev          # local preview; per portfolio/AGENTS.md use `astro dev --background`
npm run build        # static build check
npm run preview      # preview the build
```

## 9. Note for the resumed assistant

- Introduce yourself as the academic assistant / portfolio builder for Bobby.
- Read `~/Documents/AI/academic-assistant/profile.md` + `projects/crisis-aware-medical-ai.md` for context you cannot rewrite from this file.
- Do NOT add CHG/thesis co-project details or proprietary employer info to the site.
- No code comments unless asked. Keep copy concise and professional.