import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/authStore.js'

const BUNDESLAENDER = [
  'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen',
  'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen',
  'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen',
  'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen'
]

export default function ProfileSetupPage() {
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()

  const [bundesland, setBundesland] = useState('')
  const [ort, setOrt] = useState('')
  const [schuleId, setSchuleId] = useState('')
  const [ortSuche, setOrtSuche] = useState('')

  const [orte, setOrte] = useState([])
  const [schulen, setSchulen] = useState([])
  const [loadingOrte, setLoadingOrte] = useState(false)
  const [loadingSchulen, setLoadingSchulen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [schulenLeer, setSchulenLeer] = useState(false)

  // Orte laden wenn Bundesland gewählt
  useEffect(() => {
    if (!bundesland) { setOrte([]); setOrt(''); setSchulen([]); setSchuleId(''); return }
    setLoadingOrte(true)
    setOrt('')
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

  const gefilterteOrte = ortSuche
    ? orte.filter(o => o.toLowerCase().includes(ortSuche.toLowerCase()))
    : orte

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!bundesland || !ort) { setError('Bitte Bundesland und Ort auswählen.'); return }
    setSaving(true)
    const { error: err } = await supabase
      .from('profiles')
      .update({
        bundesland,
        ort,
        schule_id: schuleId || null,
        profil_komplett: true
      })
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
    <div className="page-center">
      <div className="page-content">
        <div className="app-logo">
          <div className="app-logo-icon">📚</div>
          <span className="app-logo-name">VokabelApp</span>
        </div>

        <div className="card">
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Profil ergänzen</h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              Damit du die richtigen Vokabeltests siehst, gib bitte dein Bundesland, deinen Ort und deine Schule an.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Bundesland */}
            <div className="form-group">
              <label className="form-label">Bundesland</label>
              <select
                className="form-input"
                value={bundesland}
                onChange={e => setBundesland(e.target.value)}
              >
                <option value="">– Bundesland wählen –</option>
                {BUNDESLAENDER.map(bl => (
                  <option key={bl} value={bl}>{bl}</option>
                ))}
              </select>
            </div>

            {/* Ort */}
            {bundesland && (
              <div className="form-group">
                <label className="form-label">Ort / Stadt</label>
                {loadingOrte ? (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Orte werden geladen…</div>
                ) : orte.length > 20 ? (
                  <>
                    <input
                      className="form-input"
                      placeholder="Ort suchen…"
                      value={ortSuche}
                      onChange={e => setOrtSuche(e.target.value)}
                      style={{ marginBottom: 6 }}
                    />
                    <select
                      className="form-input"
                      value={ort}
                      onChange={e => setOrt(e.target.value)}
                    >
                      <option value="">– Ort wählen –</option>
                      {gefilterteOrte.map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <select
                    className="form-input"
                    value={ort}
                    onChange={e => setOrt(e.target.value)}
                  >
                    <option value="">– Ort wählen –</option>
                    {orte.map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                )}
                {orte.length === 0 && !loadingOrte && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Noch keine Schulen für dieses Bundesland importiert.
                  </p>
                )}
              </div>
            )}

            {/* Schule */}
            {ort && (
              <div className="form-group">
                <label className="form-label">Schule</label>
                {loadingSchulen ? (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Schulen werden geladen…</div>
                ) : schulenLeer ? (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Keine Schulen für diesen Ort gefunden.</p>
                ) : (
                  <select
                    className="form-input"
                    value={schuleId}
                    onChange={e => setSchuleId(e.target.value)}
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

            {error && (
              <p style={{ fontSize: 13, color: 'var(--error, #a12c7b)', background: 'var(--error-bg, #f9f0f5)', padding: '8px 12px', borderRadius: 8 }}>
                {error}
              </p>
            )}

            <button
              className="btn btn-primary"
              type="submit"
              disabled={saving || !bundesland || !ort}
            >
              {saving ? 'Wird gespeichert…' : 'Speichern & weiter'}
            </button>

            <button
              type="button"
              onClick={handleSkip}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', textAlign: 'center', paddingTop: 4 }}
            >
              Jetzt überspringen
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
