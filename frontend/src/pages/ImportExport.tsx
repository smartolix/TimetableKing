import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { api } from '../api'
import { ErrorBox } from '../components/ui'

export default function ImportExport() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<string>('')
  const refresh = () => qc.invalidateQueries()

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post<{ counts: Record<string, number> }>('/excel/import', fd)
    },
    onSuccess: (r) => {
      setResult('Import erfolgreich: ' + Object.entries(r.counts).map(([k, v]) => `${v} ${k}`).join(', '))
      refresh()
    },
  })
  const demo = useMutation({
    mutationFn: () => api.post<void>('/demo'),
    onSuccess: () => { setResult('Beispielschule geladen. Unter „Pläne“ kannst du jetzt einen Plan berechnen.'); refresh() },
  })

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Import und Export</h1>
          <p className="muted">Stammdaten mit Excel austauschen. Pläne druckst du als PDF in der Planansicht.</p>
        </div>
      </div>
      {result && <p className="ok-box">{result}</p>}
      <div className="cards">
        <div className="card">
          <h3>Aus Excel importieren</h3>
          <p className="muted">Die Vorlage hat Blätter für Zeitraster, Fächer, Lehrkräfte, Räume, Klassen und Unterricht. Sperrzeiten schreibst du so: <code>Mo1-2, Fr</code>.</p>
          <p className="warn small">Achtung: Der Import ersetzt alle Stammdaten und löscht alle Pläne. Bei Fehlern wird nichts geändert.</p>
          <div className="actions">
            <a className="button" href="/api/excel/template">Vorlage herunterladen</a>
            <button className="primary" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? 'Importiere …' : 'Excel-Datei wählen …'}
            </button>
            <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => {
              const f = e.target.files?.[0]
              if (f && confirm('Alle Stammdaten und Pläne werden ersetzt. Fortfahren?')) { setResult(''); upload.mutate(f) }
              e.target.value = ''
            }} />
          </div>
          <ErrorBox error={upload.error} />
        </div>
        <div className="card">
          <h3>Nach Excel exportieren</h3>
          <p className="muted">Alle Stammdaten im selben Format wie die Vorlage, z. B. als Sicherung oder zum Bearbeiten.</p>
          <div className="actions"><a className="button" href="/api/excel/export">Stammdaten exportieren</a></div>
        </div>
        <div className="card">
          <h3>Beispielschule</h3>
          <p className="muted">Mittelschule mit 8 Klassen, 16 Lehrkräften und Fachräumen zum Ausprobieren.</p>
          <p className="warn small">Ersetzt alle vorhandenen Daten.</p>
          <div className="actions">
            <button onClick={() => confirm('Alle Daten durch die Beispielschule ersetzen?') && demo.mutate()} disabled={demo.isPending}>Beispielschule laden</button>
          </div>
          <ErrorBox error={demo.error} />
        </div>
      </div>
    </section>
  )
}
