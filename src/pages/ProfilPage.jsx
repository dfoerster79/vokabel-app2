import React, { useState, useEffect, useRef } from 'react'
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
      if (ortRef.current && !ortRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOrtSave = async () => {
    if (!bundesland || !ortGewaehlt.trim()) {
      setOrtMsg({ ok: false, text: 'Bitte ein Bundesland und Ort wählen.' })
      return
    }
    setOrtSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ bundesland, ort: ortGewaehlt, schule_id: null })
      .eq('id', user.id)
    setOrtSaving(false)
    if (error) {
      setOrtMsg({ ok: false, text: error.message })
    } else {
      setSavedBundesland(bundesland)
      setSavedOrt(ortGewaehlt)
      setSavedSchuleId('')
      setGespeicherteSchule(null)
      setSchuleId('')
      setEditOrt(false)
      setEditSchule(false)
      setOrtMsg({ ok: true, text: `Ort gespeichert: ${ortGewaehlt} ✓` })
    }
  }

  const handleNameSave = async (e) => {
    e.preventDefault()
    if (!vorname.trim()) {
      setNameMsg({ ok: false, text: 'Vorname darf nicht leer sein.' })
      return
    }
    setNameSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ vorname: vorname.trim(), nachname: nachname.trim() })
      .eq('id', user.id)
    setNameSaving(false)
    setNameMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Name gespeichert ✓' })
  }

  const handlePwSave = async (e) => {
    e.preventDefault()
    if (pwNeu.length < 6) {
      setPwMsg({ ok: false, text: 'Passwort muss min. 6 Zeichen haben.' })
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
    } else {
      setPwMsg({ ok: true, text: 'Passwort geändert ✓' })
      setPwNeu('')
      setPwWdh('')
    }
  }

  if (roleLoading || !profileInitialized) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}>
        <div style={{ color: '#6b7280', fontSize: '18px' }}>Lade Profil...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: '3rem' }}>
      <nav className="nav">
        <Link to="/dashboard" className="nav-logo">
          <div className="nav-logo-icon"></div>
          VokabelApp
        </Link>
        <div className="nav-actions">
          <Link to="/dashboard" className="nav-btn">Zurück</Link>
        </div>
      </nav>

      <div className="main-content" style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ marginBottom: 24 }}>
          <h2>Mein Profil</h2>
          <p style={{ color: '#6b7280' }}>Verwalte hier deine persönlichen Daten, deine Schule und deine aktuellen Fächer.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* KLASSENVERWALTUNG WIRD HIER EINGEBUNDEN */}
          <KlassenVerwaltung />
          
          {/* NAME */}
          <div style={{ background: 'white', padding: "1.5rem", borderRadius: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>Name ändern</h3>
            <form onSubmit={handleNameSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <input 
                  type="text" 
                  value={vorname} 
                  onChange={e => setVorname(e.target.value)} 
                  placeholder="Vorname" 
                  style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #e5e7eb' }} 
                />
                <input 
                  type="text" 
                  value={nachname} 
                  onChange={e => setNachname(e.target.value)} 
                  placeholder="Nachname" 
                  style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #e5e7eb' }} 
                />
              </div>
              <button 
                type="submit" 
                disabled={nameSaving} 
                style={{ padding: 10, borderRadius: 8, background: '#0f5156', color: 'white', border: 'none', fontWeight: 'bold' }}
              >
                {nameSaving ? 'Speichert...' : 'Name speichern'}
              </button>
              {nameMsg && <div style={{ color: nameMsg.ok ? '#10b981' : '#ef4444' }}>{nameMsg.text}</div>}
            </form>
          </div>

          {/* PASSWORT */}
          <div style={{ background: 'white', padding: "1.5rem", borderRadius: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>Passwort ändern</h3>
            <form onSubmit={handlePwSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input 
                type="password" 
                value={pwNeu} 
                onChange={e => setPwNeu(e.target.value)} 
                placeholder="Neues Passwort (min. 6 Zeichen)" 
                style={{ padding: 10, borderRadius: 8, border: '1px solid #e5e7eb' }} 
              />
              <input 
                type="password" 
                value={pwWdh} 
                onChange={e => setPwWdh(e.target.value)} 
                placeholder="Passwort wiederholen" 
                style={{ padding: 10, borderRadius: 8, border: '1px solid #e5e7eb' }} 
              />
              <button 
                type="submit" 
                disabled={pwSaving} 
                style={{ padding: 10, borderRadius: 8, background: '#0f5156', color: 'white', border: 'none', fontWeight: 'bold' }}
              >
                {pwSaving ? 'Speichert...' : 'Passwort ändern'}
              </button>
              {pwMsg && <div style={{ color: pwMsg.ok ? '#10b981' : '#ef4444' }}>{pwMsg.text}</div>}
            </form>
          </div>
          
        </div>
      </div>
    </div>
  )
}
