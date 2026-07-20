import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/authStore.js'

export default function LernenPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // Daten
  const [faecher, setFaecher] = useState([])
  const [tests, setTests] = useState([])
  
  // Auswahl
  const [gewaehltesFach, setGewaehltesFach] = useState('')
  const [gewaehlterTest, setGewaehlterTest] = useState('')
  const [testart, setTestart] = useState('multiple_choice') // Default, kann später erweitert werden
  
  // UI States
  const [currentStep, setCurrentStep] = useState(1) // 1: Fach, 2: Test, 3: Start
  const [loadingFaecher, setLoadingFaecher] = useState(true)
  const [loadingTests, setLoadingTests] = useState(false)

  // 1. Fächer laden
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

  // 2. Tests laden, wenn Fach gewählt
  useEffect(() => {
    if (!gewaehltesFach) return
    
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
      })
  }, [gewaehltesFach])

  // Handlers
  const handleFachSelect = (fachId) => {
    setGewaehltesFach(fachId)
    setGewaehlterTest('') // Reset child
    setCurrentStep(2)
  }

  const handleTestSelect = (testId) => {
    setGewaehlterTest(testId)
    setCurrentStep(3)
  }

  const handleStart = () => {
    if (!gewaehltesFach || !gewaehlterTest || !testart) return
    navigate(`/lernen/${testart}/${gewaehlterTest}`)
  }

  if (loadingFaecher) return <div className="page-center">Lade Lernbereich...</div>

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 60 }}>
      {/* Header wie im Screenshot: weiße Leiste */}
      <div style={{ background: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--primary)', fontWeight: 'bold', fontSize: 18 }}>
          📚 VokabelApp
        </Link>
        <Link to="/dashboard" style={{ color: 'var(--text-muted)', fontSize: 14, textDecoration: 'none' }}>
          Abbrechen
        </Link>
      </div>

      <div style={{ padding: '20px' }}>
        
        {/* Grüne Info-Box */}
        <div style={{ 
          background: 'var(--primary)', 
          borderRadius: 16, 
          padding: 24, 
          color: 'white',
          marginBottom: 32
        }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            🧠 Lern-Modus
          </h2>
          <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>
            Wähle dein Fach und die Lektion, die du heute trainieren möchtest.
          </p>
        </div>

        {/* Horizontaler Stepper */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40, position: 'relative', padding: '0 10px' }}>
          
          {/* Die graue Linie im Hintergrund */}
          <div style={{ position: 'absolute', top: 16, left: 30, right: 30, height: 2, background: 'var(--border)', zIndex: 0 }} />
          {/* Die aktive grüne Linie */}
          <div style={{ 
            position: 'absolute', top: 16, left: 30, height: 2, background: 'var(--primary)', zIndex: 1,
            width: currentStep === 1 ? '0%' : currentStep === 2 ? '50%' : '100%',
            transition: 'width 0.3s ease'
          }} />

          {/* Schritt 1 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 2, cursor: 'pointer' }} onClick={() => setCurrentStep(1)}>
            <div style={getStepCircleStyle(currentStep >= 1, currentStep === 1)}>1</div>
            <span style={getStepTextStyle(currentStep >= 1)}>Fach</span>
          </div>

          {/* Schritt 2 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 2, cursor: gewaehltesFach ? 'pointer' : 'default' }} onClick={() => gewaehltesFach && setCurrentStep(2)}>
            <div style={getStepCircleStyle(currentStep >= 2, currentStep === 2)}>2</div>
            <span style={getStepTextStyle(currentStep >= 2)}>Lektion</span>
          </div>

          {/* Schritt 3 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 2, cursor: gewaehlterTest ? 'pointer' : 'default' }} onClick={() => gewaehlterTest && setCurrentStep(3)}>
            <div style={getStepCircleStyle(currentStep >= 3, currentStep === 3)}>3</div>
            <span style={getStepTextStyle(currentStep >= 3)}>Start</span>
          </div>
        </div>

        {/* --- INHALTSBEREICH JE NACH SCHRITT --- */}
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          
          {/* CONTENT SCHRITT 1 */}
          {currentStep === 1 && (
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
                FACH WÄHLEN
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
                {faecher.map(fach => (
                  <button
                    key={fach.id}
                    onClick={() => handleFachSelect(fach.id)}
                    style={{
                      ...cardStyle,
                      borderColor: gewaehltesFach === fach.id ? 'var(--primary)' : 'transparent',
                    }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{getFachIcon(fach.name)}</div>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{fach.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CONTENT SCHRITT 2 */}
          {currentStep === 2 && (
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
                LEKTION WÄHLEN
              </h3>
              
              {loadingTests ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Lade Lektionen...</div>
              ) : tests.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40, background: '#fff', borderRadius: 16 }}>
                  Keine Lektionen für dieses Fach gefunden.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {tests.map(test => (
                    <button
                      key={test.id}
                      onClick={() => handleTestSelect(test.id)}
                      style={{
                        padding: '16px 20px',
                        background: '#fff',
                        borderRadius: 16,
                        border: gewaehlterTest === test.id ? '2px solid var(--primary)' : '2px solid transparent',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--text)' }}>{test.name}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {test.buecher?.name || 'Ohne Buch'} • Klasse {test.jahrgang}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CONTENT SCHRITT 3 */}
          {currentStep === 3 && (
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
                TESTART
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 40 }}>
                <button
                  onClick={() => setTestart('multiple_choice')}
                  style={{
                    ...cardStyle,
                    borderColor: testart === 'multiple_choice' ? 'var(--primary)' : 'transparent',
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🎯</div>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>Multiple Choice</div>
                </button>

                <button disabled style={{ ...cardStyle, opacity: 0.5, cursor: 'not-allowed' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>✍️</div>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>Schreiben</div>
                  <div style={{ fontSize: 10, color: 'var(--primary)', marginTop: 4 }}>Bald verfügbar</div>
                </button>
              </div>

              <button 
                onClick={handleStart}
                className="btn btn-primary"
                style={{ width: '100%', padding: '16px', fontSize: 16, borderRadius: 16, fontWeight: 'bold' }}
              >
                Test starten 🚀
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// --- Hilfs-Funktionen & Styles ---

function getStepCircleStyle(isDone, isActive) {
  return {
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 'bold',
    background: isActive ? 'var(--primary)' : (isDone ? 'var(--primary)' : '#e5e7eb'),
    color: isDone || isActive ? '#fff' : 'var(--text-muted)',
    border: isActive ? '4px solid #ccfbf1' : '4px solid var(--bg)', // Leichter Glow-Effekt um den aktiven Kreis
    transition: 'all 0.3s ease'
  }
}

function getStepTextStyle(isDone) {
  return {
    fontSize: 12,
    fontWeight: isDone ? 600 : 500,
    color: isDone ? 'var(--text)' : 'var(--text-muted)'
  }
}

const cardStyle = {
  background: '#fff',
  padding: '24px 16px',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  border: '2px solid transparent',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'all 0.2s',
  textAlign: 'center'
}

// Hilfsfunktion für kleine Icons bei Fächern
function getFachIcon(name) {
  const n = name.toLowerCase()
  if (n.includes('englisch')) return '🇬🇧'
  if (n.includes('französisch')) return '🇫🇷'
  if (n.includes('spanisch')) return '🇪🇸'
  if (n.includes('latein')) return '🏛️'
  if (n.includes('italienisch')) return '🇮🇹'
  return '📚'
}
