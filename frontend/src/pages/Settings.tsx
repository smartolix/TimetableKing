import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type Settings } from '../api'
import { ErrorBox, Field } from '../components/ui'
import { useSettings } from '../data'

type PeriodIn = { label: string; start: string; end: string; break_after: boolean }
type SettingsIn = Omit<Settings, 'periods'> & { periods: PeriodIn[] }

function addMinutes(time: string, minutes: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!m) return ''
  const total = Number(m[1]) * 60 + Number(m[2]) + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export default function SettingsPage() {
  const settings = useSettings()
  if (settings.error) return <ErrorBox error={settings.error} />
  if (!settings.data) return <p className="muted">Lade …</p>
  return <SettingsForm initial={settings.data} />
}

function SettingsForm({ initial }: { initial: Settings }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<SettingsIn>(() => ({
    ...initial,
    periods: initial.periods.map((p) => ({ label: p.label, start: p.start, end: p.end, break_after: p.break_after })),
  }))
  const [saved, setSaved] = useState(false)
  const save = useMutation({
    mutationFn: (data: SettingsIn) => api.put<Settings>('/settings', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setSaved(true) },
  })
  const set = (patch: Partial<SettingsIn>) => { setForm({ ...form, ...patch }); setSaved(false) }
  const setPeriod = (i: number, patch: Partial<PeriodIn>) => set({ periods: form.periods.map((p, j) => (i === j ? { ...p, ...patch } : p)) })
  const addPeriod = () => {
    const last = form.periods.at(-1)
    const start = last?.end ? addMinutes(last.end, 5) : '08:00'
    set({ periods: [...form.periods, { label: `${form.periods.length + 1}.`, start, end: addMinutes(start, 50), break_after: false }] })
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Zeitraster und Regeln</h1>
          <p className="muted">Schultage, Unterrichtsstunden und wie stark der Rechner Hohlstunden und späte Stunden vermeiden soll.</p>
        </div>
      </div>
      <form className="form card" onSubmit={(e) => { e.preventDefault(); save.mutate(form) }}>
        <div className="grid-2">
          <Field label="Name der Schule"><input value={form.school_name} onChange={(e) => set({ school_name: e.target.value })} /></Field>
          <Field label="Schultage pro Woche">
            <select value={form.days} onChange={(e) => set({ days: Number(e.target.value) })}>
              <option value={5}>5 (Mo–Fr)</option>
              <option value={6}>6 (Mo–Sa)</option>
            </select>
          </Field>
        </div>

        <h3>Unterrichtsstunden</h3>
        <table className="list compact">
          <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Beginn</th><th>Ende</th><th>Pause danach</th><th /></tr></thead>
          <tbody>
            {form.periods.map((p, i) => (
              <tr key={i}>
                <td className="num">{i + 1}</td>
                <td><input value={p.label} onChange={(e) => setPeriod(i, { label: e.target.value })} aria-label={`Bezeichnung ${i + 1}. Stunde`} /></td>
                <td><input type="time" value={p.start} onChange={(e) => setPeriod(i, { start: e.target.value })} aria-label="Beginn" /></td>
                <td><input type="time" value={p.end} onChange={(e) => setPeriod(i, { end: e.target.value })} aria-label="Ende" /></td>
                <td><input type="checkbox" checked={p.break_after} onChange={(e) => setPeriod(i, { break_after: e.target.checked })} aria-label="Pause danach" /></td>
                <td className="row-actions"><button type="button" className="danger" onClick={() => set({ periods: form.periods.filter((_, j) => j !== i) })}>Entfernen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div><button type="button" onClick={addPeriod} disabled={form.periods.length >= 16}>+ Stunde</button></div>
        <p className="muted small">„Pause danach“: Doppelstunden werden nicht über diese Pause gelegt.</p>

        <h3>Gewichtung der weichen Regeln</h3>
        <p className="muted small">0 = egal. Je höher, desto stärker vermeidet der Rechner das. Harte Regeln (keine Doppelbelegung, Sperrzeiten) gelten immer.</p>
        <div className="grid-4">
          <Field label="Hohlstunden Klassen"><input type="number" min={0} max={1000} value={form.weight_class_gap} onChange={(e) => set({ weight_class_gap: Number(e.target.value) })} /></Field>
          <Field label="Hohlstunden Lehrkräfte"><input type="number" min={0} max={1000} value={form.weight_teacher_gap} onChange={(e) => set({ weight_teacher_gap: Number(e.target.value) })} /></Field>
          <Field label="Späte Stunden"><input type="number" min={0} max={1000} value={form.weight_late} onChange={(e) => set({ weight_late: Number(e.target.value) })} /></Field>
          <Field label="„Spät“ ab Stunde">
            <input type="number" min={1} max={20} value={form.late_from_period + 1} onChange={(e) => set({ late_from_period: Math.max(0, Number(e.target.value) - 1) })} />
          </Field>
        </div>
        <ErrorBox error={save.error} />
        <div className="form-actions">
          {saved && <span className="ok">Gespeichert</span>}
          <button className="primary" type="submit" disabled={save.isPending}>Speichern</button>
        </div>
      </form>
    </section>
  )
}
