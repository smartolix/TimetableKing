import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useSettings } from './data'
import Constraints from './pages/Constraints'
import ImportExport from './pages/ImportExport'
import Lessons from './pages/Lessons'
import MasterDataPage from './pages/MasterData'
import TimetableView from './pages/TimetableView'
import Timetables from './pages/Timetables'

const NAV = [
  { to: '/plaene', label: 'Stundenplan' },
  { to: '/unterricht', label: 'Unterricht' },
  { to: '/bedingungen', label: 'Bedingungen' },
  { to: '/stammdaten', label: 'Stammdaten' },
  { to: '/daten', label: 'Import/Export' },
]

export default function App() {
  const settings = useSettings()
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <div>
            <div className="brand-name">TimetableKing</div>
            {settings.data?.school_name && <div className="brand-school">{settings.data.school_name}</div>}
          </div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/plaene" replace />} />
          <Route path="/plaene" element={<Timetables />} />
          <Route path="/plaene/:id" element={<TimetableView />} />
          <Route path="/unterricht" element={<Lessons />} />
          <Route path="/bedingungen" element={<Constraints />} />
          <Route path="/stammdaten" element={<Navigate to="/stammdaten/klassen" replace />} />
          <Route path="/stammdaten/:tab" element={<MasterDataPage />} />
          <Route path="/klassen" element={<Navigate to="/stammdaten/klassen" replace />} />
          <Route path="/lehrkraefte" element={<Navigate to="/stammdaten/lehrkraefte" replace />} />
          <Route path="/einstellungen" element={<Navigate to="/stammdaten/zeitraster" replace />} />
          <Route path="/daten" element={<ImportExport />} />
          <Route path="*" element={<p>Seite nicht gefunden.</p>} />
        </Routes>
      </main>
    </div>
  )
}
