export const TRANSPARENCY_KEY = 'hireme:transparency'
export const GLASS_ALPHA_MIN = 0.12
export const TRANSPARENCY_DEFAULT = 0.15

export function alphaForTransparency(transparency: number): number {
  return 1 - transparency * (1 - GLASS_ALPHA_MIN)
}

export function scrimForAlpha(alpha: number): number {
  return Math.min(0.5, Math.max(0, (1 - alpha) * 0.55))
}

export function applyWindowTransparency(transparency: number): void {
  const alpha = alphaForTransparency(transparency)
  document.documentElement.style.setProperty('--glass-alpha', String(alpha))
  document.documentElement.style.setProperty('--content-scrim', String(scrimForAlpha(alpha)))
}

export function loadTransparency(): number {
  const stored = Number(localStorage.getItem(TRANSPARENCY_KEY))
  if (Number.isFinite(stored) && stored >= 0 && stored <= 1) {
    return stored
  }
  return TRANSPARENCY_DEFAULT
}
