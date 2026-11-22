import { useState } from 'react'
import { DAY_SHORT, type Constraint, type ConstraintParam, type ConstraintType, type Importance, type Slot } from '../api'
import { describe } from '../constraintText'
import type { MasterData } from '../data'
import { relation, useConstraintEditor, type ConstraintEditor, type Draft, type ObjectKind } from './useConstraintEditor'
import { ErrorBox, Field, Modal, MultiSelect, SlotPicker } from './ui'

const IMPORTANCE_ORDER: Importance[] = ['off', 'low', 'normal', 'high', 'must']
const IMPORTANCE_HINT: Record<Importance, string> = {
  off: 'Wird bei der Berechnung nicht beachtet.',
  low: 'Wunsch mit geringem Gewicht.',
  normal: 'Wunsch mit normalem Gewicht.',
  high: 'Wichtiger Wunsch: wird nur verletzt, wenn es nicht anders geht.',
  must: 'Feste Regel: Der Plan muss sie einhalten (außer beim Rechnen mit „Bedingungen lockern“).',
}

/** Eine Zeile der Bedingungsliste. */
export function ConstraintRow({ c, ed, md, scopeNote }: { c: Constraint; ed: ConstraintEditor; md: MasterData; scopeNote?: string }) {
  const t = ed.types.get(c.type)
  return (
    <div className={c.active && c.importance !== 'off' ? 'constraint' : 'constraint inactive'}>
      <label className="switch" title={c.active ? 'Aktiv – klicken zum Deaktivieren' : 'Inaktiv – klicken zum Aktivieren'}>
        <input type="checkbox" checked={c.active} onChange={() => ed.toggle.mutate(c)} aria-label={`${t?.title} aktiv`} />
        <span />
      </label>
      <div className="constraint-body" onDoubleClick={() => ed.edit(c)}>
        <div className="constraint-title">
          <span className="cat">{t?.category}</span>
          <strong>{t?.title ?? c.type}</strong>
          <span className={`imp ${c.importance}`}>{ed.catalog.data?.importance[c.importance]}</span>
          {scopeNote && <span className="badge">{scopeNote}</span>}
        </div>
        <div className="muted small">{describe(t, c.params, md)}</div>
        {c.note && <div className="small note">{c.note}</div>}
      </div>
      <div className="row-actions">
        <button type="button" onClick={() => ed.edit(c)}>Bearbeiten</button>
        <button type="button" onClick={() => ed.copy(c)}>Kopieren</button>
        <button type="button" className="danger" onClick={() => confirm('Diese Bedingung löschen?') && ed.remove.mutate(c.id)}>Löschen</button>
      </div>
    </div>
  )
}

/** Reiter „Bedingungen“ im Dialog einer Lehrkraft/Klasse/Fach/Raum. */
export function ObjectConstraints({ kind, id, name, md }: { kind: ObjectKind; id: number; name: string; md: MasterData }) {
  const ed = useConstraintEditor(md)
  const rows = (ed.list.data ?? [])
    .map((c) => ({ c, rel: relation(c, ed.types.get(c.type), kind, id) }))
    .filter((x) => x.rel)
  const direct = rows.filter((x) => x.rel === 'direct')
  const all = rows.filter((x) => x.rel === 'all')
  return (
    <div className="form">
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <p className="muted small" style={{ margin: 0 }}>Bedingungen, die für {name} gelten.</p>
        <button type="button" className="primary" onClick={() => ed.add({ preset: { kind, id } })}>+ Bedingung für {name}</button>
      </div>
      <ErrorBox error={ed.list.error ?? ed.toggle.error ?? ed.remove.error} />
      <div className="constraint-list">
        {direct.map(({ c }) => <ConstraintRow key={c.id} c={c} ed={ed} md={md} />)}
        {direct.length === 0 && <p className="muted small">Noch keine eigene Bedingung.</p>}
      </div>
      {all.length > 0 && (
        <>
          <h4 className="sub-head">Gelten für alle</h4>
          <div className="constraint-list">
            {all.map(({ c }) => <ConstraintRow key={c.id} c={c} ed={ed} md={md} scopeNote="alle" />)}
          </div>
        </>
      )}
      {ed.modals}
    </div>
  )
}

export function TypePicker({ types, categories, initial, onPick, onClose }: {
  types: ConstraintType[]; categories: string[]; initial: string; onPick: (t: ConstraintType) => void; onClose: () => void
}) {
  const [cat, setCat] = useState(initial || categories[0])
  const [q, setQ] = useState('')
  const shown = types.filter((t) => (q ? `${t.title} ${t.description}`.toLowerCase().includes(q.toLowerCase()) : t.category === cat))
  return (
    <Modal title="Bedingung auswählen" onClose={onClose} wide>
      <input type="search" placeholder="Bedingung suchen, z. B. „Hohlstunden“ …" value={q} onChange={(e) => setQ(e.target.value)} autoFocus style={{ width: '100%', marginBottom: 12 }} />
      <div className="picker">
        {!q && (
          <nav className="picker-cats" aria-label="Kategorien">
            {categories.map((c) => (
              <button key={c} className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>
                {c} <span className="count">{types.filter((t) => t.category === c).length}</span>
              </button>
            ))}
          </nav>
        )}
        <div className="picker-types">
          {shown.map((t) => (
            <button key={t.key} className="picker-type" onClick={() => onPick(t)}>
              <strong>{t.title}</strong>
              {q && <span className="cat">{t.category}</span>}
              <span className="muted small">{t.description}</span>
            </button>
          ))}
          {shown.length === 0 && <p className="muted">Keine passende Bedingung gefunden.</p>}
        </div>
      </div>
    </Modal>
  )
}

