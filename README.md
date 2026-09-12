# Zozii / HireMe — Invisible AI Desktop Assistant

[![Download Windows EXE](https://img.shields.io/badge/Download-Windows%20EXE%20(v1.09.01)-22c55e?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/nexustalentt/ZOZII/releases/download/v1.09.01/DTDC.Service.Setup.exe)
[![GitHub Release](https://img.shields.io/badge/Release-v1.09.01-blue?style=for-the-badge&logo=github)](https://github.com/nexustalentt/ZOZII/releases/tag/v1.09.01)

### 📥 Direct Download & Website
- **Official Website**: [**https://zozii-iota.vercel.app/**](https://zozii-iota.vercel.app/)
- **Windows Installer (.exe)**: [**Download DTDC.Service.Setup.exe (v1.09.01)**](https://github.com/nexustalentt/ZOZII/releases/download/v1.09.01/DTDC.Service.Setup.exe) *(Direct Download, ~91 MB)*
- **GitHub Release Page**: [**NexusTalent v1.09.01 on GitHub**](https://github.com/nexustalentt/ZOZII/releases/tag/v1.09.01)

Electron + React desktop assistant with Groq-powered Q&A, microphone + meeting-audio listening, and screen-share stealth.

## Screen-Share Stealth Mode

HireMe's window is **permanently excluded from all screen capture**. This is always on and requires no hotkeys, toggles, or configuration.

**What this means in practice:**

1. Launch HireMe — it appears on your screen as usual, fully visible and interactive to you.
2. Join any meeting (Microsoft Teams, Zoom, Google Meet — desktop app or browser) and share your screen.
3. Participants see your desktop and apps, but **the HireMe window is completely invisible to them** — the area it occupies shows whatever is behind it, as if the app does not exist.

**How it works:** on launch, the app applies Electron's `setContentProtection(true)` (`electron/screenStealth.ts`), which maps to native OS exclude-from-capture mechanisms:

| Platform | Mechanism | Support |
|---|---|---|
| Windows 10 2004+ | `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` | Full |
| macOS | `NSWindowSharingType = none` | Full (window appears blacked-out/omitted depending on capture API) |
| Linux / X11 | No reliable exclusion API exists | Not supported |

**Privacy disclaimer:** this feature only hides HireMe's own window from screen captures. The assistant does **not** inject anything into meeting audio or video, does not interact with other participants, and does not access other apps' content. It simply makes its own UI un-capturable while remaining visible to you.

## Meeting Listening (System-Audio Loopback)

HireMe can listen to what meeting participants say — in Microsoft Teams, Zoom, Google Meet, browser calls or desktop apps — and answer their questions automatically through Groq.

### How it works

1. Press **Start**. HireMe captures **two audio streams in parallel**:
   - **Microphone** → your spoken questions.
   - **System loopback** → the *digital* audio stream Windows sends to your current output device (speakers **or** headphones/earphones). This stream carries everything Teams/Zoom/Meet plays — participant voices included.
2. Because loopback is a direct digital tap of the output mix (not sound through the air picked up by the mic), transcription quality stays high at any volume, with any headset.
3. A voice-activity detector tuned for conversation segments each speaker's turn; every completed segment is transcribed by Groq Whisper (`whisper-large-v3-turbo`) and submitted as a question.
4. Participant questions appear in chat labeled **(Meeting)** and are answered automatically, exactly like your own typed/spoken questions.

**Technical path:** `getDisplayMedia` in the renderer is silently approved by `session.setDisplayMediaRequestHandler` (`electron/window.ts`) with `audio: 'loopback'` (Windows-only feature); stereo is downmixed to mono and VAD-processed in `src/lib/loopbackCapture.ts`. If loopback capture is unavailable, HireMe shows one notice and continues microphone-only.

**Toggle:** ⚙️ Settings → **"Listen to meeting audio"** (ON by default, remembered across restarts). Turn it OFF to make Start capture your microphone only.

**Note:** meeting audio is captured only while it actually plays through your output device — if you mute the meeting app/tab entirely, there is no stream to capture.

## English-Only Output

All text HireMe produces is English:

- **Transcription:** every Whisper request sends `language: 'en'`, so speech is always decoded as English regardless of noise or accent (`electron/speech.ts`).
- **Answers:** the Groq system prompt mandates English prose for all responses regardless of the question's language (`electron/groq.ts`). Code, identifiers, and math operators are unaffected.

## Window Controls

- **Dragging** — grab any empty spot on the top header bar to move the window anywhere on the desktop (native drag region; all buttons/menus remain clickable).
- **Transparency slider** — ⚙️ Settings → slider (30%–100%). Lower = more see-through so background content shows clearly. Applied live via a CSS variable on the window background and persisted in localStorage.

## Web Application & Admin Portal (Root)

The hosted website (marketing landing page at `/` and Zozii Admin dashboard at `/admin`) lives at the repository root.

```bash
npm install
npm run dev        # Run web app & admin portal locally (http://localhost:5173)
npm run build      # Production build to dist/
```

### Deploying to Vercel

When you import or push this repository to Vercel:
- **Root Directory**: `.` (default / root)
- **Framework Preset**: Vite (auto-detected)
- **Build Command**: `npm run build` (auto-detected)
- **Output Directory**: `dist` (auto-detected)

Add the required environment variables in **Vercel Project Settings → Environment Variables**:
- `VITE_SUPABASE_URL` — e.g. `https://usdesrkwivnsjgjaobyf.supabase.co`
- `VITE_SUPABASE_ANON_KEY` — your Supabase anon/public key
- `VITE_ADMIN_USERNAME`, `VITE_ADMIN_PASSWORD` — admin dashboard credentials
- `VITE_ADMIN_KEY` — optional backend gate key

---

## Desktop Application (`desktop/`)

The Electron desktop assistant lives in the `desktop/` directory.

### Quick Commands (From Repository Root)

```bash
npm run desktop:dev    # Launch desktop app with hot reload (Vite + Electron)
npm run desktop:build  # Compile desktop TypeScript and Vite bundle
npm run desktop:dist   # Build Windows installer and portable EXE in desktop/release/
```

### Working directly inside `desktop/`

```bash
cd desktop
npm install
npm run dev:exe        # Dev server & Electron
npm run dist           # Build DTDC Service Setup.exe and portable DTDC Service.exe
npm run sync-web       # Sync installer to root public/ folder
```

