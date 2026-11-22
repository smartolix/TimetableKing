import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type TimetableSummary } from '../api'
import { ErrorBox, Field, Modal } from '../components/ui'
import { useMasterData } from '../data'
import { STATUS_LABEL } from '../format'

export default function Timetables() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const md = useMasterData()
  const list = useQuery({
    queryKey: ['timetables'],
    queryFn: () => api.get<TimetableSummary[]>('/timetables'),
    refetchInterval: (q) => (q.state.data?.some((t) => t.status === 'queued' || t.status === 'running') ? 1500 : false),
  })
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [seconds, setSeconds] = useState(30)
  const create = useMutation({
    mutationFn: () => api.post<TimetableSummary>('/timetables', { name, time_limit: seconds }),
    onSuccess: (tt) => { qc.invalidateQueries({ queryKey: ['timetables'] }); setCreating(false); nav(`/plaene/${tt.id}`) },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/timetables/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timetables'] }),
  })
  const hours = md.lessons.reduce((s, l) => s + l.periods_per_week, 0)

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Pläne</h1>
          <p className="muted">
            {md.classes.length} Klassen · {md.teachers.length} Lehrkräfte · {md.lessons.length} Unterrichtseinheiten mit {hours} Wochenstunden
          </p>
        </div>
        <div className="actions">
          <button className="primary" disabled={!md.lessons.length || !md.settings?.periods.length}
            onClick={() => { setName(`Stundenplan ${new Date().toLocaleDateString('de-AT')}`); setCreating(true) }}>
            + Neuen Plan berechnen
          </button>
        </div>
      </div>
      {!md.loading && !md.lessons.length && (
        <p className="hint-box">Noch kein Unterricht erfasst. Lege Stammdaten an oder lade unter <Link to="/daten">Import/Export</Link> die Beispielschule.</p>
      )}
      <ErrorBox error={md.error ?? list.error ?? remove.error} />
      <div className="table-wrap">
        <table className="list">
          <thead><tr><th>Name</th><th>Status</th><th>Erstellt</th><th className="num">Rechenzeit</th><th className="num">Strafpunkte</th><th /></tr></thead>
          <tbody>
            {(list.data ?? []).map((t) => (
              <tr key={t.id}>
                <td><Link to={`/plaene/${t.id}`}><strong>{t.name}</strong></Link></td>
                <td><span className={`status ${t.status}`}>{STATUS_LABEL[t.status]}</span></td>
                <td>{new Date(t.created_at).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="num">{t.solve_seconds != null ? `${t.solve_seconds.toFixed(1)} s` : '–'}</td>
                <td className="num">{t.score ?? '–'}</td>
                <td className="row-actions">
                  <Link className="button" to={`/plaene/${t.id}`}>Öffnen</Link>
                  <button className="danger" onClick={() => confirm(`Plan „${t.name}“ löschen?`) && remove.mutate(t.id)}>Löschen</button>
                </td>
              </tr>
            ))}
            {list.data?.length === 0 && <tr><td colSpan={6} className="empty">Noch keine Pläne.</td></tr>}
          </tbody>
        </table>
      </div>
      {creating && (
        <Modal title="Neuen Plan berechnen" onClose={() => setCreating(false)}>
          <form className="form" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
            <Field label="Name"><input required value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
            <Field label="Rechenzeit (Sekunden)" hint="Mehr Zeit ergibt meist weniger Hohlstunden.">
              <input type="number" min={5} max={3600} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
            </Field>
            <ErrorBox error={create.error} />
            <div className="form-actions">
              <button type="button" onClick={() => setCreating(false)}>Abbrechen</button>
              <button className="primary" type="submit" disabled={create.isPending}>Berechnen</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}
