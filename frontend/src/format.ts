import { DAY_SHORT, type Slot } from './api'

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf', queued: 'Wartet', running: 'Wird berechnet …', done: 'Fertig', failed: 'Fehlgeschlagen',
}

/** Entfernt die id eines Eintrags (für Formulare). */
export function withoutId<T extends { id: number }>(item: T): Omit<T, 'id'> {
  const copy: Partial<T> = { ...item }
  delete copy.id
  return copy as Omit<T, 'id'>
}

export function formatSlots(slots: Slot[]): string {
  if (!slots.length) return ''
  const byDay = new Map<number, number[]>()
  slots.forEach(([d, p]) => byDay.set(d, [...(byDay.get(d) ?? []), p]))
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([d, ps]) => {
    ps.sort((a, b) => a - b)
    const runs: string[] = []
    let start = ps[0], prev = ps[0]
    for (const p of [...ps.slice(1), -1]) {
      if (p === prev + 1) { prev = p; continue }
      runs.push(start === prev ? `${start + 1}` : `${start + 1}–${prev + 1}`)
      start = prev = p
    }
    return `${DAY_SHORT[d]} ${runs.join(', ')}`
  }).join(' · ')
}
