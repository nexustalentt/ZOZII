import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// ---- Configuration ----------------------------------------------------
// Single configured Groq connection. Change the model here only.
export const GROQ_MODEL = 'openai/gpt-oss-120b'
const GROQ_API_BASE = 'https://api.groq.com/openai/v1'
const VALIDATE_TIMEOUT_MS = 15000
const CHAT_TIMEOUT_MS = 90000

// ---- Secure API key storage -------------------------------------------
// The key is encrypted with the OS-level safeStorage facility and stored in
// the app's userData directory. It is never exposed to the renderer.
let cachedApiKey: string | null | undefined

function getKeyFilePath(): string {
  return path.join(app.getPath('userData'), 'groq-connection.bin')
}

export function loadStoredKey(): string | null {
  if (cachedApiKey !== undefined) return cachedApiKey
  try {
    const raw = fs.readFileSync(getKeyFilePath())
    if (raw.length === 0) {
      cachedApiKey = null
    } else if (safeStorage.isEncryptionAvailable()) {
      cachedApiKey = safeStorage.decryptString(raw)
    } else {
      // Fallback for platforms without safeStorage (should not happen on Windows).
      cachedApiKey = raw.toString('utf8')
    }
  } catch {
    cachedApiKey = null
  }
  return cachedApiKey
}

function storeKey(key: string): void {
  const payload = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(key)
    : Buffer.from(key, 'utf8')
  fs.writeFileSync(getKeyFilePath(), payload)
  cachedApiKey = key
}

function clearStoredKey(): void {
  try {
    fs.rmSync(getKeyFilePath(), { force: true })
  } catch {
    // Ignore removal errors — the in-memory cache is cleared regardless.
  }
  cachedApiKey = null
}

// ---- Groq API calls ---------------------------------------------------
type GroqFailureKind =
  | 'invalid'
  | 'auth'
  | 'bad-request'
  | 'model'
  | 'rate-limit'
  | 'server'
  | 'network'
  | 'timeout'

class GroqApiError extends Error {
  readonly kind: GroqFailureKind

  constructor(kind: GroqFailureKind, detail?: string) {
    super(detail ?? kind)
    this.kind = kind
  }
}

async function readErrorDetail(res: Response): Promise<string | undefined> {
  try {
    const text = await res.text()
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } }
      return parsed.error?.message
    } catch {
      return text.length > 0 ? text.slice(0, 200) : undefined
    }
  } catch {
    return undefined
  }
}

function mapStatusToKind(status: number): GroqFailureKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 400) return 'bad-request'
  if (status === 404) return 'model'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'server'
  return 'network'
}

