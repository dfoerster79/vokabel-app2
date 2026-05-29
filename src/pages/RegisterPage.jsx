import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase.js'
import { useNavigate, Link } from 'react-router-dom'

export default function RegisterPage() {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm()
  const navigate = useNavigate()
  const password = watch('password')

  const onSubmit = async ({ benutzername, password, vorname, nachname }) => {
    // Registrierung über Edge Function — kein E-Mail-Versand, sofort bestätigt
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { benutzername, password, vorname, nachname }
    })

    if (error || data?.error) {
      alert(data?.error || error.message)
      return
    }

    alert('Registrierung erfolgreich! Du kannst dich jetzt anmelden.')
    navigate('/')
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
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Konto erstellen</h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Neue Accounts erhalten automatisch die Rolle <strong>Schüler</strong>. Lehrer-Rechte werden vom Administrator vergeben.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className="form-group">
              <label className="form-label">Benutzername</label>
              <input
                className={`form-input ${errors.benutzername ? 'error' : ''}`}
                {...register('benutzername', {
                  required: 'Pflichtfeld',
                  minLength: { value: 3, message: 'Mind. 3 Zeichen' },
                  pattern: { value: /^[a-zA-Z0-9._-]+$/, message: 'Nur Buchstaben, Zahlen, . _ - erlaubt' }
                })}
                type="text"
                autoComplete="username"
                placeholder="z.B. max.mustermann"
                autoCapitalize="none"
              />
              {errors.benutzername && <span className="form-error">{errors.benutzername.message}</span>}
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Erlaubt: Buchstaben, Zahlen, Punkt, Unterstrich, Bindestrich</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Vorname</label>
                <input className={`form-input ${errors.vorname ? 'error' : ''}`} {...register('vorname', { required: 'Pflichtfeld' })} placeholder="Max" />
                {errors.vorname && <span className="form-error">{errors.vorname.message}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Nachname</label>
                <input className={`form-input ${errors.nachname ? 'error' : ''}`} {...register('nachname', { required: 'Pflichtfeld' })} placeholder="Mustermann" />
                {errors.nachname && <span className="form-error">{errors.nachname.message}</span>}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Passwort</label>
              <input
                className={`form-input ${errors.password ? 'error' : ''}`}
                {...register('password', { required: 'Pflichtfeld', minLength: { value: 6, message: 'Mind. 6 Zeichen' } })}
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
              />
              {errors.password && <span className="form-error">{errors.password.message}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Passwort wiederholen</label>
              <input
                className={`form-input ${errors.password2 ? 'error' : ''}`}
                {...register('password2', {
                  required: 'Pflichtfeld',
                  validate: v => v === password || 'Passwörter stimmen nicht überein'
                })}
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
              />
              {errors.password2 && <span className="form-error">{errors.password2.message}</span>}
            </div>

            <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Registrieren...' : 'Konto erstellen'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--text-muted)' }}>
            <Link to="/" style={{ color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>← Zurück zum Login</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
