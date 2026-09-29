import { NavLink, useLocation } from 'react-router-dom'
import { Check, FileSpreadsheet, Folder, Layers, Plus, Scale, Settings } from 'lucide-react'
import { useData } from '../hooks/useData'

export function TopNav() {
  const { records } = useData()
  const location = useLocation()
  const pending = records.filter((r) => r.status === 'Pending Review').length
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/)
  const measureHref = projectMatch ? `/measure?project=${projectMatch[1]}` : '/measure'
  const cls = ({ isActive }: { isActive: boolean }) => `nav-pill${isActive ? ' active' : ''}`

  return (
    <header className="topnav">
      <NavLink to="/" className="brand" end>
        <span className="brand-mark" aria-hidden="true">
          <Scale size={18} />
        </span>
        <span className="brand-name">Weight Data Manager</span>
      </NavLink>
      <nav className="nav-pills" aria-label="Primary">
        <NavLink to="/" end className={({ isActive }) => cls({ isActive: isActive || location.pathname.startsWith('/projects') })}>
          <Folder size={15} aria-hidden="true" /> Projects
        </NavLink>
        <NavLink to="/records" className={cls}>
          <Layers size={15} aria-hidden="true" /> All records
        </NavLink>
        <NavLink to="/review" className={cls}>
          <Check size={15} aria-hidden="true" /> Review
          {pending ? (
            <span className="nav-badge" aria-label={`${pending} pending`}>
              {pending}
            </span>
          ) : null}
        </NavLink>
        <NavLink to="/export" className={cls}>
          <FileSpreadsheet size={15} aria-hidden="true" /> Import / Export
        </NavLink>
        <NavLink to="/settings" className={cls}>
          <Settings size={15} aria-hidden="true" /> Settings
        </NavLink>
      </nav>
      <span className="grow" />
      <NavLink to={measureHref} className="button primary-cta">
        <Plus size={16} aria-hidden="true" /> Start measuring
      </NavLink>
    </header>
  )
}
