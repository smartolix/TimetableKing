import { useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, useParams } from 'react-router-dom'
import type { Division, Lesson, Room, SchoolClass, Slot, Subject, Teacher } from '../api'
import { TimePrefs } from '../components/TimePrefs'
import { ObjectConstraints } from '../components/constraintEditor'
import type { ObjectKind } from '../components/useConstraintEditor'
import { ErrorBox, Field, Modal } from '../components/ui'
import { useMasterData, useSave, type MasterData } from '../data'
import { formatSlots, withoutId } from '../format'
import { audienceText, groupIndex, lessonClassIds, lessonTeacherIds } from '../lessons'
import SettingsPage from './Settings'

const TABS = [
  { key: 'klassen', label: 'Klassen' },
  { key: 'lehrkraefte', label: 'Lehrkräfte' },
  { key: 'faecher', label: 'Fächer' },
  { key: 'raeume', label: 'Räume' },
  { key: 'zeitraster', label: 'Zeitraster' },
]

/** Stammdaten mit Reitern (wie die Stammdaten-Fenster in Untis). */
export default function MasterDataPage() {
  const { tab = 'klassen' } = useParams()
  if (!TABS.some((t) => t.key === tab)) return <Navigate to="/stammdaten/klassen" replace />
  return (
    <section>
      <nav className="subnav" aria-label="Stammdaten">
        {TABS.map((t) => <NavLink key={t.key} to={`/stammdaten/${t.key}`} className={({ isActive }) => (isActive ? 'active' : '')}>{t.label}</NavLink>)}
      </nav>
      {tab === 'klassen' && <ClassesPage />}
      {tab === 'lehrkraefte' && <TeachersPage />}
      {tab === 'faecher' && <SubjectsPage />}
      {tab === 'raeume' && <RoomsPage />}
      {tab === 'zeitraster' && <SettingsPage />}
    </section>
  )
}

// ---- Generische Tabelle mit Dialog und Reitern ----

interface Column<T> { label: string; render: (item: T, md: MasterData) => ReactNode; className?: string }
interface DialogTab<In> {
  key: string
  label: string
  needsId?: boolean
  render: (value: In, set: (patch: Partial<In>) => void, md: MasterData, id: number | undefined) => ReactNode
}

interface EntityConfig<T extends { id: number }, In> {
  title: string
  singular: string
  path: string
  intro: string
  items: (md: MasterData) => T[]
  empty: () => In
  toInput: (item: T) => In
  columns: Column<T>[]
  tabs: DialogTab<In>[]
  search: (item: T) => string
}

