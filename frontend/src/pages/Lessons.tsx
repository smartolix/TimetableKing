import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Lesson, LessonPart } from '../api'
import { ErrorBox, Field, Modal, MultiSelect } from '../components/ui'
import { useMasterData, useSave, type MasterData } from '../data'
import { audienceText, groupIndex, lessonClassIds, lessonTeacherIds, type GroupInfo } from '../lessons'
import { HoursBadge, SubjectTag } from './MasterData'

type LessonIn = Omit<Lesson, 'id'>
type View = 'klasse' | 'lehrkraft' | 'alle'

const emptyPart = (md: MasterData, preset?: Partial<LessonPart>): LessonPart => ({
  id: null, subject_id: md.subjects[0]?.id ?? 0, teacher_ids: [], class_ids: [], group_ids: [], room_ids: [], ...preset,
})

/** Unterricht (Lehrfächerverteilung): links Klassen oder Lehrkräfte, rechts deren Unterricht mit Kopplungszeilen. */
export default function Lessons() {
  const md = useMasterData()
  const { save, remove } = useSave<Lesson, LessonIn>('lessons', ['lessons'])
  const [params, setParams] = useSearchParams()
  const view = (params.get('ansicht') as View) || 'klasse'
  const groups = useMemo(() => groupIndex(md.classes), [md.classes])
  const [editing, setEditing] = useState<{ id?: number; value: LessonIn } | null>(null)

  const entities = view === 'klasse'
    ? md.classes.map((c) => ({ id: c.id, label: c.name, sub: '', match: (l: Lesson) => lessonClassIds(l, groups).includes(c.id), soll: null as number | null }))
    : view === 'lehrkraft'
      ? md.teachers.map((t) => ({ id: t.id, label: t.short, sub: t.name, match: (l: Lesson) => lessonTeacherIds(l).includes(t.id), soll: t.target_hours }))
      : []
  const selectedId = Number(params.get('id')) || entities[0]?.id
  const selected = entities.find((e) => e.id === selectedId)
  const rows = view === 'alle' ? md.lessons : selected ? md.lessons.filter(selected.match) : []
  const total = rows.reduce((s, l) => s + l.periods_per_week, 0)

  const setView = (v: View) => setParams({ ansicht: v })
  const select = (id: number) => setParams({ ansicht: view, id: String(id) })
  const blank = (): LessonIn => ({
    periods_per_week: 2, double_periods: 0, note: '',
    parts: [emptyPart(md, view === 'klasse' && selected ? { class_ids: [selected.id] } : view === 'lehrkraft' && selected ? { teacher_ids: [selected.id] } : {})],
  })
  const close = () => { setEditing(null); save.reset() }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Unterricht</h1>
          <p className="muted">Lehrfächerverteilung. Zeilen eines Unterrichts finden gleichzeitig statt (Kopplung); mehrere Lehrkräfte in einer Zeile = Teamteaching.</p>
        </div>
        <div className="actions">
          <div className="segmented" role="tablist">
            {(['klasse', 'lehrkraft', 'alle'] as View[]).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                {{ klasse: 'Klassen', lehrkraft: 'Lehrkräfte', alle: 'Alle' }[v]}
              </button>
            ))}
          </div>
          <button className="primary" disabled={!md.subjects.length || !md.classes.length} onClick={() => setEditing({ value: blank() })}>+ Unterricht</button>
        </div>
      </div>
      {!md.loading && (!md.subjects.length || !md.classes.length) && (
        <p className="hint-box">Lege zuerst unter „Stammdaten“ Fächer und Klassen an, oder lade unter „Import/Export“ die Beispielschule.</p>
      )}
      <ErrorBox error={md.error ?? remove.error} />

      <div className={view === 'alle' ? '' : 'split'}>
        {view !== 'alle' && (
          <nav className="entity-list" aria-label={view === 'klasse' ? 'Klassen' : 'Lehrkräfte'}>
            {entities.map((e) => {
              const ist = md.lessons.filter(e.match).reduce((s, l) => s + l.periods_per_week, 0)
              return (
                <button key={e.id} className={e.id === selectedId ? 'on' : ''} onClick={() => select(e.id)}>
                  <span><strong>{e.label}</strong>{e.sub && <span className="muted small"> {e.sub}</span>}</span>
                  <HoursBadge ist={ist} soll={e.soll} />
                </button>
              )
            })}
          </nav>
        )}
        <div className="table-wrap">
          <table className="list lessons">
            <thead>
              <tr><th>Fach</th><th>Schüler</th><th>Lehrkräfte</th><th>Räume</th><th className="num">Std.</th><th className="num">Doppel</th><th /></tr>
            </thead>
            {rows.map((l) => (
              <tbody key={l.id} className="lesson-group" onDoubleClick={() => setEditing({ id: l.id, value: { ...l } })}>
                {l.parts.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <SubjectTag md={md} id={p.subject_id} />
                      {i === 0 && l.parts.length > 1 && <span className="tag">Kopplung</span>}
                      {p.teacher_ids.length > 1 && <span className="tag">Teamteaching</span>}
                    </td>
                    <td>{audienceText(p, md, groups)}</td>
                    <td>{p.teacher_ids.map((t) => md.teacherById.get(t)?.short).join(', ') || <span className="warn">keine</span>}</td>
                    <td>{p.room_ids.length ? p.room_ids.map((r) => md.roomById.get(r)?.short).join(', ') : <span className="muted">Stammraum</span>}</td>
                    {i === 0 && <td className="num" rowSpan={l.parts.length}><strong>{l.periods_per_week}</strong></td>}
                    {i === 0 && <td className="num" rowSpan={l.parts.length}>{l.double_periods || ''}</td>}
                    {i === 0 && (
                      <td className="row-actions" rowSpan={l.parts.length}>
                        <button onClick={() => setEditing({ id: l.id, value: { ...l } })}>Bearbeiten</button>
                        <button onClick={() => setEditing({ value: { ...l, parts: l.parts.map((x) => ({ ...x, id: null })) } })}>Kopieren</button>
                        <button className="danger" onClick={() => confirm('Diesen Unterricht löschen?') && remove.mutate(l.id)}>Löschen</button>
                      </td>
                    )}
                  </tr>
                ))}
                {l.note && <tr className="note-row"><td colSpan={7} className="muted small">{l.note}</td></tr>}
              </tbody>
            ))}
            {rows.length === 0 && <tbody><tr><td colSpan={7} className="empty">Kein Unterricht.</td></tr></tbody>}
            {rows.length > 0 && (
              <tfoot><tr><td colSpan={4}>{rows.length} Unterrichte</td><td className="num"><strong>{total}</strong></td><td colSpan={2} /></tr></tfoot>
            )}
          </table>
        </div>
      </div>

      {editing && (
        <Modal title={editing.id ? 'Unterricht bearbeiten' : 'Unterricht anlegen'} onClose={close} wide>
          <LessonEditor md={md} groups={groups} value={editing.value} onChange={(value) => setEditing({ ...editing, value })}
            error={save.error} pending={save.isPending} isNew={!editing.id} onCancel={close}
            onSubmit={() => save.mutate({ id: editing.id, data: editing.value }, { onSuccess: close })} />
        </Modal>
      )}
    </section>
  )
}

