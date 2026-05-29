import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useRole } from '../hooks/useRole.js'
import { Navigate } from 'react-router-dom'

const adminTools = [
  {
    icon: '🏫',
    label: 'Schulen-Import',
    desc: 'Schulen aus jedeschule.de in die Datenbank importieren',
    to: '/admin/schulen-import',
    badge: 'Datenimport',
  },
  {
    icon: '🗺️',
    label: 'Orte-Import',
    desc: 'Orte mit PLZ und Bundesland-Zuordnung importieren',
    to: '/admin/orte-import',
    badge: 'Datenimport',
  },
]

export default function AdminPage() {
  const { user } = useAuthStore()
  const { rolle, loading } = useRole()

  if (loading) return (
    <div className="page-center">
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        <p>Lade Admin-Bereich...</p>
      </div>
    </div>
  )

  const username = user?.user_metadata?.username || user?.email?.split('@')[0]
  const isAllowed = rolle === 'admin' || username === 'dfoerster'
  if (!isAllowed) return <Navigate to="/dashboard" />

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <nav className="nav">
        <Link to="/dashboard" className="nav-logo">
          <div className="nav-logo-icon">📚</div>
          VokabelApp
        </Link>
        <div className="nav-actions">
          <span className="badge badge-admin">Admin</span>
          <Link to="/dashboard" className="nav-btn">← Dashboard</Link>
        </div>
      </nav>

      <div className="main-content">
        <div className="welcome-banner">
          <h2>⚙️ Admin-Bereich</h2>
          <p>Verwaltungswerkzeuge für den Betrieb der App.</p>
        </div>

        <p className="section-title">Verfügbare Tools</p>
        <div className="menu-grid">
          {adminTools.map(tool => (
            <Link key={tool.to} to={tool.to} className="menu-card">
              <span className="menu-card-icon">{tool.icon}</span>
              <span className="menu-card-label">{tool.label}</span>
              <span className="menu-card-desc">{tool.desc}</span>
              {tool.badge && (
                <span style={{
                  marginTop: 8,
                  display: 'inline-block',
                  fontSize: 11,
                  background: 'var(--primary)',
                  color: '#fff',
                  borderRadius: 99,
                  padding: '2px 10px',
                  fontWeight: 600,
                  letterSpacing: '0.03em',
                }}>{tool.badge}</span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
