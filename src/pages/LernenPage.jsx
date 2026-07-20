import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/authStore.js'

// Hardcoded Farben, passend zu Ihrem Foto-Test Screenshot
const BRAND_COLOR = '#0f5156' // Das dunkle Tannengrün
const BRAND_LIGHT = '#e6f0f1' // Sehr helles Tannengrün für Hover/Active Backgrounds

export default function LernenPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // Daten
  const [faecher, setFaecher] = useState([])
  const [tests, setTests] = useState([])
  
  // Auswahl
  const [gewaehltesFach, setGewaehltesFach] = useState('')
  const [gewaehlterTest, setGewaehlterTest] = useState('')
  const [testart, setTestart] = useState('multiple_choice')
  
  // UI States
  const [currentStep, setCurrentStep] = useState(1)
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
    setGewaehlterTest('') 
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
    <div style={{ minHeight: '100dvh', background: '#f8fafc', paddingBottom: 60 }}>
      {/* Navbar - Cleaner weißer Header */}
      <div style={{ background: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: BRAND_COLOR, fontWeight: '700', fontSize: 18 }}>
          📚 VokabelApp
        </Link>
        <Link to="/dashboard" style={{ color: '#64748b', fontSize: 14, textDecoration: 'none' }}>
          Abbrechen
        </Link>
      </div>

      <div style={{ padding: '20px', maxWidth: 600, margin: '0 auto' }}>
        
        {/* Dunkelgrüne Info-Box wie im Screenshot */}
        <div style={{ 
          background: BRAND_COLOR, 
          borderRadius: 16, 
          padding: 24, 
          color: 'white',
          marginBottom: 32,
          boxShadow: '0 4px 12px rgba(15, 81, 86, 0.15)'
        }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: 20, display: 'flex', alignItems: 'center', gap: 8, fontWeight: '700' }}>
            🧠 Lern-Modus
          </h2>
          <p style={{ margin: 0, fontSize: 15, opacity: 0.9, lineHeight: 1.4 }}>
            Wähle dein Fach und die Lektion, die du heute trainieren möchtest.
          </p>
        </div>

        {/* Horizontaler Stepper - Exakt wie im Foto-Test */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40, position: 'relative', padding: '0 10px' }}>
          
          {/* Graue Linie */}
          <div style={{ position: 'absolute', top: 16, left: 30, right: 30, height: 2, background: '#e2e8f0', zIndex: 0 }} />
          {/* Aktive Linie */}
          <div style={{ 
            position: 'absolute', top: 16, left: 30, height: 2, background: BRAND_COLOR, zIndex: 1,
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

        {/* --- INHALTSBEREICH --- */}
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          
          {/* CONTENT SCHRITT 1 */}
          {currentStep === 1 && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16, paddingLeft: 4 }}>
                FACH WÄHLEN
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
                {faecher.map(fach => (
                  <button
                    key={fach.id}
                    onClick={() => handleFachSelect(fach.id)}
                    style={getCardStyle(gewaehltesFach === fach.id)}
                  >
                    <div style={{ fontSize: 28, marginBottom: 12 }}>{getFachIcon(fach.name)}</div>
                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>{fach.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CONTENT SCHRITT 2 */}
          {currentStep === 2 && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16, paddingLeft: 4 }}>
                LEKTION WÄHLEN
              </h3>
              
              {loadingTests ? (
                <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>Lade Lektionen...</div>
              ) : tests.length === 0 ? (
                <div style={{ color: '#64748b', textAlign: 'center', padding: 40, background: '#fff', borderRadius: 16 }}>
                  Keine Lektionen für dieses Fach gefunden.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {tests.map(test => (
                    <button
                      key={test.id}
                      onClick={() => handleTestSelect(test.id)}
                      style={{
                        ...getCardStyle(gewaehlterTest === test.id),
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        padding: '16px 20px',
                        gap: 4
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 16, color: '#1e293b' }}>{test.name}</span>
                      <span style={{ fontSize: 13, color: '#64748b' }}>
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
              <h3 style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16, paddingLeft: 4 }}>
                TESTART WÄHLEN
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 40 }}>
                <button
                  onClick={() => setTestart('multiple_choice')}
                  style={getCardStyle(testart === 'multiple_choice')}
                >
                  <div style={{ fontSize: 28, marginBottom: 12 }}>🎯</div>
                  <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>Multiple Choice</div>
                </button>

                <button disabled style={{ ...getCardStyle(false), opacity: 0.5, cursor: 'not-allowed' }}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>✍️</div>
                  <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>Schreiben</div>
                  <div style={{ fontSize: 11, color: BRAND_COLOR, marginTop: 6, fontWeight: 600 }}>Bald verfügbar</div>
                </button>
              </div>

              <button 
                onClick={handleStart}
                style={{ 
                  width: '100%', 
                  padding: '16px', 
                  fontSize: 16, 
                  borderRadius: 16, 
                  fontWeight: 'bold',
                  background: BRAND_COLOR,
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(15, 81, 86, 0.2)'
                }}
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

// --- Hilfs-Funktionen ---

function getStepCircleStyle(isDone, isActive) {
  // Das exakte Styling aus dem Screenshot: aktiver Kreis hat einen hellgrünen Glow-Rand (box-shadow/border)
  return {
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 'bold',
    background: isActive || isDone ? BRAND_COLOR : '#fff',
    color: isActive || isDone ? '#fff' : '#94a3b8',
    border: isActive ? '4px solid #ccfbf1' : '4px solid transparent',
    boxShadow: (!isActive && !isDone) ? 'inset 0 0 0 1px #cbd5e1' : 'none',
    transition: 'all 0.3s ease'
  }
}

function getStepTextStyle(isDone) {
  return {
    fontSize: 13,
    fontWeight: isDone ? 600 : 500,
    color: isDone ? '#1e293b' : '#94a3b8'
  }
}

function getCardStyle(isActive) {
  return {
    background: '#fff',
    padding: '24px 16px',
    borderRadius: 16,
    boxShadow: isActive ? `0 0 0 2px ${BRAND_COLOR}` : '0 1px 3px rgba(0,0,0,0.05)',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'center',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent'
  }
}

function getFachIcon(name) {
  const n = name.toLowerCase()
  if (n.includes('englisch')) return '🇬🇧'
  if (n.includes('französisch')) return '🇫🇷'
  if (n.includes('spanisch')) return '🇪🇸'
  if (n.includes('latein')) return '🏛️'
  if (n.includes('italienisch')) return '🇮🇹'
  return '📚'
}
