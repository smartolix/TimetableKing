import { DAY_SHORT, type Slot } from '../api'

type State = 'free' | 'undesired' | 'blocked'
const LABEL: Record<State, string> = { free: 'frei', undesired: 'unerwünscht', blocked: 'gesperrt' }

/** Zeitwünsche: Klick schaltet frei → unerwünscht → gesperrt (ohne „unerwünscht“: frei ↔ gesperrt).
 *  Klick auf Tag oder Stunde setzt die ganze Spalte/Zeile. */
export function TimePrefs({ days, periods, periodLabels, unavailable, undesired, onChange, allowUndesired = true }: {
  days: number
  periods: number
  periodLabels?: string[]
  unavailable: Slot[]
  undesired?: Slot[]
  allowUndesired?: boolean
  onChange: (v: { unavailable: Slot[]; undesired: Slot[] }) => void
}) {
  const key = (d: number, p: number) => `${d}:${p}`
  const blocked = new Set(unavailable.map(([d, p]) => key(d, p)))
  const und = new Set((undesired ?? []).map(([d, p]) => key(d, p)))
  const state = (d: number, p: number): State => (blocked.has(key(d, p)) ? 'blocked' : und.has(key(d, p)) ? 'undesired' : 'free')
  const cycle: State[] = allowUndesired ? ['free', 'undesired', 'blocked'] : ['free', 'blocked']
  const next = (s: State) => cycle[(cycle.indexOf(s) + 1) % cycle.length]

  const apply = (cells: Slot[], target: State) => {
    const b = new Set(blocked), u = new Set(und)
    cells.forEach(([d, p]) => {
      const k = key(d, p)
      b.delete(k); u.delete(k)
      if (target === 'blocked') b.add(k)
      if (target === 'undesired') u.add(k)
    })
    const toSlots = (s: Set<string>) => [...s].map((k) => k.split(':').map(Number) as Slot).sort((x, y) => x[0] - y[0] || x[1] - y[1])
    onChange({ unavailable: toSlots(b), undesired: toSlots(u) })
  }
  const range = (n: number) => Array.from({ length: n }, (_, i) => i)
  const many = (cells: Slot[]) => apply(cells, next(state(cells[0][0], cells[0][1])))

  return (
    <div className="time-prefs">
      <table className="slot-picker">
        <thead>
          <tr>
            <th />
            {range(days).map((d) => (
              <th key={d}><button type="button" onClick={() => many(range(periods).map((p) => [d, p]))}>{DAY_SHORT[d]}</button></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {range(periods).map((p) => (
            <tr key={p}>
              <th><button type="button" onClick={() => many(range(days).map((d) => [d, p]))}>{periodLabels?.[p] || `${p + 1}.`}</button></th>
              {range(days).map((d) => {
                const s = state(d, p)
                return (
                  <td key={d}>
                    <button type="button" className={`cell ${s}`} title={`${DAY_SHORT[d]} ${p + 1}. Stunde: ${LABEL[s]}`}
                      aria-label={`${DAY_SHORT[d]} ${p + 1}. Stunde ${LABEL[s]}`} onClick={() => apply([[d, p]], next(s))}>
                      {s === 'blocked' ? '✕' : s === 'undesired' ? '−' : ''}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="legend-row small muted">
        <span><span className="legend-cell free" /> frei</span>
        {allowUndesired && <span><span className="legend-cell undesired">−</span> unerwünscht (möglich, aber vermieden)</span>}
        <span><span className="legend-cell blocked">✕</span> gesperrt</span>
      </div>
    </div>
  )
}
