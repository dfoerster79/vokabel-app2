import { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useRole } from '../hooks/useRole.js'
import { useAuthStore } from '../store/authStore.js'

const BUNDESLAENDER = [
  { kuerzel: 'BW', name: 'Baden-Württemberg' }, { kuerzel: 'BY', name: 'Bayern' },
  { kuerzel: 'BE', name: 'Berlin' }, { kuerzel: 'BB', name: 'Brandenburg' },
  { kuerzel: 'HB', name: 'Bremen' }, { kuerzel: 'HH', name: 'Hamburg' },
  { kuerzel: 'HE', name: 'Hessen' }, { kuerzel: 'MV', name: 'Mecklenburg-Vorpommern' },
  { kuerzel: 'NI', name: 'Niedersachsen' }, { kuerzel: 'NW', name: 'Nordrhein-Westfalen' },
  { kuerzel: 'RP', name: 'Rheinland-Pfalz' }, { kuerzel: 'SL', name: 'Saarland' },
  { kuerzel: 'SN', name: 'Sachsen' }, { kuerzel: 'ST', name: 'Sachsen-Anhalt' },
  { kuerzel: 'SH', name: 'Schleswig-Holstein' }, { kuerzel: 'TH', name: 'Thüringen' },
]

const SCHULARTEN = ['Gymnasium', 'Realschule', 'Mittelschule', 'Gesamtschule', 'Hauptschule', 'Grundschule']
const JAHRGAENGE = [5, 6, 7, 8, 9, 10, 11, 12, 13]

