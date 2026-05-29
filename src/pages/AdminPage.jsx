import { Link, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useRole } from '../hooks/useRole.js'

const adminSections = [
  {
    title: 'Verwaltung',
    items: [
      { icon: '👤', label: 'Benutzer',  desc: 'Nutzer & Rollen',     to: '/admin/benutzer' },
      { icon: '🏫', label: 'Schulen',  desc: 'Schulen verwalten',  to: '/admin/schulen' },
      { icon: '📚', label: 'Fächer',   desc: 'Fächer & Kurse',     to: '/admin/faecher' },
      { icon: '⚙️',  label: 'System',   desc: 'App-Einstellungen', to: '/admin/system' },
    ],
  },
  {
    title: 'Datenimport',
    items: [
      { icon: '🏫', label: 'Schulen-Import', desc: 'Schulen aus jedeschule.de importieren', to: '/admin/schulen-import' },
      { icon: '🗺️',  label: 'Orte-Import',   desc: 'Orte mit PLZ und Bundesland importieren', to: '/admin/orte-import' },
    ],
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

        {adminSections.map(section => (
          <div key={section.title}>
            <p className="section-title">{section.title}</p>
            <div className="menu-grid">
              {section.items.map(item => (
                <Link key={item.to} to={item.to} className="menu-card">
                  <span className="menu-card-icon">{item.icon}</span>
                  <span className="menu-card-label">{item.label}</span>
                  <span className="menu-card-desc">{item.desc}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
