import { useState } from 'react'
import { ErrorBox } from '../components/ui'
import { ConstraintRow } from '../components/constraintEditor'
import { useConstraintEditor } from '../components/useConstraintEditor'
import { useMasterData } from '../data'

export default function Constraints() {
  const md = useMasterData()
  const ed = useConstraintEditor(md)
  const [category, setCategory] = useState<string>('')
  const all = ed.list.data ?? []
  const items = all.filter((c) => !category || ed.types.get(c.type)?.category === category)
  const categories = ed.catalog.data?.categories ?? []
  const count = (cat: string) => all.filter((c) => ed.types.get(c.type)?.category === cat).length

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Bedingungen</h1>
          <p className="muted">Regeln und Wünsche für die Berechnung. „Muss“ ist eine feste Regel, alle anderen Stufen sind gewichtete Wünsche. Bedingungen einer einzelnen Lehrkraft, Klasse oder eines Fachs findest du auch im jeweiligen Dialog unter „Stammdaten“.</p>
        </div>
        <div className="actions">
          <button className="primary" disabled={!ed.catalog.data} onClick={() => ed.add({ category })}>+ Bedingung</button>
        </div>
      </div>
      <ErrorBox error={ed.catalog.error ?? ed.list.error ?? ed.toggle.error ?? ed.remove.error} />

      <div className="segmented" role="tablist" style={{ marginBottom: 14 }}>
        <button role="tab" aria-selected={!category} className={!category ? 'on' : ''} onClick={() => setCategory('')}>
          Alle <span className="count">{all.length}</span>
        </button>
        {categories.map((c) => (
          <button key={c} role="tab" aria-selected={category === c} className={category === c ? 'on' : ''} onClick={() => setCategory(c)}>
            {c} <span className="count">{count(c)}</span>
          </button>
        ))}
      </div>

      <div className="constraint-list">
        {items.map((c) => <ConstraintRow key={c.id} c={c} ed={ed} md={md} />)}
        {ed.list.data && items.length === 0 && (
          <div className="card empty">Noch keine Bedingungen{category ? ` für ${category}` : ''}. Mit „+ Bedingung“ wählst du eine aus dem Katalog.</div>
        )}
      </div>
      {ed.modals}
    </section>
  )
}
