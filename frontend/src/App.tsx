import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useSettings } from './data'
import Constraints from './pages/Constraints'
import ImportExport from './pages/ImportExport'
import Lessons from './pages/Lessons'
import { ClassesPage, RoomsPage, SubjectsPage, TeachersPage } from './pages/MasterData'
import SettingsPage from './pages/Settings'
import TimetableView from './pages/TimetableView'
import Timetables from './pages/Timetables'

const NAV = [
  { to: '/plaene', label: 'Pläne' },
  { to: '/unterricht', label: 'Unterricht' },
  { to: '/bedingungen', label: 'Bedingungen' },
  { to: '/klassen', label: 'Klassen' },
  { to: '/lehrkraefte', label: 'Lehrkräfte' },
  { to: '/faecher', label: 'Fächer' },
  { to: '/raeume', label: 'Räume' },
  { to: '/einstellungen', label: 'Zeitraster' },
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
          <Route path="/klassen" element={<ClassesPage />} />
          <Route path="/lehrkraefte" element={<TeachersPage />} />
          <Route path="/faecher" element={<SubjectsPage />} />
          <Route path="/raeume" element={<RoomsPage />} />
          <Route path="/einstellungen" element={<SettingsPage />} />
          <Route path="/daten" element={<ImportExport />} />
          <Route path="*" element={<p>Seite nicht gefunden.</p>} />
        </Routes>
      </main>
    </div>
  )
}
