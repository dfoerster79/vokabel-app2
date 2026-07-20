import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import ProfileSetupPage from './pages/ProfileSetupPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import SchulenPage from './pages/SchulenPage.jsx'
import FaecherPage from './pages/FaecherPage.jsx'
import SchulenImportPage from './pages/SchulenImportPage.jsx'
import OrteImportPage from './pages/OrteImportPage.jsx'
import ProfilPage from './pages/ProfilPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import FotoTestPage from './pages/FotoTestPage.jsx'  // NEU
import { useAuthStore } from './store/authStore.js'
import AdminFachuebersichtPage from './pages/AdminFachuebersichtPage.jsx'
import LernenPage from './pages/LernenPage.jsx'
import MultipleChoicePage from './pages/MultipleChoicePage';

export default function App() {
  const user = useAuthStore(s => s.user)
  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" /> : <LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/profil-einrichten" element={user ? <ProfileSetupPage /> : <Navigate to="/" />} />
      <Route path="/dashboard" element={user ? <DashboardPage /> : <Navigate to="/" />} />
      <Route path="/admin/fachuebersicht" element={<AdminFachuebersichtPage />} />
      <Route path="/profil" element={user ? <ProfilPage /> : <Navigate to="/" />} />
      <Route path="/lernen" element={<LernenPage />} />
      <Route path="/neuer-test" element={user ? <FotoTestPage /> : <Navigate to="/" />} />  {/* NEU */}
      <Route path="/admin" element={user ? <AdminPage /> : <Navigate to="/" />} />
      <Route path="/admin/schulen" element={user ? <SchulenPage /> : <Navigate to="/" />} />
      <Route path="/admin/faecher" element={user ? <FaecherPage /> : <Navigate to="/" />} />
      <Route path="/admin/schulen-import" element={user ? <SchulenImportPage /> : <Navigate to="/" />} />
      <Route path="/admin/orte-import" element={user ? <OrteImportPage /> : <Navigate to="/" />} />
      <Route path="/lernen/multiple_choice/:testId" element={<MultipleChoicePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
