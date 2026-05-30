import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import ProfileSetupPage from './pages/ProfileSetupPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import SchulenPage from './pages/SchulenPage.jsx'
import SchulenImportPage from './pages/SchulenImportPage.jsx'
import OrteImportPage from './pages/OrteImportPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import { useAuthStore } from './store/authStore.js'

export default function App() {
  const user = useAuthStore(s => s.user)
  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" /> : <LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/profil-einrichten" element={user ? <ProfileSetupPage /> : <Navigate to="/" />} />
      <Route path="/dashboard" element={user ? <DashboardPage /> : <Navigate to="/" />} />
      <Route path="/admin" element={user ? <AdminPage /> : <Navigate to="/" />} />
      <Route path="/admin/schulen" element={user ? <SchulenPage /> : <Navigate to="/" />} />
      <Route path="/admin/schulen-import" element={user ? <SchulenImportPage /> : <Navigate to="/" />} />
      <Route path="/admin/orte-import" element={user ? <OrteImportPage /> : <Navigate to="/" />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