function LessonEditor({ md, groups, value, onChange, error, pending, isNew, onCancel, onSubmit }: {
  md: MasterData; groups: Map<number, GroupInfo>; value: LessonIn; onChange: (v: LessonIn) => void
  error: unknown; pending: boolean; isNew: boolean; onCancel: () => void; onSubmit: () => void
}) {
  const set = (patch: Partial<LessonIn>) => onChange({ ...value, ...patch })
  const setPart = (i: number, p: LessonPart) => set({ parts: value.parts.map((x, j) => (j === i ? p : x)) })
  const first = value.parts[0]
  // Für „Zeile je Gruppe“: Teilungen der beteiligten Klassen
  const classIds = [...new Set(value.parts.flatMap((p) => [...p.class_ids, ...p.group_ids.map((g) => groups.get(g)?.classId ?? 0)]))]
  const divisions = classIds.flatMap((cid) => (md.classById.get(cid)?.divisions ?? []).map((d) => ({ cls: md.classById.get(cid)!, d })))
  const divNames = [...new Set(divisions.map((x) => x.d.name))]

  /** Ersetzt die Zeilen durch eine Zeile je Gruppe der Teilung (über alle beteiligten Klassen). */
  const splitBy = (name: string) => {
    const byGroupName = new Map<string, number[]>()
    divisions.filter((x) => x.d.name === name).forEach(({ d }) => d.groups.forEach((g) => {
      if (g.id != null) byGroupName.set(g.name, [...(byGroupName.get(g.name) ?? []), g.id])
    }))
    set({
      parts: [...byGroupName.entries()].map(([, ids], i) => ({
        ...emptyPart(md, { subject_id: first.subject_id, room_ids: [] }),
        teacher_ids: i === 0 ? first.teacher_ids : [], group_ids: ids,
      })),
    })
  }

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
      <div className="grid-3">
        <Field label="Stunden pro Woche">
          <input type="number" min={1} max={40} required value={value.periods_per_week}
            onChange={(e) => set({ periods_per_week: Math.max(1, Number(e.target.value)) })} />
        </Field>
        <Field label="davon Doppelstunden" hint="Anzahl der 2-Stunden-Blöcke">
          <input type="number" min={0} max={Math.floor(value.periods_per_week / 2)} value={value.double_periods}
            onChange={(e) => set({ double_periods: Math.max(0, Number(e.target.value)) })} />
        </Field>
        <Field label="Notiz"><input value={value.note} onChange={(e) => set({ note: e.target.value })} /></Field>
      </div>

      <div className="parts">
        {value.parts.map((p, i) => (
          <PartEditor key={i} index={i} part={p} md={md} groups={groups} onChange={(np) => setPart(i, np)}
            onRemove={value.parts.length > 1 ? () => set({ parts: value.parts.filter((_, j) => j !== i) }) : undefined} />
        ))}
      </div>
      <div className="actions">
        <button type="button" onClick={() => set({ parts: [...value.parts, emptyPart(md, { class_ids: first.class_ids, group_ids: [] })] })}>
          + Zeile (gleichzeitiger Unterricht)
        </button>
        {divNames.map((n) => (
          <button type="button" key={n} onClick={() => splitBy(n)} title="Ersetzt die Zeilen durch je eine Zeile pro Gruppe">
            Zeile je Gruppe: {n}
          </button>
        ))}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Alle Zeilen finden gleichzeitig statt, z. B. Religion RK und EV parallel. Mehrere Lehrkräfte in einer Zeile unterrichten gemeinsam (Teamteaching).
      </p>
      {!isNew && <p className="muted small" style={{ margin: 0 }}>Wenn du Stunden oder Doppelstunden änderst, wird dieser Unterricht aus bestehenden Plänen entfernt und muss neu gesetzt werden.</p>}
      <ErrorBox error={error} />
      <div className="form-actions">
        <button type="button" onClick={onCancel}>Abbrechen</button>
        <button className="primary" type="submit" disabled={pending || value.parts.some((p) => !p.class_ids.length && !p.group_ids.length)}>Speichern</button>
      </div>
    </form>
  )
}