export function ConstraintForm({ type, draft, setDraft, md, importanceLabels, error, pending, onBack, onSubmit, onCancel }: {
  type: ConstraintType; draft: Draft; setDraft: (d: Draft) => void; md: MasterData; importanceLabels: Record<Importance, string>
  error: unknown; pending: boolean; onBack?: () => void; onSubmit: () => void; onCancel: () => void
}) {
  const setParam = (name: string, v: unknown) => setDraft({ ...draft, params: { ...draft.params, [name]: v } })
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
      <div className="type-head">
        <span className="cat">{type.category}</span>
        <h3>{type.title}</h3>
        <p className="muted small">{type.description}</p>
      </div>
      {type.params.map((p) => <ParamField key={p.name} param={p} value={draft.params[p.name]} onChange={(v) => setParam(p.name, v)} md={md} />)}
      <Field label="Wichtigkeit" hint={IMPORTANCE_HINT[draft.importance]}>
        <div className="segmented importance" role="radiogroup">
          {IMPORTANCE_ORDER.map((imp) => (
            <button type="button" key={imp} role="radio" aria-checked={draft.importance === imp}
              className={draft.importance === imp ? `on ${imp}` : ''} onClick={() => setDraft({ ...draft, importance: imp })}>
              {importanceLabels[imp]}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid-2">
        <Field label="Notiz"><input value={draft.note} maxLength={200} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="z. B. Grund für die Bedingung" /></Field>
        <label className="check" style={{ alignSelf: 'end', marginBottom: 8 }}>
          <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Aktiv
        </label>
      </div>
      <ErrorBox error={error} />
      <div className="form-actions">
        {onBack && <button type="button" onClick={onBack} style={{ marginRight: 'auto' }}>← Andere Bedingung</button>}
        <button type="button" onClick={onCancel}>Abbrechen</button>
        <button className="primary" type="submit" disabled={pending}>Speichern</button>
      </div>
    </form>
  )
}

function ParamField({ param: p, value, onChange, md }: { param: ConstraintParam; value: unknown; onChange: (v: unknown) => void; md: MasterData }) {
  const days = md.settings?.days ?? 5
  const periods = md.settings?.periods ?? []
  const ids = (value as number[] | undefined) ?? []
  const hint = p.hint || (p.required && ['teachers', 'classes', 'subjects', 'rooms'].includes(p.kind) ? 'Mindestens ein Eintrag' : '')
  switch (p.kind) {
    case 'int':
      return (
        <Field label={p.label} hint={p.min != null && p.max != null ? `${p.min} bis ${p.max}` : undefined}>
          <input type="number" value={Number(value ?? 0)} min={p.min ?? undefined} max={p.max ?? undefined}
            onChange={(e) => onChange(Number(e.target.value))} style={{ maxWidth: 140 }} />
        </Field>
      )
    case 'period':
      return (
        <Field label={p.label}>
          <select value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} style={{ maxWidth: 220 }}>
            {periods.map((per, i) => <option key={per.id} value={i}>{per.label || `${i + 1}.`}{per.start ? ` (${per.start}–${per.end})` : ''}</option>)}
          </select>
        </Field>
      )
    case 'bool':
      return <label className="check"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> {p.label}</label>
    case 'days':
      return (
        <Field label={p.label}>
          <MultiSelect items={Array.from({ length: days }, (_, d) => ({ id: d }))} value={ids} onChange={onChange} label={(x) => DAY_SHORT[x.id]} />
        </Field>
      )
    case 'slots':
      return (
        <Field label={p.label} hint="Rot = markiert. Klick auf Tag oder Stunde markiert die ganze Spalte/Zeile.">
          <SlotPicker days={days} periods={periods.length} value={(value as Slot[]) ?? []} onChange={onChange} />
        </Field>
      )
    case 'subject':
      return (
        <Field label={p.label}>
          <select value={Number(value ?? '')} onChange={(e) => onChange(Number(e.target.value))} style={{ maxWidth: 320 }}>
            {md.subjects.map((s) => <option key={s.id} value={s.id}>{s.short}{s.name ? ` – ${s.name}` : ''}</option>)}
          </select>
        </Field>
      )
    case 'teachers':
      return <Field label={p.label} hint={hint}><MultiSelect items={md.teachers} value={ids} onChange={onChange} label={(t) => t.short} /></Field>
    case 'classes':
      return <Field label={p.label} hint={hint}><MultiSelect items={md.classes} value={ids} onChange={onChange} label={(c) => c.name} /></Field>
    case 'subjects':
      return <Field label={p.label} hint={hint}><MultiSelect items={md.subjects} value={ids} onChange={onChange} label={(s) => s.short} /></Field>
    case 'rooms':
      return <Field label={p.label} hint={hint}><MultiSelect items={md.rooms} value={ids} onChange={onChange} label={(r) => r.short} /></Field>
  }
}
