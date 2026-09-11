import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export interface DisplayInfo {
  width: number
  height: number
  maxWidth: number
  maxHeight: number
  compactHeight: number
  minHeight: number
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

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const bridge = {
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('zozii:minimize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('zozii:close'),
  getVersion: (): Promise<string> => ipcRenderer.invoke('zozii:get-version'),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('zozii:open-external', url),
  setAlwaysOnTop: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('zozii:set-on-top', enabled),
  getDisplayInfo: (): Promise<DisplayInfo> => ipcRenderer.invoke('zozii:get-display-info'),
  setWindowSize: (
    width: number | null,
    height: number | null,
  ): Promise<DisplayInfo & { x: number; y: number }> =>
    ipcRenderer.invoke('zozii:set-window-size', width, height),

  groqGetStatus: (): Promise<{ connected: boolean }> =>
    ipcRenderer.invoke('zozii:groq-get-status'),
  groqConnect: (apiKey: string): Promise<GroqConnectResult> =>
    ipcRenderer.invoke('zozii:groq-connect', apiKey),
  groqDisconnect: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('zozii:groq-disconnect'),
  groqAsk: (payload: GroqAskPayload): Promise<void> => ipcRenderer.invoke('zozii:groq-ask', payload),
  onGroqChunk: (callback: (event: GroqChunkEvent) => void): (() => void) =>
    subscribe<GroqChunkEvent>('zozii:groq-chunk', callback),
  onGroqDone: (callback: (event: GroqDoneEvent) => void): (() => void) =>
    subscribe<GroqDoneEvent>('zozii:groq-done', callback),
  onGroqError: (callback: (event: GroqErrorEvent) => void): (() => void) =>
    subscribe<GroqErrorEvent>('zozii:groq-error', callback),
  aiGetProvider: (): Promise<{ provider: AiProvider }> => ipcRenderer.invoke('zozii:ai-get-provider'),
  aiSetProvider: (provider: AiProvider): Promise<{ ok: boolean; provider?: AiProvider }> =>
    ipcRenderer.invoke('zozii:ai-set-provider', provider),
  geminiGetStatus: (): Promise<{ connected: boolean }> => ipcRenderer.invoke('zozii:gemini-get-status'),
  geminiConnect: (apiKey: string): Promise<GeminiConnectResult> => ipcRenderer.invoke('zozii:gemini-connect', apiKey),
  geminiDisconnect: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('zozii:gemini-disconnect'),
  geminiAsk: (payload: GeminiAskPayload): Promise<void> => ipcRenderer.invoke('zozii:gemini-ask', payload),
  onGeminiChunk: (callback: (event: GeminiChunkEvent) => void): (() => void) =>
    subscribe<GeminiChunkEvent>('zozii:gemini-chunk', callback),
  onGeminiDone: (callback: (event: GeminiDoneEvent) => void): (() => void) =>
    subscribe<GeminiDoneEvent>('zozii:gemini-done', callback),
  onGeminiError: (callback: (event: GeminiErrorEvent) => void): (() => void) =>
    subscribe<GeminiErrorEvent>('zozii:gemini-error', callback),
  onToggleListening: (callback: () => void): (() => void) =>
    subscribe<void>('zozii:toggle-listening', callback),

  authLogin: (username: string, password: string): Promise<AuthValidateResult> =>
    ipcRenderer.invoke('zozii:auth-login', username, password),
  authRevalidate: (): Promise<AuthValidateResult> => ipcRenderer.invoke('zozii:auth-revalidate'),
  authHasSession: (): Promise<boolean> => ipcRenderer.invoke('zozii:auth-has-session'),
  authRegister: (
    username: string,
    password: string,
    name: string,
    email: string,
  ): Promise<AuthRegisterResult> =>
    ipcRenderer.invoke('zozii:auth-register', username, password, name, email),
  authLogout: (): Promise<void> => ipcRenderer.invoke('zozii:auth-logout'),
  usageStart: (): Promise<AuthValidateResult> => ipcRenderer.invoke('zozii:usage-start'),
  usageStop: (): Promise<AuthValidateResult> => ipcRenderer.invoke('zozii:usage-stop'),
  usageHeartbeat: (): Promise<AuthValidateResult> => ipcRenderer.invoke('zozii:usage-heartbeat'),
  planRequest: (minutes: number): Promise<PlanRequestResult> =>
    ipcRenderer.invoke('zozii:plan-request', minutes),

  transcribeSpeech: (wav: Uint8Array): Promise<SpeechTranscribeResult> =>
    ipcRenderer.invoke('zozii:speech-transcribe', wav),
}

export type ZoziiBridge = typeof bridge

contextBridge.exposeInMainWorld('zozii', bridge)
