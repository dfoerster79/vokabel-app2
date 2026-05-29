import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="page-center">
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🔍</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Seite nicht gefunden</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Diese Seite existiert nicht.</p>
        <Link to="/" className="btn btn-primary" style={{ maxWidth: 200, margin: '0 auto' }}>Zur Startseite</Link>
      </div>
    </div>
  )
}
