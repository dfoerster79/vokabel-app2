import { useState, useRef } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useRole } from '../hooks/useRole.js'

const BUNDESLAENDER = [
  { kuerzel: 'BB', name: 'Brandenburg' },
  { kuerzel: 'BE', name: 'Berlin' },
  { kuerzel: 'BW', name: 'Baden-Württemberg' },
  { kuerzel: 'BY', name: 'Bayern' },
  { kuerzel: 'HB', name: 'Bremen' },
  { kuerzel: 'HE', name: 'Hessen' },
  { kuerzel: 'HH', name: 'Hamburg' },
  { kuerzel: 'MV', name: 'Mecklenburg-Vorpommern' },
  { kuerzel: 'NI', name: 'Niedersachsen' },
  { kuerzel: 'NW', name: 'Nordrhein-Westfalen' },
  { kuerzel: 'RP', name: 'Rheinland-Pfalz' },
  { kuerzel: 'SH', name: 'Schleswig-Holstein' },
  { kuerzel: 'SL', name: 'Saarland' },
  { kuerzel: 'SN', name: 'Sachsen' },
  { kuerzel: 'ST', name: 'Sachsen-Anhalt' },
  { kuerzel: 'TH', name: 'Thüringen' },
]

export default function SchulenImportPage() {
  const { user } = useAuthStore()
  const { rolle, loading } = useRole()

  const [log, setLog] = useState([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [stats, setStats] = useState({ imported: 0, errors: 0 })
  const [activeKuerzel, setActiveKuerzel] = useState(null)
  const [completed, setCompleted] = useState({})
  const [progress, setProgress] = useState(0)
  // debug=BY: nur Bayern importieren (für Diagnose)
  const [debugBayern, setDebugBayern] = useState(true)
  const logRef = useRef(null)

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

  const addLog = (msg) => {
    setLog(prev => [...prev, msg])
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }, 30)
  }

  const startImport = async () => {
    setRunning(true)
    setDone(false)
    setLog([])
    setStats({ imported: 0, errors: 0 })
    setActiveKuerzel(null)
    setCompleted({})
    setProgress(0)

    const url = debugBayern ? '/api/schulen-import?debug=BY' : '/api/schulen-import'
    addLog(debugBayern ? '🔍 Debug-Modus: Nur Bayern wird importiert …' : '🚀 Starte Import über Server-API …')

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        addLog(`❌ Server-Fehler ${res.status}: ${err.error || res.statusText}`)
        setRunning(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            handleEvent(evt)
          } catch {}
        }
      }
    } catch (e) {
      addLog(`❌ Netzwerk-Fehler: ${e.message}`)
    }

    setRunning(false)
    setDone(true)
  }

  const handleEvent = (evt) => {
    switch (evt.type) {
      case 'start':
        addLog(`ℹ️ Import gestartet (${evt.total} Bundesländer)`)
        break
      case 'state_start':
        setActiveKuerzel(evt.kuerzel)
        addLog(`▶ ${evt.name} …`)
        break
      case 'log':
        addLog(`  ${evt.kuerzel}: ${evt.msg}`)
        break
      case 'state_done':
        setActiveKuerzel(null)
        setCompleted(prev => ({ ...prev, [evt.kuerzel]: evt.errors === 0 ? 'ok' : 'warn' }))
        setProgress(Math.round(((evt.index + 1) / (debugBayern ? 1 : BUNDESLAENDER.length)) * 100))
        addLog(`✓ ${evt.name}: ${(evt.total || 0).toLocaleString('de-DE')} Schulen (${evt.imported} importiert, ${evt.errors} Fehler)`)
        break
      case 'done':
        setStats({ imported: evt.totalImported, errors: evt.totalErrors })
        addLog(`\n✅ Abgeschlossen: ${evt.totalImported.toLocaleString('de-DE')} Schulen importiert, ${evt.totalErrors} Fehler.`)
        setProgress(100)
        break
    }
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
          <p style={{ marginBottom: 4 }}>Datenabgleich via <strong>jedeschule.codefor.de</strong></p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Alle 16 Bundesländer werden importiert. Bestehende Schulen werden aktualisiert.
          </p>
        </div>

        {/* Debug-Toggle */}
        <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={debugBayern}
              onChange={e => setDebugBayern(e.target.checked)}
              disabled={running}
            />
            <span>🔍 <strong>Debug-Modus:</strong> Nur Bayern importieren (mit Zirndorf-Diagnose im Log)</span>
          </label>
          {!debugBayern && (
            <span style={{ fontSize: 12, color: '#d19900' }}>⚠️ Alle 16 Bundesländer werden importiert</span>
          )}
        </div>

        {/* Fortschrittsbalken */}
        {(running || done) && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {running && activeKuerzel
                  ? `⏳ Importiere: ${BUNDESLAENDER.find(b => b.kuerzel === activeKuerzel)?.name ?? activeKuerzel}`
                  : done ? '✅ Import abgeschlossen' : '⏳ Starte…'
                }
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{progress}%</span>
            </div>
            <div style={{
              height: 10, borderRadius: 999,
              background: 'var(--border)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                borderRadius: 999,
                background: done && stats.errors === 0
                  ? '#437a22'
                  : done && stats.errors > 0
                  ? '#d19900'
                  : 'var(--primary, #01696f)',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}

        {/* Bundesländer-Grid */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))',
            gap: 8,
            marginBottom: 20,
          }}>
            {BUNDESLAENDER.map(bl => {
              const status = completed[bl.kuerzel]
              const isActive = activeKuerzel === bl.kuerzel
              const isDone = !!status
              const isError = status === 'warn'
              const isSkipped = debugBayern && bl.kuerzel !== 'BY'

              return (
                <div key={bl.kuerzel} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', borderRadius: 7,
                  opacity: isSkipped ? 0.35 : 1,
                  background: isActive
                    ? 'oklch(from var(--primary, #01696f) l c h / 0.08)'
                    : isDone
                    ? isError ? 'oklch(from #d19900 l c h / 0.07)' : 'oklch(from #437a22 l c h / 0.07)'
                    : 'transparent',
                  border: isActive ? '1px solid oklch(from var(--primary, #01696f) l c h / 0.25)' : '1px solid transparent',
                  transition: 'all 0.3s ease',
                }}>
                  <span style={{
                    width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                    background: isDone
                      ? (isError ? '#d19900' : '#437a22')
                      : isActive ? 'var(--primary, #01696f)' : 'var(--border)',
                    animation: isActive ? 'blPulse 1s ease-in-out infinite' : 'none',
                  }} />
                  <span style={{
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--primary, #01696f)' : isDone ? 'var(--text)' : 'var(--text-muted)',
                  }}>{bl.name}</span>
                  {isDone && !isError && <span style={{ marginLeft: 'auto', fontSize: 11 }}>✓</span>}
                  {isError && <span style={{ marginLeft: 'auto', fontSize: 11 }}>⚠</span>}
                </div>
              )
            })}
          </div>

          <style>{`
            @keyframes blPulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.5); opacity: 0.6; }
            }
          `}</style>

          {/* Statistik */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <div style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary, #01696f)' }}>
                {stats.imported > 0 ? stats.imported.toLocaleString('de-DE') : '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Importiert</div>
            </div>
            <div style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: stats.errors > 0 ? '#d19900' : 'var(--text-muted)' }}>
                {stats.errors > 0 ? stats.errors : '0'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fehler</div>
            </div>
            <div style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-muted)' }}>
                {done ? new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Letzte Ausführung</div>
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={startImport}
            disabled={running}
            style={{ minWidth: 220 }}
          >
            {running
              ? '⏳ Import läuft…'
              : debugBayern
              ? '🔍 Bayern debuggen'
              : '▶️ Alle Bundesländer importieren'
            }
          </button>

          {done && stats.errors === 0 && (
            <p style={{ marginTop: 10, fontSize: 13, color: '#437a22' }}>
              ✅ Import erfolgreich abgeschlossen
            </p>
          )}
          {done && stats.errors > 0 && (
            <p style={{ marginTop: 10, fontSize: 13, color: '#d19900' }}>
              ⚠️ Import mit {stats.errors} Fehlern abgeschlossen
            </p>
          )}
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div className="card">
            <p className="section-title" style={{ marginBottom: 8 }}>Protokoll</p>
            <pre
              ref={logRef}
              style={{
                background: '#0d1117', color: '#e6edf3',
                border: '1px solid var(--border)', borderRadius: 8,
                padding: 16, fontSize: 13, lineHeight: 1.6,
                maxHeight: 400, overflowY: 'auto',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
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