function EntityPage<T extends { id: number }, In>({ cfg }: { cfg: EntityConfig<T, In> }) {
  const md = useMasterData()
  const { save, remove } = useSave<T, In>(cfg.path, [cfg.path, 'lessons'])
  const [editing, setEditing] = useState<{ id?: number; value: In; tab: string } | null>(null)
  const [filter, setFilter] = useState('')
  const items = cfg.items(md).filter((it) => cfg.search(it).toLowerCase().includes(filter.toLowerCase()))

  const open = (item?: T, tab = cfg.tabs[0].key) =>
    setEditing(item ? { id: item.id, value: cfg.toInput(item), tab } : { value: cfg.empty(), tab })
  const close = () => { setEditing(null); save.reset() }
  const submit = (e: React.FormEvent, keepOpen = false) => {
    e.preventDefault()
    if (!editing) return
    save.mutate({ id: editing.id, data: editing.value }, {
      onSuccess: (saved) => (keepOpen ? setEditing({ ...editing, id: saved.id, value: cfg.toInput(saved) }) : close()),
    })
  }
  const del = (item: T) => {
    if (confirm(`${cfg.singular} „${cfg.search(item)}“ wirklich löschen? Zugehöriger Unterricht wird angepasst.`)) remove.mutate(item.id)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{cfg.title}</h1>
          <p className="muted">{cfg.intro}</p>
        </div>
        <div className="actions">
          <input type="search" placeholder="Suchen …" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="primary" onClick={() => open()}>+ {cfg.singular}</button>
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
                <tr key={it.id} onDoubleClick={() => open(it)}>
                  {cfg.columns.map((c) => <td key={c.label} className={c.className}>{c.render(it, md)}</td>)}
                  <td className="row-actions">
                    <button onClick={() => open(it)}>Bearbeiten</button>
                    {cfg.tabs.some((t) => t.key === 'bedingungen') && <button onClick={() => open(it, 'bedingungen')}>Bedingungen</button>}
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
          <div className="dialog-tabs" role="tablist">
            {cfg.tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={editing.tab === t.key}
                className={editing.tab === t.key ? 'on' : ''} disabled={t.needsId && !editing.id}
                title={t.needsId && !editing.id ? 'Erst speichern' : undefined}
                onClick={() => setEditing({ ...editing, tab: t.key })}>
                {t.label}
              </button>
            ))}
          </div>
          {(() => {
            const tab = cfg.tabs.find((t) => t.key === editing.tab) ?? cfg.tabs[0]
            const content = tab.render(editing.value, (patch) => setEditing({ ...editing, value: { ...editing.value, ...patch } }), md, editing.id)
            if (tab.needsId) return <div className="dialog-body">{content}</div>
            return (
              <form onSubmit={(e) => submit(e)} className="form dialog-body">
                {content}
                <ErrorBox error={save.error} />
                <div className="form-actions">
                  <button type="button" onClick={close}>Abbrechen</button>
                  {!editing.id && cfg.tabs.some((t) => t.needsId) && (
                    <button type="button" onClick={(e) => submit(e, true)} disabled={save.isPending}>Speichern und weiter</button>
                  )}
                  <button className="primary" type="submit" disabled={save.isPending}>Speichern</button>
                </div>
              </form>
            )
          })()}
        </Modal>
      )}
    </>
  )
}

// ---- Gemeinsame Reiter ----

function prefsTab<In extends { unavailable: Slot[]; undesired?: Slot[] }>(allowUndesired: boolean, hint: string): DialogTab<In> {
  return {
    key: 'zeiten', label: 'Zeitwünsche',
    render: (v, set, md) => {
      const periods = md.settings?.periods ?? []
      if (!periods.length) return <p className="muted">Lege zuerst unter „Zeitraster“ die Unterrichtsstunden an.</p>
      return (
        <>
          <p className="muted small" style={{ margin: 0 }}>{hint}</p>
          <TimePrefs days={md.settings?.days ?? 5} periods={periods.length} periodLabels={periods.map((p) => p.label)}
            unavailable={v.unavailable} undesired={v.undesired} allowUndesired={allowUndesired}
            onChange={(x) => set((allowUndesired ? x : { unavailable: x.unavailable }) as Partial<In>)} />
        </>
      )
    },
  }
}

function constraintsTab<In>(kind: ObjectKind, name: (v: In) => string): DialogTab<In> {
  return {
    key: 'bedingungen', label: 'Bedingungen', needsId: true,
    render: (v, _set, md, id) => (id ? <ObjectConstraints kind={kind} id={id} name={name(v)} md={md} /> : null),
  }
}

function lessonsTab<In>(match: (l: Lesson, id: number, md: MasterData) => boolean, link: (id: number) => string): DialogTab<In> {
  return {
    key: 'unterricht', label: 'Unterricht', needsId: true,
    render: (_v, _set, md, id) => (id ? <ObjectLessons md={md} lessons={md.lessons.filter((l) => match(l, id, md))} link={link(id)} /> : null),
  }
}

