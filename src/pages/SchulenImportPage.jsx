import { useState, useRef } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useRole } from '../hooks/useRole.js'

export default function SchulenImportPage() {
  const { user } = useAuthStore()
  const { rolle, loading } = useRole()
  const [log, setLog] = useState([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [stats, setStats] = useState({ imported: 0, errors: 0 })
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

  const startImport = async () => {
    setRunning(true)
    setDone(false)
    setLog([])
    setStats({ imported: 0, errors: 0 })
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

      // Alle Log-Einträge vom Server anzeigen
      if (Array.isArray(data.logs)) {
        data.logs.forEach(line => addLog(line))
      }

      setStats({ imported: data.totalImported || 0, errors: data.totalErrors || 0 })
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
          <p>
            Importiert alle deutschen Schulen aus <strong>jedeschule.codefor.de</strong> in die Datenbank.
            Der Import läuft sicher über den Server – kein direkter Datenbankzugriff aus dem Browser.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <p style={{ marginBottom: 16, color: 'var(--text-muted)', fontSize: 14 }}>
            Alle 16 Bundesländer werden abgerufen und per Upsert in die Tabelle <code>schulen</code> geschrieben.
            Dies kann einige Minuten dauern. Bitte das Fenster nicht schließen.
          </p>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={startImport}
              disabled={running}
              style={{ minWidth: 180 }}
            >
              {running ? '⏳ Import läuft...' : '▶️ Import starten'}
            </button>

            {(running || done) && (
              <div style={{ display: 'flex', gap: 16, fontSize: 14 }}>
                <span style={{ color: 'var(--success, #437a22)' }}>✅ {stats.imported.toLocaleString('de-DE')} importiert</span>
                {stats.errors > 0 && <span style={{ color: 'var(--error, #a12c7b)' }}>⚠️ {stats.errors} Fehler</span>}
              </div>
            )}
          </div>
        </div>

        {log.length > 0 && (
          <div className="card">
            <p className="section-title" style={{ marginBottom: 8 }}>Protokoll</p>
            <pre
              ref={logRef}
              style={{
                background: 'var(--bg)',
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
