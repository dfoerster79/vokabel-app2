import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useRole } from '../hooks/useRole.js'

const menuSchueler = [
  { icon: '📝', label: 'Neuer Test', desc: 'Foto-Scan: Vokabeln aus Buch', to: '/neuer-test' },
  { icon: '🎯', label: 'Lernen', desc: 'Vokabeln üben', to: '/lernen' },
  { icon: '🏆', label: 'Rangliste', desc: 'Vergleiche dich mit anderen', to: '/rangliste' }, // <-- Hier ist die Änderung
  { icon: '🏫', label: 'Mein Kurs', desc: 'Kurseinstellungen', to: '/profil' },
]

const menuLehrer = [
  { icon: '📝', label: 'Sets verwalten', desc: 'Vokabelsets pflegen', to: '/sets' },
  { icon: '👥', label: 'Kurse', desc: 'Kurse & Schüler', to: '/kurse' },
  { icon: '📊', label: 'Ergebnisse', desc: 'Lernfortschritt', to: '/ergebnisse' },
  { icon: '⚙️', label: 'Einstellungen', desc: 'Mein Profil', to: '/profil' },
]

const rolleConfig = {
  schueler: { label: 'Schüler', badgeClass: 'badge-schueler', menu: menuSchueler, greeting: 'Was möchtest du heute lernen?' },
  lehrer:   { label: 'Lehrer',  badgeClass: 'badge-lehrer',   menu: menuLehrer,   greeting: 'Verwalte deine Kurse und Vokabelsets.' },
  admin:    { label: 'Admin',   badgeClass: 'badge-admin',    menu: menuSchueler, greeting: 'Was möchtest du heute lernen?' },
}

export default function DashboardPage() {
  const { user, logout } = useAuthStore()
  const { rolle, profile, loading } = useRole()

  const config = rolleConfig[rolle] || rolleConfig.schueler
  const vorname = profile?.vorname || user?.user_metadata?.vorname || user?.email?.split('@')[0] || 'Willkommen'
  const username = user?.user_metadata?.username || user?.email?.split('@')[0]
  const showAdminLink = rolle === 'admin' || username === 'dfoerster'

  if (loading) return (
    <div className="page-center">
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        <p>Lade Dashboard...</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <nav className="nav">
        <Link to="/dashboard" className="nav-logo">
          <div className="nav-logo-icon">📚</div>
          VokabelApp
        </Link>
        <div className="nav-actions">
          {showAdminLink ? (
            <Link
              to="/admin"
              className="badge badge-admin"
              style={{ textDecoration: 'none', cursor: 'pointer' }}
            >
              Admin
            </Link>
          ) : (
            <span className={`badge ${config.badgeClass}`}>{config.label}</span>
          )}
          <button className="nav-btn" onClick={logout}>Abmelden</button>
        </div>
      </nav>

      <div className="main-content">
        <div className="welcome-banner">
          <h2>Hallo, {vorname}! 👋</h2>
          <p>{config.greeting}</p>
          <Link
            to="/profil"
            style={{
              display: 'inline-block',
              marginTop: 10,
              fontSize: 13,
              color: 'rgba(255,255,255,0.85)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            Profil verwalten
          </Link>
        </div>

        <p className="section-title">Schnellzugriff</p>
        <div className="menu-grid">
          {config.menu.map(item => (
            <Link key={item.to} to={item.to} className="menu-card">
              <span className="menu-card-icon">{item.icon}</span>
              <span className="menu-card-label">{item.label}</span>
              <span className="menu-card-desc">{item.desc}</span>
            </Link>
          ))}
        </div>

        <p className="section-title">Letzte Aktivität</p>
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📖</div>
            <h3>Noch keine Aktivität</h3>
            <p>Erstelle dein erstes Vokabelset, um loszulegen.</p>
            <Link to="/neuer-test" className="btn btn-primary" style={{ maxWidth: 220, margin: '0 auto' }}>
              Jetzt starten
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
