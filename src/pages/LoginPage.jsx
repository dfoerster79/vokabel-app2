import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/authStore.js'
import { useNavigate, Link } from 'react-router-dom'

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()
  const [rememberMe, setRememberMe] = useState(true)
  const [serverError, setServerError] = useState('')
  const setUser = useAuthStore(s => s.setUser)
  const navigate = useNavigate()

  const onSubmit = async ({ benutzername, password }) => {
    setServerError('')
    const email = `${benutzername.trim().toLowerCase()}@vokabelapp.local`
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setServerError('Benutzername oder Passwort falsch.')
      return
    }
    setUser(data.user)
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
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Willkommen 👋</h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Melde dich mit deinem Benutzernamen an.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Benutzername</label>
              <input
                className={`form-input ${errors.benutzername ? 'error' : ''}`}
                {...register('benutzername', {
                  required: 'Pflichtfeld',
                  pattern: { value: /^[a-zA-Z0-9._-]+$/, message: 'Nur Buchstaben, Zahlen, . _ - erlaubt' }
                })}
                type="text"
                autoComplete="username"
                placeholder="z.B. max.mustermann"
                autoCapitalize="none"
              />
              {errors.benutzername && <span className="form-error">{errors.benutzername.message}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Passwort</label>
              <input
                className={`form-input ${errors.password ? 'error' : ''}`}
                {...register('password', { required: 'Pflichtfeld' })}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
              />
              {errors.password && <span className="form-error">{errors.password.message}</span>}
            </div>

            <label className="checkbox-row">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
              Angemeldet bleiben
            </label>

            {serverError && <div className="alert-error">{serverError}</div>}

            <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Anmelden...' : 'Anmelden'}
            </button>
          </form>

          <div className="divider" style={{ margin: '20px 0' }}>oder</div>

          <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' }}>
            Noch kein Konto?{' '}
            <Link to="/register" style={{ color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>
              Jetzt registrieren →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