export default function AdminFachuebersichtPage() {
const { user } = useAuthStore()
const { rolle, loading: roleLoading } = useRole()

  const [faecher, setFaecher] = useState([])
  
  // Filter-States
  const [filterBundesland, setFilterBundesland] = useState('')
  const [filterSchulart, setFilterSchulart] = useState('')
  const [filterFach, setFilterFach] = useState('')
  const [filterJahrgang, setFilterJahrgang] = useState('')

  // Ergebnisse
  const [ergebnisse, setErgebnisse] = useState([])
  const [loadingDaten, setLoadingDaten] = useState(false)
  const [expandedBooks, setExpandedBooks] = useState({})

  const toggleBook = (buchName) => {
    setExpandedBooks(prev => ({
      ...prev,
      [buchName]: !prev[buchName]
    }))
  }

  const username = user?.user_metadata?.username || user?.email?.split('@')[0]
  const isAllowed = rolle === 'admin' || username === 'dfoerster'
  // 2. Fächer laden für Dropdown
  useEffect(() => {
    supabase.from('faecher').select('id, name').order('name')
      .then(({ data }) => setFaecher(data || []))
  }, [])

  // 3. Daten abrufen, wenn sich ein Filter ändert
  useEffect(() => {
    const ladeDaten = async () => {
      setLoadingDaten(true)

      // Supabase Query: Wir holen Tests und joinen Bücher, Fächer und Schulen.
      // !inner bei schulen bedeutet: Filtere die Tests so, dass nur die mit der passenden Schule bleiben.
      let query = supabase
        .from('vokabel_tests')
        .select(`
          id,
          name,
          jahrgang,
          buecher ( id, name ),
          faecher ( id, name ),
          schulen!inner ( id, name, bundesland, schulart )
        `)

      if (filterBundesland) query = query.eq('schulen.bundesland', filterBundesland)
      if (filterSchulart) query = query.eq('schulen.schulart', filterSchulart)
      if (filterFach) query = query.eq('fach_id', filterFach)
      if (filterJahrgang) query = query.eq('jahrgang', parseInt(filterJahrgang))

      const { data, error } = await query

      if (error) {
        console.error("Fehler beim Laden:", error)
        setErgebnisse([])
      } else {
        setErgebnisse(data || [])
      }
      
      setLoadingDaten(false)
    }

    ladeDaten()
  }, [filterBundesland, filterSchulart, filterFach, filterJahrgang])

  // 4. Daten gruppieren nach Lehrbuch
  const gruppiertNachBuch = ergebnisse.reduce((acc, test) => {
    const buchName = test.buecher?.name || 'Ohne Buch'
    if (!acc[buchName]) {
      acc[buchName] = { 
        count: 0, 
        schulen: new Set(),
        tests: []
      }
    }
    acc[buchName].count++
    acc[buchName].tests.push(test)
    if (test.schulen?.name) acc[buchName].schulen.add(test.schulen.name)
    return acc
  }, {})

 if (roleLoading) return <div className="page-center">Lade...</div>
 if (!isAllowed) return <Navigate to="/dashboard" />

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <nav className="nav">
        <div className="nav-logo">
          <div className="nav-logo-icon">👑</div>Admin-Bereich
        </div>
        <div className="nav-actions">
          <Link to="/dashboard" className="nav-btn">← Dashboard</Link>
        </div>
      </nav>

      <div className="main-content">
        <div className="welcome-banner" style={{ marginBottom: 24, background: '#f3e8ff', color: '#6b21a8' }}>
          <h2>📊 Fach- & Buchübersicht</h2>
          <p>Finde heraus, welche Bücher in welchem Bundesland/Jahrgang verwendet werden.</p>
        </div>

        {/* --- FILTER-BEREICH --- */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 16 }}>Filter</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            
            <div>
              <label style={labelStyle}>Bundesland</label>
              <select className="input" value={filterBundesland} onChange={e => setFilterBundesland(e.target.value)} style={{ width: '100%' }}>
                <option value="">Alle Bundesländer</option>
                {BUNDESLAENDER.map(b => <option key={b.kuerzel} value={b.kuerzel}>{b.name}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Schulart</label>
              <select className="input" value={filterSchulart} onChange={e => setFilterSchulart(e.target.value)} style={{ width: '100%' }}>
                <option value="">Alle Schularten</option>
                {SCHULARTEN.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Fach</label>
              <select className="input" value={filterFach} onChange={e => setFilterFach(e.target.value)} style={{ width: '100%' }}>
                <option value="">Alle Fächer</option>
                {faecher.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Jahrgang</label>
              <select className="input" value={filterJahrgang} onChange={e => setFilterJahrgang(e.target.value)} style={{ width: '100%' }}>
                <option value="">Alle Jahrgänge</option>
                {JAHRGAENGE.map(j => <option key={j} value={j}>Klasse {j}</option>)}
              </select>
            </div>

          </div>
        </div>

        {/* --- ERGEBNIS-BEREICH --- */}
        <div>
          <h3 style={{ fontSize: 18, marginBottom: 16 }}>Ergebnisse ({ergebnisse.length} Tests gefunden)</h3>
          
          {loadingDaten ? (
            <p style={{ color: 'var(--text-muted)' }}>Daten werden geladen...</p>
          ) : Object.keys(gruppiertNachBuch).length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              Keine Tests für diese Filterkombination gefunden.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                         {Object.entries(gruppiertNachBuch).map(([buchName, daten]) => {
                const isExpanded = expandedBooks[buchName]

                return (
                  <div key={buchName} className="card" style={{ borderLeft: '4px solid var(--primary)', transition: 'all 0.2s' }}>
                    {/* Der klickbare Header-Bereich */}
                    <div 
                      onClick={() => toggleBook(buchName)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
                    >
                      <div>
                        <h4 style={{ fontSize: 18, margin: '0 0 8px 0', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14, opacity: 0.7 }}>{isExpanded ? '▼' : '▶'}</span> 📚 {buchName}
                        </h4>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                          Wird an <strong>{daten.schulen.size} Schule(n)</strong> in dieser Filterkombination genutzt.
                        </p>
                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                          <strong>Schulen:</strong> {Array.from(daten.schulen).join(', ')}
                        </div>
                      </div>
                      <div style={{ 
                        background: 'var(--bg)', 
                        padding: '8px 16px', 
                        borderRadius: 8, 
                        textAlign: 'center',
                        fontWeight: 'bold',
                        color: 'var(--primary)'
                      }}>
                        <div style={{ fontSize: 24 }}>{daten.count}</div>
                        <div style={{ fontSize: 11, textTransform: 'uppercase' }}>Tests</div>
                      </div>
                    </div>

                    {/* Der aufklappbare Detail-Bereich */}
                    {isExpanded && (
                      <div style={{ 
                        marginTop: 20, 
                        paddingTop: 16, 
                        borderTop: '1px solid var(--border)',
                        animation: 'fadeIn 0.3s ease'
                      }}>
                        <h5 style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--text)' }}>
                          Erfasste Tests / Seiten für dieses Buch:
                        </h5>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {daten.tests.map(test => (
                            <div key={test.id} style={{
                              padding: '10px 12px',
                              background: 'var(--bg)',
                              borderRadius: 6,
                              fontSize: 13,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              border: '1px solid var(--border)'
                            }}>
                              <div>
                                <strong style={{ color: 'var(--primary)' }}>{test.name}</strong> 
                                <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                                  (Klasse {test.jahrgang})
                                </span>
                              </div>
                              <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'right' }}>
                                🏫 {test.schulen?.name || 'Unbekannte Schule'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

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
