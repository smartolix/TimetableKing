import type { Lesson, LessonPart, SchoolClass } from './api'
import type { MasterData } from './data'

/** Gruppe mit Klasse und Teilung, zum Nachschlagen per Gruppen-ID. */
export interface GroupInfo { id: number; name: string; division: string; classId: number; className: string }

export function groupIndex(classes: SchoolClass[]): Map<number, GroupInfo> {
  const out = new Map<number, GroupInfo>()
  for (const c of classes) for (const d of c.divisions) for (const g of d.groups) {
    if (g.id != null) out.set(g.id, { id: g.id, name: g.name, division: d.name, classId: c.id, className: c.name })
  }
  return out
}

/** Kleinste Schülergruppen („Atome“) je Klasse, wie im Backend: Kombination aller Teilungen. */
export function classAtoms(c: SchoolClass): string[] {
  let combos: number[][] = [[]]
  for (const d of c.divisions) {
    const ids = d.groups.map((g) => g.id).filter((x): x is number => x != null)
    if (!ids.length) continue
    combos = combos.flatMap((combo) => ids.map((g) => [...combo, g]))
  }
  return combos.slice(0, 64).map((combo) => `${c.id}:${combo.join('.')}`)
}

/** Atome, die eine Zeile belegt. */
export function partAtoms(part: LessonPart, md: MasterData, groups: Map<number, GroupInfo>): string[] {
  const out = new Set<string>()
  for (const cid of part.class_ids) {
    const c = md.classById.get(cid)
    if (c) classAtoms(c).forEach((a) => out.add(a))
  }
  for (const gid of part.group_ids) {
    const g = groups.get(gid)
    const c = g && md.classById.get(g.classId)
    if (!c) continue
    classAtoms(c).filter((a) => a.split(':')[1].split('.').includes(String(gid))).forEach((a) => out.add(a))
  }
  return [...out]
}

/** Alle Klassen einer Zeile (ganz oder über Gruppen). */
export function partClassIds(part: LessonPart, groups: Map<number, GroupInfo>): number[] {
  const ids = new Set(part.class_ids)
  part.group_ids.forEach((g) => { const gi = groups.get(g); if (gi) ids.add(gi.classId) })
  return [...ids]
}

export function lessonClassIds(l: Lesson, groups: Map<number, GroupInfo>): number[] {
  return [...new Set(l.parts.flatMap((p) => partClassIds(p, groups)))]
}

export function lessonTeacherIds(l: Lesson): number[] {
  return [...new Set(l.parts.flatMap((p) => p.teacher_ids))]
}

/** „1a, 1b:RK“ */
export function audienceText(part: LessonPart, md: MasterData, groups: Map<number, GroupInfo>): string {
  return [
    ...part.class_ids.map((c) => md.classById.get(c)?.name ?? '?'),
    ...part.group_ids.map((g) => { const gi = groups.get(g); return gi ? `${gi.className} ${gi.name}` : '?' }),
  ].join(', ')
}
