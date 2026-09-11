export interface DisplayInfo {
  width: number
  height: number
  maxWidth: number
  maxHeight: number
  compactHeight: number
  minHeight: number
}

export interface WindowBounds extends DisplayInfo {
  x: number
  y: number
}

export interface GroqAskPayload {
  requestId: number
  question: string
  selectedLabels: string[]
  history: Array<{ question: string; answer: string }>
  codeOnly?: boolean
  fullCode?: boolean
}

export interface GroqChunkEvent {
  requestId: number
  delta: string
}

export interface GroqDoneEvent {
  requestId: number
  full: string
}

export interface GroqErrorEvent {
  requestId: number
  message:
    | 'not-connected'
    | 'auth'
    | 'bad-request'
    | 'model'
    | 'rate-limit'
    | 'server'
    | 'network'
    | 'timeout'
}

export interface GroqConnectResult {
  ok: boolean
  reason?: 'invalid' | 'network' | 'model'
}

export type AiProvider = 'groq' | 'gemini'
export type GeminiAskPayload = GroqAskPayload
export type GeminiChunkEvent = GroqChunkEvent
export type GeminiDoneEvent = GroqDoneEvent
export type GeminiErrorEvent = GroqErrorEvent
export type GeminiConnectResult = GroqConnectResult

export interface SpeechTranscribeResult {
  ok: boolean
  text?: string
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

export interface AuthValidateResult {
  status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'BLOCKED' | 'NOT_FOUND'
  access_expiry_time?: string | null
  access_start_time?: string | null
  user_id?: string | null
  name?: string | null
  plan_type?: string | null
  grant_duration_seconds?: number | null
  used_seconds?: number | null
  remaining_seconds?: number | null
}

export interface AuthRegisterResult {
  ok: boolean
  user_id?: string
  error?: string
}

export interface PlanRequestResult {
  ok: boolean
  note?: string
  error?: string
}

export interface ZoziiBridge {
  minimizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  getVersion: () => Promise<string>
  openExternal: (url: string) => Promise<boolean>
  setAlwaysOnTop: (enabled: boolean) => Promise<boolean>
  getDisplayInfo: () => Promise<DisplayInfo>
  setWindowSize: (width: number | null, height: number | null) => Promise<WindowBounds>

  groqGetStatus: () => Promise<{ connected: boolean }>
  groqConnect: (apiKey: string) => Promise<GroqConnectResult>
  groqDisconnect: () => Promise<{ ok: boolean }>
  groqAsk: (payload: GroqAskPayload) => Promise<void>
  onGroqChunk: (callback: (event: GroqChunkEvent) => void) => () => void
  onGroqDone: (callback: (event: GroqDoneEvent) => void) => () => void
  onGroqError: (callback: (event: GroqErrorEvent) => void) => () => void
  aiGetProvider: () => Promise<{ provider: AiProvider }>
  aiSetProvider: (provider: AiProvider) => Promise<{ ok: boolean; provider?: AiProvider }>
  geminiGetStatus: () => Promise<{ connected: boolean }>
  geminiConnect: (apiKey: string) => Promise<GeminiConnectResult>
  geminiDisconnect: () => Promise<{ ok: boolean }>
  geminiAsk: (payload: GeminiAskPayload) => Promise<void>
  onGeminiChunk: (callback: (event: GeminiChunkEvent) => void) => () => void
  onGeminiDone: (callback: (event: GeminiDoneEvent) => void) => () => void
  onGeminiError: (callback: (event: GeminiErrorEvent) => void) => () => void
  onToggleListening: (callback: () => void) => () => void

  authLogin: (username: string, password: string) => Promise<AuthValidateResult>
  authRevalidate: () => Promise<AuthValidateResult>
  authHasSession: () => Promise<boolean>
  authRegister: (
    username: string,
    password: string,
    name: string,
    email: string,
  ) => Promise<AuthRegisterResult>
  authLogout: () => Promise<void>
  usageStart: () => Promise<AuthValidateResult>
  usageStop: () => Promise<AuthValidateResult>
  usageHeartbeat: () => Promise<AuthValidateResult>
  planRequest: (minutes: number) => Promise<PlanRequestResult>

  transcribeSpeech: (wav: Uint8Array) => Promise<SpeechTranscribeResult>
}

declare global {
  interface Window {
    zozii?: ZoziiBridge
  }
}
