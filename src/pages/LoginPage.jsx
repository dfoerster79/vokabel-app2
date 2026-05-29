import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/authStore.js'
import { useNavigate, Link } from 'react-router-dom'

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors } } = useForm()
  const setUser = useAuthStore(s => s.setUser)
  const navigate = useNavigate()

  const onSubmit = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { alert(error.message); return }
    setUser(data.user)
    navigate('/dashboard')
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24 }}>
      <h1>VokabelApp</h1>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label>E-Mail / Benutzername</label>
          <input
            {...register('email', { required: 'Pflichtfeld' })}
            autoComplete="username"
            style={{ display: 'block', width: '100%', marginBottom: 4 }}
          />
          {errors.email && <span style={{ color: 'red', fontSize: 12 }}>{errors.email.message}</span>}
        </div>
        <div style={{ marginTop: 12 }}>
          <label>Passwort / PIN</label>
          <input
            type="password"
            {...register('password', { required: 'Pflichtfeld' })}
            autoComplete="current-password"
            style={{ display: 'block', width: '100%', marginBottom: 4 }}
          />
          {errors.password && <span style={{ color: 'red', fontSize: 12 }}>{errors.password.message}</span>}
        </div>
        <button type="submit" style={{ marginTop: 20, width: '100%', padding: '10px 0', background: '#01696f', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Anmelden
        </button>
      </form>
      <p style={{ marginTop: 16, fontSize: 14 }}>
        Noch kein Konto?{' '}
        <Link to="/register">Jetzt registrieren →</Link>
      </p>
    </div>
  )
}
