import type { BrowserWindow } from 'electron'

/**
 * Always-on "screen-share stealth" for the HireMe assistant window.
 *
 * Applies Electron's setContentProtection(true), which maps to the native
 * OS exclude-from-capture mechanism:
 *   - Windows: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) — the window
 *     is omitted from any screen capture (Teams/Zoom/Meet shares, OBS,
 *     screenshots) while remaining fully visible and interactive locally.
 *   - macOS:   NSWindowSharingType = none (excluded from ScreenCaptureKit /
 *     CGWindowList captures, and flagged by browsers as non-shareable).
 *
 * The protection is idempotent: calling apply() repeatedly is safe, so the
 * manager can simply re-apply it whenever a window is created or recreated.
 */
export class ScreenStealthManager {
  private readonly getWindow: () => BrowserWindow | null
  private appliedWindowIds = new Set<number>()

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow
  }

  /** Enable capture exclusion on the current main window. Safe to call often. */
  apply(): void {
    const win = this.getWindow()
    if (!win || win.isDestroyed()) return
    if (this.appliedWindowIds.has(win.id)) return

    try {
      win.setContentProtection(true)
      this.appliedWindowIds.add(win.id)
      if (!process.env.NODE_ENV?.includes('test')) {
        console.log(`[stealth] content protection enabled (window ${win.id})`)
      }
    } catch (err) {
      // Older Electron builds or exotic platforms may reject the call.
      console.warn('[stealth] could not enable content protection:', err)
    }
  }

  /** Forget tracked windows (e.g. after app shutdown). */
  reset(): void {
    this.appliedWindowIds.clear()
  }
}

let manager: ScreenStealthManager | null = null

/** Lazily created singleton bound to the main-window getter. */
export function getScreenStealthManager(
  getWindow: () => BrowserWindow | null,
): ScreenStealthManager {
  manager ??= new ScreenStealthManager(getWindow)
  return manager
}
