import { useState, type ReactNode } from 'react'
import type { Room, SchoolClass, Slot, Subject, Teacher } from '../api'
import { ErrorBox, Field, Modal, SlotPicker } from '../components/ui'
import { formatSlots, withoutId } from '../format'
import { useMasterData, useSave, type MasterData } from '../data'

interface Column<T> { label: string; render: (item: T, md: MasterData) => ReactNode; className?: string }

interface EntityConfig<T extends { id: number }, In> {
  title: string
  singular: string
  path: string
  intro: string
  items: (md: MasterData) => T[]
  empty: () => In
  toInput: (item: T) => In
  columns: Column<T>[]
  form: (value: In, set: (patch: Partial<In>) => void, md: MasterData) => ReactNode
  search: (item: T) => string
}

function EntityPage<T extends { id: number }, In>({ cfg }: { cfg: EntityConfig<T, In> }) {
  const md = useMasterData()
  const { save, remove } = useSave<T, In>(cfg.path, [cfg.path, 'lessons'])
  const [editing, setEditing] = useState<{ id?: number; value: In } | null>(null)
  const [filter, setFilter] = useState('')
  const items = cfg.items(md).filter((it) => cfg.search(it).toLowerCase().includes(filter.toLowerCase()))

  const close = () => { setEditing(null); save.reset() }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    save.mutate({ id: editing.id, data: editing.value }, { onSuccess: close })
  }
  const del = (item: T) => {
    if (confirm(`${cfg.singular} „${cfg.search(item)}“ wirklich löschen? Zugehöriger Unterricht wird angepasst.`)) remove.mutate(item.id)
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{cfg.title}</h1>
          <p className="muted">{cfg.intro}</p>
        </div>
        <div className="actions">
          <input type="search" placeholder="Suchen …" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="primary" onClick={() => setEditing({ value: cfg.empty() })}>+ {cfg.singular}</button>
        </div>
      </div>
      <ErrorBox error={md.error ?? remove.error} />
      {md.loading ? <p className="muted">Lade …</p> : (
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>{cfg.columns.map((c) => <th key={c.label} className={c.className}>{c.label}</th>)}<th /></tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} onDoubleClick={() => setEditing({ id: it.id, value: cfg.toInput(it) })}>
                  {cfg.columns.map((c) => <td key={c.label} className={c.className}>{c.render(it, md)}</td>)}
                  <td className="row-actions">
                    <button onClick={() => setEditing({ id: it.id, value: cfg.toInput(it) })}>Bearbeiten</button>
                    <button className="danger" onClick={() => del(it)}>Löschen</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={cfg.columns.length + 1} className="empty">Keine Einträge. Lege einen an oder lade unter „Import/Export“ die Beispielschule.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal title={editing.id ? `${cfg.singular} bearbeiten` : `${cfg.singular} anlegen`} onClose={close} wide>
          <form onSubmit={submit} className="form">
            {cfg.form(editing.value, (patch) => setEditing({ ...editing, value: { ...editing.value, ...patch } }), md)}
            <ErrorBox error={save.error} />
            <div className="form-actions">
              <button type="button" onClick={close}>Abbrechen</button>
              <button className="primary" type="submit" disabled={save.isPending}>Speichern</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

function Unavailable({ value, onChange, md }: { value: Slot[]; onChange: (v: Slot[]) => void; md: MasterData }) {
  const periods = md.settings?.periods.length ?? 0
  if (!periods) return <p className="muted">Lege zuerst unter „Zeitraster“ die Unterrichtsstunden an.</p>
  return (
    <Field label="Gesperrte Zeiten" hint="Rot = gesperrt. Klick auf Tag oder Stunde schaltet die ganze Spalte/Zeile.">
      <SlotPicker days={md.settings?.days ?? 5} periods={periods} value={value} onChange={onChange} />
    </Field>
  )
}

const nullableInt = (v: string) => (v.trim() === '' ? null : Math.max(1, parseInt(v, 10) || 1))

type SubjectIn = Omit<Subject, 'id'>
type TeacherIn = Omit<Teacher, 'id'>
type RoomIn = Omit<Room, 'id'>
type ClassIn = Omit<SchoolClass, 'id'>

function hoursFor(md: MasterData, match: (l: MasterData['lessons'][number]) => boolean) {
  return md.lessons.filter(match).reduce((s, l) => s + l.periods_per_week, 0)
}

export function SubjectsPage() {
  return (
    <EntityPage<Subject, SubjectIn>
      cfg={{
        title: 'Fächer', singular: 'Fach', path: 'subjects',
        intro: 'Kürzel und Farbe erscheinen im Stundenplan.',
        items: (md) => md.subjects,
        empty: () => ({ short: '', name: '', color: '#4f7cff' }),
        toInput: withoutId,
        search: (s) => `${s.short} ${s.name}`,
        columns: [
          { label: 'Kürzel', render: (s) => <span className="subject-tag" style={{ background: s.color }}>{s.short}</span> },
          { label: 'Name', render: (s) => s.name },
          { label: 'Wochenstunden', className: 'num', render: (s, md) => hoursFor(md, (l) => l.subject_id === s.id) },
        ],
        form: (v, set) => (
          <div className="grid-2">
            <Field label="Kürzel"><input required value={v.short} onChange={(e) => set({ short: e.target.value })} autoFocus /></Field>
            <Field label="Name"><input value={v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Farbe"><input type="color" value={v.color} onChange={(e) => set({ color: e.target.value })} /></Field>
          </div>
        ),
      }}
    />
  )
}

export function TeachersPage() {
  return (
    <EntityPage<Teacher, TeacherIn>
      cfg={{
        title: 'Lehrkräfte', singular: 'Lehrkraft', path: 'teachers',
        intro: 'Sperrzeiten und Höchststunden pro Tag sind feste Regeln für die Planberechnung.',
        items: (md) => md.teachers,
        empty: () => ({ short: '', name: '', max_per_day: null, unavailable: [] }),
        toInput: withoutId,
        search: (t) => `${t.short} ${t.name}`,
        columns: [
          { label: 'Kürzel', render: (t) => <strong>{t.short}</strong> },
          { label: 'Name', render: (t) => t.name },
          { label: 'Stunden/Woche', className: 'num', render: (t, md) => hoursFor(md, (l) => l.teacher_ids.includes(t.id)) },
          { label: 'Max./Tag', className: 'num', render: (t) => t.max_per_day ?? '–' },
          { label: 'Gesperrt', render: (t) => <span className="muted small">{formatSlots(t.unavailable)}</span> },
        ],
        form: (v, set, md) => (
          <>
            <div className="grid-3">
              <Field label="Kürzel"><input required value={v.short} onChange={(e) => set({ short: e.target.value })} autoFocus /></Field>
              <Field label="Name"><input value={v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Höchststunden pro Tag">
                <input type="number" min={1} max={16} value={v.max_per_day ?? ''} onChange={(e) => set({ max_per_day: nullableInt(e.target.value) })} />
              </Field>
            </div>
            <Unavailable value={v.unavailable} onChange={(unavailable) => set({ unavailable })} md={md} />
          </>
        ),
      }}
    />
  )
}

export function RoomsPage() {
  return (
    <EntityPage<Room, RoomIn>
      cfg={{
        title: 'Räume', singular: 'Raum', path: 'rooms',
        intro: 'Klassenzimmer (als Stammraum einer Klasse) und Fachräume wie Turnsaal oder EDV-Raum.',
        items: (md) => md.rooms,
        empty: () => ({ short: '', name: '', capacity: null, unavailable: [] }),
        toInput: withoutId,
        search: (r) => `${r.short} ${r.name}`,
        columns: [
          { label: 'Kürzel', render: (r) => <strong>{r.short}</strong> },
          { label: 'Name', render: (r) => r.name },
          { label: 'Plätze', className: 'num', render: (r) => r.capacity ?? '–' },
          { label: 'Stammraum von', render: (r, md) => md.classes.filter((c) => c.home_room_id === r.id).map((c) => c.name).join(', ') },
          { label: 'Gesperrt', render: (r) => <span className="muted small">{formatSlots(r.unavailable)}</span> },
        ],
        form: (v, set, md) => (
          <>
            <div className="grid-3">
              <Field label="Kürzel"><input required value={v.short} onChange={(e) => set({ short: e.target.value })} autoFocus /></Field>
              <Field label="Name"><input value={v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Plätze"><input type="number" min={1} value={v.capacity ?? ''} onChange={(e) => set({ capacity: nullableInt(e.target.value) })} /></Field>
            </div>
            <Unavailable value={v.unavailable} onChange={(unavailable) => set({ unavailable })} md={md} />
          </>
        ),
      }}
    />
  )
}

export function ClassesPage() {
  return (
    <EntityPage<SchoolClass, ClassIn>
      cfg={{
        title: 'Klassen', singular: 'Klasse', path: 'classes',
        intro: 'Unterricht ohne eigenen Raum findet im Stammraum der Klasse statt.',
        items: (md) => md.classes,
        empty: () => ({ name: '', home_room_id: null, unavailable: [] }),
        toInput: withoutId,
        search: (c) => c.name,
        columns: [
          { label: 'Klasse', render: (c) => <strong>{c.name}</strong> },
          { label: 'Stammraum', render: (c, md) => (c.home_room_id ? md.roomById.get(c.home_room_id)?.short : '–') },
          { label: 'Stunden/Woche', className: 'num', render: (c, md) => hoursFor(md, (l) => l.class_ids.includes(c.id)) },
          { label: 'Gesperrt', render: (c) => <span className="muted small">{formatSlots(c.unavailable)}</span> },
        ],
        form: (v, set, md) => (
          <>
            <div className="grid-2">
              <Field label="Name"><input required value={v.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
              <Field label="Stammraum">
                <select value={v.home_room_id ?? ''} onChange={(e) => set({ home_room_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">– keiner –</option>
                  {md.rooms.map((r) => <option key={r.id} value={r.id}>{r.short}{r.name ? ` – ${r.name}` : ''}</option>)}
                </select>
              </Field>
            </div>
            <Unavailable value={v.unavailable} onChange={(unavailable) => set({ unavailable })} md={md} />
          </>
        ),
      }}
    />
  )
}
