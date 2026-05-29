import { useState, useRef } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useRole } from '../hooks/useRole.js'
import { supabase } from '../lib/supabase.js'

const BUNDESLAENDER = [
  { kuerzel: 'BB', name: 'Brandenburg' },
  { kuerzel: 'BE', name: 'Berlin' },
  { kuerzel: 'BW', name: 'Baden-W\u00fcrttemberg' },
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
  { kuerzel: 'TH', name: 'Th\u00fcringen' },
]

// Neue API: https://jedeschule.codefor.de/schools/
// Parameter: state=BY, limit=500, skip=0 (paginiert)
async function fetchSchulenForState(kuerzel) {
  let all = [], skip = 0
  const limit = 500
  while (true) {
    const url = `https://jedeschule.codefor.de/schools/?state=${kuerzel}&limit=${limit}&skip=${skip}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status} fuer ${kuerzel}`)
    const items = await res.json()
    all = all.concat(Array.isArray(items) ? items : [])
    if (!Array.isArray(items) || items.length < limit) break
    skip += limit
  }
  return all
}

const BATCH = 100

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
        <div style={{ fontSize: 32, marginBottom: 12 }}>&#9203;</div>
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
    addLog('\uD83D\uDE80 Starte Schulen-Import von jedeschule.codefor.de ...')

    // Stats vorab abrufen fuer Fortschrittsanzeige
    let statsMap = {}
    try {
      const statsRes = await fetch('https://jedeschule.codefor.de/stats')
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        if (Array.isArray(statsData)) {
          statsData.forEach(s => { statsMap[s.name] = s.count })
          const gesamt = statsData.reduce((acc, s) => acc + s.count, 0)
          addLog(`\uD83D\uDCCA Gesamt: ${gesamt.toLocaleString('de-DE')} Schulen in Deutschland`)
        }
      }
    } catch (_) {
      // Stats nicht verfuegbar - kein Problem
    }

    let totalImported = 0
    let totalErrors = 0

    for (const bl of BUNDESLAENDER) {
      const expected = statsMap[bl.kuerzel] ? ` (erwartet: ${statsMap[bl.kuerzel].toLocaleString('de-DE')})` : ''
      addLog(`\u23F3 Lade ${bl.name} (${bl.kuerzel})${expected}...`)
      let schulen = []
      try {
        schulen = await fetchSchulenForState(bl.kuerzel)
        addLog(`   \u2192 ${schulen.length.toLocaleString('de-DE')} Schulen abgerufen`)
      } catch (e) {
        addLog(`   \u274C Fehler beim Abruf: ${e.message}`)
        totalErrors++
        continue
      }

      for (let i = 0; i < schulen.length; i += BATCH) {
        const batch = schulen.slice(i, i + BATCH).map(s => ({
          id:           s.id,
          name:         s.name || null,
          schulart:     s.school_type || null,
          bundesland:   bl.kuerzel,
          ort:          s.city || null,
          plz:          s.zip || null,
          strasse:      s.address || null,
          telefon:      s.phone || null,
          email:        s.email || null,
          website:      s.website || null,
          traeger:      s.provider || null,
          legal_status: s.legal_status || null,
          latitude:     s.latitude || null,
          longitude:    s.longitude || null,
        }))

        const { error } = await supabase
          .from('schulen')
          .upsert(batch, { onConflict: 'id' })

        if (error) {
          addLog(`   \u26A0\uFE0F Batch ${i / BATCH + 1} Fehler: ${error.message}`)
          totalErrors += batch.length
        } else {
          totalImported += batch.length
        }
      }

      addLog(`   \u2705 ${bl.name}: fertig`)
      setStats({ imported: totalImported, errors: totalErrors })
    }

    addLog('')
    addLog(`\uD83C\uDFC1 Import abgeschlossen: ${totalImported.toLocaleString('de-DE')} importiert, ${totalErrors} Fehler.`)
    setRunning(false)
    setDone(true)
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <nav className="nav">
        <Link to="/dashboard" className="nav-logo">
          <div className="nav-logo-icon">\uD83D\uDCDA</div>
          VokabelApp
        </Link>
        <div className="nav-actions">
          <span className="badge badge-admin">Admin</span>
          <Link to="/admin" className="nav-btn">\u2190 Admin</Link>
        </div>
      </nav>

      <div className="main-content">
        <div className="welcome-banner">
          <h2>\uD83C\uDFEB Schulen-Import</h2>
          <p>Importiert alle deutschen Schulen aus <strong>jedeschule.codefor.de</strong> in die Supabase-Datenbank.</p>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <p style={{ marginBottom: 16, color: 'var(--text-muted)', fontSize: 14 }}>
            Der Import holt alle 16 Bundesl\u00e4nder ab und schreibt die Daten per Upsert in die Tabelle <code>schulen</code>.
            Dies kann einige Minuten dauern. Bitte das Fenster nicht schlie\u00DFen.
          </p>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={startImport}
              disabled={running}
              style={{ minWidth: 180 }}
            >
              {running ? '\u23F3 Import l\u00E4uft...' : '\u25B6\uFE0F Import starten'}
            </button>

            {(running || done) && (
              <div style={{ display: 'flex', gap: 16, fontSize: 14 }}>
                <span style={{ color: 'var(--success, #437a22)' }}>\u2705 {stats.imported.toLocaleString('de-DE')} importiert</span>
                {stats.errors > 0 && <span style={{ color: 'var(--error, #a12c7b)' }}>\u26A0\uFE0F {stats.errors} Fehler</span>}
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
