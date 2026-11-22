import { DAY_SHORT, type ConstraintType, type Slot } from './api'
import type { MasterData } from './data'
import { formatSlots } from './format'

/** Kurzbeschreibung der eingestellten Werte, z. B. „Höchstens 6 · Lehrkräfte: alle“. */
export function describe(type: ConstraintType | undefined, params: Record<string, unknown>, md: MasterData): string {
  if (!type) return ''
  const periodLabel = (i: number) => md.settings?.periods[i]?.label || `${i + 1}.`
  return type.params.map((p) => {
    const v = params[p.name]
    const ids = (v as number[] | undefined) ?? []
    switch (p.kind) {
      case 'int': return `${p.label} ${v}`
      case 'period': return `${p.label} ${periodLabel(Number(v))}`
      case 'bool': return v ? p.label : ''
      case 'days': return `${p.label}: ${ids.map((d) => DAY_SHORT[d]).join(', ')}`
      case 'slots': return `${p.label}: ${formatSlots(v as Slot[]) || '–'}`
      case 'subject': return `${p.label}: ${md.subjectById.get(Number(v))?.short ?? '?'}`
      case 'teachers': return `${p.label}: ${ids.length ? ids.map((i) => md.teacherById.get(i)?.short ?? '?').join(', ') : 'alle'}`
      case 'classes': return `${p.label}: ${ids.length ? ids.map((i) => md.classById.get(i)?.name ?? '?').join(', ') : 'alle'}`
      case 'subjects': return `${p.label}: ${ids.length ? ids.map((i) => md.subjectById.get(i)?.short ?? '?').join(', ') : 'alle'}`
      case 'rooms': return `${p.label}: ${ids.length ? ids.map((i) => md.roomById.get(i)?.short ?? '?').join(', ') : 'alle'}`
    }
    return ''
  }).filter(Boolean).join(' · ')
}

