/** Kurze, eindeutige ID – nutzt crypto.randomUUID wenn verfügbar. */
export function createId(prefix = 'id'): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined
  if (c && typeof c.randomUUID === 'function') return `${prefix}-${c.randomUUID()}`
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
