import { useEffect, useState } from 'react'
import ZoziiLogo from './components/ZoziiLogo'
import { fetchActiveRelease, DEFAULT_RELEASE } from './lib/api'
import type { AppRelease } from './lib/types'
import {
  Download,
  Terminal,
  Shield,
  Radio,
  Zap,
  Mic,
  Volume2,
  Code,
  Cpu,
  Monitor,
  Lock,
  ExternalLink,
  Sparkles
} from 'lucide-react'

export default function Landing(): React.JSX.Element {
  const [release, setRelease] = useState<AppRelease>(DEFAULT_RELEASE)

  useEffect(() => {
    void fetchActiveRelease().then(setRelease)
  }, [])

  return (
    <div className="landing">
      {/* ----------------------------------------------------------------- NAV */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <a href="/" className="landing-nav-brand">
            <ZoziiLogo size={28} />
            <span>Zozii</span>
            <span className="landing-nav-brand-badge">v{release.version || '1.0.0'}</span>
          </a>

          <div className="landing-nav-links">
            <a href="#engine">Engine</a>
            <a href="#modalities">Modalities</a>
            <a href="#architecture">Architecture</a>
            <a href="#guide">Quickstart</a>
            <a href="#faq">FAQ</a>
          </div>

          <div className="landing-nav-actions">
            <a
              href={release.download_url}
              download={release.filename}
              className="btn btn-primary btn-nav-download"
              title={`Download ${release.filename}`}
            >
              <Download size={15} style={{ marginRight: '6px' }} />
              <span>Download (.exe)</span>
            </a>
            <a className="btn btn-ghost btn-nav-admin" href="/admin">
              Admin
            </a>
          </div>
        </div>
      </nav>

      {/* ----------------------------------------------------------------- HERO */}
      <section className="landing-hero">
        <div className="landing-hero-bg" aria-hidden="true" />
        <div className="landing-hero-grid">
          {/* Left Column: Copy & Actions */}
          <div className="landing-hero-col">
            <div className="landing-hero-badge">
              <span className="badge-pulse-dot" />
              <span>SYSTEM ONLINE</span>
              <span className="cursor-blink">|</span>
            </div>

            <h1 className="landing-hero-title">
              Meet <span className="landing-gradient-text">Zozii</span> — invisible AI meeting assistant
            </h1>

            <p className="landing-hero-sub">
              Listen to meetings, speak or type questions, and receive instant streaming answers —
              rendered directly on your display, completely invisible to screen shares and meeting participants.
            </p>

            <div className="landing-hero-actions">
              <a
                href={release.download_url}
                download={release.filename}
                className="btn btn-primary btn-lg landing-hero-download"
              >
                <Download size={18} style={{ marginRight: '8px' }} />
                <span>
                  Download for Windows (.exe)
                  {release.version && (
                    <small style={{ opacity: 0.85, fontWeight: 500, marginLeft: '8px' }}>
                      v{release.version}
                    </small>
                  )}
                </span>
              </a>

              <a href="#engine" className="btn btn-ghost btn-lg">
                <Terminal size={17} style={{ marginRight: '6px' }} />
                Explore Engine
              </a>
            </div>

            <div className="landing-hero-chips">
              <span className="landing-chip">
                <span className="landing-chip-tag">[•]</span> WDA_EXCLUDEFROMCAPTURE
              </span>
              <span className="landing-chip">
                <span className="landing-chip-tag">[•]</span> WASAPI Loopback Tap
              </span>
              <span className="landing-chip">
                <span className="landing-chip-tag">[•]</span> &lt;320ms Realtime Stream
              </span>
              <span className="landing-chip">
                <span className="landing-chip-tag">[•]</span> 10-Min Instant Trial
              </span>
            </div>
          </div>

          {/* Right Column: Floating Terminal Card */}
          <div className="floating-terminal-col">
            <div className="floating-terminal">
              <div className="terminal-window">
                <div className="terminal-header">
                  <div className="terminal-dots">
                    <span className="terminal-dot terminal-dot--red" />
                    <span className="terminal-dot terminal-dot--amber" />
                    <span className="terminal-dot terminal-dot--green" />
                  </div>
                  <span className="terminal-title">zozii-engine.ts</span>
                  <span className="terminal-status-pill">● LIVE RUNTIME</span>
                </div>

                <div className="terminal-body">
                  <div className="terminal-code">
                    <div className="terminal-line">
                      <span className="syn-comment">// initializing invisible meeting assistant</span>
                    </div>
                    <div className="terminal-line">
                      <span className="syn-kwd">const</span> <span className="syn-def">assistant</span> = {'{'}
                    </div>
                    <div className="terminal-line" style={{ paddingLeft: '16px' }}>
                      <span className="syn-prop">role</span>: <span className="syn-str">"Invisible AI Co-Pilot"</span>,
                    </div>
                    <div className="terminal-line" style={{ paddingLeft: '16px' }}>
                      <span className="syn-prop">stealth</span>: <span className="syn-str">"WDA_EXCLUDEFROMCAPTURE"</span>,
                    </div>
                    <div className="terminal-line" style={{ paddingLeft: '16px' }}>
                      <span className="syn-prop">audioTap</span>: <span className="syn-str">"WASAPI_LOOPBACK_ACTIVE"</span>,
                    </div>
                    <div className="terminal-line" style={{ paddingLeft: '16px' }}>
                      <span className="syn-prop">models</span>: [<span className="syn-str">"Groq/LLaMA-3.3"</span>, <span className="syn-str">"Gemini 1.5 Pro"</span>],
                    </div>
                    <div className="terminal-line" style={{ paddingLeft: '16px' }}>
                      <span className="syn-prop">latency</span>: <span className="syn-str">"&lt; 320ms"</span>,
                    </div>
                    <div className="terminal-line" style={{ paddingLeft: '16px' }}>
                      <span className="syn-prop">screenShareSafe</span>: <span className="syn-bool">true</span>,
                    </div>
                    <div className="terminal-line" style={{ paddingLeft: '16px' }}>
                      <span className="syn-prop">active</span>: <span className="syn-bool">true</span>
                    </div>
                    <div className="terminal-line">{'}'};</div>
                  </div>

                  <div className="terminal-output-box">
                    <div className="terminal-output-label">
                      <Terminal size={12} />
                      <span>Live Stream Simulation</span>
                    </div>
                    <div className="terminal-output-text">
                      <div style={{ color: '#9ca3af', marginBottom: '4px' }}>
                        &gt; Meeting: "How do you manage zero downtime database migrations?"
                      </div>
                      <div style={{ color: '#22d472' }}>
                        &gt; Zozii: <strong>"Expand-contract pattern:</strong> add nullable column first, backfill asynchronously in batches, switch dual writes, then migrate read queries before pruning."
                        <span className="cursor-blink">|</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- CORE CAPABILITIES */}
      <div className="landing-section-wrap" id="engine">
        <section className="landing-section">
          <div className="landing-section-header">
            <span className="landing-section-label">Core Engineering</span>
            <h2 className="landing-section-title">Engineered for absolute discretion</h2>
            <p className="landing-section-sub">
              Hardware and OS-level innovations that keep your AI assistant private, ultra-low latency, and reliable.
            </p>
          </div>

          <div className="landing-cards">
            <div className="glow-card">
              <span className="glow-card-tag">WIN32 DIRECTCOMPOSITION</span>
              <div className="glow-card-icon">
                <Shield size={24} />
              </div>
              <h3>Invisible in Screen Shares</h3>
              <p>
                The Zozii window is excluded at the Desktop Window Manager (DWM) level using native OS capture flags.
                Teams, Zoom, Google Meet, and screen recorders render right through it. Participants will never see it.
              </p>
            </div>

            <div className="glow-card">
              <span className="glow-card-tag">WASAPI LOOPBACK</span>
              <div className="glow-card-icon">
                <Radio size={24} />
              </div>
              <h3>Digital Loopback Audio Tap</h3>
              <p>
                Directly captures system audio output from your sound hardware without third-party virtual audio cables.
                Zero audio is uploaded or stored remotely — audio analysis remains completely local on your PC.
              </p>
            </div>

            <div className="glow-card">
              <span className="glow-card-tag">TOKEN STREAMING</span>
              <div className="glow-card-icon">
                <Zap size={24} />
              </div>
              <h3>Sub-Second Token Streaming</h3>
              <p>
                Engineered with Groq LLaMA-3.3 and Google Gemini high-speed streaming APIs.
                Answers begin rendering word-by-word in milliseconds so you can read ahead effortlessly.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* ---------------------------------------------------- INTERACTION MODALITIES */}
      <div className="landing-section-wrap landing-section-wrap--alt" id="modalities">
        <section className="landing-section">
          <div className="landing-section-header">
            <span className="landing-section-label">Interaction Modalities</span>
            <h2 className="landing-section-title">Four ways to interact with Zozii</h2>
            <p className="landing-section-sub">
              Flexible multi-modal input designed for seamless, discreet workflow integration during critical meetings.
            </p>
          </div>

          <div className="landing-cards landing-cards--four">
            <div className="glow-card modality-card">
              <div className="modality-icon-wrap">
                <Mic size={20} />
              </div>
              <h3>Voice Prompts</h3>
              <p>Press <kbd>Ctrl+Z</kbd> and speak out loud into your microphone. Zozii transcribes and answers live.</p>
            </div>

            <div className="glow-card modality-card">
              <div className="modality-icon-wrap">
                <Volume2 size={20} />
              </div>
              <h3>Meeting Audio Tap</h3>
              <p>Enable passive listening in settings. Zozii hears questions from other participants and formulates answers.</p>
            </div>

            <div className="glow-card modality-card">
              <div className="modality-icon-wrap">
                <Code size={20} />
              </div>
              <h3>Stealth Keyboard</h3>
              <p>Prefer typing? Enter queries into the stealth prompt box and hit enter — works like an invisible private terminal.</p>
            </div>

            <div className="glow-card modality-card">
              <div className="modality-icon-wrap">
                <Zap size={20} />
              </div>
              <h3>Real-Time Stream</h3>
              <p>Tokens appear incrementally word-by-word. You never have to wait for the complete answer before reading.</p>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '32px' }}>
            <span className="landing-chip" style={{ fontSize: '12px' }}>
              <span className="landing-chip-tag">[i]</span> Prompts and meeting transcription currently supported in English.
            </span>
          </div>
        </section>
      </div>

      {/* ---------------------------------------------------- TECHNICAL ARCHITECTURE */}
      <div className="landing-section-wrap" id="architecture">
        <section className="landing-section">
          <div className="landing-section-header">
            <span className="landing-section-label">Architecture</span>
            <h2 className="landing-section-title">Under the hood</h2>
            <p className="landing-section-sub">
              A breakdown of the native system stack powering Zozii's desktop runtime.
            </p>
          </div>

          <div className="tech-grid">
            <div className="tech-card">
              <div className="tech-card-header">
                <Cpu size={20} color="var(--primary)" />
                <span className="tech-card-category">RUNTIME</span>
              </div>
              <h4>Electron 32 &amp; TypeScript</h4>
              <p>Hardened desktop environment with secure context isolation, fast IPC communication, and minimal memory footprint.</p>
            </div>

            <div className="tech-card">
              <div className="tech-card-header">
                <Monitor size={20} color="var(--primary)" />
                <span className="tech-card-category">DWM WIN32</span>
              </div>
              <h4>Direct3D Screen Guard</h4>
              <p>Native exclusion flags instruct the Windows Desktop Window Manager to omit the window buffer from any capture pipe.</p>
            </div>

            <div className="tech-card">
              <div className="tech-card-header">
                <Radio size={20} color="var(--primary)" />
                <span className="tech-card-category">AUDIO PIPELINE</span>
              </div>
              <h4>WASAPI Audio Session</h4>
              <p>Direct digital audio loopback from your default playback device without requiring virtual cable drivers.</p>
            </div>

            <div className="tech-card">
              <div className="tech-card-header">
                <Zap size={20} color="var(--primary)" />
                <span className="tech-card-category">LLM ENGINE</span>
              </div>
              <h4>Groq &amp; Gemini Dual Backend</h4>
              <p>Switch dynamically between Groq's high-throughput LPU inference and Google Gemini's reasoning models.</p>
            </div>

            <div className="tech-card">
              <div className="tech-card-header">
                <Lock size={20} color="var(--primary)" />
                <span className="tech-card-category">INFRASTRUCTURE</span>
              </div>
              <h4>Supabase Auth &amp; Storage</h4>
              <p>Encrypted user accounts, cryptographically verified session duration, and fast installer binary distribution.</p>
            </div>

            <div className="tech-card">
              <div className="tech-card-header">
                <Sparkles size={20} color="var(--primary)" />
                <span className="tech-card-category">PRIVACY</span>
              </div>
              <h4>Local-First Zero Retention</h4>
              <p>No meeting audio, transcripts, or personal logs are persisted on remote infrastructure. Everything is transient.</p>
            </div>
          </div>
        </section>
      </div>

      {/* ---------------------------------------------------- STEP-BY-STEP GUIDE */}
      <div className="landing-section-wrap landing-section-wrap--alt" id="guide">
        <section className="landing-section">
          <div className="landing-section-header">
            <span className="landing-section-label">Quickstart</span>
            <h2 className="landing-section-title">Get started in 3 minutes</h2>
            <p className="landing-section-sub">
              Simple steps from downloading the installer to receiving your first live streaming answer.
            </p>
          </div>

          <ol className="landing-steps">
            <li>
              <div className="landing-step-content">
                <h4>Download &amp; install Zozii</h4>
                <p>
                  Download the latest Windows installer and launch it to install the desktop assistant:
                </p>
                <div className="landing-step-cta">
                  <a
                    href={release.download_url}
                    download={release.filename}
                    className="btn btn-primary btn-sm"
                  >
                    <Download size={14} style={{ marginRight: '6px' }} />
                    Download {release.filename}
                  </a>
                </div>
              </div>
            </li>

            <li>
              <div className="landing-step-content">
                <h4>Register your account</h4>
                <p>
                  Launch Zozii on your computer and click <strong>Register</strong>. Enter your email and choose a password.
                  No administrator pre-approval is needed to begin trying the app.
                </p>
              </div>
            </li>

            <li>
              <div className="landing-step-content">
                <h4>10-minute free trial starts instantly</h4>
                <p>
                  Your account is activated immediately upon registration. You receive <strong>10 minutes of active session time</strong>{' '}
                  and can ask <strong>up to 10 questions</strong> on the complimentary trial.
                </p>
              </div>
            </li>

            <li>
              <div className="landing-step-content">
                <h4>Connect your AI provider (Groq or Gemini)</h4>
                <p>
                  Open <strong>Settings ⚙</strong> and select <em>Change AI / API Key</em>.
                  Paste your personal Groq or Gemini API key to power real-time answers.
                </p>
              </div>
            </li>

            <li>
              <div className="landing-step-content">
                <h4>Start listening</h4>
                <p>
                  Click <strong>Start</strong> or press hotkey <kbd>Ctrl+Z</kbd> to begin.
                  The green mic indicator confirms the engine is actively listening.
                </p>
              </div>
            </li>

            <li>
              <div className="landing-step-content">
                <h4>Ask a question aloud or via text</h4>
                <p>
                  Speak naturally into your microphone or type into the question input.
                  Zozii accurately interprets your prompt and routes it to the AI backend.
                </p>
              </div>
            </li>

            <li>
              <div className="landing-step-content">
                <h4>Read streaming answers word-by-word</h4>
                <p>
                  Answers render immediately in the response panel as tokens stream in.
                  Click <strong>Stop</strong> (or press <kbd>Ctrl+Z</kbd>) whenever you are finished.
                </p>
              </div>
            </li>

            <li>
              <div className="landing-step-content">
                <h4>Request additional time from your admin</h4>
                <p>
                  When your trial ends, Zozii displays a <strong>"Get More Access"</strong> prompt.
                  Pick your requested duration and click Send. Your admin can approve it instantly via the{' '}
                  <a href="/admin" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                    Admin dashboard
                  </a>.
                </p>
              </div>
            </li>
          </ol>
        </section>
      </div>

      {/* ---------------------------------------------------------------- FAQ */}
      <div className="landing-section-wrap" id="faq">
        <section className="landing-section">
          <div className="landing-section-header">
            <span className="landing-section-label">FAQ</span>
            <h2 className="landing-section-title">Frequently asked questions</h2>
            <p className="landing-section-sub">
              Clear answers regarding privacy, screen protection, audio capture, and account quotas.
            </p>
          </div>

          <div className="landing-faq">
            {[
              {
                tag: '// 01 · ACTIVATION',
                q: 'Do I need to activate anything after registering?',
                a: 'No. Your account is active immediately upon registration. You can start using Zozii right away with the 10-minute free trial with no waiting or approval needed.',
              },
              {
                tag: '// 02 · TRIAL EXTENSIONS',
                q: 'What happens when my free trial runs out?',
                a: 'Zozii shows a simple "Get More Access" dialog where you can request additional hours or days. Your administrator reviews it on the dashboard and grants access with one click.',
              },
              {
                tag: '// 03 · AUDIO PRIVACY',
                q: 'Does the meeting audio feature record or upload conversations?',
                a: 'No. Zozii uses local WASAPI loopback capture on your sound card to understand meeting dialogue. Nothing is stored on remote servers or shared with third parties.',
              },
              {
                tag: '// 04 · LLM PROVIDERS',
                q: 'Which AI providers are supported?',
                a: 'Zozii supports Groq (Whisper + LLaMA-3.3) and Google Gemini (Gemini 1.5 Pro). You can toggle between them or update your API keys anytime in Settings.',
              },
              {
                tag: '// 05 · SCREEN SHARE SAFETY',
                q: 'Can participants see Zozii when I share my screen?',
                a: 'No. Zozii applies Windows DWM_EXCLUDEFROMCAPTURE window protection. It is physically hidden from Teams, Zoom, Google Meet, OBS, and screenshot utilities.',
              },
            ].map((item) => (
              <div className="landing-faq-item" key={item.q}>
                <span className="landing-faq-tag">{item.tag}</span>
                <h4>{item.q}</h4>
                <p>{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ----------------------------------------------------------------- CTA */}
      <div className="landing-cta-wrap">
        <section className="landing-cta">
          <h2>Ready to experience invisible AI co-piloting?</h2>
          <p>
            Download the desktop application, register in seconds, and start getting instant answers in your meetings.
          </p>
          <div className="landing-cta-actions">
            <a
              href={release.download_url}
              download={release.filename}
              className="btn btn-primary btn-lg"
            >
              <Download size={18} style={{ marginRight: '8px' }} />
              <span>Download for Windows (.exe)</span>
            </a>
            <a href="/admin" className="btn btn-ghost btn-lg">
              <ExternalLink size={16} style={{ marginRight: '8px' }} />
              Admin Dashboard
            </a>
          </div>
        </section>
      </div>

      {/* ---------------------------------------------------------------- FOOTER */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <ZoziiLogo size={22} />
            <span className="landing-footer-name">Zozii</span>
            <span className="landing-footer-byline">by Nexus Talent · a Nexus Talent product</span>
          </div>

          <div className="landing-footer-links">
            <a href="#engine">Engine</a>
            <a href="#modalities">Modalities</a>
            <a href="#architecture">Architecture</a>
            <a href="#guide">Quickstart</a>
            <a href="#faq">FAQ</a>
            <a href="/admin">Admin</a>
          </div>

          <p className="landing-footer-copy">© 2026 Nexus Talent. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}