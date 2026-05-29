import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import { useAuthStore } from './store/authStore.js'

export default function App() {
  const user = useAuthStore(s => s.user)
  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" /> : <LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={user ? <DashboardPage /> : <Navigate to="/" />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
