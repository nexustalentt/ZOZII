import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { buildMessages, type AskPayload, type ChatMessage } from './groq'

// This is the preferred model, not an assumption that every API project has
// access to it. The provider resolves an available generateContent model from
// the project's own models.list response before making a request.
export const GEMINI_MODEL = 'gemini-2.5-flash'
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const VALIDATE_TIMEOUT_MS = 15000
const CHAT_TIMEOUT_MS = 90000

let cachedApiKey: string | null | undefined
let cachedResolvedModel: string | null | undefined
let cachedAvailableModels: string[] | undefined

function getKeyFilePath(): string {
  return path.join(app.getPath('userData'), 'gemini-connection.bin')
}

export function loadStoredGeminiKey(): string | null {
  if (cachedApiKey !== undefined) return cachedApiKey
  try {
    const raw = fs.readFileSync(getKeyFilePath())
    cachedApiKey = raw.length === 0 ? null : safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8')
  } catch {
    cachedApiKey = null
  }
  return cachedApiKey
}

function storeKey(key: string): void {
  fs.writeFileSync(getKeyFilePath(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : Buffer.from(key, 'utf8'))
  cachedApiKey = key
  cachedResolvedModel = undefined
  cachedAvailableModels = undefined
}

function clearStoredKey(): void {
  try { fs.rmSync(getKeyFilePath(), { force: true }) } catch { /* cache is still cleared */ }
  cachedApiKey = null
  cachedResolvedModel = undefined
  cachedAvailableModels = undefined
}

export type GeminiFailureKind = 'invalid' | 'auth' | 'bad-request' | 'model' | 'rate-limit' | 'server' | 'network' | 'timeout'

class GeminiApiError extends Error {
  constructor(readonly kind: GeminiFailureKind, detail?: string) { super(detail ?? kind) }
}

async function errorDetail(res: Response): Promise<string | undefined> {
  try {
    const parsed = (await res.json()) as { error?: { message?: string } }
    return parsed.error?.message
  } catch { return undefined }
}

function errorKind(status: number, detail?: string): GeminiFailureKind {
  // Gemini can return an invalid API key as either 400/API_KEY_INVALID or 401.
  if (status === 401 || status === 403 || /api key.*(invalid|not valid)/i.test(detail ?? '')) return 'auth'
  if (status === 400) return 'bad-request'
  if (status === 404) return 'model'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'server'
  return 'network'
}

async function validateKey(apiKey: string): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'network' | 'model' }> {
  try {
    const model = await resolveGeminiModel(apiKey)
    if (model) return { ok: true }
    const res = await fetch(`${GEMINI_API_BASE}/models`, {
      headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS),
    })
    if (res.ok) return { ok: false, reason: 'model' }
    const detail = await errorDetail(res)
    console.log(`Gemini validation HTTP status: ${res.status}`)
    return { ok: false, reason: errorKind(res.status, detail) === 'auth' ? 'invalid' : 'network' }
  } catch (error) {
    console.log(`Gemini validation network error: ${error instanceof Error ? error.message : String(error)}`)
    return { ok: false, reason: 'network' }
  }
}

interface GeminiModelInfo {
  name?: string
  supportedGenerationMethods?: string[]
}

// Projects can have different model availability (region, billing tier, or
// rollout). Pick from models.list instead of treating one hard-coded name as
// universally available. The candidate order keeps the original 2.5 Flash
// choice whenever it is supported.
async function resolveGeminiModels(apiKey: string): Promise<string[]> {
  if (cachedAvailableModels !== undefined) return cachedAvailableModels
  try {
    const res = await fetch(`${GEMINI_API_BASE}/models`, {
      headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS),
    })
    if (!res.ok) return []
    const parsed = (await res.json()) as { models?: GeminiModelInfo[] }
    const available = (parsed.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => model.name?.replace(/^models\//, ''))
      .filter((name): name is string => Boolean(name))
    const preferred = [GEMINI_MODEL, 'gemini-2.5-flash-lite', 'gemini-flash-latest']
    const ordered = [
      ...preferred.filter((name) => available.includes(name)),
      ...available.filter((name) => !preferred.includes(name) && /^gemini-.*flash/i.test(name)),
      ...available.filter((name) => !preferred.includes(name) && !/^gemini-.*flash/i.test(name)),
    ]
    cachedAvailableModels = [...new Set(ordered)]
    return cachedAvailableModels
  } catch {
    return []
  }
}

export async function resolveGeminiModel(apiKey: string): Promise<string | null> {
  if (cachedResolvedModel !== undefined) return cachedResolvedModel
  cachedResolvedModel = (await resolveGeminiModels(apiKey))[0] ?? null
  return cachedResolvedModel
}

function toGeminiPayload(messages: ChatMessage[]): object {
  const system = messages.find((message) => message.role === 'system')
  return {
    ...(system ? { systemInstruction: { parts: [{ text: system.content }] } } : {}),
    contents: messages.filter((message) => message.role !== 'system').map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }],
    })),
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  }
}

