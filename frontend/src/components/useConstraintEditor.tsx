import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { api, type Constraint, type ConstraintType, type Importance } from '../api'
import { useCatalog, useConstraints, type MasterData } from '../data'
import { ConstraintForm, TypePicker } from './constraintEditor'
import { Modal } from './ui'

export type ObjectKind = 'teachers' | 'classes' | 'subjects' | 'rooms'
export type Draft = { id?: number; type: string; importance: Importance; active: boolean; params: Record<string, unknown>; note: string }

/** Bedingung bezieht sich auf dieses Objekt? „all“ = gilt für alle (leere Auswahl). */
export function relation(c: Constraint, t: ConstraintType | undefined, kind: ObjectKind, id: number): 'direct' | 'all' | null {
  if (!t) return null
  for (const p of t.params) {
    if (p.kind === kind) {
      const ids = (c.params[p.name] as number[] | undefined) ?? []
      if (ids.includes(id)) return 'direct'
      if (!ids.length && !p.required) return 'all'
    }
    if (kind === 'subjects' && p.kind === 'subject' && c.params[p.name] === id) return 'direct'
  }
  return null
}

const kindOf = (t: ConstraintType, kind: ObjectKind) =>
  t.params.some((p) => p.kind === kind || (kind === 'subjects' && p.kind === 'subject'))

/** Gemeinsame Logik für Bedingungs-Listen: auswählen, einstellen, speichern, (de)aktivieren, löschen. */
export function useConstraintEditor(md: MasterData) {
  const catalog = useCatalog()
  const list = useConstraints()
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [picking, setPicking] = useState<{ category?: string; preset?: { kind: ObjectKind; id: number } } | null>(null)
  const [preset, setPreset] = useState<{ kind: ObjectKind; id: number } | undefined>()
  const types = useMemo(() => new Map((catalog.data?.types ?? []).map((t) => [t.key, t])), [catalog.data])
  const refresh = () => qc.invalidateQueries({ queryKey: ['constraints'] })

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = { type: d.type, importance: d.importance, active: d.active, params: d.params, note: d.note }
      return d.id ? api.put<Constraint>(`/constraints/${d.id}`, body) : api.post<Constraint>('/constraints', body)
    },
    onSuccess: () => { refresh(); setDraft(null) },
  })
  const toggle = useMutation({
    mutationFn: (c: Constraint) => api.patch<Constraint>(`/constraints/${c.id}/active`, { active: !c.active }),
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: (id: number) => api.del(`/constraints/${id}`), onSuccess: refresh })

  const startNew = (t: ConstraintType) => {
    const params: Record<string, unknown> = {}
    t.params.forEach((p) => {
      let v = p.default
      if (p.kind === 'period') v = Math.min(Number(v ?? 0), Math.max(0, (md.settings?.periods.length ?? 1) - 1))
      if (p.kind === 'subject') v = md.subjects[0]?.id ?? null
      params[p.name] = Array.isArray(v) ? [...v] : v
    })
    if (preset) {
      const target = t.params.find((p) => p.kind === preset.kind) ?? t.params.find((p) => preset.kind === 'subjects' && p.kind === 'subject')
      if (target) params[target.name] = target.kind === 'subject' ? preset.id : [preset.id]
    }
    setPicking(null)
    setDraft({ type: t.key, importance: 'normal', active: true, params, note: '' })
  }

  const modals: ReactNode = (
    <>
      {picking && catalog.data && (
        <TypePicker
          types={picking.preset ? catalog.data.types.filter((t) => kindOf(t, picking.preset!.kind)) : catalog.data.types}
          categories={catalog.data.categories} initial={picking.category ?? ''} onPick={startNew} onClose={() => setPicking(null)} />
      )}
      {draft && types.get(draft.type) && catalog.data && (
        <Modal title={draft.id ? 'Bedingung bearbeiten' : 'Bedingung einstellen'} onClose={() => { setDraft(null); save.reset() }} wide>
          <ConstraintForm type={types.get(draft.type)!} draft={draft} setDraft={setDraft} md={md}
            importanceLabels={catalog.data.importance} error={save.error} pending={save.isPending}
            onBack={draft.id ? undefined : () => { setDraft(null); setPicking({ preset }) }}
            onSubmit={() => save.mutate(draft)} onCancel={() => { setDraft(null); save.reset() }} />
        </Modal>
      )}
    </>
  )

  return {
    catalog, list, types, modals, toggle, remove,
    add: (opts: { category?: string; preset?: { kind: ObjectKind; id: number } } = {}) => { setPreset(opts.preset); setPicking(opts) },
    edit: (c: Constraint) => setDraft({ ...c }),
    copy: (c: Constraint) => setDraft({ ...c, id: undefined, note: c.note ? `${c.note} (Kopie)` : '' }),
  }
}
export type ConstraintEditor = ReturnType<typeof useConstraintEditor>

