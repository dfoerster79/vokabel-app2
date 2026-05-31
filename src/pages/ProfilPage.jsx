import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/authStore.js'
import { useRole } from '../hooks/useRole.js'

const BUNDESLAENDER = [
  'Baden-Württemberg','Bayern','Berlin','Brandenburg','Bremen',
  'Hamburg','Hessen','Mecklenburg-Vorpommern','Niedersachsen',
  'Nordrhein-Westfalen','Rheinland-Pfalz','Saarland','Sachsen',
  'Sachsen-Anhalt','Schleswig-Holstein','Thüringen'
]

export default function ProfilPage() {
  const { user } = useAuthStore()
  const { profile, loading: roleLoading } = useRole()

  // ── Name ──
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameMsg, setNameMsg] = useState(null)

  // ── Passwort ──
  const [pwNeu, setPwNeu] = useState('')
  const [pwWdh, setPwWdh] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  // ── Bundesland / Schule ──
  const [bundesland, setBundesland] = useState('')
  const [ortSuche, setOrtSuche] = useState('')
  const [orte, setOrte] = useState([])
  const [loadingOrte, setLoadingOrte] = useState(false)
  const [ort, setOrt] = useState('')
  const [schulen, setSchulen] = useState([])
  const [loadingSchulen, setLoadingSchulen] = useState(false)
  const [schuleId, setSchuleId] = useState('')
  const [schulenLeer, setSchulenLeer] = useState(false)
  const [schuleSaving, setSchuleSaving] = useState(false)
  const [schuleMsg, setSchuleMsg] = useState(null)

  // Profildaten laden
  useEffect(() => {
    if (!profile) return
    setVorname(profile.vorname || '')
    setNachname(profile.nachname || '')
    setBundesland(profile.bundesland || '')
    setOrt(profile.ort || '')
    setSchuleId(profile.schule_id || '')
  }, [profile])

  // Orte laden wenn Bundesland gesetzt
  useEffect(() => {
    if (!bundesland) { setOrte([]); setOrt(''); setOrtSuche(''); setSchulen([]); setSchuleId(''); return }
    setLoadingOrte(true)
    setOrt('')
    setOrtSuche('')
    setSchulen([])
    setSchuleId('')
    supabase
      .from('schulen')
      .select('ort')
      .eq('bundesland', bundesland)
      .order('ort')
      .then(({ data }) => {
        const unique = [...new Set((data || []).map(r => r.ort).filter(Boolean))].sort()
        setOrte(unique)
        setLoadingOrte(false)
      })
  }, [bundesland])

  // Schulen laden wenn Ort gewählt
  useEffect(() => {
    if (!ort) { setSchulen([]); setSchuleId(''); setSchulenLeer(false); return }
    setLoadingSchulen(true)
    setSchuleId('')
    setSchulenLeer(false)
    supabase
      .from('schulen')
      .select('id, name, schulart')
      .eq('bundesland', bundesland)
      .eq('ort', ort)
      .order('name')
      .then(({ data }) => {
        setSchulen(data || [])
        setSchulenLeer((data || []).length === 0)
        setLoadingSchulen(false)
      })
  }, [ort])

  // Prefix-Suche: nur Orte die MIT dem Suchbegriff beginnen
  const gefilterteOrte = ortSuche
    ? orte.filter(o => o.toLowerCase().startsWith(ortSuche.toLowerCase()))
    : orte

  // ── Name speichern ──
  const handleNameSave = async (e) => {
    e.preventDefault()
    if (!vorname.trim()) { setNameMsg({ ok: false, text: 'Vorname darf nicht leer sein.' }); return }
    setNameSaving(true)
    setNameMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({ vorname: vorname.trim(), nachname: nachname.trim() })
      .eq('id', user.id)
    setNameSaving(false)
    setNameMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Name gespeichert ✓' })
  }

  // ── Passwort speichern ──
  const handlePwSave = async (e) => {
    e.preventDefault()
    setPwMsg(null)
    if (pwNeu.length < 6) { setPwMsg({ ok: false, text: 'Passwort muss mindestens 6 Zeichen haben.' }); return }
    if (pwNeu !== pwWdh) { setPwMsg({ ok: false, text: 'Passwörter stimmen nicht überein.' }); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pwNeu })
    setPwSaving(false)
    if (error) { setPwMsg({ ok: false, text: error.message }); return }
    setPwMsg({ ok: true, text: 'Passwort geändert ✓' })
    setPwNeu('')
    setPwWdh('')
  }

  // ── Bundesland / Schule speichern ──
  const handleSchuleSave = async (e) => {
    e.preventDefault()
    if (!bundesland) { setSchuleMsg({ ok: false, text: 'Bitte Bundesland wählen.' }); return }
    setSchuleSaving(true)
    setSchuleMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({
        bundesland,
        ort: ort || null,
        schule_id: schuleId || null,
      })
      .eq('id', user.id)
    setSchuleSaving(false)
    setSchuleMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Gespeichert ✓' })
  }

  if (roleLoading) return (
    <div className="page-center">
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        <p>Lade...</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <nav className="nav">
        <Link to="/dashboard" className="nav-logo">
          <div className="nav-logo-icon">📚</div>
          VokabelApp
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

        {/* ── 1. Name ── */}
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

        {/* ── 2. Passwort ── */}
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

        {/* ── 3. Bundesland & Schule ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={sectionTitle}>Bundesland & Schule</h3>
          <form onSubmit={handleSchuleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Bundesland */}
            <div>
              <label style={labelStyle}>Bundesland</label>
              <select
                className="input"
                value={bundesland}
                onChange={e => setBundesland(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">– Bundesland wählen –</option>
                {BUNDESLAENDER.map(bl => (
                  <option key={bl} value={bl}>{bl}</option>
                ))}
              </select>
            </div>

            {/* Ort-Suche (nur wenn Bundesland gewählt) */}
            {bundesland && (
              <div>
                <label style={labelStyle}>Ort / Stadt</label>
                {loadingOrte ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Orte werden geladen…</p>
                ) : (
                  <>
                    <input
                      className="input"
                      placeholder="Ort eingeben (z.B. Stein…)"
                      value={ortSuche}
                      onChange={e => { setOrtSuche(e.target.value); setOrt('') }}
                      style={{ width: '100%', marginBottom: 6 }}
                    />
                    {ortSuche.length > 0 && (
                      <select
                        className="input"
                        value={ort}
                        onChange={e => setOrt(e.target.value)}
                        style={{ width: '100%' }}
                        size={Math.min(gefilterteOrte.length + 1, 6)}
                      >
                        <option value="">– Ort wählen –</option>
                        {gefilterteOrte.length === 0 ? (
                          <option disabled>Keine Orte gefunden</option>
                        ) : (
                          gefilterteOrte.map(o => (
                            <option key={o} value={o}>{o}</option>

                          ))
                        )}
                      </select>
                    )}
                    {ortSuche.length === 0 && orte.length > 0 && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {orte.length} Orte verfügbar – Suchbegriff eingeben
                      </p>
                    )}
                    {orte.length === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Noch keine Schulen für dieses Bundesland importiert.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Schule (nur wenn Ort gewählt) */}
            {ort && (
              <div>
                <label style={labelStyle}>Schule</label>
                {loadingSchulen ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Schulen werden geladen…</p>
                ) : schulenLeer ? (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Keine Schulen für diesen Ort gefunden.</p>
                ) : (
                  <select
                    className="input"
                    value={schuleId}
                    onChange={e => setSchuleId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">– Schule wählen (optional) –</option>
                    {schulen.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.schulart ? ` (${s.schulart})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {schuleMsg && <Msg msg={schuleMsg} />}
            <button className="btn btn-primary" type="submit" disabled={schuleSaving || !bundesland} style={{ alignSelf: 'flex-start' }}>
              {schuleSaving ? 'Speichern…' : 'Bundesland & Schule speichern'}
            </button>
          </form>
        </div>

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