function ObjectLessons({ md, lessons, link }: { md: MasterData; lessons: Lesson[]; link: string }) {
  const groups = groupIndex(md.classes)
  const total = lessons.reduce((s, l) => s + l.periods_per_week, 0)
  return (
    <div className="form">
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <p className="muted small" style={{ margin: 0 }}>{lessons.length} Unterrichte, {total} Wochenstunden</p>
        <Link className="button" to={link}>Im Unterricht bearbeiten →</Link>
      </div>
      <div className="table-wrap">
        <table className="list compact">
          <thead><tr><th>Fach</th><th>Schüler</th><th>Lehrkräfte</th><th className="num">Std.</th></tr></thead>
          <tbody>
            {lessons.map((l) => l.parts.map((p, i) => (
              <tr key={`${l.id}-${i}`} className={i > 0 ? 'coupled' : ''}>
                <td><SubjectTag md={md} id={p.subject_id} /></td>
                <td>{audienceText(p, md, groups)}</td>
                <td>{p.teacher_ids.map((t) => md.teacherById.get(t)?.short).join(', ')}</td>
                <td className="num">{i === 0 ? l.periods_per_week : ''}</td>
              </tr>
            )))}
            {lessons.length === 0 && <tr><td colSpan={4} className="empty">Kein Unterricht.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function SubjectTag({ md, id }: { md: MasterData; id: number }) {
  const s = md.subjectById.get(id)
  return s ? <span className="subject-tag" style={{ background: s.color }} title={s.name}>{s.short}</span> : <span>?</span>
}

const nullableInt = (v: string) => (v.trim() === '' ? null : Math.max(1, parseInt(v, 10) || 1))
const nullableFloat = (v: string) => (v.trim() === '' ? null : Math.max(0, parseFloat(v.replace(',', '.')) || 0))

type SubjectIn = Omit<Subject, 'id'>
type TeacherIn = Omit<Teacher, 'id'>
type RoomIn = Omit<Room, 'id'>
type ClassIn = Omit<SchoolClass, 'id'>

const lessonHours = (ls: Lesson[]) => ls.reduce((s, l) => s + l.periods_per_week, 0)

// ---- Fächer ----

function SubjectsPage() {
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
          { label: 'Wochenstunden', className: 'num', render: (s, md) => lessonHours(md.lessons.filter((l) => l.parts.some((p) => p.subject_id === s.id))) },
        ],
        tabs: [
          {
            key: 'allgemein', label: 'Allgemein',
            render: (v, set) => (
              <div className="grid-3">
                <Field label="Kürzel"><input required value={v.short} onChange={(e) => set({ short: e.target.value })} autoFocus /></Field>
                <Field label="Name"><input value={v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field label="Farbe"><input type="color" value={v.color} onChange={(e) => set({ color: e.target.value })} /></Field>
              </div>
            ),
          },
          constraintsTab<SubjectIn>('subjects', (v) => v.short),
          lessonsTab<SubjectIn>((l, id) => l.parts.some((p) => p.subject_id === id), () => '/unterricht'),
        ],
      }}
    />
  )
}

// ---- Lehrkräfte ----

