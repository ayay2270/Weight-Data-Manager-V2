import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { RecordActionsProvider } from './components/RecordActionsProvider'
import { TopNav } from './components/TopNav'
import { DataProvider } from './hooks/useData'
import { AllRecordsPage } from './pages/AllRecordsPage'
import { ExportPage } from './pages/ExportPage'
import { MeasurementSessionPage } from './pages/MeasurementSessionPage'
import { ProjectsHomePage } from './pages/ProjectsHomePage'
import { ProjectWorkspacePage } from './pages/ProjectWorkspacePage'
import { ReviewSessionPage } from './pages/ReviewSessionPage'
import { SettingsPage } from './pages/SettingsPage'

/** Old V1 URL → V2 All records (keeps ?project= links working). */
function LegacyWeightDataRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/records${search}`} replace />
}

/** Remount the review session when it is opened with a different ?id= / ?ids= / ?project=. */
function ReviewRoute() {
  const { search } = useLocation()
  return <ReviewSessionPage key={search} />
}

export default function App() {
  return (
    <DataProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <RecordActionsProvider>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <div className="app-shell">
            <TopNav />
            <main className="main" id="main" tabIndex={-1}>
              <Routes>
                <Route path="/" element={<ProjectsHomePage />} />
                <Route path="/projects" element={<Navigate to="/" replace />} />
                <Route path="/projects/:projectId" element={<ProjectWorkspacePage />} />
                <Route path="/projects/:projectId/:tab" element={<ProjectWorkspacePage />} />
                <Route path="/records" element={<AllRecordsPage />} />
                <Route path="/weight-data" element={<LegacyWeightDataRedirect />} />
                <Route path="/measure" element={<MeasurementSessionPage />} />
                <Route path="/review" element={<ReviewRoute />} />
                <Route path="/export" element={<ExportPage />} />
                <Route path="/import-export" element={<Navigate to="/export" replace />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </RecordActionsProvider>
      </BrowserRouter>
    </DataProvider>
  )
}
