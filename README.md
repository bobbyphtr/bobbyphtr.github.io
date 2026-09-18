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

```
src/
  layouts/Layout.astro      # head, nav, footer
  components/               # Hero, About, Experience, Projects, Skills, Contact
  pages/index.astro         # composes the above into one page
  styles/global.css         # design tokens + base styles
public/
  images/                   # hero (profile.jpg) + about (about.jpg) photos
  logos/                    # company/university logos (200×200 normalized)
  deepfont.png              # DeepFont project banner
```

## Content notes

- Experience descriptions are kept at capability level to respect employer agreements.
- The thesis project (NSTC Crisis-Aware Medical AI, sub-project III) is intentionally **not** shown on the public site.