function TeachersPage() {
  return (
    <EntityPage<Teacher, TeacherIn>
      cfg={{
        title: 'Lehrkräfte', singular: 'Lehrkraft', path: 'teachers',
        intro: 'Soll-Stunden, Zeitwünsche und Bedingungen je Lehrkraft. Gesperrte Zeiten und Höchststunden sind feste Regeln.',
        items: (md) => md.teachers,
        empty: () => ({ short: '', name: '', target_hours: null, max_per_day: null, unavailable: [], undesired: [] }),
        toInput: withoutId,
        search: (t) => `${t.short} ${t.name}`,
        columns: [
          { label: 'Kürzel', render: (t) => <strong>{t.short}</strong> },
          { label: 'Name', render: (t) => t.name },
          {
            label: 'Ist / Soll', className: 'num',
            render: (t, md) => <HoursBadge ist={lessonHours(md.lessons.filter((l) => lessonTeacherIds(l).includes(t.id)))} soll={t.target_hours} />,
          },
          { label: 'Max./Tag', className: 'num', render: (t) => t.max_per_day ?? '–' },
          {
            label: 'Zeitwünsche',
            render: (t) => (
              <span className="muted small">
                {t.unavailable.length > 0 && <>gesperrt: {formatSlots(t.unavailable)}</>}
                {t.unavailable.length > 0 && t.undesired.length > 0 && <br />}
                {t.undesired.length > 0 && <>unerwünscht: {formatSlots(t.undesired)}</>}
              </span>
            ),
          },
        ],
        tabs: [
          {
            key: 'allgemein', label: 'Allgemein',
            render: (v, set) => (
              <div className="grid-2">
                <Field label="Kürzel"><input required value={v.short} onChange={(e) => set({ short: e.target.value })} autoFocus /></Field>
                <Field label="Name"><input value={v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field label="Soll-Stunden pro Woche" hint="Lehrverpflichtung, nur zur Anzeige Ist/Soll">
                  <input type="number" min={0} max={60} step={0.5} value={v.target_hours ?? ''} onChange={(e) => set({ target_hours: nullableFloat(e.target.value) })} />
                </Field>
                <Field label="Höchststunden pro Tag" hint="Feste Regel">
                  <input type="number" min={1} max={16} value={v.max_per_day ?? ''} onChange={(e) => set({ max_per_day: nullableInt(e.target.value) })} />
                </Field>
              </div>
            ),
          },
          prefsTab<TeacherIn>(true, 'Gesperrt: hier wird nie Unterricht gesetzt. Unerwünscht: möglich, aber der Rechner vermeidet es.'),
          constraintsTab<TeacherIn>('teachers', (v) => v.short),
          lessonsTab<TeacherIn>((l, id) => lessonTeacherIds(l).includes(id), (id) => `/unterricht?ansicht=lehrkraft&id=${id}`),
        ],
      }}
    />
  )
}

export function HoursBadge({ ist, soll }: { ist: number; soll: number | null | undefined }) {
  if (soll == null) return <span>{ist}</span>
  const diff = ist - soll
  const cls = Math.abs(diff) < 0.01 ? 'ok' : diff > 0 ? 'over' : 'under'
  return <span className={`hours ${cls}`} title={diff === 0 ? 'passt' : diff > 0 ? `${diff} zu viel` : `${-diff} zu wenig`}>{ist} / {soll}</span>
}

// ---- Räume ----

function RoomsPage() {
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
        tabs: [
          {
            key: 'allgemein', label: 'Allgemein',
            render: (v, set) => (
              <div className="grid-3">
                <Field label="Kürzel"><input required value={v.short} onChange={(e) => set({ short: e.target.value })} autoFocus /></Field>
                <Field label="Name"><input value={v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field label="Plätze"><input type="number" min={1} value={v.capacity ?? ''} onChange={(e) => set({ capacity: nullableInt(e.target.value) })} /></Field>
              </div>
            ),
          },
          prefsTab<RoomIn>(false, 'Gesperrte Zeiten: der Raum steht dann nicht zur Verfügung.'),
          constraintsTab<RoomIn>('rooms', (v) => v.short),
        ],
      }}
    />
  )
}

// ---- Klassen ----

const DIVISION_PRESETS: { name: string; groups: string[] }[] = [
  { name: 'Religion', groups: ['RK', 'EV'] },
  { name: 'Gruppen', groups: ['G1', 'G2'] },
  { name: 'Sprache', groups: ['F', 'SPA'] },
]

