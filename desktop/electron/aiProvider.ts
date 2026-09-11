import { app, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export type AiProvider = 'groq' | 'gemini'

const PROVIDER_FILE = 'ai-provider.json'

function providerFilePath(): string {
  return path.join(app.getPath('userData'), PROVIDER_FILE)
}

// Missing or malformed settings deliberately fall back to Groq. This preserves
// existing installations which only have groq-connection.bin.
export function loadSelectedProvider(): AiProvider {
  try {
    const parsed = JSON.parse(fs.readFileSync(providerFilePath(), 'utf8')) as { provider?: unknown }
    return parsed.provider === 'gemini' ? 'gemini' : 'groq'
  } catch {
    return 'groq'
  }
}

export function saveSelectedProvider(provider: AiProvider): void {
  fs.writeFileSync(providerFilePath(), JSON.stringify({ provider }), { encoding: 'utf8', mode: 0o600 })
}

export function registerAiProviderIpc(): void {
  ipcMain.handle('zozii:ai-get-provider', () => ({ provider: loadSelectedProvider() }))
  ipcMain.handle('zozii:ai-set-provider', (_event, provider: unknown) => {
    if (provider !== 'groq' && provider !== 'gemini') return { ok: false }
    saveSelectedProvider(provider)
    return { ok: true, provider }
  })
}
