# bobbyphtr.github.io

Personal portfolio for **Bobby Pehtrus (白鎮銓)** — software engineer, currently a Master's student in Smart Medicine & Health Informatics at National Taiwan University.

**Live site:** https://bobbyphtr.github.io

## Stack

- [Astro](https://astro.build) (v7, static output)
- TypeScript (strict)
- Inter via Google Fonts
- No framework runtime — plain Astro components + vanilla JS

## Sections

Home page (single page, anchored nav):

- Hero — full-bleed photo with parallax
- About — intro + side photo
- Experience — timeline with company/university logos
- Projects — gallery (2×2 grid, `object-fit: cover` images)
- Skills — animated bar chart
- Contact — email + GitHub / LinkedIn / Instagram / Medium

## Local development

```bash
npm install
npm run dev         # local dev server (http://localhost:4321)
npm run build       # static build to dist/
npm run preview     # preview the production build
```

Run the dev server in background mode:

```bash
npx astro dev --background
npx astro dev status   # check status
npx astro dev logs     # view logs
```

## Deploy

Hosted on **GitHub Pages** via GitHub Actions.

- Push to `main` → `.github/workflows/deploy.yml` runs `npm ci && npm run build` (Node 22) and deploys `dist/` using `actions/deploy-pages`.
- Pages source is configured to **GitHub Actions** in the repo settings.

## Structure

Code is grouped by feature; `src/pages/` only holds thin routes.

```
src/
  pages/
    index.astro                       # → features/portfolio/PortfolioPage.astro
    northstar/index.astro             # → features/northstar/NorthstarApp.astro
    northstar/default-state.json.ts   # publishes the North Star blueprint JSON
    glossary/index.astro              # → features/glossary/GlossaryApp.astro
  features/
    portfolio/                        # the main site (/)
      PortfolioPage.astro             # composes the sections into one page
      layouts/Layout.astro            # head, nav, footer
      components/                     # Hero, About, Experience, Projects, Skills, Contact
      styles/global.css               # design tokens + base styles
    northstar/                        # Career & Study Compass (/northstar/) — see its README
    glossary/                         # Mandarin Glossary (/glossary/) — see its README
  shared/
    app-kit/                          # shell, UI kit, localStorage + GitHub sync for the mini-apps
public/
  images/                   # hero (profile.jpg) + about (about.jpg) photos
  logos/                    # company/university logos (200×200 normalized)
  deepfont.png              # DeepFont project banner
```

## Personal mini-apps

Self-contained, offline-capable pages that share `src/shared/app-kit/`. Data lives in the browser's `localStorage`, with optional sync to a private GitHub repo and JSON backup/restore.

- **North Star (`/northstar/`)**: career compass with a Target JD gap check, focus filter and a project Kanban. See [`src/features/northstar/README.md`](src/features/northstar/README.md).
- **Mandarin Glossary (`/glossary/`)**: vocabulary with pinyin, spaced-repetition review and markdown-table import. See [`src/features/glossary/README.md`](src/features/glossary/README.md).

## Content notes

- Experience descriptions are kept at capability level to respect employer agreements.
- The thesis project is intentionally **not** shown on the public site.