function DivisionsEditor({ value, onChange }: { value: Division[]; onChange: (v: Division[]) => void }) {
  const [newGroup, setNewGroup] = useState<Record<number, string>>({})
  const setDiv = (i: number, d: Division) => onChange(value.map((x, j) => (j === i ? d : x)))
  return (
    <div className="divisions">
      {value.map((d, i) => (
        <div key={d.id ?? `n${i}`} className="division">
          <input value={d.name} onChange={(e) => setDiv(i, { ...d, name: e.target.value })} aria-label="Name der Teilung" placeholder="z. B. Religion" />
          <div className="chips">
            {d.groups.map((g, j) => (
              <span key={g.id ?? `g${j}`} className="chip on removable">
                <input value={g.name} size={Math.max(2, g.name.length)} aria-label="Gruppenname"
                  onChange={(e) => setDiv(i, { ...d, groups: d.groups.map((x, k) => (k === j ? { ...x, name: e.target.value } : x)) })} />
                <button type="button" aria-label={`Gruppe ${g.name} entfernen`} disabled={d.groups.length <= 2}
                  onClick={() => setDiv(i, { ...d, groups: d.groups.filter((_, k) => k !== j) })}>×</button>
              </span>
            ))}
            <span className="add-group">
              <input placeholder="+ Gruppe" value={newGroup[i] ?? ''} aria-label="Neue Gruppe"
                onChange={(e) => setNewGroup({ ...newGroup, [i]: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (newGroup[i] ?? '').trim()) {
                    e.preventDefault()
                    setDiv(i, { ...d, groups: [...d.groups, { id: null, name: newGroup[i].trim() }] })
                    setNewGroup({ ...newGroup, [i]: '' })
                  }
                }} />
            </span>
          </div>
          <button type="button" className="danger" onClick={() => confirm(`Teilung „${d.name}“ entfernen? Unterricht für diese Gruppen verliert die Gruppe.`) && onChange(value.filter((_, j) => j !== i))}>Entfernen</button>
        </div>
      ))}
      <div className="actions">
        <span className="muted small">Teilung hinzufügen:</span>
        {DIVISION_PRESETS.filter((p) => !value.some((d) => d.name === p.name)).map((p) => (
          <button type="button" key={p.name} onClick={() => onChange([...value, { id: null, name: p.name, groups: p.groups.map((g) => ({ id: null, name: g })) }])}>
            {p.name} ({p.groups.join('/')})
          </button>
        ))}
        <button type="button" onClick={() => onChange([...value, { id: null, name: 'Teilung', groups: [{ id: null, name: 'A' }, { id: null, name: 'B' }] }])}>Eigene</button>
      </div>
    </div>
  )
}

function ClassesPage() {
  return (
    <EntityPage<SchoolClass, ClassIn>
      cfg={{
        title: 'Klassen', singular: 'Klasse', path: 'classes',
        intro: 'Klassen mit Stammraum und Teilungen (z. B. Religion RK/EV, Gruppen G1/G2). Gruppen derselben Teilung haben parallel unterschiedlichen Unterricht.',
        items: (md) => md.classes,
        empty: () => ({ name: '', home_room_id: null, unavailable: [], undesired: [], divisions: [] }),
        toInput: withoutId,
        search: (c) => c.name,
        columns: [
          { label: 'Klasse', render: (c) => <strong>{c.name}</strong> },
          { label: 'Stammraum', render: (c, md) => (c.home_room_id ? md.roomById.get(c.home_room_id)?.short : '–') },
          { label: 'Teilungen', render: (c) => <span className="small">{c.divisions.map((d) => `${d.name}: ${d.groups.map((g) => g.name).join('/')}`).join(' · ') || '–'}</span> },
          {
            label: 'Stunden/Woche', className: 'num',
            render: (c, md) => { const gi = groupIndex(md.classes); return lessonHours(md.lessons.filter((l) => lessonClassIds(l, gi).includes(c.id))) },
          },
        ],
        tabs: [
          {
            key: 'allgemein', label: 'Allgemein',
            render: (v, set, md) => (
              <>
                <div className="grid-2">
                  <Field label="Name"><input required value={v.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
                  <Field label="Stammraum" hint="Unterricht ohne eigenen Raum findet hier statt">
                    <select value={v.home_room_id ?? ''} onChange={(e) => set({ home_room_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">– keiner –</option>
                      {md.rooms.map((r) => <option key={r.id} value={r.id}>{r.short}{r.name ? ` – ${r.name}` : ''}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Teilungen und Gruppen" hint="Enter im Feld „+ Gruppe“ fügt eine Gruppe hinzu. Jede Teilung braucht mindestens zwei Gruppen.">
                  <DivisionsEditor value={v.divisions} onChange={(divisions) => set({ divisions })} />
                </Field>
              </>
            ),
          },
          prefsTab<ClassIn>(true, 'Gesperrt: hier hat die Klasse nie Unterricht. Unerwünscht: möglich, aber der Rechner vermeidet es.'),
          constraintsTab<ClassIn>('classes', (v) => v.name),
          lessonsTab<ClassIn>((l, id, md) => lessonClassIds(l, groupIndex(md.classes)).includes(id), (id) => `/unterricht?ansicht=klasse&id=${id}`),
        ],
      }}
    />
  )
}
