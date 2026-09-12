import { ipcMain } from 'electron'
import { loadStoredKey } from './groq'
import { loadSelectedProvider } from './aiProvider'
import { GEMINI_API_BASE, loadStoredGeminiKey, resolveGeminiModel } from './gemini'

// Speech-to-text via the Groq Whisper endpoint, reusing the already verified
// Groq connection. No additional provider or API key is involved. Audio is
// held in memory for the duration of a single request and never persisted.
const GROQ_API_BASE = 'https://api.groq.com/openai/v1'
const WHISPER_MODEL = 'whisper-large-v3'
const TRANSCRIBE_TIMEOUT_MS = 30000

// Broad technical interview prompt providing natural vocabulary context across software engineering.
const TRANSCRIBE_PROMPT =
  'Professional technical interview questions, answers, coding discussions, software development, architecture, algorithms, and system concepts.'

export interface SpeechTranscribeResult {
  ok: boolean
  text?: string
  // Overall reliability of the transcription (0..1). Undefined when the
  // provider does not return confidence data — the caller then treats the
  // text as usable if it is non-empty.
  confidence?: number
  reason?:
    | 'not-connected'
    | 'empty'
    | 'unreliable'
    | 'auth'
    | 'rate-limit'
    | 'server'
    | 'network'
    | 'timeout'
}

interface VerboseSegment {
  avg_logprob?: number
  no_speech_prob?: number
}

// Combines per-segment Whisper signals into one 0..1 reliability score:
// - no_speech_prob close to 1 means the model heard no actual speech there;
// - avg_logprob close to 0 means confident token predictions, very negative
//   values mean the model was guessing.
function computeConfidence(segments: VerboseSegment[] | undefined): number | undefined {
  if (!segments || segments.length === 0) return undefined
  let totalWeight = 0
  let weighted = 0
  for (const segment of segments) {
    const noSpeech = typeof segment.no_speech_prob === 'number' ? segment.no_speech_prob : 0
    const logProb = typeof segment.avg_logprob === 'number' ? segment.avg_logprob : -0.5
    const logConfidence = Math.max(0, Math.min(1, 1 + logProb / 1.5))
    const score = Math.min(logConfidence, 1 - noSpeech)
    weighted += score
    totalWeight += 1
  }
  return totalWeight > 0 ? weighted / totalWeight : undefined
}

export function registerSpeechIpc(): void {
  ipcMain.handle('zozii:speech-transcribe', async (_event, wav: unknown): Promise<SpeechTranscribeResult> => {
    const provider = loadSelectedProvider()
    if (provider === 'gemini') return transcribeWithGemini(wav)
    const apiKey = loadStoredKey()
    if (!apiKey) return { ok: false, reason: 'not-connected' }

    if (!(wav instanceof Uint8Array) || wav.byteLength < 1000) {
      return { ok: false, reason: 'empty' }
    }

    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'question.wav')
    form.append('model', WHISPER_MODEL)
    // Pin decoding to English so meeting/mic audio never transcribes into
    // another language regardless of background noise or accent.
    form.append('language', 'en')
    form.append('response_format', 'verbose_json')
    form.append('temperature', '0')
    form.append('prompt', TRANSCRIBE_PROMPT)

    try {
      const res = await fetch(`${GROQ_API_BASE}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
      })

      if (res.status === 200) {
        const parsed = (await res.json()) as {
          text?: string
          segments?: VerboseSegment[]
        }
        let text = (parsed.text ?? '').trim()
        // Strip common Whisper bracket hallucinations
        text = text.replace(/\[(?:music|applause|laughter|silence|blank_audio|cheering|snort|cough|throat-clearing)\]/gi, '').trim()
        text = text.replace(/^\((?:music|applause|laughter|silence|blank_audio|cheering)\)$/gi, '').trim()
        if (text.length === 0) {
          return { ok: false, reason: 'empty' }
        }
        const confidence = computeConfidence(parsed.segments)
        return { ok: true, text, confidence }
      }
      console.log(`Groq transcription HTTP status: ${res.status}`)
      if (res.status === 401 || res.status === 403) return { ok: false, reason: 'auth' }
      if (res.status === 429) return { ok: false, reason: 'rate-limit' }
      if (res.status >= 500) return { ok: false, reason: 'server' }
      return { ok: false, reason: 'network' }
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        return { ok: false, reason: 'timeout' }
      }
      console.log(`Groq transcription error: ${error instanceof Error ? error.message : String(error)}`)
      return { ok: false, reason: 'network' }
    }
  })
}

// Gemini accepts WAV audio inline. Its answer is normalized to the exact same
// speech result shape as Groq Whisper, so the renderer's voice workflow stays
// provider-neutral. Gemini does not provide Whisper-style segment confidence.
async function transcribeWithGemini(wav: unknown): Promise<SpeechTranscribeResult> {
  const apiKey = loadStoredGeminiKey()
  if (!apiKey) return { ok: false, reason: 'not-connected' }
  if (!(wav instanceof Uint8Array) || wav.byteLength < 1000) return { ok: false, reason: 'empty' }
  try {
    const model = await resolveGeminiModel(apiKey)
    if (!model) return { ok: false, reason: 'network' }
    const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: 'Transcribe this English technical-interview audio exactly. Return only the spoken words, with no labels, commentary, or markdown.' },
          { inlineData: { mimeType: 'audio/wav', data: Buffer.from(wav).toString('base64') } },
        ] }],
        generationConfig: { temperature: 0, maxOutputTokens: 512 },
      }),
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
    })
    if (res.ok) {
      const parsed = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      const text = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
      return text.trim().length > 0 ? { ok: true, text } : { ok: false, reason: 'empty' }
    }
    console.log(`Gemini transcription HTTP status: ${res.status}`)
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'auth' }
    if (res.status === 429) return { ok: false, reason: 'rate-limit' }
    if (res.status >= 500) return { ok: false, reason: 'server' }
    return { ok: false, reason: 'network' }
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') return { ok: false, reason: 'timeout' }
    console.log(`Gemini transcription error: ${error instanceof Error ? error.message : String(error)}`)
    return { ok: false, reason: 'network' }
  }
}