async function validateKey(apiKey: string): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'network' }> {
  try {
    const res = await fetch(`${GROQ_API_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS),
    })
    if (res.status === 200) return { ok: true }
    // Never include API-key material in application logs.
    console.log(`Groq validation HTTP status: ${res.status}`)
    const reason: 'invalid' | 'network' =
      res.status === 401 || res.status === 403 ? 'invalid' : 'network'
    return { ok: false, reason }
  } catch (error) {
    console.log(`Groq validation network error: ${error instanceof Error ? error.message : String(error)}`)
    return { ok: false, reason: 'network' }
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AskPayload {
  requestId: number
  question: string
  selectedLabels: string[]
  history: Array<{ question: string; answer: string }>
  codeOnly?: boolean
  fullCode?: boolean
}

function buildSystemPrompt(selectedLabels: string[], codeOnly?: boolean, fullCode?: boolean): string {
  if (codeOnly) {
    const base =
      'You are Zozii, a helpful AI technical interview assistant. Answer the user\'s EXACT question\n' +
      'directly by providing ONLY the specific code logic snippet. Do NOT provide any theory, general\n' +
      'explanations, concepts, background, or pros/cons. Your response should contain ONLY the minimal code/logic\n' +
      'in a fenced code block (e.g. ```java, ```python), with no boilerplate, classes, imports, setup methods, or explanations.\n' +
      'CRITICAL: Return ONLY the exact logic code lines inside the code block. No conversational text before or after the code block.'

    if (selectedLabels.length === 0) {
      return base
    }
    return (
      `${base} The user has selected these domains/technologies as preferred context: ${selectedLabels.join(', ')}.`
    )
  }

  if (fullCode) {
    const base =
      'You are Zozii, a personal AI technical interview copilot. Your goal is to provide complete, runnable\n' +
      'code solutions when the user asks a programming question.\n' +
      '\n' +
      'CODING QUESTIONS (Full Code mode):\n' +
      '- Provide the COMPLETE, fully working code program — including ALL necessary imports, class declarations,\n' +
      '  main methods, boilerplate, variable declarations, and any other setup required to make the code runnable.\n' +
      '- The code must be production-ready and immediately runnable without any modifications.\n' +
      '- Include all error handling, edge cases, and proper structure.\n' +
      '- Use fenced code blocks with the correct language tag (e.g. ```java, ```python, ```cpp).\n' +
      '- Do NOT write any conversational summary, introductions, explanations, or prose outside the code block.\n' +
      '- For theory/conceptual questions (non-coding), respond in exactly one or two sentences with no lists, headings, or details. Sound natural, conversational, spontaneous, and explain the concept in your own words using a natural Indian English interview candidate style (comfortable mix of professional and native phrasing, avoiding textbook jargon).\n' +
      '\n' +
      'RELEVANCE:\n' +
      '- Be extremely direct. Return only the final response. No conversational filler, intro, or outro.'

    if (selectedLabels.length === 0) {
      return (
        `${base} The user is in General mode: answer any question using your broad knowledge. ` +
        'Never refuse a general technology question.'
      )
    }
    return (
      `${base} The user has selected these domains/technologies as preferred context: ${selectedLabels.join(', ')}. ` +
      'These are preferences, NOT restrictions: always prioritize correctness. When relevant, prefer examples ' +
      "from the selected technologies; otherwise answer normally."
    )
  }

  const base =
    'You are Zozii, a personal AI technical interview copilot. Your goal is to provide answers in an\n' +
    'extremely concise, natural, spoken interview format. The user must be able to say your response directly\n' +
    'to an interviewer in under 10-15 seconds.\n' +
    '\n' +
    'THEORY/CONCEPTUAL QUESTIONS:\n' +
    '- For every conceptual or theoretical question, your response MUST be strictly one to two sentences long (maximum 45 words).\n' +
    '- Sound natural, conversational, spontaneous, and explain the concept in your own words using a natural Indian English interview candidate style.\n' +
    '- Phrasing should feel human and use a comfortable mix of professional and spontaneous language (a subtle native Indian English touch, not overly polished or read from a textbook).\n' +
    '- Deliver a direct, simple, and clear explanation that is very easy to say out loud.\n' +
    '- Absolutely DO NOT write bullet points, lists, headings, introductions, extra code blocks, or extra examples.\n' +
    '- Example: if asked about Black-box vs White-box testing, respond exactly with:\n' +
    '  "Black‑box testing checks what the system does without looking at its internals, while white‑box testing checks how the system does it by examining the code itself."\n' +
    '\n' +
    'CODING QUESTIONS:\n' +
    '- For all code requests, your response must contain ONLY the specific lines of logic or code snippet that implement the requested feature.\n' +
    '- DO NOT write any boilerplate setup, import statements, class declarations, main methods, variable declarations, or driver instantiations.\n' +
    '- Provide ONLY the minimal, exact code snippet inside a fenced code block.\n' +
    '- Do NOT write any conversational summary, introductions, explanations, or prose outside the code block.\n' +
    '- Example: if asked for implicit wait in Java Selenium, return exactly:\n' +
    '  ```java\n' +
    '  driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(10));\n' +
    '  ```\n' +
    '\n' +
    'RELEVANCE:\n' +
    '- Be extremely direct. Return only the final response. No conversational filler, intro, or outro.'

  if (selectedLabels.length === 0) {
    return (
      `${base} The user is in General mode: answer any question using your broad knowledge. ` +
      'Never refuse a general technology question.'
    )
  }
  return (
    `${base} The user has selected these domains/technologies as preferred context: ${selectedLabels.join(', ')}. ` +
    'These are preferences, NOT restrictions: always prioritize correctness. When relevant, prefer examples ' +
    "from the selected technologies; otherwise answer normally."
  )
}

export function buildMessages(payload: AskPayload): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: buildSystemPrompt(payload.selectedLabels, payload.codeOnly, payload.fullCode) }]
  for (const turn of payload.history) {
    messages.push({ role: 'user', content: turn.question })
    messages.push({ role: 'assistant', content: turn.answer })
  }
  const userContent = payload.codeOnly
    ? `${payload.question}\n\n(CRITICAL: Return ONLY the exact code logic lines inside a single fenced code block. Do NOT write any boilerplate, wrapper classes, imports, setup methods, explanation, or prose. Return the core logic code lines and absolutely nothing else.)`
    : payload.fullCode
      ? `${payload.question}\n\n(CRITICAL: Provide the COMPLETE, fully working code program — including ALL imports, class declarations, main methods, boilerplate, and setup required to make the code runnable. The code must be immediately runnable without any modifications. Use fenced code blocks with the correct language tag. For non-coding theory questions, respond in exactly one or two sentences.)`
      : `${payload.question}\n\n(CRITICAL: For code requests, return ONLY the core logic lines inside a fenced code block, with no boilerplate, wrappers, or explanations. For theory questions, explain in exactly one or two sentences with no lists, headings, or details.)`
  messages.push({ role: 'user', content: userContent })
  return messages
}

