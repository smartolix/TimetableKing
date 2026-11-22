import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError, DAY_NAMES, DAY_SHORT, api, type Conflict, type Placement, type Timetable } from '../api'
import { ErrorBox, Modal, RelaxOption } from '../components/ui'
import { describe } from '../constraintText'
import { useCatalog, useConstraints, useMasterData, type MasterData } from '../data'
import { STATUS_LABEL } from '../format'

type View = 'class' | 'teacher' | 'room'

/** Ziel ist das Feld unter der oberen Kante des gezogenen Blocks (wichtig bei Doppelstunden). */
const topEdge: CollisionDetection = ({ collisionRect, droppableRects, droppableContainers }) => {
  const x = collisionRect.left + collisionRect.width / 2
  const y = collisionRect.top + 14
  for (const c of droppableContainers) {
    const r = droppableRects.get(c.id)
    if (r && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height) return [{ id: c.id }]
  }
  return []
}
const VIEW_LABEL: Record<View, string> = { class: 'Klassen', teacher: 'Lehrkräfte', room: 'Räume' }

/** Welche Ressourcen (Lehrkraft/Klasse/Raum) belegt ein Block? */
function resources(p: Placement, md: MasterData): string[] {
  const lesson = md.lessonById.get(p.lesson_id)
  if (!lesson) return []
  return [
    ...lesson.teacher_ids.map((t) => `t${t}`),
    ...lesson.class_ids.map((c) => `c${c}`),
    ...(p.room_id != null ? [`r${p.room_id}`] : []),
  ]
}

function belongs(p: Placement, view: View, id: number, md: MasterData): boolean {
  const lesson = md.lessonById.get(p.lesson_id)
  if (!lesson) return false
  if (view === 'class') return lesson.class_ids.includes(id)
  if (view === 'teacher') return lesson.teacher_ids.includes(id)
  return p.room_id === id
}

