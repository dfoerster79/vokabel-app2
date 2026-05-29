import { useAuthStore } from '../store/authStore.js'

export default function DashboardPage() {
  const { user, logout } = useAuthStore()
  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 24 }}>
      <h1>Dashboard</h1>
      <p>Angemeldet als: <strong>{user?.email}</strong></p>
      <button onClick={logout} style={{ padding: '8px 16px', cursor: 'pointer' }}>Abmelden</button>
    </div>
  )
}
