import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
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
    return (
      <div className="page-center">
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <p>Lade...</p>
        </div>
      </div>
    )
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

      <div className="main-content">
        <div className="welcome-banner" style={{ marginBottom: 24 }}>
          <h2>👤 Mein Profil</h2>
          <p>Deine persönlichen Einstellungen verwalten.</p>
        </div>

        {/* ── Name ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={sectionTitle}>Name</h3>
          <form onSubmit={handleNameSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Vorname</label>
                <input
                  className="input"
                  type="text"
                  value={vorname}
                  onChange={e => setVorname(e.target.value)}
                  placeholder="Vorname"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={labelStyle}>Nachname</label>
                <input
                  className="input"
                  type="text"
                  value={nachname}
                  onChange={e => setNachname(e.target.value)}
                  placeholder="Nachname"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            {nameMsg && <Msg msg={nameMsg} />}
            <button className="btn btn-primary" type="submit" disabled={nameSaving} style={{ alignSelf: 'flex-start' }}>
              {nameSaving ? 'Speichern…' : 'Name speichern'}
            </button>
          </form>
        </div>

        {/* ── Passwort ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={sectionTitle}>Passwort ändern</h3>
          <form onSubmit={handlePwSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Neues Passwort</label>
              <input
                className="input"
                type="password"
                value={pwNeu}
                onChange={e => setPwNeu(e.target.value)}
                placeholder="Mindestens 6 Zeichen"
                style={{ width: '100%' }}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label style={labelStyle}>Passwort wiederholen</label>
              <input
                className="input"
                type="password"
                value={pwWdh}
                onChange={e => setPwWdh(e.target.value)}
                placeholder="Passwort bestätigen"
                style={{ width: '100%' }}
                autoComplete="new-password"
              />
            </div>
            {pwMsg && <Msg msg={pwMsg} />}
            <button className="btn btn-primary" type="submit" disabled={pwSaving} style={{ alignSelf: 'flex-start' }}>
              {pwSaving ? 'Speichern…' : 'Passwort ändern'}
            </button>
          </form>
        </div>

        {/* ── Bundesland & Ort ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={sectionTitle}>Bundesland &amp; Ort</h3>

          {showOrtEditor ? (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Bundesland</label>
                <select
                  className="input"
                  value={bundesland}
                  onChange={e => {
                    setBundesland(e.target.value)
                    setOrtInput('')
                    setOrtGewaehlt('')
                    setOrtSuggestions([])
                    setSchuleId('')
                    setOrtMsg(null)
                    setSchuleMsg(null)
                  }}
                  style={{ width: '100%' }}
                >
                  <option value="">– Bundesland wählen –</option>
                  {BUNDESLAENDER.map(bl => (
                    <option key={bl.kuerzel} value={bl.kuerzel}>{bl.name}</option>
                  ))}
                </select>
              </div>

              {bundesland && (
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Ort / Stadt</label>
                  <div ref={ortRef} style={{ position: 'relative' }}>
                    <input
                      className="input"
                      placeholder="Ort suchen…"
                      value={ortInput}
                      onChange={e => {
                        setOrtInput(e.target.value)
                        setOrtGewaehlt('')
                        setShowSuggestions(true)
                        setSchuleId('')
                        setSchuleMsg(null)
                      }}
                      onFocus={() => ortInput.length >= 1 && setShowSuggestions(true)}
                      style={{ width: '100%' }}
                      autoComplete="off"
                    />
                    {loadingOrte && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Suche…</p>
                    )}

                    {showSuggestions && ortSuggestions.length > 0 && (
                      <ul style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 100,
                        background: 'var(--surface,#fff)',
                        border: '1px solid var(--border,#e0e0e0)',
                        borderRadius: 8,
                        marginTop: 2,
                        padding: 0,
                        listStyle: 'none',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
                        maxHeight: 220,
                        overflowY: 'auto',
                      }}>
                        {ortSuggestions.map(o => (
                          <li
                            key={o}
                            onMouseDown={() => handleOrtSelect(o)}
                            style={{
                              padding: '10px 14px',
                              cursor: 'pointer',
                              fontSize: 14,
                              borderBottom: '1px solid var(--border,#f0f0f0)',
                              background: ortGewaehlt === o
                                ? 'oklch(from var(--primary,#01696f) l c h / 0.08)'
                                : 'transparent',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'oklch(from var(--primary,#01696f) l c h / 0.07)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = ortGewaehlt === o
                                ? 'oklch(from var(--primary,#01696f) l c h / 0.08)'
                                : 'transparent'
                            }}
                          >
                            {o}
                          </li>
                        ))}
                      </ul>
                    )}

                    {showSuggestions && !loadingOrte && ortInput.length >= 1 && ortSuggestions.length === 0 && ortGewaehlt !== ortInput && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 100,
                        background: 'var(--surface,#fff)',
                        border: '1px solid var(--border,#e0e0e0)',
                        borderRadius: 8,
                        marginTop: 2,
                        padding: '10px 14px',
                        fontSize: 13,
                        color: 'var(--text-muted)',
                      }}>
                        Kein Ort gefunden für „{ortInput}".
                      </div>
                    )}

                    {ortInput && !ortGewaehlt && (
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                        Ort aus der Liste wählen
                      </p>
                    )}
                  </div>
                </div>
              )}

              {ortMsg && <div style={{ marginBottom: 10 }}><Msg msg={ortMsg} /></div>}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {bundesland && ortGewaehlt && (
                  <button className="btn btn-primary" type="button" onClick={handleOrtSave} disabled={ortSaving}>
                    {ortSaving ? 'Speichern…' : 'Ort speichern'}
                  </button>
                )}
                {hasSavedOrt && editOrt && (
                  <button className="btn" type="button" onClick={cancelOrtEdit}>
                    Abbrechen
                  </button>
                )}
              </div>
            </>
          ) : (
            <div style={{
              padding: '12px 14px',
              borderRadius: 10,
              border: '2px solid var(--primary,#01696f)',
              background: 'oklch(from var(--primary,#01696f) l c h / 0.07)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                Gespeicherter Ort
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                {ortAnzeige}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                {bundeslandAnzeige}
              </div>
              <button
                type="button"
                className="btn"
                onClick={startOrtEdit}
                style={{ marginTop: 12, fontSize: 13 }}
              >
                ✎ Ort ändern
              </button>
            </div>
          )}
        </div>

        {/* ── Schule ── */}
        {showSchuleCard && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={sectionTitle}>Schule</h3>

            {hasSavedSchule && !showSchuleSelection ? (
              /* ── Gespeicherte Schule anzeigen ── */
              <div>
                {loadingGespeicherteSchule ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lade Schule…</p>
                ) : gespeicherteSchule ? (
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '2px solid var(--primary,#01696f)',
                    background: 'oklch(from var(--primary,#01696f) l c h / 0.07)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    marginBottom: 12,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                        Deine Schule
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                        {gespeicherteSchule.name}
                      </div>
                      <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {gespeicherteSchule.schulart && (
                          <span style={badgeStyle}>{gespeicherteSchule.schulart}</span>
                        )}
                        {gespeicherteSchule.ort && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {gespeicherteSchule.ort}
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 22, color: 'var(--primary,#01696f)', flexShrink: 0 }}>✓</span>
                  </div>
                ) : null}

                {!editOrt && (
                  <button
                    type="button"
                    onClick={startSchuleEdit}
                    style={aenderungsLinkStyle}
                  >
                    🏫 Schule ändern
                  </button>
                )}

                {schuleMsg && <div style={{ marginTop: 10 }}><Msg msg={schuleMsg} /></div>}
              </div>
            ) : (
              /* ── Schulauswahl anzeigen ── */
              <>
                {editSchule && hasSavedSchule && !editOrt && (
                  <button
                    type="button"
                    className="btn"
                    onClick={cancelSchuleEdit}
                    style={{ fontSize: 13, marginBottom: 14 }}
                  >
                    ← Abbrechen
                  </button>
                )}

                {loadingSchulen ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Schulen werden geladen…</p>
                ) : schulen.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Keine Schulen für diesen Ort gefunden.</p>
                ) : (
                  <>
                    {schulen.length > 3 && schultypen.length > 1 && (
                      <div style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>Schultyp filtern</label>
                        <select
                          className="input"
                          value={schulTypFilter}
                          onChange={e => setSchulTypFilter(e.target.value)}
                          style={{ width: '100%' }}
                        >
                          <option value="">Alle Schultypen ({schulen.length})</option>
                          {schultypen.map(t => (
                            <option key={t} value={t}>
                              {t} ({schulen.filter(s => s.schulart === t).length})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {gefilterteSchulen.map(s => {
                        const isSelected = String(s.id) === String(schuleId || savedSchuleId)
                        return (
                          <div
                            key={s.id}
                            onClick={() => handleSchuleSave(s.id)}
                            style={{
                              padding: '12px 14px',
                              borderRadius: 10,
                              cursor: 'pointer',
                              border: isSelected
                                ? '2px solid var(--primary,#01696f)'
                                : '1px solid var(--border,#e0e0e0)',
                              background: isSelected
                                ? 'oklch(from var(--primary,#01696f) l c h / 0.07)'
                                : 'var(--surface,#fff)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{s.name}</div>
                              {s.schulart && <span style={badgeStyle}>{s.schulart}</span>}
                            </div>
                            {isSelected && <span style={{ fontSize: 18, color: 'var(--primary,#01696f)', flexShrink: 0 }}>✓</span>}
                          </div>
                        )
                      })}
                    </div>

                    {schuleMsg && <div style={{ marginTop: 10 }}><Msg msg={schuleMsg} /></div>}
                    {schuleSaving && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Wird gespeichert…</p>}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── NEU: KLASSENVERWALTUNG ── */}
        {profileInitialized && (
          <KlassenVerwaltung />
        )}

      </div>
    </div>
  )
}

function Msg({ msg }) {
  return (
    <p style={{
      fontSize: 13,
      padding: '7px 12px',
      borderRadius: 8,
      background: msg.ok
        ? 'oklch(from var(--primary,#01696f) l c h / 0.10)'
        : 'oklch(from var(--error,#a12c7b) l c h / 0.08)',
      color: msg.ok ? 'var(--primary,#01696f)' : 'var(--error,#a12c7b)',
      border: msg.ok
        ? '1px solid oklch(from var(--primary,#01696f) l c h / 0.25)'
        : '1px solid oklch(from var(--error,#a12c7b) l c h / 0.25)',
    }}>
      {msg.text}
    </p>
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

const sectionTitle = {
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 14,
  color: 'var(--text)',
}

const badgeStyle = {
  display: 'inline-block',
  marginLeft: 6,
  marginTop: 3,
  background: 'oklch(from var(--primary,#01696f) l c h / 0.10)',
  color: 'var(--primary,#01696f)',
  borderRadius: 4,
  padding: '1px 7px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
}

const aenderungsLinkStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontSize: 13,
  color: 'var(--primary,#01696f)',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
  fontWeight: 600,
}