export default function TimetableView() {
  const { id } = useParams()
  const ttId = Number(id)
  const qc = useQueryClient()
  const md = useMasterData()
  const [params, setParams] = useSearchParams()
  const view = (params.get('ansicht') as View) || 'class'
  const [selected, setSelected] = useState<number | null>(null)
  const [dragging, setDragging] = useState<Placement | null>(null)
  const [pending, setPending] = useState<{ conflicts: Conflict[]; retry: () => void } | null>(null)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [seconds, setSeconds] = useState(30)
  const [relax, setRelax] = useState(false)

  const tt = useQuery({
    queryKey: ['timetable', ttId],
    queryFn: () => api.get<Timetable>(`/timetables/${ttId}`),
    refetchInterval: (q) => (q.state.data && ['queued', 'running'].includes(q.state.data.status) ? 1500 : false),
  })
  const conflicts = useQuery({
    queryKey: ['conflicts', ttId, tt.data?.updated_at],
    queryFn: () => api.get<Conflict[]>(`/timetables/${ttId}/conflicts`),
    enabled: tt.data?.status === 'done',
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['timetable', ttId] })
    qc.invalidateQueries({ queryKey: ['conflicts', ttId] })
    qc.invalidateQueries({ queryKey: ['timetables'] })
  }

  const entities = view === 'class'
    ? md.classes.map((c) => ({ id: c.id, label: c.name }))
    : view === 'teacher'
      ? md.teachers.map((t) => ({ id: t.id, label: t.name ? `${t.short} – ${t.name}` : t.short }))
      : md.rooms.map((r) => ({ id: r.id, label: r.name ? `${r.short} – ${r.name}` : r.short }))
  const entityId = Number(params.get('id')) || entities[0]?.id
  const setView = (v: View) => setParams({ ansicht: v })
  const setEntity = (eid: number) => setParams({ ansicht: view, id: String(eid) })

  const placements = useMemo(() => tt.data?.placements ?? [], [tt.data])
  const visible = placements.filter((p) => entityId != null && belongs(p, view, entityId, md))
  const conflictIds = new Set((conflicts.data ?? []).flatMap((c) => c.placement_ids))
  const days = md.settings?.days ?? 5
  const periods = md.settings?.periods ?? []
  const busy = tt.data && ['queued', 'running'].includes(tt.data.status)

  // Belegung aller anderen Blöcke: Ressource -> Set "tag:stunde"
  const occupancy = useMemo(() => {
    const occ = new Map<string, Map<string, number[]>>()
    for (const p of placements) {
      for (const r of resources(p, md)) {
        if (!occ.has(r)) occ.set(r, new Map())
        for (let q = p.period; q < p.period + p.length; q++) {
          const k = `${p.day}:${q}`
          occ.get(r)!.set(k, [...(occ.get(r)!.get(k) ?? []), p.id])
        }
      }
    }
    return occ
  }, [placements, md])

  /** Ist (tag, stunde) für den gezogenen Block frei? */
  const fits = (p: Placement, day: number, period: number): 'ok' | 'conflict' | 'blocked' => {
    if (period + p.length > periods.length) return 'blocked'
    for (let q = period; q < period + p.length - 1; q++) if (periods[q]?.break_after) return 'blocked'
    const lesson = md.lessonById.get(p.lesson_id)
    for (let q = period; q < period + p.length; q++) {
      for (const r of resources(p, md)) {
        const ids = occupancy.get(r)?.get(`${day}:${q}`) ?? []
        if (ids.some((x) => x !== p.id)) return 'conflict'
      }
      const slot = (s: [number, number]) => s[0] === day && s[1] === q
      if (lesson?.teacher_ids.some((t) => md.teacherById.get(t)?.unavailable.some(slot))) return 'conflict'
      if (lesson?.class_ids.some((c) => md.classById.get(c)?.unavailable.some(slot))) return 'conflict'
      if (p.room_id != null && md.roomById.get(p.room_id)?.unavailable.some(slot)) return 'conflict'
    }
    return 'ok'
  }

  const move = useMutation({
    mutationFn: (v: { p: Placement; body: Record<string, unknown> }) => api.patch<Placement>(`/timetables/${ttId}/placements/${v.p.id}`, v.body),
    onSuccess: refresh,
    onError: (err, v) => {
      if (err instanceof ApiError && err.status === 409 && err.conflicts.length) {
        setPending({ conflicts: err.conflicts, retry: () => move.mutate({ p: v.p, body: { ...v.body, force: true } }) })
      }
    },
  })
  const swap = useMutation({
    mutationFn: (v: { a: number; b: number; force?: boolean }) => api.post<Placement[]>(`/timetables/${ttId}/swap`, v),
    onSuccess: refresh,
    onError: (err, v) => {
      if (err instanceof ApiError && err.status === 409 && err.conflicts.length) {
        setPending({ conflicts: err.conflicts, retry: () => swap.mutate({ ...v, force: true }) })
      }
    },
  })
  const resolve = useMutation({
    mutationFn: () => api.post(`/timetables/${ttId}/solve`, { time_limit: seconds, keep_locked: true, relax }),
    onSuccess: () => { setResolveOpen(false); refresh() },
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const onDragStart = (e: DragStartEvent) => setDragging(placements.find((p) => p.id === e.active.id) ?? null)
  const onDragEnd = (e: DragEndEvent) => {
    const p = dragging
    setDragging(null)
    if (!p || !e.over) return
    const [day, period] = String(e.over.id).split(':').map(Number)
    if (day === p.day && period === p.period) return
    const target = visible.find((x) => x.day === day && x.period === period && x.id !== p.id)
    if (target && target.length === p.length) swap.mutate({ a: p.id, b: target.id })
    else move.mutate({ p, body: { day, period } })
  }

  const sel = placements.find((p) => p.id === selected) ?? null
  const unplaced = useMemo(() => {
    const count = new Map<number, number>()
    placements.forEach((p) => count.set(p.lesson_id, (count.get(p.lesson_id) ?? 0) + p.length))
    return md.lessons.filter((l) => (count.get(l.id) ?? 0) < l.periods_per_week)
  }, [placements, md.lessons])

  if (tt.isPending || md.loading) return <p className="muted">Lade …</p>
  if (tt.error) return <ErrorBox error={tt.error} />
  const data = tt.data!
  const pdfUrl = (all: boolean) => `/api/timetables/${ttId}/pdf?view=${view}${all || entityId == null ? '' : `&entity_id=${entityId}`}`

  return (
    <section>
      <div className="page-head">
        <div>
          <p className="crumb"><Link to="/plaene">Pläne</Link> /</p>
          <h1>{data.name}</h1>
          <p className="muted">
            <span className={`status ${data.status}`}>{STATUS_LABEL[data.status]}</span>
            {data.solve_seconds != null && ` · ${data.solve_seconds.toFixed(1)} s Rechenzeit`}
            {data.score != null && ` · ${data.score} Strafpunkte`}
          </p>
        </div>
        <div className="actions">
          <a className="button" href={pdfUrl(false)} target="_blank" rel="noreferrer">PDF (diese Ansicht)</a>
          <a className="button" href={pdfUrl(true)} target="_blank" rel="noreferrer">PDF (alle {VIEW_LABEL[view]})</a>
          <button className="primary" disabled={!!busy} onClick={() => setResolveOpen(true)}>Neu berechnen</button>
        </div>
      </div>

      {data.message && data.status !== 'done' && <div className={data.status === 'failed' ? 'error-box' : 'hint-box'} style={{ whiteSpace: 'pre-line' }}>{data.message}</div>}
      {busy && <div className="hint-box"><span className="spinner" /> Der Plan wird berechnet. Das kann bis zur eingestellten Rechenzeit dauern.</div>}
      <ErrorBox error={(move.error instanceof ApiError && move.error.status === 409) ? null : move.error} />
      <ErrorBox error={(swap.error instanceof ApiError && swap.error.status === 409) ? null : swap.error} />

      <div className="tt-toolbar">
        <div className="segmented" role="tablist">
          {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{VIEW_LABEL[v]}</button>
          ))}
        </div>
        <div className="entity-tabs">
          {entities.map((e) => (
            <button key={e.id} className={e.id === entityId ? 'on' : ''} onClick={() => setEntity(e.id)} title={e.label}>
              {e.label.split(' – ')[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="tt-layout">
        <DndContext sensors={sensors} collisionDetection={topEdge} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="tt-grid" style={{ gridTemplateColumns: `72px repeat(${days}, minmax(90px, 1fr))`, gridTemplateRows: `36px repeat(${periods.length}, minmax(58px, auto))` }}>
            <div className="tt-corner" />
            {Array.from({ length: days }, (_, d) => <div key={d} className="tt-day" style={{ gridColumn: d + 2 }}><span className="long">{DAY_NAMES[d]}</span><span className="short">{DAY_SHORT[d]}</span></div>)}
            {periods.map((p, i) => (
              <div key={p.id} className={`tt-period${p.break_after ? ' break' : ''}`} style={{ gridRow: i + 2 }}>
                <strong>{p.label || `${i + 1}.`}</strong>
                {p.start && <span>{p.start}<br />{p.end}</span>}
              </div>
            ))}
            {Array.from({ length: days }, (_, d) => periods.map((p, i) => (
              <DropCell key={`${d}:${i}`} day={d} period={i} breakAfter={p.break_after}
                state={dragging ? fits(dragging, d, i) : null} />
            )))}
            {visible.map((p) => (
              <Card key={p.id} p={p} md={md} view={view} selected={p.id === selected} conflict={conflictIds.has(p.id)}
                disabled={!!busy} onSelect={() => setSelected(p.id === selected ? null : p.id)} />
            ))}
          </div>
        </DndContext>

        <aside className="tt-side">
          {sel ? (
            <Details p={sel} md={md} conflicts={(conflicts.data ?? []).filter((c) => c.placement_ids.includes(sel.id))}
              disabled={!!busy}
              onLock={(locked) => move.mutate({ p: sel, body: { locked } })}
              onRoom={(room_id) => move.mutate({ p: sel, body: room_id == null ? { clear_room: true } : { room_id } })}
              onClose={() => setSelected(null)} />
          ) : (
            <div className="card">
              <h3>Bearbeiten</h3>
              <p className="muted small">Ziehe einen Block in ein anderes Feld. <span className="legend ok" /> frei, <span className="legend conflict" /> Konflikt. Auf einen gleich langen Block ziehen tauscht die beiden.</p>
              <p className="muted small">Klicke auf einen Block, um ihn zu fixieren oder den Raum zu ändern. Fixierte Blöcke 📌 bleiben beim Neuberechnen, wo sie sind.</p>
            </div>
          )}
          {data.status === 'done' && data.report.length > 0 && <ReportCard report={data.report} md={md} />}
          <div className="card">
            <h3>Konflikte {conflicts.data && <span className={conflicts.data.length ? 'badge bad' : 'badge good'}>{conflicts.data.length}</span>}</h3>
            {conflicts.data?.length === 0 && <p className="muted small">Keine Konflikte.</p>}
            <ul className="conflicts">
              {(conflicts.data ?? []).slice(0, 50).map((c, i) => (
                <li key={i}><button className="link" onClick={() => setSelected(c.placement_ids[0])}>{c.message}</button></li>
              ))}
            </ul>
          </div>
          {unplaced.length > 0 && data.status === 'done' && (
            <div className="card">
              <h3>Nicht gesetzt <span className="badge bad">{unplaced.length}</span></h3>
              <p className="muted small">Dieser Unterricht wurde nach der Berechnung angelegt oder geändert. „Neu berechnen“ setzt ihn ein.</p>
              <ul className="conflicts">
                {unplaced.slice(0, 20).map((l) => (
                  <li key={l.id}>{md.subjectById.get(l.subject_id)?.short} {l.class_ids.map((c) => md.classById.get(c)?.name).join('+')}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {pending && (
        <Modal title="Konflikt" onClose={() => setPending(null)}>
          <p>Diese Änderung erzeugt Konflikte:</p>
          <ul className="conflicts">{pending.conflicts.map((c, i) => <li key={i}>{c.message}</li>)}</ul>
          <div className="form-actions">
            <button onClick={() => setPending(null)}>Abbrechen</button>
            <button className="danger-solid" onClick={() => { pending.retry(); setPending(null) }}>Trotzdem ändern</button>
          </div>
        </Modal>
      )}
      {resolveOpen && (
        <Modal title="Plan neu berechnen" onClose={() => setResolveOpen(false)}>
          <form className="form" onSubmit={(e) => { e.preventDefault(); resolve.mutate() }}>
            <p>Alle nicht fixierten Blöcke werden neu gesetzt. Fixierte Blöcke bleiben, wo sie sind.</p>
            <label className="field"><span className="field-label">Rechenzeit (Sekunden)</span>
              <input type="number" min={5} max={3600} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
            </label>
            <RelaxOption value={relax} onChange={setRelax} />
            <ErrorBox error={resolve.error} />
            <div className="form-actions">
              <button type="button" onClick={() => setResolveOpen(false)}>Abbrechen</button>
              <button className="primary" type="submit" disabled={resolve.isPending}>Berechnen</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

function DropCell({ day, period, state, breakAfter }: { day: number; period: number; state: 'ok' | 'conflict' | 'blocked' | null; breakAfter: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${day}:${period}`, disabled: state === 'blocked' })
  const cls = ['tt-cell', breakAfter ? 'break' : '', state ? `drop-${state}` : '', isOver ? 'over' : ''].filter(Boolean).join(' ')
  return <div ref={setNodeRef} className={cls} style={{ gridColumn: day + 2, gridRow: period + 2 }} />
}

function Card({ p, md, view, selected, conflict, disabled, onSelect }: {
  p: Placement; md: MasterData; view: View; selected: boolean; conflict: boolean; disabled: boolean; onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: p.id, disabled })
  const lesson = md.lessonById.get(p.lesson_id)
  const subject = lesson ? md.subjectById.get(lesson.subject_id) : undefined
  const teachers = lesson?.teacher_ids.map((t) => md.teacherById.get(t)?.short).join(', ') ?? ''
  const classes = lesson?.class_ids.map((c) => md.classById.get(c)?.name).join(', ') ?? ''
  const room = p.room_id != null ? md.roomById.get(p.room_id)?.short : ''
  const lines = view === 'class' ? [teachers, room] : view === 'teacher' ? [classes, room] : [classes, teachers]
  const style: React.CSSProperties = {
    gridColumn: p.day + 2,
    gridRow: `${p.period + 2} / span ${p.length}`,
    ['--subject' as string]: subject?.color ?? '#9aa5b1',
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    zIndex: isDragging ? 20 : undefined,
  }
  const cls = ['tt-card', selected ? 'selected' : '', conflict ? 'conflict' : '', isDragging ? 'dragging' : '', p.locked ? 'locked' : ''].filter(Boolean).join(' ')
  return (
    <button ref={setNodeRef} className={cls} style={style} onClick={onSelect} {...listeners} {...attributes}
      aria-label={`${subject?.name ?? subject?.short} ${classes} ${teachers} ${room}`}>
      <span className="tt-subject">{subject?.short}{p.locked && <span className="pin" aria-label="fixiert">📌</span>}</span>
      {lines.filter(Boolean).map((l, i) => <span key={i} className="tt-line">{l}</span>)}
    </button>
  )
}

function Details({ p, md, conflicts, disabled, onLock, onRoom, onClose }: {
  p: Placement; md: MasterData; conflicts: Conflict[]; disabled: boolean
  onLock: (locked: boolean) => void; onRoom: (room: number | null) => void; onClose: () => void
}) {
  const lesson = md.lessonById.get(p.lesson_id)
  const subject = lesson ? md.subjectById.get(lesson.subject_id) : undefined
  const period = md.settings?.periods[p.period]
  return (
    <div className="card">
      <div className="card-head">
        <h3><span className="subject-tag" style={{ background: subject?.color }}>{subject?.short}</span> {subject?.name}</h3>
        <button className="icon" onClick={onClose} aria-label="Schließen">×</button>
      </div>
      <dl className="details">
        <dt>Zeit</dt><dd>{DAY_NAMES[p.day]}, {period?.label ?? p.period + 1}{p.length > 1 ? ` (${p.length} Stunden)` : ''}</dd>
        <dt>Klassen</dt><dd>{lesson?.class_ids.map((c) => md.classById.get(c)?.name).join(', ')}</dd>
        <dt>Lehrkräfte</dt><dd>{lesson?.teacher_ids.map((t) => md.teacherById.get(t)?.short).join(', ') || '–'}</dd>
        <dt>Raum</dt>
        <dd>
          <select value={p.room_id ?? ''} disabled={disabled} onChange={(e) => onRoom(e.target.value ? Number(e.target.value) : null)} aria-label="Raum">
            <option value="">– kein Raum –</option>
            {md.rooms.map((r) => <option key={r.id} value={r.id}>{r.short}{r.name ? ` – ${r.name}` : ''}</option>)}
          </select>
        </dd>
      </dl>
      <label className="check">
        <input type="checkbox" checked={p.locked} disabled={disabled} onChange={(e) => onLock(e.target.checked)} /> Fixiert (bleibt beim Neuberechnen)
      </label>
      {conflicts.length > 0 && <ul className="conflicts bad">{conflicts.map((c, i) => <li key={i}>{c.message}</li>)}</ul>}
    </div>
  )
}

function ReportCard({ report, md }: { report: Timetable['report']; md: MasterData }) {
  const catalog = useCatalog()
  const constraints = useConstraints()
  const byId = new Map((constraints.data ?? []).map((c) => [c.id, c]))
  const types = new Map((catalog.data?.types ?? []).map((t) => [t.key, t]))
  const violated = report.filter((r) => r.violations > 0)
  return (
    <div className="card">
      <h3>
        Bedingungen
        <span className={violated.length ? 'badge bad' : 'badge good'}>
          {report.length - violated.length}/{report.length} erfüllt
        </span>
      </h3>
      {violated.length === 0 && <p className="muted small">Alle aktiven Bedingungen sind erfüllt.</p>}
      <ul className="report-list">
        {violated.map((r) => {
          const c = byId.get(r.constraint_id)
          const t = c ? types.get(c.type) : undefined
          return (
            <li key={r.constraint_id} title={c && t ? describe(t, c.params, md) : ''}>
              <span>
                {t?.title ?? 'Gelöschte Bedingung'}
                {c?.note && <span className="muted"> – {c.note}</span>}
                {c && <span className={`imp ${c.importance}`} style={{ marginLeft: 6 }}>{catalog.data?.importance[c.importance]}</span>}
              </span>
              <strong className="warn">{r.violations}×</strong>
            </li>
          )
        })}
      </ul>
      <p className="muted small" style={{ marginTop: 8 }}><Link to="/bedingungen">Bedingungen bearbeiten</Link></p>
    </div>
  )
}
