import { useState } from 'react'
import type { Lesson } from '../api'
import { ErrorBox, Field, Modal, MultiSelect } from '../components/ui'
import { useMasterData, useSave } from '../data'

type LessonIn = Omit<Lesson, 'id'>

export default function Lessons() {
  const md = useMasterData()
  const { save, remove } = useSave<Lesson, LessonIn>('lessons', ['lessons'])
  const [classFilter, setClassFilter] = useState<number | ''>('')
  const [teacherFilter, setTeacherFilter] = useState<number | ''>('')
  const [editing, setEditing] = useState<{ id?: number; value: LessonIn } | null>(null)

  const rows = md.lessons
    .filter((l) => classFilter === '' || l.class_ids.includes(classFilter))
    .filter((l) => teacherFilter === '' || l.teacher_ids.includes(teacherFilter))
    .sort((a, b) => {
      const ca = md.classById.get(a.class_ids[0])?.name ?? ''
      const cb = md.classById.get(b.class_ids[0])?.name ?? ''
      return ca.localeCompare(cb, 'de', { numeric: true }) ||
        (md.subjectById.get(a.subject_id)?.short ?? '').localeCompare(md.subjectById.get(b.subject_id)?.short ?? '')
    })
  const total = rows.reduce((s, l) => s + l.periods_per_week, 0)

  const blank = (): LessonIn => ({
    subject_id: md.subjects[0]?.id ?? 0,
    class_ids: classFilter === '' ? [] : [classFilter],
    teacher_ids: teacherFilter === '' ? [] : [teacherFilter],
    room_ids: [], periods_per_week: 2, double_periods: 0, note: '',
  })
  const close = () => { setEditing(null); save.reset() }
  const set = (patch: Partial<LessonIn>) => editing && setEditing({ ...editing, value: { ...editing.value, ...patch } })

  const names = (ids: number[], map: Map<number, { short?: string; name?: string }>, key: 'short' | 'name') =>
    ids.map((id) => map.get(id)?.[key] ?? '?').join(', ')

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Unterricht</h1>
          <p className="muted">Die Lehrfächerverteilung: welches Fach in welcher Klasse von wem, wie viele Stunden pro Woche.</p>
        </div>
        <div className="actions">
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value ? Number(e.target.value) : '')} aria-label="Klasse filtern">
            <option value="">Alle Klassen</option>
            {md.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value ? Number(e.target.value) : '')} aria-label="Lehrkraft filtern">
            <option value="">Alle Lehrkräfte</option>
            {md.teachers.map((t) => <option key={t.id} value={t.id}>{t.short}{t.name ? ` – ${t.name}` : ''}</option>)}
          </select>
          <button className="primary" disabled={!md.subjects.length || !md.classes.length} onClick={() => setEditing({ value: blank() })}>
            + Unterricht
          </button>
        </div>
      </div>
      {(!md.subjects.length || !md.classes.length) && !md.loading && (
        <p className="hint-box">Lege zuerst Fächer und Klassen an, oder lade unter „Import/Export“ die Beispielschule.</p>
      )}
      <ErrorBox error={md.error ?? remove.error} />
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr><th>Klasse(n)</th><th>Fach</th><th>Lehrkraft</th><th className="num">Std./Woche</th><th className="num">Doppelst.</th><th>Raum</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const subj = md.subjectById.get(l.subject_id)
              const home = md.classById.get(l.class_ids[0])?.home_room_id
              return (
                <tr key={l.id} onDoubleClick={() => setEditing({ id: l.id, value: { ...l } })}>
                  <td><strong>{names(l.class_ids, md.classById, 'name')}</strong></td>
                  <td>{subj && <span className="subject-tag" style={{ background: subj.color }}>{subj.short}</span>} <span className="muted small">{subj?.name}</span></td>
                  <td>{names(l.teacher_ids, md.teacherById, 'short') || <span className="warn">keine</span>}</td>
                  <td className="num">{l.periods_per_week}</td>
                  <td className="num">{l.double_periods || ''}</td>
                  <td>{l.room_ids.length ? names(l.room_ids, md.roomById, 'short') : <span className="muted">{home ? `${md.roomById.get(home)?.short} (Stammraum)` : '–'}</span>}</td>
                  <td className="row-actions">
                    <button onClick={() => setEditing({ id: l.id, value: { ...l } })}>Bearbeiten</button>
                    <button className="danger" onClick={() => confirm('Diesen Unterricht löschen?') && remove.mutate(l.id)}>Löschen</button>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="empty">Kein Unterricht vorhanden.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr><td colSpan={3}>{rows.length} Einträge</td><td className="num"><strong>{total}</strong></td><td colSpan={3} /></tr></tfoot>
          )}
        </table>
      </div>

      {editing && (
        <Modal title={editing.id ? 'Unterricht bearbeiten' : 'Unterricht anlegen'} onClose={close} wide>
          <form className="form" onSubmit={(e) => { e.preventDefault(); save.mutate({ id: editing.id, data: editing.value }, { onSuccess: close }) }}>
            <div className="grid-3">
              <Field label="Fach">
                <select value={editing.value.subject_id} onChange={(e) => set({ subject_id: Number(e.target.value) })}>
                  {md.subjects.map((s) => <option key={s.id} value={s.id}>{s.short}{s.name ? ` – ${s.name}` : ''}</option>)}
                </select>
              </Field>
              <Field label="Stunden pro Woche">
                <input type="number" min={1} max={40} required value={editing.value.periods_per_week}
                  onChange={(e) => set({ periods_per_week: Math.max(1, Number(e.target.value)) })} />
              </Field>
              <Field label="davon Doppelstunden" hint="Anzahl der 2-Stunden-Blöcke">
                <input type="number" min={0} max={Math.floor(editing.value.periods_per_week / 2)} value={editing.value.double_periods}
                  onChange={(e) => set({ double_periods: Math.max(0, Number(e.target.value)) })} />
              </Field>
            </div>
            <Field label="Klassen" hint="Mehrere Klassen = gemeinsamer Unterricht">
              <MultiSelect items={md.classes} value={editing.value.class_ids} onChange={(class_ids) => set({ class_ids })} label={(c) => c.name} />
            </Field>
            <Field label="Lehrkräfte" hint="Mehrere Lehrkräfte = Teamteaching (alle gleichzeitig)">
              <MultiSelect items={md.teachers} value={editing.value.teacher_ids} onChange={(teacher_ids) => set({ teacher_ids })} label={(t) => t.short} />
            </Field>
            <Field label="Räume" hint="Leer = Stammraum der Klasse. Mehrere = einer davon wird gewählt.">
              <MultiSelect items={md.rooms} value={editing.value.room_ids} onChange={(room_ids) => set({ room_ids })} label={(r) => r.short} />
            </Field>
            <Field label="Notiz"><input value={editing.value.note} onChange={(e) => set({ note: e.target.value })} /></Field>
            {editing.id && <p className="muted small">Wenn du Stunden oder Doppelstunden änderst, wird dieser Unterricht aus bestehenden Plänen entfernt und muss neu gesetzt werden.</p>}
            <ErrorBox error={save.error} />
            <div className="form-actions">
              <button type="button" onClick={close}>Abbrechen</button>
              <button className="primary" type="submit" disabled={save.isPending || !editing.value.class_ids.length}>Speichern</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}
