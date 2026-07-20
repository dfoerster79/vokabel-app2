import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/authStore.js'

export default function LernenPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // Schritt-States
  const [faecher, setFaecher] = useState([])
  const [tests, setTests] = useState([])
  
  // Auswahl-States
  const [gewaehltesFach, setGewaehltesFach] = useState('')
  const [gewaehlterTest, setGewaehlterTest] = useState('')
  const [testart, setTestart] = useState('multiple_choice')
  
  const [loadingFaecher, setLoadingFaecher] = useState(true)
  const [loadingTests, setLoadingTests] = useState(false)

  // 1. Alle verfügbaren Fächer laden
  useEffect(() => {
    supabase
      .from('faecher')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        setFaecher(data || [])
        setLoadingFaecher(false)
      })
  }, [])

  // 2. Tests laden, wenn ein Fach ausgewählt wurde
  useEffect(() => {
    if (!gewaehltesFach) {
      setTests([])
      setGewaehlterTest('')
      return
    }

    setLoadingTests(true)
    supabase
      .from('vokabel_tests')
      .select('id, name, jahrgang, buecher(name)')
      .eq('fach_id', gewaehltesFach)
      .order('jahrgang')
      .order('name')
      .then(({ data }) => {
        setTests(data || [])
        setLoadingTests(false)
        setGewaehlterTest('') // Reset der Testauswahl beim Fachwechsel
      })
  }, [gewaehltesFach])

  const handleStart = () => {
    if (!gewaehltesFach || !gewaehlterTest || !testart) return
    
    // Leitet auf die eigentliche Test-Seite weiter (die wir als Nächstes bauen)
    navigate(`/lernen/${testart}/${gewaehlterTest}`)
  }

  if (loadingFaecher) {
    return <div className="page-center">Lade Fächer...</div>
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <nav className="nav">
        <Link to="/dashboard" className="nav-logo">
          <div className="nav-logo-icon">📚</div>VokabelApp
        </Link>
        <div className="nav-actions">
          <Link to="/dashboard" className="nav-btn">← Dashboard</Link>
        </div>
      </nav>

      <div className="main-content" style={{ maxWidth: 800 }}>
        <div className="welcome-banner" style={{ marginBottom: 32 }}>
          <h2>🧠 Lernen</h2>
          <p>Wähle aus, was du heute trainieren möchtest.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* SCHRITT 1: FACH */}
          <div className="card">
            <h3 style={stepHeaderStyle}>
              <span style={stepNumberStyle}>1</span> Welches Fach?
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {faecher.map(fach => (
                <button
                  key={fach.id}
                  onClick={() => setGewaehltesFach(fach.id)}
                  style={{
                    ...cardButtonStyle,
                    borderColor: gewaehltesFach === fach.id ? 'var(--primary)' : 'var(--border)',
                    background: gewaehltesFach === fach.id ? 'var(--primary-light, #f0fdfa)' : 'var(--surface)',
                    color: gewaehltesFach === fach.id ? 'var(--primary-dark, #0f766e)' : 'var(--text)'
                  }}
                >
                  {fach.name}
                </button>
              ))}
            </div>
          </div>

          {/* SCHRITT 2: SEITE / TEST (Wird nur gezeigt, wenn Fach gewählt ist) */}
          {gewaehltesFach && (
            <div className="card" style={{ animation: 'fadeIn 0.3s ease' }}>
              <h3 style={stepHeaderStyle}>
                <span style={stepNumberStyle}>2</span> Welche Seite?
              </h3>
              {loadingTests ? (
                <p style={{ color: 'var(--text-muted)' }}>Lade Tests...</p>
              ) : tests.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>Keine Tests für dieses Fach gefunden.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                  {tests.map(test => (
                    <button
                      key={test.id}
                      onClick={() => setGewaehlterTest(test.id)}
                      style={{
                        ...cardButtonStyle,
                        textAlign: 'left',
                        borderColor: gewaehlterTest === test.id ? 'var(--primary)' : 'var(--border)',
                        background: gewaehlterTest === test.id ? 'var(--primary-light, #f0fdfa)' : 'var(--surface)',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{test.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        {test.buecher?.name || 'Ohne Buch'} (Klasse {test.jahrgang})
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SCHRITT 3: TESTART (Wird nur gezeigt, wenn Test gewählt ist) */}
          {gewaehlterTest && (
            <div className="card" style={{ animation: 'fadeIn 0.3s ease' }}>
              <h3 style={stepHeaderStyle}>
                <span style={stepNumberStyle}>3</span> Wie möchtest du lernen?
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                
                <button
                  onClick={() => setTestart('multiple_choice')}
                  style={{
                    ...cardButtonStyle,
                    borderColor: testart === 'multiple_choice' ? 'var(--primary)' : 'var(--border)',
                    background: testart === 'multiple_choice' ? 'var(--primary-light, #f0fdfa)' : 'var(--surface)',
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🎯</div>
                  <strong style={{ display: 'block' }}>Multiple Choice</strong>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Wähle aus 4 Optionen</span>
                </button>

                <button disabled style={{ ...cardButtonStyle, opacity: 0.5, cursor: 'not-allowed' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>✍️</div>
                  <strong style={{ display: 'block' }}>Schreiben</strong>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tippe die Vokabel ein</span>
                  <div style={{ fontSize: 10, marginTop: 8, color: 'var(--primary)' }}>Bald verfügbar</div>
                </button>

                <button disabled style={{ ...cardButtonStyle, opacity: 0.5, cursor: 'not-allowed' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🔄</div>
                  <strong style={{ display: 'block' }}>Vertiefen</strong>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Deine falsch gemerkten</span>
                  <div style={{ fontSize: 10, marginTop: 8, color: 'var(--primary)' }}>Bald verfügbar</div>
                </button>

              </div>
              
              <div style={{ marginTop: 32, textAlign: 'center' }}>
                <button 
                  onClick={handleStart}
                  className="btn btn-primary" 
                  style={{ fontSize: 18, padding: '16px 48px', borderRadius: 100 }}
                >
                  Jetzt Starten 🚀
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// --- Styles ---
const stepHeaderStyle = {
  fontSize: 18,
  marginBottom: 16,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  color: 'var(--text)'
}

const stepNumberStyle = {
  background: 'var(--primary)',
  color: 'white',
  width: 28,
  height: 28,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  fontWeight: 'bold'
}

const cardButtonStyle = {
  padding: '16px',
  borderRadius: '12px',
  border: '2px solid',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  outline: 'none',
  fontFamily: 'inherit'
}