const activeRequests = new Map<number, AbortController>()
const abortedByDisconnect = new Set<number>()
type GetWindow = () => BrowserWindow | null

function send(window: BrowserWindow | null, channel: string, payload: unknown): void {
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
}

async function streamChat(apiKey: string, requestId: number, payload: AskPayload, onDelta: (text: string) => void): Promise<string> {
  const controller = new AbortController()
  const timeout = AbortSignal.timeout(CHAT_TIMEOUT_MS)
  const signal = AbortSignal.any([controller.signal, timeout])
  activeRequests.set(requestId, controller)
  const models = await resolveGeminiModels(apiKey)
  if (models.length === 0) throw new GeminiApiError('model')
  let res: Response | null = null
  for (let index = 0; index < models.length; index += 1) {
    try {
      res = await fetch(`${GEMINI_API_BASE}/models/${models[index]}:streamGenerateContent?alt=sse`, {
        method: 'POST', headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(toGeminiPayload(buildMessages(payload))), signal,
      })
    } catch (error) {
      throw new GeminiApiError(error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network')
    }
    if (res.status !== 404 || index === models.length - 1) break
    // A model can disappear between models.list and generation. Try the next
    // compatible project model before surfacing an error to the user.
    console.log(`Gemini model unavailable; trying another compatible model.`)
  }
  if (!res || !res.ok || !res.body) {
    if (!res) throw new GeminiApiError('network')
    const detail = await errorDetail(res)
    console.log(`Gemini chat HTTP status: ${res.status}`)
    throw new GeminiApiError(errorKind(res.status, detail), detail)
  }
  const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let full = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const event = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); boundary = buffer.indexOf('\n\n')
        const data = event.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim()
        if (!data) continue
        try {
          const parsed = JSON.parse(data) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
          const text = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
          if (text) { full += text; onDelta(text) }
        } catch { /* ignore malformed SSE keep-alives */ }
      }
    }
  } finally { activeRequests.delete(requestId) }
  return full
}

export function registerGeminiIpc(getWindow: GetWindow): void {
  ipcMain.handle('zozii:gemini-get-status', () => ({ connected: loadStoredGeminiKey() !== null }))
  ipcMain.handle('zozii:gemini-connect', async (_event, apiKey: unknown) => {
    if (typeof apiKey !== 'string' || apiKey.trim().length < 10) return { ok: false, reason: 'invalid' as const }
    const result = await validateKey(apiKey.trim()); if (result.ok) storeKey(apiKey.trim()); return result
  })
  ipcMain.handle('zozii:gemini-disconnect', () => {
    clearStoredKey()
    for (const [requestId, controller] of activeRequests) { abortedByDisconnect.add(requestId); controller.abort(); send(getWindow(), 'zozii:gemini-error', { requestId, message: 'not-connected' }) }
    activeRequests.clear(); return { ok: true }
  })
  ipcMain.handle('zozii:gemini-ask', async (_event, payload: AskPayload) => {
    const apiKey = loadStoredGeminiKey()
    if (!apiKey) { send(getWindow(), 'zozii:gemini-error', { requestId: payload.requestId, message: 'not-connected' }); return }
    try {
      const full = await streamChat(apiKey, payload.requestId, payload, (delta) => send(getWindow(), 'zozii:gemini-chunk', { requestId: payload.requestId, delta }))
      send(getWindow(), 'zozii:gemini-done', { requestId: payload.requestId, full })
    } catch (error) {
      if (abortedByDisconnect.delete(payload.requestId)) return
      const kind = error instanceof GeminiApiError ? error.kind : 'network'
      if (error instanceof GeminiApiError) console.log(`Gemini chat failed (${kind}): ${error.message}`)
      send(getWindow(), 'zozii:gemini-error', { requestId: payload.requestId, message: kind })
    }
  })
}
