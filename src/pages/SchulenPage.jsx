import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useRole } from '../hooks/useRole.js'
import { supabase } from '../lib/supabase.js'

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

const PAGE_SIZE = 50

// Hilfsfunktion: alle Zeilen einer Supabase-Query ohne 1000er-Limit holen
async function fetchAll(buildQuery) {
  const BATCH = 1000
  let offset = 0
  let all = []
  while (true) {
    const { data, error } = await buildQuery(offset, BATCH)
    if (error || !data || data.length === 0) break
    all = all.concat(data)
    if (data.length < BATCH) break
    offset += BATCH
  }
  return all
}

export default function SchulenPage() {
  const { user } = useAuthStore()
  const { rolle, loading: roleLoading } = useRole()

  // Filter-Zustände
  const [bundesland, setBundesland] = useState('')
  const [ortInput, setOrtInput] = useState('')       // was der User tippt
  const [ortSelected, setOrtSelected] = useState('') // bestätigter Ort
  const [schulart, setSchulart] = useState('')
  const [suche, setSuche] = useState('')
  const [sucheInput, setSucheInput] = useState('')

  // Autocomplete
  const [ortVorschlaege, setOrtVorschlaege] = useState([])
  const [showVorschlaege, setShowVorschlaege] = useState(false)
  const ortRef = useRef(null)

  // Schularten (nur nach Ort-Auswahl)
  const [schularten, setSchularten] = useState([])

  // Ergebnisse
  const [schulen, setSchulen] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [dataLoading, setDataLoading] = useState(false)

  const username = user?.user_metadata?.username || user?.email?.split('@')[0]
  const isAllowed = rolle === 'admin' || username === 'dfoerster'

  // Klick außerhalb schließt Vorschlagsliste
  useEffect(() => {
    const handler = (e) => {
      if (ortRef.current && !ortRef.current.contains(e.target)) {
        setShowVorschlaege(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Wenn Bundesland wechselt: Ort + Schulart zurücksetzen
  useEffect(() => {
    setOrtInput('')
    setOrtSelected('')
    setSchulart('')
    setSchularten([])
    setOrtVorschlaege([])
  }, [bundesland])

  // Ort-Vorschläge laden wenn User tippt (mind. 1 Zeichen, Bundesland gewählt)
  useEffect(() => {
    if (!bundesland || ortInput.length < 1) {
      setOrtVorschlaege([])
      setShowVorschlaege(false)
      return
    }
    // Wenn der User noch den zuletzt gewählten Ort im Feld hat, keine Vorschläge
    if (ortInput === ortSelected) return

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('schulen')
        .select('ort')
        .eq('bundesland', bundesland)
        .ilike('ort', `%${ortInput}%`)
        .not('ort', 'is', null)
        .order('ort')
        .limit(200)
      const unique = [...new Set((data || []).map(r => r.ort).filter(Boolean))].sort()
      setOrtVorschlaege(unique)
      setShowVorschlaege(unique.length > 0)
    }, 220)
    return () => clearTimeout(timer)
  }, [ortInput, bundesland, ortSelected])

  // Schularten vollständig laden wenn Ort bestätigt wurde
  useEffect(() => {
    setSchulart('')
    setSchularten([])
    if (!bundesland || !ortSelected) return
    fetchAll((offset, limit) =>
      supabase
        .from('schulen')
        .select('schulart')
        .eq('bundesland', bundesland)
        .eq('ort', ortSelected)
        .not('schulart', 'is', null)
        .order('schulart')
        .range(offset, offset + limit - 1)
    ).then(rows => {
      const unique = [...new Set(rows.map(r => r.schulart).filter(Boolean))].sort()
      setSchularten(unique)
    })
  }, [bundesland, ortSelected])

  // Schulen laden
  const loadSchulen = useCallback(async (pg = 0) => {
    setDataLoading(true)
    const from = pg * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let q = supabase
      .from('schulen')
      .select('id, name, schulart, ort, bundesland, adresse', { count: 'exact' })

    if (bundesland)   q = q.eq('bundesland', bundesland)
    if (ortSelected)  q = q.eq('ort', ortSelected)
    if (schulart)     q = q.eq('schulart', schulart)
    if (suche)        q = q.ilike('name', `%${suche}%`)

    q = q.order('name').range(from, to)

    const { data, count, error } = await q
    if (!error) {
      setSchulen(data || [])
      setTotal(count || 0)
    }
    setDataLoading(false)
  }, [bundesland, ortSelected, schulart, suche])

  useEffect(() => {
    setPage(0)
    loadSchulen(0)
  }, [loadSchulen])

  const handleOrtSelect = (o) => {
    setOrtInput(o)
    setOrtSelected(o)
    setShowVorschlaege(false)
    setSchulart('')
  }

  const handleOrtClear = () => {
    setOrtInput('')
    setOrtSelected('')
    setSchulart('')
    setSchularten([])
  }

  const handlePageChange = (newPage) => {
    setPage(newPage)
    loadSchulen(newPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSucheSubmit = (e) => {
    e.preventDefault()
    setSuche(sucheInput.trim())
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (roleLoading) return (
    <div className="page-center">
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        <p>Lade...</p>
      </div>
    </div>
  )

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
          <Link to="/admin" className="nav-btn">← Admin</Link>
        </div>
      </nav>

      <div className="main-content">
        <div className="welcome-banner">
          <h2>🏫 Schulen</h2>
          <p>Schulen nach Bundesland, Ort und Schulart filtern oder nach Name suchen.</p>
        </div>

        {/* Filter-Bereich */}
        <div className="card" style={{ marginBottom: 20 }}>
          {/* Freitext-Suche */}
          <form onSubmit={handleSucheSubmit} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              type="text"
              className="input"
              placeholder="Schulname suchen…"
              value={sucheInput}
              onChange={e => setSucheInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary" style={{ minWidth: 90 }}>
              🔍 Suchen
            </button>
            {suche && (
              <button
                type="button"
                className="btn"
                onClick={() => { setSuche(''); setSucheInput('') }}
                style={{ minWidth: 80 }}
              >
                ✕ Reset
              </button>
            )}
          </form>

          {/* Dropdown + Ort-Suche + Schulart */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>

            {/* Bundesland */}
            <div>
              <label style={labelStyle}>Bundesland</label>
              <select
                className="input"
                value={bundesland}
                onChange={e => setBundesland(e.target.value)}
              >
                <option value="">Alle Bundesländer</option>
                {BUNDESLAENDER.map(bl => (
                  <option key={bl.kuerzel} value={bl.kuerzel}>{bl.name}</option>
                ))}
              </select>
            </div>

            {/* Ort – Autocomplete-Suchfeld */}
            <div ref={ortRef} style={{ position: 'relative' }}>
              <label style={labelStyle}>Ort</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="input"
                  placeholder={bundesland ? 'Ort suchen…' : 'Erst Bundesland wählen'}
                  value={ortInput}
                  disabled={!bundesland}
                  onChange={e => {
                    setOrtInput(e.target.value)
                    if (ortSelected && e.target.value !== ortSelected) {
                      setOrtSelected('')
                      setSchulart('')
                      setSchularten([])
                    }
                  }}
                  onFocus={() => ortVorschlaege.length > 0 && setShowVorschlaege(true)}
                  style={{
                    width: '100%',
                    paddingRight: ortInput ? 28 : undefined,
                    opacity: !bundesland ? 0.5 : 1,
                    cursor: !bundesland ? 'not-allowed' : 'text',
                  }}
                />
                {ortInput && bundesland && (
                  <button
                    type="button"
                    onClick={handleOrtClear}
                    style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, padding: 2,
                    }}
                    aria-label="Ort zurücksetzen"
                  >✕</button>
                )}
              </div>
              {/* Vorschlagsliste */}
              {showVorschlaege && ortVorschlaege.length > 0 && (
                <ul style={{
                  position: 'absolute', zIndex: 100, top: '100%', left: 0, right: 0,
                  background: 'var(--surface, #fff)',
                  border: '1px solid var(--border)',
                  borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  maxHeight: 220, overflowY: 'auto',
                  margin: 0, padding: 0, listStyle: 'none',
                }}>
                  {ortVorschlaege.map(o => (
                    <li
                      key={o}
                      onMouseDown={() => handleOrtSelect(o)}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', fontSize: 14,
                        borderBottom: '1px solid var(--border)',
                        background: o === ortSelected ? 'oklch(from var(--primary,#01696f) l c h / 0.10)' : 'transparent',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'oklch(from var(--primary,#01696f) l c h / 0.07)'}
                      onMouseLeave={e => e.currentTarget.style.background = o === ortSelected ? 'oklch(from var(--primary,#01696f) l c h / 0.10)' : 'transparent'}
                    >
                      {o}
                    </li>
                  ))}
                </ul>
              )}
              {/* Hinweis wenn Ort getippt aber nicht ausgewählt */}
              {ortInput && !ortSelected && bundesland && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  Ort aus der Liste wählen
                </p>
              )}
            </div>

            {/* Schulart */}
            <div>
              <label style={labelStyle}>Schulart</label>
              <select
                className="input"
                value={schulart}
                onChange={e => setSchulart(e.target.value)}
                disabled={!ortSelected || schularten.length === 0}
                style={{ opacity: !ortSelected ? 0.5 : 1, cursor: !ortSelected ? 'not-allowed' : 'default' }}
              >
                <option value="">{!ortSelected ? 'Erst Ort wählen' : 'Alle Schularten'}</option>
                {schularten.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Treffer-Zeile + obere Paginierung */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            {dataLoading ? '⏳ Lade…' : (
              <>
                <strong style={{ color: 'var(--text)' }}>{total.toLocaleString('de-DE')}</strong> Schulen gefunden
                {totalPages > 1 && ` · Seite ${page + 1} von ${totalPages}`}
              </>
            )}
          </p>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn" onClick={() => handlePageChange(page - 1)} disabled={page === 0} style={{ padding: '4px 10px', fontSize: 13 }}>‹ Zurück</button>
              <button className="btn" onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages - 1} style={{ padding: '4px 10px', fontSize: 13 }}>Weiter ›</button>
            </div>
          )}
        </div>

        {/* Tabelle */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {dataLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
              <p>Lade Schulen…</p>
            </div>
          ) : schulen.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏫</div>
              <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Keine Schulen gefunden</p>
              <p style={{ fontSize: 13 }}>Filter oder Suche anpassen.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Schulart</th>
                    <th style={thStyle}>Ort</th>
                    <th style={thStyle}>Adresse</th>
                  </tr>
                </thead>
                <tbody>
                  {schulen.map((s, i) => (
                    <tr
                      key={s.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: i % 2 === 0 ? 'transparent' : 'var(--bg)',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'oklch(from var(--primary, #01696f) l c h / 0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--bg)'}
                    >
                      <td style={tdStyle}><strong>{s.name || '–'}</strong></td>
                      <td style={tdStyle}>
                        {s.schulart ? (
                          <span style={{
                            display: 'inline-block',
                            background: 'oklch(from var(--primary, #01696f) l c h / 0.10)',
                            color: 'var(--primary, #01696f)',
                            borderRadius: 4,
                            padding: '2px 7px',
                            fontSize: 12,
                            fontWeight: 500,
                          }}>{s.schulart}</span>
                        ) : '–'}
                      </td>
                      <td style={tdStyle}>{s.ort || '–'}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 13 }}>{s.adresse || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Untere Paginierung */}
        {totalPages > 1 && !dataLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
            <button className="btn" onClick={() => handlePageChange(0)} disabled={page === 0} style={{ padding: '4px 10px', fontSize: 13 }}>«</button>
            <button className="btn" onClick={() => handlePageChange(page - 1)} disabled={page === 0} style={{ padding: '4px 10px', fontSize: 13 }}>‹ Zurück</button>
            <span style={{ padding: '4px 12px', fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>Seite {page + 1} / {totalPages}</span>
            <button className="btn" onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages - 1} style={{ padding: '4px 10px', fontSize: 13 }}>Weiter ›</button>
            <button className="btn" onClick={() => handlePageChange(totalPages - 1)} disabled={page >= totalPages - 1} style={{ padding: '4px 10px', fontSize: 13 }}>»</button>
          </div>
        )}
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  color: 'var(--text-muted)',
  marginBottom: 4,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const thStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '10px 14px',
  verticalAlign: 'top',
}
