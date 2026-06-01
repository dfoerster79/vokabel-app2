import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/authStore.js'

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

export default function ProfileSetupPage() {
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()

  const [bundesland, setBundesland] = useState('')
  const [ort, setOrt] = useState('')
  const [schuleId, setSchuleId] = useState('')

  const [ortInput, setOrtInput] = useState('')
  const [ortSuggestions, setOrtSuggestions] = useState([])
  const [loadingOrte, setLoadingOrte] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const ortRef = useRef(null)

  const [schulen, setSchulen] = useState([])
  const [loadingSchulen, setLoadingSchulen] = useState(false)
  const [schulTypFilter, setSchulTypFilter] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Bundesland wechsel: alles zurücksetzen
  useEffect(() => {
    setOrtInput('')
    setOrt('')
    setOrtSuggestions([])
    setSchulen([])
    setSchuleId('')
    setSchulTypFilter('')
  }, [bundesland])

  // Live-Suche in schulen-Tabelle: ab 3 Zeichen, startsWith, 200ms Debounce
  useEffect(() => {
    if (!bundesland || ortInput.length < 3 || ort === ortInput) {
      if (ortInput.length < 3) setOrtSuggestions([])
      return
    }
    const timeout = setTimeout(async () => {
      setLoadingOrte(true)
      const { data, error } = await supabase
        .from('schulen')
        .select('ort')
        .eq('bundesland', bundesland)
        .ilike('ort', `${ortInput}%`)
        .order('ort')
        .limit(20)
      if (!error && data) {
        const unique = [...new Set(data.map(r => r.ort).filter(Boolean))]
        setOrtSuggestions(unique)
        setShowSuggestions(true)
      } else {
        setOrtSuggestions([])
      }
      setLoadingOrte(false)
    }, 200)
    return () => clearTimeout(timeout)
  }, [ortInput, bundesland, ort])

  // Schulen für gewählten Ort laden
  useEffect(() => {
    if (!ort) { setSchulen([]); setSchuleId(''); setSchulTypFilter(''); return }
    setLoadingSchulen(true)
    setSchuleId('')
    setSchulTypFilter('')
    supabase
      .from('schulen')
      .select('id, name, schulart')
      .eq('bundesland', bundesland)
      .eq('ort', ort)
      .order('name')
      .then(({ data }) => {
        setSchulen(data || [])
        setLoadingSchulen(false)
      })
  }, [ort])

  // Klick außerhalb schließt Dropdown
  useEffect(() => {
    const handler = (e) => {
      if (ortRef.current && !ortRef.current.contains(e.target)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOrtSelect = (o) => {
    setOrtInput(o)
    setOrt(o)
    setShowSuggestions(false)
    setOrtSuggestions([])
  }

  const schultypen = [...new Set(schulen.map(s => s.schulart).filter(Boolean))].sort()
  const gefilterteSchulen = schulTypFilter
    ? schulen.filter(s => s.schulart === schulTypFilter)
    : schulen

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!bundesland || !ort) { setError('Bitte Bundesland und Ort auswählen.'); return }
    setSaving(true)
    const { error: err } = await supabase
      .from('profiles')
      .update({ bundesland, ort, schule_id: schuleId || null, profil_komplett: true })
      .eq('id', user.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    navigate('/dashboard')
  }

  const handleSkip = async () => {
    await supabase.from('profiles').update({ profil_komplett: true }).eq('id', user?.id)
    navigate('/dashboard')
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏫</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Profil einrichten
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 340, margin: '0 auto' }}>
            Damit du die richtigen Vokabeltests siehst, gib bitte dein Bundesland, deinen Ort und deine Schule an.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Bundesland */}
          <div>
            <label style={labelStyle}>Bundesland</label>
            <select className="input" value={bundesland}
              onChange={e => setBundesland(e.target.value)} style={{ width: '100%' }}>
              <option value="">– Bundesland wählen –</option>
              {BUNDESLAENDER.map(bl => (
                <option key={bl.kuerzel} value={bl.kuerzel}>{bl.name}</option>
              ))}
            </select>
          </div>

          {/* Ort */}
          {bundesland && (
            <div>
              <label style={labelStyle}>Ort / Stadt</label>
              <div ref={ortRef} style={{ position: 'relative' }}>
                <input
                  className="input"
                  placeholder="Mindestens 3 Buchstaben eingeben…"
                  value={ortInput}
                  onChange={e => {
                    setOrtInput(e.target.value)
                    setOrt('')
                    setShowSuggestions(true)
                  }}
                  onFocus={() => ortInput.length >= 3 && setShowSuggestions(true)}
                  style={{ width: '100%' }}
                  autoComplete="off"
                />
                {ortInput.length > 0 && ortInput.length < 3 && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Bitte mindestens 3 Buchstaben eingeben
                  </p>
                )}
                {loadingOrte && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Suche…</p>
                )}
                {showSuggestions && ortSuggestions.length > 0 && (
                  <ul style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: 'var(--surface,#fff)', border: '1px solid var(--border,#e0e0e0)',
                    borderRadius: 8, marginTop: 2, padding: 0, listStyle: 'none',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.10)', maxHeight: 220, overflowY: 'auto',
                  }}>
                    {ortSuggestions.map(o => (
                      <li key={o} onMouseDown={() => handleOrtSelect(o)} style={{
                        padding: '10px 14px', cursor: 'pointer', fontSize: 14,
                        borderBottom: '1px solid var(--border,#f0f0f0)',
                        background: ort === o
                          ? 'oklch(from var(--primary,#01696f) l c h / 0.08)'
                          : 'transparent',
                      }}>
                        {o}
                      </li>
                    ))}
                  </ul>
                )}
                {showSuggestions && !loadingOrte && ortInput.length >= 3
                  && ortSuggestions.length === 0 && ort !== ortInput && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: 'var(--surface,#fff)', border: '1px solid var(--border,#e0e0e0)',
                    borderRadius: 8, marginTop: 2, padding: '10px 14px',
                    fontSize: 13, color: 'var(--text-muted)',
                  }}>
                    Kein Ort gefunden, der mit „{ortInput}" beginnt.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Schulen */}
          {ort && (
            <div>
              <label style={labelStyle}>
                Schule in {ort} <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span>
              </label>
              {loadingSchulen ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Schulen werden geladen…</p>
              ) : schulen.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Keine Schulen für diesen Ort gefunden.</p>
              ) : (
                <>
                  {schulen.length > 3 && schultypen.length > 1 && (
                    <div style={{ marginBottom: 10 }}>
                      <select className="input" value={schulTypFilter}
                        onChange={e => setSchulTypFilter(e.target.value)} style={{ width: '100%' }}>
                        <option value="">Alle Schultypen ({schulen.length})</option>
                        {schultypen.map(t => (
                          <option key={t} value={t}>{t} ({schulen.filter(s => s.schulart === t).length})</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                    {gefilterteSchulen.map(s => {
                      const isSelected = String(s.id) === String(schuleId)
                      return (
                        <div key={s.id} onClick={() => setSchuleId(isSelected ? '' : String(s.id))} style={{
                          padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                          border: isSelected
                            ? '2px solid var(--primary,#01696f)'
                            : '1px solid var(--border,#e0e0e0)',
                          background: isSelected
                            ? 'oklch(from var(--primary,#01696f) l c h / 0.07)'
                            : 'var(--surface,#fff)',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                          transition: 'all 0.15s ease',
                        }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{s.name}</div>
                            {s.schulart && <span style={badgeStyle}>{s.schulart}</span>}
                          </div>
                          {isSelected && <span style={{ fontSize: 18, color: 'var(--primary,#01696f)', flexShrink: 0 }}>✓</span>}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <p style={{
              fontSize: 13, padding: '7px 12px', borderRadius: 8,
              background: 'oklch(from var(--error,#a12c7b) l c h / 0.08)',
              color: 'var(--error,#a12c7b)',
              border: '1px solid oklch(from var(--error,#a12c7b) l c h / 0.25)',
            }}>
              {error}
            </p>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={saving || !bundesland || !ort}
            style={{ width: '100%', padding: '12px', fontSize: 15, fontWeight: 600, marginTop: 4 }}
          >
            {saving ? 'Wird gespeichert…' : 'Profil speichern & weiter'}
          </button>
        </form>

        <button onClick={handleSkip} style={{
          width: '100%', marginTop: 12, padding: '10px',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, color: 'var(--text-muted)',
        }}>
          Überspringen – später einrichten
        </button>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 12, color: 'var(--text-muted)',
  marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
}
const badgeStyle = {
  display: 'inline-block', marginLeft: 6, marginTop: 3,
  background: 'oklch(from var(--primary,#01696f) l c h / 0.10)',
  color: 'var(--primary,#01696f)',
  borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
}