function PartEditor({ index, part, md, groups, onChange, onRemove }: {
  index: number; part: LessonPart; md: MasterData; groups: Map<number, GroupInfo>
  onChange: (p: LessonPart) => void; onRemove?: () => void
}) {
  const set = (patch: Partial<LessonPart>) => onChange({ ...part, ...patch })
  return (
    <fieldset className="part">
      <legend>Zeile {index + 1}{part.teacher_ids.length > 1 && <span className="tag">Teamteaching</span>}</legend>
      {onRemove && <button type="button" className="danger part-remove" onClick={onRemove}>Zeile entfernen</button>}
      <div className="grid-2">
        <Field label="Fach">
          <select value={part.subject_id} onChange={(e) => set({ subject_id: Number(e.target.value) })}>
            {md.subjects.map((s) => <option key={s.id} value={s.id}>{s.short}{s.name ? ` – ${s.name}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Räume" hint="Leer = Stammraum. Mehrere = einer davon wird gewählt.">
          <MultiSelect items={md.rooms} value={part.room_ids} onChange={(room_ids) => set({ room_ids })} label={(r) => r.short} />
        </Field>
      </div>
      <Field label="Lehrkräfte" hint="Mehrere = Teamteaching">
        <MultiSelect items={md.teachers} value={part.teacher_ids} onChange={(teacher_ids) => set({ teacher_ids })} label={(t) => t.short} />
      </Field>
      <Field label="Schüler" hint="Ganze Klasse anklicken oder einzelne Gruppen">
        <AudiencePicker md={md} groups={groups} part={part} onChange={(class_ids, group_ids) => set({ class_ids, group_ids })} />
      </Field>
    </fieldset>
  )
}

function AudiencePicker({ md, part, onChange }: {
  md: MasterData; groups: Map<number, GroupInfo>; part: LessonPart; onChange: (classIds: number[], groupIds: number[]) => void
}) {
  const whole = new Set(part.class_ids)
  const gsel = new Set(part.group_ids)
  return (
    <div className="audience">
      {md.classes.map((c) => {
        const groupIds = c.divisions.flatMap((d) => d.groups.map((g) => g.id).filter((x): x is number => x != null))
        const toggleClass = () => whole.has(c.id)
          ? onChange(part.class_ids.filter((x) => x !== c.id), part.group_ids)
          : onChange([...part.class_ids, c.id], part.group_ids.filter((g) => !groupIds.includes(g)))
        const active = whole.has(c.id) || groupIds.some((g) => gsel.has(g))
        return (
          <div key={c.id} className={active ? 'aud-row active' : 'aud-row'}>
            <button type="button" className={whole.has(c.id) ? 'chip on' : 'chip'} aria-pressed={whole.has(c.id)} onClick={toggleClass}>{c.name}</button>
            {c.divisions.map((d) => (
              <span key={d.id ?? d.name} className="aud-div">
                {d.groups.map((g) => g.id != null && (
                  <button type="button" key={g.id} className={gsel.has(g.id) ? 'chip small on' : 'chip small'} aria-pressed={gsel.has(g.id)}
                    title={`${c.name}: ${d.name} ${g.name}`} disabled={whole.has(c.id)}
                    onClick={() => onChange(part.class_ids, gsel.has(g.id!) ? part.group_ids.filter((x) => x !== g.id) : [...part.group_ids, g.id!])}>
                    {g.name}
                  </button>
                ))}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}