// Pending chat requests so Disconnect can abort an in-flight stream.
const activeRequests = new Map<number, AbortController>()
const abortedByDisconnect = new Set<number>()

function makeChatSignal(): { signal: AbortSignal; controller: AbortController; cleanup: () => void } {
  const controller = new AbortController()
  const timeout = AbortSignal.timeout(CHAT_TIMEOUT_MS)
  const combined = AbortSignal.any([controller.signal, timeout])
  const onTimeoutAbort = (): void => controller.abort()
  timeout.addEventListener('abort', onTimeoutAbort, { once: true })
  const cleanup = (): void => {
    timeout.removeEventListener('abort', onTimeoutAbort)
  }
  return { signal: combined, controller, cleanup }
}

async function streamChat(
  apiKey: string,
  requestId: number,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
): Promise<string> {
  const { signal, controller, cleanup } = makeChatSignal()
  activeRequests.set(requestId, controller)

  let res: Response
  try {
    res = await fetch(`${GROQ_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        stream: true,
        temperature: 0.3,
        max_tokens: 2048,
      }),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') throw new GroqApiError('timeout')
    throw new GroqApiError('network', error instanceof Error ? error.message : String(error))
  }

  if (!res.ok || !res.body) {
    const detail = await readErrorDetail(res)
    console.log(`Groq HTTP status: ${res.status}${detail ? ` — ${detail}` : ''}`)
    throw new GroqApiError(mapStatusToKind(res.status), detail)
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  type Reader = { done: boolean; value?: Uint8Array }
  const reader = res.body.getReader()
  try {
    for (;;) {
      const chunk = (await reader.read()) as Reader
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        newlineIndex = buffer.indexOf('\n')

        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>
          }
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            full += delta
            onDelta(delta)
          }
        } catch {
          // Ignore malformed keep-alive fragments.
        }
      }
    }
  } finally {
    cleanup()
    activeRequests.delete(requestId)
  }

  return full
}

// ---- IPC ---------------------------------------------------------------
type GetWindow = () => BrowserWindow | null

function send(window: BrowserWindow | null, channel: string, payload: unknown): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload)
  }
}

export function registerGroqIpc(getWindow: GetWindow): void {
  ipcMain.handle('zozii:groq-get-status', () => ({ connected: loadStoredKey() !== null }))

  ipcMain.handle('zozii:groq-connect', async (_event, apiKey: unknown) => {
    if (typeof apiKey !== 'string' || apiKey.trim().length < 10) {
      return { ok: false, reason: 'invalid' as const }
    }
    const trimmed = apiKey.trim()
    const result = await validateKey(trimmed)
    if (result.ok) storeKey(trimmed)
    return result
  })

  ipcMain.handle('zozii:groq-disconnect', () => {
    clearStoredKey()
    for (const [requestId, controller] of activeRequests) {
      abortedByDisconnect.add(requestId)
      controller.abort()
      send(getWindow(), 'zozii:groq-error', { requestId, message: 'not-connected' })
    }
    activeRequests.clear()
    return { ok: true }
  })

  ipcMain.handle('zozii:groq-ask', async (_event, payload: AskPayload) => {
    const apiKey = loadStoredKey()
    if (!apiKey) {
      send(getWindow(), 'zozii:groq-error', { requestId: payload.requestId, message: 'not-connected' })
      return
    }

    try {
      const full = await streamChat(apiKey, payload.requestId, buildMessages(payload), (delta) => {
        send(getWindow(), 'zozii:groq-chunk', { requestId: payload.requestId, delta })
      })
      send(getWindow(), 'zozii:groq-done', { requestId: payload.requestId, full })
    } catch (error) {
      if (abortedByDisconnect.delete(payload.requestId)) {
        // Aborted by Disconnect — the UI was already notified.
        return
      }
      const kind =
        error instanceof GroqApiError
          ? error.kind
          : error instanceof Error && error.name === 'TimeoutError'
            ? 'timeout'
            : 'network'
      if (error instanceof GroqApiError) {
        console.log(`Groq chat failed (${kind}): ${error.message}`)
      }
      send(getWindow(), 'zozii:groq-error', { requestId: payload.requestId, message: kind })
    }
  })
}
