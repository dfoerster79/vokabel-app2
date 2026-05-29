import { useState, useRef } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useRole } from '../hooks/useRole.js'

const ALLE_BL = [
  { kuerzel: 'BB', name: 'Brandenburg',             aktiv: true },
  { kuerzel: 'BE', name: 'Berlin',                  aktiv: true },
  { kuerzel: 'BW', name: 'Baden-Württemberg',       aktiv: true },
  { kuerzel: 'BY', name: 'Bayern',                  aktiv: true },
  { kuerzel: 'HB', name: 'Bremen',                  aktiv: true },
  { kuerzel: 'HE', name: 'Hessen',                  aktiv: true },
  { kuerzel: 'HH', name: 'Hamburg',                 aktiv: true },
  { kuerzel: 'MV', name: 'Mecklenburg-Vorpommern',  aktiv: true },
  { kuerzel: 'NI', name: 'Niedersachsen',           aktiv: true },
  { kuerzel: 'NW', name: 'Nordrhein-Westfalen',     aktiv: true },
  { kuerzel: 'RP', name: 'Rheinland-Pfalz',         aktiv: true },
  { kuerzel: 'SH', name: 'Schleswig-Holstein',      aktiv: true },
  { kuerzel: 'SL', name: 'Saarland',                aktiv: true },
  { kuerzel: 'SN', name: 'Sachsen',                 aktiv: true },
  { kuerzel: 'ST', name: 'Sachsen-Anhalt',          aktiv: true },
  { kuerzel: 'TH', name: 'Thüringen',               aktiv: true },
]

export default function SchulenImportPage() {
  const { user } = useAuthStore()
  const { rolle, loading } = useRole()
  const [log, setLog] = useState([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [stats, setStats] = useState({ imported: 0, errors: 0 })
  const [progress, setProgress] = useState({ completed: [], active: null })
  const logRef = useRef(null)

  const addLog = (msg) => {
    setLog(prev => [...prev, msg])
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }, 30)
  }

  if (loading) return (
    <div className="page-center">
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        <p>Lade...</p>
      </div>
    </div>
  )

  const username = user?.user_metadata?.username || user?.email?.split('@')[0]
  const isAllowed = rolle === 'admin' || username === 'dfoerster'
  if (!isAllowed) return <Navigate to="/dashboard" />

  const aktiveBL = ALLE_BL.filter(bl => bl.aktiv)

  const startImport = async () => {
    setRunning(true)
    setDone(false)
    setLog([])
    setStats({ imported: 0, errors: 0 })
    setProgress({ completed: [], active: null })
    addLog('🚀 Starte Import über Server-API ...')

    try {
      const res = await fetch('/api/schulen-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        addLog(`❌ Server-Fehler ${res.status}: ${err.error || res.statusText}`)
        setRunning(false)
        return
      }

      const data = await res.json()

      if (Array.isArray(data.logs)) {
        data.logs.forEach(line => addLog(line))
      }

      setStats({ imported: data.totalImported || 0, errors: data.totalErrors || 0 })
      setProgress({ completed: aktiveBL.map(bl => bl.kuerzel), active: null })
    } catch (e) {
      addLog(`❌ Netzwerk-Fehler: ${e.message}`)
    }

    setRunning(false)
    setDone(true)
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <nav className="nav">
        <Link to="/dashboard" className="nav-logo">
          <div className="nav-logo-icon">📚</div>
          VokabelApp
        </Link>
        <div className="nav-actions">
          <span className="badge badge-admin">Admin</span>
          <Link to="/admin" className="nav-btn">← Admin</Link>
        </div>
      </nav>

      <div className="main-content">
        <div className="welcome-banner">
          <h2>🏫 Schulen-Import</h2>
          <p style={{ marginBottom: 4 }}>
            Datenabgleich via <strong>jedeschule.codefor.de</strong> API
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Alle 16 Bundesländer werden importiert. Bestehende Schulen werden aktualisiert, neue hinzugefügt.
          </p>
        </div>

        {/* Bundesländer-Übersicht */}
        <div className="card" style={{ marginBottom: 24 }}>
          <p className="section-title" style={{ marginBottom: 12 }}>
            {aktiveBL.length}/16 Bundesländer aktiv
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 16 }}>
            {ALLE_BL.map(bl => {
              const isDone = progress.completed.includes(bl.kuerzel)
              const isActive = progress.active === bl.kuerzel

              return (
                <div
                  key={bl.kuerzel}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: isActive ? 'var(--primary-light, #e8f4f5)' : 'transparent',
                  }}
                >
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: isDone ? '#437a22' : isActive ? '#01696f' : '#01696f',
                    boxShadow: isActive ? '0 0 0 3px rgba(1,105,111,0.2)' : 'none',
                    animation: isActive ? 'pulse 1s ease-in-out infinite' : 'none',
                  }} />
                  <span style={{
                    fontSize: 13,
                    color: 'var(--text)',
                    fontWeight: isActive ? 600 : 400,
                  }}>
                    {bl.name}
                  </span>
                </div>
              )
            })}
          </div>

          <style>{`
            @keyframes pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.3); opacity: 0.7; }
            }
          `}</style>

          {/* Statistik-Kacheln */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary, #01696f)' }}>{stats.imported > 0 ? stats.imported.toLocaleString('de-DE') : '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Schulen in DB</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: stats.errors > 0 ? '#a12c7b' : 'var(--text-muted)' }}>{stats.errors > 0 ? stats.errors : '0'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fehler</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-muted)' }}>{done ? new Date().toLocaleDateString('de-DE') : '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Letzter Import</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={startImport}
              disabled={running}
              style={{ minWidth: 180 }}
            >
              {running ? '⏳ Import läuft...' : '▶️ Alle Bundesländer importieren'}
            </button>
            {done && stats.errors === 0 && (
              <span style={{ fontSize: 13, color: '#437a22' }}>✅ Import erfolgreich abgeschlossen</span>
            )}
            {done && stats.errors > 0 && (
              <span style={{ fontSize: 13, color: '#a12c7b' }}>⚠️ Import mit {stats.errors} Fehlern abgeschlossen</span>
            )}
          </div>
        </div>

        {log.length > 0 && (
          <div className="card">
            <p className="section-title" style={{ marginBottom: 8 }}>Protokoll</p>
            <pre
              ref={logRef}
              style={{
                background: '#0d1117',
                color: '#e6edf3',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 16,
                fontSize: 13,
                lineHeight: 1.6,
                maxHeight: 420,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {log.join('\n')}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
