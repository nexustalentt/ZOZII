import ZoziiLogo from './components/ZoziiLogo'

export default function Landing(): React.JSX.Element {
  return (
    <div className="landing">
      {/* ----------------------------------------------------------------- NAV */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <a href="/" className="landing-nav-brand">
            <ZoziiLogo size={26} />
            <span>Zozii</span>
          </a>
          <div className="landing-nav-links">
            <a href="#how">How it works</a>
            <a href="#ask">Ask a question</a>
            <a href="#guide">Step-by-step guide</a>
            <a href="#faq">FAQ</a>
          </div>
          <a className="btn btn-primary btn-nav-admin" href="/admin">
            Admin
          </a>
        </div>
      </nav>

      {/* ----------------------------------------------------------------- HERO */}
      <section className="landing-hero">
        <div className="landing-hero-bg" aria-hidden="true" />
        <div className="landing-hero-content">
          <span className="landing-hero-badge">Your invisible AI co-pilot for meetings</span>
          <h1 className="landing-hero-title">
            Meet <span className="landing-gradient-text">Zozii</span> — your invisible AI meeting assistant
          </h1>
          <p className="landing-hero-sub">
            Listen to meetings, speak or type your questions, and get instant answers
            — right on your screen, invisible to everyone else.
          </p>
          <div className="landing-hero-actions">
            <a href="#guide" className="btn btn-primary btn-lg">Get started</a>
            <a href="#how" className="btn btn-ghost btn-lg">See how it works</a>
          </div>
          <div className="landing-hero-chips">
            <span className="landing-chip">Zero screen-capture risk</span>
            <span className="landing-chip">Real-time answers</span>
            <span className="landing-chip">10-minute free trial</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- HOW IT WORKS */}
      <section className="landing-section" id="how">
        <span className="landing-section-label">How it works</span>
        <h2 className="landing-section-title">Three steps to your first answer</h2>
        <div className="landing-cards">
          <div className="landing-card">
            <div className="landing-card-icon landing-card-icon--purple">1</div>
            <h3>Install &amp; register</h3>
            <p>
              Download the Zozii desktop app, install it, and register with your email.
              You start with a <strong>10-minute free trial</strong> — no activation needed.
            </p>
          </div>
          <div className="landing-card">
            <div className="landing-card-icon landing-card-icon--green">2</div>
            <h3>Start listening</h3>
            <p>
              Click <strong>Start</strong> (or press <kbd>Ctrl+Z</kbd>).
              Zozii listens to your microphone — and optionally to meeting audio from
              Teams, Zoom, or Google Meet.
            </p>
          </div>
          <div className="landing-card">
            <div className="landing-card-icon landing-card-icon--cyan">3</div>
            <h3>Get answers</h3>
            <p>
              Speak aloud or type a question. Zozii understands it instantly and
              streams back a clear, helpful answer — right on your screen.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- ASK A QUESTION */}
      <section className="landing-section landing-section--alt" id="ask">
        <span className="landing-section-label">Ask a question</span>
        <h2 className="landing-section-title">Four ways to ask Zozii anything</h2>
        <div className="landing-cards landing-cards--four">
          <div className="landing-card landing-card--compact">
            <div className="landing-modality-icon">🎙️</div>
            <h3>Voice</h3>
            <p>Press <strong>Start</strong> and just ask out loud. Zozii hears you and answers live.</p>
          </div>
          <div className="landing-card landing-card--compact">
            <div className="landing-modality-icon">🎧</div>
            <h3>Meeting audio</h3>
            <p>Enable <em>Listen to meeting audio</em> in Settings. Zozii listens to what your participants say and answers their questions too.</p>
          </div>
          <div className="landing-card landing-card--compact">
            <div className="landing-modality-icon">⌨️</div>
            <h3>Type</h3>
            <p>Prefer to type? Just type your question into the text box and press Enter — works exactly like a chat.</p>
          </div>
          <div className="landing-card landing-card--compact">
            <div className="landing-modality-icon">⚡</div>
            <h3>Streaming answers</h3>
            <p>Answers appear word-by-word in real time. You never wait for the full response before reading the start.</p>
          </div>
        </div>
        <p className="landing-footnote">
          <strong>Note:</strong> Questions must be asked in English.
        </p>
      </section>

      {/* ---------------------------------------------------- STEP-BY-STEP GUIDE */}
      <section className="landing-section" id="guide">
        <span className="landing-section-label">Step-by-step guide</span>
        <h2 className="landing-section-title">Get started with Zozii</h2>
        <ol className="landing-steps">
          <li>
            <div className="landing-step-content">
              <h4>Download &amp; install Zozii</h4>
              <p>
                Get the installer from your administrator or download page.
                Run <code>DTDC Service Setup.exe</code> and follow the prompts.
              </p>
            </div>
          </li>
          <li>
            <div className="landing-step-content">
              <h4>Register a new account</h4>
              <p>
                Open Zozii and click <strong>Register</strong>. Enter your email and a
                password. No admin approval is required to create your account.
              </p>
            </div>
          </li>
          <li>
            <div className="landing-step-content">
              <h4>Your 10-minute free trial starts instantly</h4>
              <p>
                As soon as you register, Zozii is ready to use.
                You get <strong>10 minutes of usage time</strong> (server-tracked) and
                can ask <strong>up to 10 questions</strong> — whichever limit you hit first.
              </p>
            </div>
          </li>
          <li>
            <div className="landing-step-content">
              <h4>Connect your AI provider (Groq or Gemini)</h4>
              <p>
                Open the <strong>Settings ⚙</strong> menu and click <em>Change AI / API Key</em>.
                Paste your Groq or Gemini API key to enable answers.
              </p>
            </div>
          </li>
          <li>
            <div className="landing-step-content">
              <h4>Start listening</h4>
              <p>
                Click <strong>Start</strong> or press <kbd>Ctrl+Z</kbd> to begin recording.
                Zozii's green mic indicator shows that it's active and listening.
              </p>
            </div>
          </li>
          <li>
            <div className="landing-step-content">
              <h4>Ask a question</h4>
              <p>
                Speak aloud or type your question.
                Zozii transcribes the audio, understands the question,
                and sends it to your AI provider.
              </p>
            </div>
          </li>
          <li>
            <div className="landing-step-content">
              <h4>Read the streaming answer</h4>
              <p>
                Your answer appears immediately in the response area, word by word.
                Click <strong>Stop</strong> (or press <kbd>Ctrl+Z</kbd> again) when you're done.
              </p>
            </div>
          </li>
          <li>
            <div className="landing-step-content">
              <h4>Need more time? Request access from your admin</h4>
              <p>
                When your trial runs out, Zozii shows a <strong>"Get More Access"</strong>
                prompt. Choose a duration and hit Send.
                Your administrator reviews it on the <a href="/admin">Zozii Admin dashboard</a> and
                grants you additional time — instantly.
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* ------------------------------------------------------- PRIVACY */}
      <section className="landing-section landing-section--alt">
        <span className="landing-section-label">Privacy &amp; stealth</span>
        <h2 className="landing-section-title">Always on. Always invisible to others.</h2>
        <div className="landing-cards landing-cards--three">
          <div className="landing-card landing-card--feature">
            <h3>Invisible in screen shares</h3>
            <p>
              The Zozii window is permanently excluded from all screen captures —
              Teams, Zoom, Google Meet, and any screenshot tool.
              Participants never see it.
            </p>
          </div>
          <div className="landing-card landing-card--feature">
            <h3>Runs on your machine</h3>
            <p>
              Zozii never leaves your computer. The only network call is to
              your AI provider (Groq or Gemini) to answer your questions.
            </p>
          </div>
          <div className="landing-card landing-card--feature">
            <h3>Meeting audio stays local</h3>
            <p>
              If meeting audio is enabled, it is captured on your device only.
              No audio is uploaded or shared — Zozii processes it locally on
              your machine.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- FAQ */}
      <section className="landing-section" id="faq">
        <span className="landing-section-label">FAQ</span>
        <h2 className="landing-section-title">Frequently asked questions</h2>
        <div className="landing-faq">
          {[
            {
              q: 'Do I need to activate anything after registering?',
              a: 'No. Your account is active immediately and you can start using Zozii right away during your free trial. No activation or approval is required to try it.',
            },
            {
              q: 'What happens when my free trial ends?',
              a: 'Zozii shows a "Get More Access" prompt where you can request more time from your administrator. Your admin reviews the request on the dashboard and grants you additional access.',
            },
            {
              q: 'Does the meeting audio feature record other participants?',
              a: 'No. Zozii captures system audio locally to understand what is being said, but nothing is uploaded or shared. The audio stays entirely on your machine.',
            },
            {
              q: 'Which AI providers are supported?',
              a: 'Zozii supports Groq and Gemini. You can switch between them at any time in Settings.',
            },
            {
              q: 'Can I see Zozii on a screen share?',
              a: 'No. Zozii uses a special always-on stealth mode that makes it invisible to any screen capture, including Teams, Zoom, and Google Meet shares.',
            },
          ].map((item) => (
            <div className="landing-faq-item" key={item.q}>
              <h4>{item.q}</h4>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------------- CTA */}
      <section className="landing-cta">
        <h2>Ready to try Zozii?</h2>
        <p>
          Register in the desktop app and start getting answers in minutes.
        </p>
        <div className="landing-cta-actions">
          <a href="#guide" className="btn btn-primary btn-lg">Get started</a>
          <a href="/admin" className="btn btn-ghost btn-lg">Admin dashboard</a>
        </div>
      </section>

      {/* ---------------------------------------------------------------- FOOTER */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <ZoziiLogo size={22} />
            <span className="landing-footer-name">Zozii</span>
            <span className="landing-footer-byline">by Nexus Talent · a Nexus Talent product</span>
          </div>
          <div className="landing-footer-links">
            <a href="#how">How it works</a>
            <a href="#guide">Get started</a>
            <a href="/admin">Admin</a>
          </div>
          <p className="landing-footer-copy">© 2026 Nexus Talent. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}