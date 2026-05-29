import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase.js'
import { useNavigate, Link } from 'react-router-dom'

export default function RegisterPage() {
  const { register, handleSubmit, formState: { errors } } = useForm()
  const navigate = useNavigate()

  const onSubmit = async ({ email, password }) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) { alert(error.message); return }
    alert('Registrierung erfolgreich – bitte E-Mail bestätigen.')
    navigate('/')
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24 }}>
      <h1>Registrierung</h1>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label>E-Mail</label>
          <input
            {...register('email', { required: 'Pflichtfeld' })}
            autoComplete="username"
            style={{ display: 'block', width: '100%', marginBottom: 4 }}
          />
          {errors.email && <span style={{ color: 'red', fontSize: 12 }}>{errors.email.message}</span>}
        </div>
        <div style={{ marginTop: 12 }}>
          <label>Passwort</label>
          <input
            type="password"
            {...register('password', { required: 'Pflichtfeld', minLength: { value: 6, message: 'Mind. 6 Zeichen' } })}
            autoComplete="new-password"
            style={{ display: 'block', width: '100%', marginBottom: 4 }}
          />
          {errors.password && <span style={{ color: 'red', fontSize: 12 }}>{errors.password.message}</span>}
        </div>
        <button type="submit" style={{ marginTop: 20, width: '100%', padding: '10px 0', background: '#01696f', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Registrieren
        </button>
      </form>
      <p style={{ marginTop: 16, fontSize: 14 }}>
        <Link to="/">← Zurück zum Login</Link>
      </p>
    </div>
  )
}
