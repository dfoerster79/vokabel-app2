import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/authStore.js'

const BRAND_COLOR = '#0f5156'
const BRAND_LIGHT = '#e6f0f1'

export default function LernenPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // Daten
  const [faecher, setFaecher] = useState([])
  const [tests, setTests] = useState([])
  const [favoriten, setFavoriten] = useState([]) // Speichert die favorisierten Test-IDs
  const [favoritenDetails, setFavoritenDetails] = useState([]) // Speichert die vollen Infos für die Anzeige oben

  // Auswahl
  const [gewaehltesFach, setGewaehltesFach] = useState('')
  const [gewaehlterTest, setGewaehlterTest] = useState('')
  const [testart, setTestart] = useState('multiple_choice')

  // UI States
  const [currentStep, setCurrentStep] = useState(1)
  const [loadingFaecher, setLoadingFaecher] = useState(true)
  const [loadingTests, setLoadingTests] = useState(false)

  // 1. Initiale Daten laden: Fächer UND Favoriten
  useEffect(() => {
    // Fächer laden
    supabase
      .from('faecher')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        setFaecher(data || [])
        setLoadingFaecher(false)
      })

    // Favoriten laden
    if (user) {
      fetchFavoriten()
    }
  }, [user])

  // Funktion zum Laden der Favoriten
  const fetchFavoriten = async () => {
    // Hole die Favoriten des Nutzers inkl. der Test-Details
    const { data } = await supabase
      .from('lern_favoriten')
      .select(`
        vokabel_test_id,
        vokabel_tests (
          id, name, jahrgang, buecher(name),
          faecher(id, name)
        )
      `)
      .eq('user_id', user.id)

    if (data) {
      // Array der reinen IDs (für den gelben/grauen Stern im Lektionen-Listing)
      setFavoriten(data.map(f => f.vokabel_test_id))
      // Volles Array für den Schnellstart-Bereich ganz oben
      setFavoritenDetails(data.map(f => f.vokabel_tests).filter(Boolean))
    }
  }

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

  // --- Handlers ---
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

  // Schnellstart von Favoriten überspringt Schritt 1 & 2
  const handleFavoritStart = (testData) => {
    setGewaehltesFach(testData.faecher.id)
    setGewaehlterTest(testData.id)
    setCurrentStep(3) // Geht direkt zur Wahl der Testart
  }

  // Stern-Klick zum Favorisieren / Entfavorisieren
  const toggleFavorit = async (e, testId) => {
    e.stopPropagation() // Verhindert, dass der Button auch den Test für Schritt 3 auswählt

    const isFav = favoriten.includes(testId)

    if (isFav) {
      // Entfernen
      setFavoriten(prev => prev.filter(id => id !== testId))
      await supabase.from('lern_favoriten').delete().eq('user_id', user.id).eq('vokabel_test_id', testId)
    } else {
      // Hinzufügen
      setFavoriten(prev => [...prev, testId])
      await supabase.from('lern_favoriten').insert([{ user_id: user.id, vokabel_test_id: testId }])
    }
    // Lade Details neu, damit der Bereich oben aktualisiert wird
    fetchFavoriten()
  }

  if (loadingFaecher) return <div style={{ padding: '2rem', textAlign: 'center' }}>Lade Daten...</div>

  return (
    <div style={{ maxWidth: '42rem', margin: '2rem auto 5rem', padding: '0 1rem', fontFamily: 'sans-serif' }}>
      
      {/* Headerbereich */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: BRAND_COLOR, margin: '0 0 0.5rem 0' }}>Lernen</h1>
        <p style={{ color: '#4b5563', margin: 0, fontSize: '1.1rem' }}>Wähle dein Fach und die Lektion, die du heute trainieren möchtest.</p>
      </div>

      {/* --- NEU: FAVORITEN SCHNELLZUGRIFF --- */}
      {favoritenDetails.length > 0 && currentStep === 1 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', color: '#374151', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⭐ Deine Favoriten
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {favoritenDetails.map(fav => (
              <button
                key={fav.id}
                onClick={() => handleFavoritStart(fav)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'white', border: `1px solid ${BRAND_LIGHT}`, borderRadius: '0.75rem',
                  padding: '1rem', cursor: 'pointer', textAlign: 'left',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'all 0.2s'
                }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = BRAND_COLOR; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = BRAND_LIGHT; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <div>
                  <div style={{ fontWeight: '600', color: '#1f2937', fontSize: '1.1rem' }}>{fav.name}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '4px' }}>
                    {fav.faecher?.name} • {fav.buecher?.name || 'Kein Buch'}
                  </div>
                </div>
                <div style={{ background: BRAND_LIGHT, color: BRAND_COLOR, padding: '0.5rem 1rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: '600' }}>
                  Üben ➔
                </div>
              </button>
            ))}
          </div>
        </div>
      )}


      {/* Stepper Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
        {[1, 2, 3].map((step) => (
          <div key={step} style={{ flex: 1, height: '4px', background: currentStep >= step ? BRAND_COLOR : '#e5e7eb', borderRadius: '4px', transition: 'background 0.3s' }} />
        ))}
      </div>

      {/* SCHRITT 1: Fach wählen */}
      {currentStep === 1 && (
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#1f2937' }}>1. Welches Fach?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
            {faecher.map(fach => (
              <button
                key={fach.id}
                onClick={() => handleFachSelect(fach.id)}
                style={{ padding: '1.5rem', background: 'white', border: `2px solid ${gewaehltesFach === fach.id ? BRAND_COLOR : '#e5e7eb'}`, borderRadius: '1rem', fontSize: '1.25rem', fontWeight: '600', color: gewaehltesFach === fach.id ? BRAND_COLOR : '#374151', cursor: 'pointer', transition: 'all 0.2s', boxShadow: gewaehltesFach === fach.id ? `0 4px 14px -3px ${BRAND_COLOR}40` : 'none' }}
                onMouseOver={(e) => { if(gewaehltesFach !== fach.id) e.currentTarget.style.borderColor = BRAND_LIGHT }}
                onMouseOut={(e) => { if(gewaehltesFach !== fach.id) e.currentTarget.style.borderColor = '#e5e7eb' }}
              >
                {fach.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SCHRITT 2: Lektion wählen */}
      {currentStep === 2 && (
        <div>
          <button onClick={() => setCurrentStep(1)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', marginBottom: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
            ← Zurück zu Fächer
          </button>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#1f2937' }}>2. Welche Lektion?</h2>
          
          {loadingTests ? (
            <div style={{ color: '#6b7280' }}>Lade Lektionen...</div>
          ) : tests.length === 0 ? (
            <div style={{ padding: '2rem', background: '#f9fafb', borderRadius: '1rem', textAlign: 'center', color: '#6b7280' }}>Keine Lektionen für dieses Fach gefunden.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {tests.map(test => {
                const isFav = favoriten.includes(test.id)
                return (
                  <div 
                    key={test.id} 
                    style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                  >
                    <button
                      onClick={(e) => toggleFavorit(e, test.id)}
                      title={isFav ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
                      style={{ background: 'white', border: '2px solid #e5e7eb', borderRadius: '0.75rem', padding: '0.5rem', fontSize: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                      onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                      onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      {/* Gelber Stern, wenn favorisiert, ansonsten blasser/grauer Stern */}
                      <span style={{ filter: isFav ? 'none' : 'grayscale(100%) opacity(0.3)' }}>⭐</span>
                    </button>

                    <button
                      onClick={() => handleTestSelect(test.id)}
                      style={{ flex: 1, padding: '1rem 1.25rem', background: 'white', border: `2px solid ${gewaehlterTest === test.id ? BRAND_COLOR : '#e5e7eb'}`, borderRadius: '0.75rem', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column' }}
                    >
                      <span style={{ fontSize: '1.125rem', fontWeight: '600', color: gewaehlterTest === test.id ? BRAND_COLOR : '#1f2937' }}>{test.name}</span>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '2px' }}>{test.buecher?.name || 'Kein Buch zugeordnet'}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* SCHRITT 3: Testart & Start */}
      {currentStep === 3 && (
        <div>
          <button onClick={() => setCurrentStep(2)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', marginBottom: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
            ← Zurück zur Auswahl
          </button>
          
          <div style={{ background: BRAND_LIGHT, padding: '1.5rem', borderRadius: '1rem', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', margin: '0 0 1.5rem 0', color: BRAND_COLOR }}>3. Trainingsmodus</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '2rem' }}>
              
              {/* Option 1: Multiple Choice */}
              <button
                onClick={() => setTestart('multiple_choice')}
                style={{ padding: '1.25rem', background: 'white', border: `2px solid ${testart === 'multiple_choice' ? BRAND_COLOR : 'transparent'}`, borderRadius: '0.75rem', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'all 0.2s' }}
              >
                <div style={{ fontSize: '2rem' }}>📝</div>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#1f2937' }}>Multiple Choice</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Wähle aus 4 Antwortmöglichkeiten (ideal für Einsteiger)</div>
                </div>
              </button>

              {/* Option 2: Karteikarten (Noch inaktiv für dieses Beispiel, aber im UI) */}
              <button
                disabled
                style={{ padding: '1.25rem', background: 'white', border: '2px solid transparent', borderRadius: '0.75rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem', opacity: 0.6 }}
              >
                <div style={{ fontSize: '2rem' }}>🗂️</div>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#1f2937' }}>Karteikarten <span style={{ fontSize: '0.75rem', background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', marginLeft: '4px' }}>Bald</span></div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Klassisches Umdrehen und selbst bewerten</div>
                </div>
              </button>

              {/* Option 3: Schreiben */}
              <button
                disabled
                style={{ padding: '1.25rem', background: 'white', border: '2px solid transparent', borderRadius: '0.75rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem', opacity: 0.6 }}
              >
                <div style={{ fontSize: '2rem' }}>⌨️</div>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#1f2937' }}>Tippen <span style={{ fontSize: '0.75rem', background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', marginLeft: '4px' }}>Bald</span></div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Schreibe die exakte Übersetzung</div>
                </div>
              </button>

            </div>

            <button
              onClick={handleStart}
              style={{ width: '100%', padding: '1.25rem', background: BRAND_COLOR, color: 'white', border: 'none', borderRadius: '0.75rem', fontSize: '1.25rem', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.2s', boxShadow: '0 4px 6px -1px rgba(15,81,86,0.2)' }}
              onMouseOver={(e) => e.currentTarget.style.background = '#0a3d41'}
              onMouseOut={(e) => e.currentTarget.style.background = BRAND_COLOR}
            >
              Starten 🚀
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
