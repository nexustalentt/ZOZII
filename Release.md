# HireMe — Website & Download System Plan

This document describes exactly what was added to this repository,
split into **Part A** (done automatically by the assistant) and
**Part B** (done manually by you).

Nothing in Part A modifies the existing Electron application's
functionality — the website is a fully separate addition.

---

## Quick Summary

| Item | Value |
|---|---|
| Website location | `website/` (new, self-contained directory) |
| Tech stack | Vite + React + TypeScript (matches existing app stack) |
| Deployment | Vercel (auto-redeploys on every push) |
| Installer hosting | **Served directly from the Vercel site itself** |
| Main repo visibility | **Private — your source code stays private** ✅ |
| Public download file | `HireMe Setup.exe` — **never** `HireMe.exe` |

### Why downloads come from Vercel (not GitHub Releases)

Your repository is private, so GitHub Release assets cannot be downloaded
by visitors without logging in. Instead, the installer lives inside the
website's public folder (`website/public/`) and is served by Vercel at:

```
https://<your-vercel-domain>/HireMe%20Setup.exe
```

Anyone can download it; nobody can see your code.

> ⚠️ Trade-off to be aware of: each new version adds ~90 MB permanently
> to git history, and pushes/clones get slower over time. GitHub also
> hard-rejects any single file over **100 MB** — if the installer ever
> grows past that, switch hosting to a separate small PUBLIC releases-only
> repo (GitHub Releases allow up to 2 GB per asset) and update one URL in
> `website/src/lib/release.ts`.

---

# PART A — Done by the assistant (complete)

## A1. The website (`website/` directory)

```
website/
├── package.json          # react, react-dom, vite, @vitejs/plugin-react only
├── vite.config.ts        # base: './', outDir: 'dist'
├── tsconfig.json
├── index.html
├── public/
│   ├── icon.png              # branding (copied from build/icon.png)
│   ├── HireMe Setup.exe      # the downloadable installer (synced by script)
│   └── version.json          # auto-generated from root package.json
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── lib/release.ts        # download URL + version fetch
    ├── components/
    │   ├── Header.tsx         # nav: Home / Features / Download + "Download HireMe"
    │   │                      # collapses to hamburger menu on mobile
    │   ├── Hero.tsx           # home section
    │   ├── Features.tsx       # feature card grid (8 real capabilities)
    │   ├── Download.tsx       # download section + live version display
    │   └── Footer.tsx
    └── styles.css             # dark premium theme, responsive breakpoints
```

Plus two root-level additions:

- `scripts/sync-web.mjs` — copies the fresh installer into
  `website/public/` and writes `version.json` from root `package.json`
- `"sync-web"` npm script in root `package.json`

## A2. Website content

Exactly 3 sections:

```
Header   → Home | Features | Download   [Download HireMe button]
Home     → Hero section
Features → Feature grid
Download → Installer download section
Footer   → single line
```

No login, signup, pricing, billing, plans, demo video, dashboard,
account system, blog, or contact forms.

### Content details

- **Badge**: "AI-Powered Interview Assistant"
- **H1**: "Prepare Smarter. Interview Better."
- **Description**: desktop AI assistant for technical interviews —
  understands questions, generates solutions, real-time assistance.
- **Primary CTA**: Download HireMe → downloads the installer
- **Secondary CTA**: Explore Features → smooth-scrolls to Features

### Feature cards (only real, existing capabilities)

1. **AI-Powered Answers** — Groq-powered AI generates technical answers.
2. **Real-Time Speech Understanding** — mic transcription of spoken questions.
3. **Meeting Audio Support** — system/meeting audio capture on Windows.
4. **Technical Problem Solving** — DSA, algorithms, complexity, system design.
5. **Fast Responses** — built for live conversations.
6. **Desktop Application** — native app, no extra browser tab.
7. **Screen Capture Protection** — can exclude its own window from supported
   screen-capture mechanisms via Electron content protection.
   *(Accurate wording only — no "undetectable"/"bypasses monitoring" claims.)*
8. **English Output** — transcription/answers produced in English.

### Footer (exact line)

```
© 2026 HireMe. All Rights Reserved. | Maintained By Norvique Technologies Team
```

## A3. Version handling — single source of truth

- The version number exists ONLY in root `package.json`
- `npm run sync-web` writes `website/public/version.json` from it
- The website displays "Latest Windows Release • vX.Y.Z" by fetching
  `version.json`; falls back to "Latest Windows Release" gracefully

## A4. electron-builder.yml

Left as it originally was (no publish config needed anymore — nothing
publishes to GitHub). Nothing about the Electron build changed.

## A5. Verification (already run)

1. `npm run sync-web` → installer + version synced ✅
2. `cd website && npm install && npm run build` → clean production build;
   `dist/` contains `HireMe Setup.exe`, `version.json`, `icon.png` ✅
3. Root `npm run typecheck` → Electron TypeScript passes ✅
4. Root `npm run build` → Electron app builds ✅

---

# PART B — Your workflows

## B1. First-time: commit & push everything

```powershell
git add .
git commit -m "Add marketing website with direct installer download"
git push
```

Vercel redeploys automatically → the site AND the installer go live.
Verify: open your site → Download section shows
"Latest Windows Release • v0.1.0" → button downloads `HireMe Setup.exe`.

> Note: the first push uploads ~90 MB (the exe). It may take a few minutes.

## B2. Every future version (repeat these 4 commands)

| Step | Command | What it does |
|---|---|---|
| 1 | *(edit code, then bump* `"version"` *in root `package.json`, e.g.* `0.1.0 → 0.2.0`*)* | single source of truth |
| 2 | `npm run dist` | builds fresh `release/HireMe Setup.exe` |
| 3 | `npm run sync-web` | copies exe + version into `website/public/` |
| 4 | `git add . && git commit -m "Release v0.2.0" && git push` | Vercel deploys site + new installer together |

That's it — no GitHub release step, no website code changes.
The website updates itself from the pushed files.

## B3. If you ever change ONLY the website

Just edit `website/` files and push. No rebuild of the exe needed.

---

## Explicitly out of scope

Authentication, database, payments, pricing, dashboard, blog, contact
forms, analytics setup, login/signup, demo videos, account systems.
