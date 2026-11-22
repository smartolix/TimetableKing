import { useEffect, useRef, type ReactNode } from 'react'
import { DAY_SHORT, type Slot } from '../api'

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog ref={ref} className={wide ? 'modal wide' : 'modal'} onCancel={(e) => { e.preventDefault(); onClose() }}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon" onClick={onClose} aria-label="Schließen">×</button>
      </div>
      {children}
    </dialog>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof Error ? error.message : String(error)
  const list = (error as { errors?: string[] }).errors ?? []
  return (
    <div className="error-box" role="alert">
      <strong>{msg}</strong>
      {list.length > 0 && (
        <ul>
          {list.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}
          {list.length > 30 && <li>… und {list.length - 30} weitere</li>}
        </ul>
      )}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

/** Auswahl mehrerer Einträge als Chips. */
export function MultiSelect<T extends { id: number }>({ items, value, onChange, label }: {
  items: T[]; value: number[]; onChange: (v: number[]) => void; label: (item: T) => string
}) {
  const set = new Set(value)
  return (
    <div className="chips">
      {items.length === 0 && <span className="muted">Noch keine Einträge vorhanden</span>}
      {items.map((it) => (
        <button
          type="button"
          key={it.id}
          className={set.has(it.id) ? 'chip on' : 'chip'}
          aria-pressed={set.has(it.id)}
          onClick={() => onChange(set.has(it.id) ? value.filter((v) => v !== it.id) : [...value, it.id])}
        >
          {label(it)}
        </button>
      ))}
    </div>
  )
}

/** Raster zum Sperren von Zeiten. Klick schaltet ein Feld, Klick auf Tag/Stunde die ganze Zeile/Spalte. */
export function SlotPicker({ days, periods, value, onChange }: {
  days: number; periods: number; value: Slot[]; onChange: (v: Slot[]) => void
}) {
  const key = (d: number, p: number) => `${d}:${p}`
  const set = new Set(value.map(([d, p]) => key(d, p)))
  const toggleMany = (cells: Slot[]) => {
    const allOn = cells.every(([d, p]) => set.has(key(d, p)))
    const next = new Set(set)
    cells.forEach(([d, p]) => (allOn ? next.delete(key(d, p)) : next.add(key(d, p))))
    onChange([...next].map((k) => k.split(':').map(Number) as Slot).sort((a, b) => a[0] - b[0] || a[1] - b[1]))
  }
  const range = (n: number) => Array.from({ length: n }, (_, i) => i)
  return (
    <table className="slot-picker">
      <thead>
        <tr>
          <th />
          {range(days).map((d) => (
            <th key={d}><button type="button" onClick={() => toggleMany(range(periods).map((p) => [d, p]))}>{DAY_SHORT[d]}</button></th>
          ))}
        </tr>
      </thead>
      <tbody>
        {range(periods).map((p) => (
          <tr key={p}>
            <th><button type="button" onClick={() => toggleMany(range(days).map((d) => [d, p]))}>{p + 1}.</button></th>
            {range(days).map((d) => (
              <td key={d}>
                <button
                  type="button"
                  className={set.has(key(d, p)) ? 'cell off' : 'cell'}
                  aria-label={`${DAY_SHORT[d]} ${p + 1}. Stunde ${set.has(key(d, p)) ? 'gesperrt' : 'frei'}`}
                  onClick={() => toggleMany([[d, p]])}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
