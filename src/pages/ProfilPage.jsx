import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/authStore.js'
import { useRole } from '../hooks/useRole.js'
import KlassenVerwaltung from '../components/KlassenVerwaltung.jsx'

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

export default function ProfilPage() {
  const { user } = useAuthStore()
  const { profile, loading: roleLoading } = useRole()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
  const isSchuljahrUpdate = searchParams.get('update') === 'schuljahr'

  const [profileInitialized, setProfileInitialized] = useState(false)
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameMsg, setNameMsg] = useState(null)

  const [pwNeu, setPwNeu] = useState('')
  const [pwWdh, setPwWdh] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  const [savedBundesland, setSavedBundesland] = useState('')
  const [savedOrt, setSavedOrt] = useState('')
  const [savedSchuleId, setSavedSchuleId] = useState('')

  const [bundesland, setBundesland] = useState('')
  const [ortInput, setOrtInput] = useState('')
  const [ortGewaehlt, setOrtGewaehlt] = useState('')
  const [ortSuggestions, setOrtSuggestions] = useState([])
  const [loadingOrte, setLoadingOrte] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [ortSaving, setOrtSaving] = useState(false)
  const [ortMsg, setOrtMsg] = useState(null)

  const [schulen, setSchulen] = useState([])
  const [loadingSchulen, setLoadingSchulen] = useState(false)
  const [schulTypFilter, setSchulTypFilter] = useState('')
  const [schuleId, setSchuleId] = useState('')
  const [schuleSaving, setSchuleSaving] = useState(false)
  const [schuleMsg, setSchuleMsg] = useState(null)
  
  const [gespeicherteSchule, setGespeicherteSchule] = useState(null)
  const [loadingGespeicherteSchule, setLoadingGespeicherteSchule] = useState(false)

  const [editOrt, setEditOrt] = useState(false)
  const [editSchule, setEditSchule] = useState(false)

  const ortRef = useRef(null)

  useEffect(() => {
    if (roleLoading) return
    if (!profile) return

    setVorname(profile.vorname || '')
    setNachname(profile.nachname || '')

    const bl = profile.bundesland || ''
    const ort = profile.ort || ''
    const sid = profile.schule_id || ''

    setSavedBundesland(bl)
    setSavedOrt(ort)
    setSavedSchuleId(sid)

    setBundesland(bl)
    setOrtInput(ort)
    setOrtGewaehlt(ort)
    setSchuleId(sid)

    setEditOrt(!bl || !ort)
    setEditSchule(false)
    setProfileInitialized(true)
  }, [profile, roleLoading])

  useEffect(() => {
    if (!savedSchuleId) {
      setGespeicherteSchule(null)
      return
    }
    setLoadingGespeicherteSchule(true)
    supabase
      .from('schulen')
      .select('id, name, schulart, ort')
      .eq('id', savedSchuleId)
      .single()
      .then(({ data }) => {
        setGespeicherteSchule(data || null)
        setLoadingGespeicherteSchule(false)
      })
  }, [savedSchuleId])

  useEffect(() => {
    if (!bundesland || ortInput.trim().length < 1 || ortGewaehlt === ortInput) {
      if (ortInput.trim().length < 1) setOrtSuggestions([])
      return
    }
    const timeout = setTimeout(async () => {
      setLoadingOrte(true)
      const { data, error } = await supabase
        .from('schulen')
        .select('ort')
        .eq('bundesland', bundesland)
        .ilike('ort', `%${ortInput}%`)
        .not('ort', 'is', null)
        .order('ort')
        .limit(200)

      if (!error && data) {
        const unique = [...new Set(data.map(r => r.ort).filter(Boolean))].sort()
        setOrtSuggestions(unique)
        setShowSuggestions(true)
      } else {
        setOrtSuggestions([])
      }
      setLoadingOrte(false)
    }, 220)
    return () => clearTimeout(timeout)
  }, [ortInput, bundesland, ortGewaehlt])

  useEffect(() => {
    const aktiverOrt = editOrt ? ortGewaehlt : savedOrt
    const aktivesBundesland = editOrt ? bundesland : savedBundesland

    if (!aktivesBundesland || !aktiverOrt) {
      setSchulen([])
      setSchulTypFilter('')
      return
    }
    setLoadingSchulen(true)
    setSchulTypFilter('')
    supabase
      .from('schulen')
      .select('id, name, schulart')
      .eq('bundesland', aktivesBundesland)
      .eq('ort', aktiverOrt)
      .order('name')
      .then(({ data }) => {
        setSchulen(data || [])
        setLoadingSchulen(false)
      })
  }, [editOrt, bundesland, ortGewaehlt, savedBundesland, savedOrt])

  useEffect(() => {
    const handler = (e) => {
      if (ortRef.current && !ortRef.current.contains(e.target)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const schultypen = [...new Set(schulen.map(s => s.schulart).filter(Boolean))].sort()
  const gefilterteSchulen = schulTypFilter ? schulen.filter(s => s.schulart === schulTypFilter) : schulen

  const hasSavedOrt = !!savedBundesland && !!savedOrt
  const hasSavedSchule = !!savedSchuleId

  const showOrtEditor = editOrt || !hasSavedOrt
  const showSchuleCard = !!(showOrtEditor ? ortGewaehlt : savedOrt)
  const showSchuleSelection = showSchuleCard && (!hasSavedSchule || editSchule || editOrt)

  const ortAnzeige = savedOrt
  const bundeslandAnzeige = BUNDESLAENDER.find(b => b.kuerzel === savedBundesland)?.name || savedBundesland

  const handleOrtSelect = (ort) => {
    setOrtInput(ort)
    setOrtGewaehlt(ort)
    setShowSuggestions(false)
    setOrtSuggestions([])
    setSchuleId('')
    setSchuleMsg(null)
    setOrtMsg(null)
  }

  const startOrtEdit = () => {
    setEditOrt(true)
    setEditSchule(false)
    setBundesland(savedBundesland || '')
    setOrtInput(savedOrt || '')
    setOrtGewaehlt(savedOrt || '')
    setSchuleId(savedSchuleId || '')
    setOrtMsg(null)
    setSchuleMsg(null)
  }

  const cancelOrtEdit = () => {
    setEditOrt(false)
    setBundesland(savedBundesland || '')
    setOrtInput(savedOrt || '')
    setOrtGewaehlt(savedOrt || '')
    setSchuleId(savedSchuleId || '')
    setOrtSuggestions([])
    setShowSuggestions(false)
    setOrtMsg(null)
    setSchuleMsg(null)
  }

  const startSchuleEdit = () => {
    setEditSchule(true)
    setEditOrt(false)
    setBundesland(savedBundesland || '')
    setOrtInput(savedOrt || '')
    setOrtGewaehlt(savedOrt || '')
    setSchuleId(savedSchuleId || '')
    setSchuleMsg(null)
  }

  const cancelSchuleEdit = () => {
    setEditSchule(false)
    setSchuleId(savedSchuleId || '')
    setSchuleMsg(null)
  }

  const handleOrtSave = async () => {
    if (!bundesland) {
      setOrtMsg({ ok: false, text: 'Bitte ein Bundesland auswählen.' })
      return
    }
    if (!ortGewaehlt.trim()) {
      setOrtMsg({ ok: false, text: 'Bitte einen Ort aus den Vorschlägen auswählen.' })
      return
    }
    setOrtSaving(true)
    setOrtMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({ bundesland, ort: ortGewaehlt, schule_id: null })
      .eq('id', user.id)

    setOrtSaving(false)
    if (error) {
      setOrtMsg({ ok: false, text: error.message })
      return
    }
    setSavedBundesland(bundesland)
    setSavedOrt(ortGewaehlt)
    setSavedSchuleId('')
    setGespeicherteSchule(null)
    setSchuleId('')
    setEditOrt(false)
    setEditSchule(false)
    setOrtMsg({ ok: true, text: `Ort gespeichert: ${ortGewaehlt} ✓` })
    setSchuleMsg(null)
  }

  const handleNameSave = async (e) => {
    e.preventDefault()
    if (!vorname.trim()) {
      setNameMsg({ ok: false, text: 'Vorname darf nicht leer sein.' })
      return
    }
    setNameSaving(true)
    setNameMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({ vorname: vorname.trim(), nachname: nachname.trim() })
      .eq('id', user.id)
    setNameSaving(false)
    setNameMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Name gespeichert ✓' })
  }

  const handlePwSave = async (e) => {
    e.preventDefault()
    setPwMsg(null)
    if (pwNeu.length < 6) {
      setPwMsg({ ok: false, text: 'Passwort muss mindestens 6 Zeichen haben.' })
      return
    }
    if (pwNeu !== pwWdh) {
      setPwMsg({ ok: false, text: 'Passwörter stimmen nicht überein.' })
      return
    }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pwNeu })
    setPwSaving(false)
    if (error) {
      setPwMsg({ ok: false, text: error.message })
      return
    }
    setPwMsg({ ok: true, text: 'Passwort geändert ✓' })
    setPwNeu('')
    setPwWdh('')
  }

  const handleSchuleSave = async (schuleIdParam) => {
    const id = schuleIdParam || schuleId
    setSchuleSaving(true)
    setSchuleMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({ schule_id: id || null })
      .eq('id', user.id)
      
    setSchuleSaving(false)
    if (error) {
      setSchuleMsg({ ok: false, text: error.message })
      return
    }
    setSchuleId(id)
    setSavedSchuleId(id)
    const ortFuerAnzeige = editOrt ? ortGewaehlt : savedOrt
    const s = schulen.find(s => String(s.id) === String(id))
    setGespeicherteSchule(s ? { ...s, ort: ortFuerAnzeige } : null)
    setEditSchule(false)
    setSchuleMsg({ ok: true, text: s ? `Schule gespeichert: ${s.name} ✓` : 'Gespeichert ✓' })
  }

  if (roleLoading || !profileInitialized) {
    return <div style={{ padding: 20, textAlign: 'center' }}>Lade Profil...</div>
  }

  const inputStyle = {
    display: 'block', width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
    border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827',
    fontSize: '1rem', boxSizing: 'border-box', marginBottom: '1rem'
  }
  const labelStyle = { display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
  const sectionTitle = { fontSize: 18, fontWeight: 700, marginBottom: 14, color: '#111827' }
  const badgeStyle = { display: 'inline-block', marginLeft: 6, marginTop: 3, background: '#ccfbf1', color: '#0f5156', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }
  const aenderungsLinkStyle = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, color: '#0f5156', textDecoration: 'underline', textUnderlineOffset: 3, fontWeight: 600 }

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", paddingBottom: "5rem", fontFamily: "sans-serif" }}>
      
      {/* --- Menüleiste --- */}
      <div style={{ backgroundColor: "white", padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e5e7eb", marginBottom: "1.5rem" }}>
        <h1 style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: "bold", fontSize: "1.2rem", color: "#0f5156", margin: 0 }}>
          ⚙️ Einstellungen
        </h1>
        <button 
          onClick={() => navigate('/dashboard')}
          style={{ background: "none", border: "none", color: "#6b7280", fontSize: "0.9rem", cursor: "pointer", fontWeight: "600" }}
        >
          Zurück
        </button>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 1rem' }}>

        {/* --- NEUER HEADER MIT VERLAUF --- */}
        <div style={{ background: "linear-gradient(135deg, #0f5156 0%, #167a7f 100%)", padding: "1.5rem", borderRadius: "1rem", marginBottom: "2rem", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
          <h2 style={{ margin: 0, color: "white", fontSize: 24, fontWeight: "800", display: "flex", alignItems: "center", gap: 8 }}>
             Dein Profil
          </h2>
          <p style={{ color: "#e5e7eb", margin: "10px 0 0 0", fontSize: 14, lineHeight: 1.5 }}>
            Verwalte hier deine persönlichen Daten, deine Schule und deine aktuellen Fächer.
          </p>
        </div>

        {isSchuljahrUpdate && (
          <div style={{ background: '#ccfbf1', border: '1px solid #2dd4bf', borderRadius: '1rem', padding: 15, marginBottom: 20, color: '#0f5156' }}>
            <strong style={{ display: 'block', marginBottom: 5 }}>Neues Schuljahr! 🚀</strong>
            Bitte scrolle nach unten zur <strong>Klassenverwaltung</strong> und aktualisiere deine Jahrgänge und Klassen für das neue Schuljahr, bevor du weiterlernst.
          </div>
        )}

        {/* --- NAME ÄNDERN --- */}
        <div style={{ background: 'white', padding: "1.5rem", borderRadius: "1rem", marginBottom: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h2 style={sectionTitle}>Persönliche Daten</h2>
          <form onSubmit={handleNameSave}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Vorname</label>
                <input type="text" value={vorname} onChange={(e) => setVorname(e.target.value)} style={inputStyle} placeholder="Vorname" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Nachname</label>
                <input type="text" value={nachname} onChange={(e) => setNachname(e.target.value)} style={inputStyle} placeholder="Nachname" />
              </div>
            </div>
            <button type="submit" disabled={nameSaving} style={{ width: '100%', padding: '0.75rem', background: '#0f5156', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
              {nameSaving ? 'Speichert...' : 'Name speichern'}
            </button>
            {nameMsg && <div style={{ marginTop: 10, fontSize: 13, color: nameMsg.ok ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>{nameMsg.text}</div>}
          </form>
        </div>

        {/* --- PASSWORT ÄNDERN --- */}
        <div style={{ background: 'white', padding: "1.5rem", borderRadius: "1rem", marginBottom: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h2 style={sectionTitle}>Passwort ändern</h2>
          <form onSubmit={handlePwSave}>
            <label style={labelStyle}>Neues Passwort</label>
            <input type="password" value={pwNeu} onChange={(e) => setPwNeu(e.target.value)} placeholder="Mindestens 6 Zeichen" style={inputStyle} />
            <label style={labelStyle}>Passwort wiederholen</label>
            <input type="password" value={pwWdh} onChange={(e) => setPwWdh(e.target.value)} placeholder="Passwort bestätigen" style={inputStyle} />
            <button type="submit" disabled={pwSaving} style={{ width: '100%', padding: '0.75rem', background: '#0f5156', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
              {pwSaving ? 'Speichert...' : 'Passwort ändern'}
            </button>
            {pwMsg && <div style={{ marginTop: 10, fontSize: 13, color: pwMsg.ok ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>{pwMsg.text}</div>}
          </form>
        </div>

        {/* --- SCHULE ÄNDERN --- */}
        <div style={{ background: 'white', padding: "1.5rem", borderRadius: "1rem", marginBottom: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#111827' }}>Meine Schule</h2>
            {hasSavedSchule && !editSchule && !editOrt && (
              <button onClick={startSchuleEdit} style={aenderungsLinkStyle}>Schule ändern</button>
            )}
          </div>

          {showOrtEditor ? (
            <div style={{ marginBottom: 20, padding: 15, background: '#f8fafc', borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: 13, margin: '0 0 10px 0', color: '#4b5563' }}>Bundesland & Ort festlegen</h3>
              <label style={labelStyle}>Bundesland</label>
              <select value={bundesland} onChange={(e) => { setBundesland(e.target.value); setOrtInput(''); setOrtGewaehlt(''); setSchuleId(''); setOrtSuggestions([]); }} style={inputStyle}>
                <option value="">-- Bitte wählen --</option>
                {BUNDESLAENDER.map(b => <option key={b.kuerzel} value={b.kuerzel}>{b.name}</option>)}
              </select>

              <div style={{ position: 'relative' }} ref={ortRef}>
                <label style={labelStyle}>Ort / Stadt</label>
                <input type="text" value={ortInput} onChange={(e) => { setOrtInput(e.target.value); setOrtGewaehlt(''); setSchuleId(''); }} onFocus={() => { if (ortSuggestions.length > 0) setShowSuggestions(true) }} placeholder={bundesland ? "Ort tippen..." : "Erst Bundesland wählen"} disabled={!bundesland} style={inputStyle} />
                {loadingOrte && <div style={{ fontSize: 12, color: '#6b7280', marginTop: -5, marginBottom: 10 }}>Suche...</div>}
                {showSuggestions && ortSuggestions.length > 0 && (
                  <ul style={{ position: 'absolute', top: 65, left: 0, right: 0, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, maxHeight: 200, overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none', zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                    <li style={{ padding: '8px 12px', fontSize: 11, background: '#f3f4f6', color: '#6b7280', fontWeight: 'bold' }}>Ort aus der Liste wählen</li>
                    {ortSuggestions.map(o => <li key={o} onClick={() => handleOrtSelect(o)} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', color: '#1f2937' }}>{o}</li>)}
                  </ul>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleOrtSave} disabled={ortSaving} style={{ flex: 1, padding: '0.75rem', background: '#0f5156', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>{ortSaving ? 'Speichert...' : 'Ort bestätigen'}</button>
                {hasSavedOrt && <button onClick={cancelOrtEdit} style={{ padding: '0.75rem', background: 'white', color: '#4b5563', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>Abbrechen</button>}
              </div>
              {ortMsg && <div style={{ marginTop: 10, fontSize: 13, color: ortMsg.ok ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>{ortMsg.text}</div>}
            </div>
          ) : (
            <div style={{ marginBottom: 15 }}>
              <div style={{ fontSize: 15, color: '#111827', fontWeight: 600 }}>{ortAnzeige} <span style={{ color: '#6b7280', fontWeight: 'normal' }}>({bundeslandAnzeige})</span></div>
              <button onClick={startOrtEdit} style={{ ...aenderungsLinkStyle, fontSize: 12, marginTop: 4 }}>Ort/Bundesland ändern</button>
            </div>
          )}

          {showSchuleCard && (
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 15 }}>
              {showSchuleSelection ? (
                loadingSchulen ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Schulen werden geladen...</div> : schulen.length === 0 ? <div style={{ fontSize: 13, color: '#ef4444' }}>Keine Schulen für diesen Ort gefunden.</div> : (
                  <>
                    {schulen.length > 3 && schultypen.length > 1 && (
                      <div style={{ marginBottom: 10 }}>
                        <label style={labelStyle}>Schulform filtern (optional)</label>
                        <select value={schulTypFilter} onChange={(e) => setSchulTypFilter(e.target.value)} style={inputStyle}>
                          <option value="">Alle Schulformen</option>
                          {schultypen.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    )}
                    <label style={labelStyle}>Schule wählen</label>
                    <select value={schuleId} onChange={(e) => { setSchuleId(e.target.value); handleSchuleSave(e.target.value); }} style={inputStyle}>
                      <option value="">-- Bitte wähle deine Schule --</option>
                      {gefilterteSchulen.map(s => <option key={s.id} value={s.id}>{s.name} ({s.schulart})</option>)}
                    </select>
                    {hasSavedSchule && <button onClick={cancelSchuleEdit} style={{ marginTop: 10, padding: '0.5rem', background: 'transparent', color: '#6b7280', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>Abbrechen</button>}
                    {schuleSaving && <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 10 }}>Wird gespeichert...</div>}
                  </>
                )
              ) : (
                loadingGespeicherteSchule ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Lade Schule...</div> : gespeicherteSchule ? (
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{gespeicherteSchule.name}</div>
                    <div style={badgeStyle}>{gespeicherteSchule.schulart}</div>
                  </div>
                ) : <div style={{ fontSize: 13, color: '#ef4444' }}>Fehler beim Laden der Schule</div>
              )}
              {schuleMsg && <div style={{ marginTop: 10, fontSize: 13, color: schuleMsg.ok ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>{schuleMsg.text}</div>}
            </div>
          )}
        </div>

        {/* --- KLASSENVERWALTUNG COMPONENT --- */}
        <KlassenVerwaltung />

      </div>
    </div>
  )
}
