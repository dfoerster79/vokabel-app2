import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useRole } from '../hooks/useRole.js'
import { supabase } from '../lib/supabase.js'

const menuSchueler = [
  { icon: '📝', label: 'Neuer Test', desc: 'Foto-Scan: Vokabeln aus Buch', to: '/neuer-test' },
  { icon: '🎯', label: 'Lernen', desc: 'Vokabeln üben', to: '/lernen' },
  { icon: '🏆', label: 'Rangliste', desc: 'Vergleiche dich mit anderen', to: '/rangliste' },
  { icon: '🏫', label: 'Mein Kurs', desc: 'Kurseinstellungen', to: '/profil' },
]

const menuLehrer = [
  { icon: '📝', label: 'Sets verwalten', desc: 'Vokabelsets pflegen', to: '/sets' },
  { icon: '👥', label: 'Kurse', desc: 'Kurse & Schüler', to: '/kurse' },
  { icon: '📊', label: 'Ergebnisse', desc: 'Lernfortschritt', to: '/ergebnisse' },
  { icon: '⚙️', label: 'Einstellungen', desc: 'Mein Profil', to: '/profil' },
]

const rolleConfig = {
  schueler: { label: 'Schüler', badgeClass: 'badge-schueler', menu: menuSchueler, greeting: 'Was möchtest du heute lernen?' },
  lehrer: { label: 'Lehrer', badgeClass: 'badge-lehrer', menu: menuLehrer, greeting: 'Verwalte deine Kurse und Vokabelsets.' },
  admin: { label: 'Admin', badgeClass: 'badge-admin', menu: menuSchueler, greeting: 'Was möchtest du heute lernen?' },
}

// Hilfsfunktion: Datum formatieren
const formatActivityDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  
  const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth() && date.getFullYear() === yesterday.getFullYear();

  const timeOptions = { hour: '2-digit', minute: '2-digit' };
  const timeString = date.toLocaleTimeString('de-DE', timeOptions);

  if (isToday) return `Heute, ${timeString}`;
  if (isYesterday) return `Gestern, ${timeString}`;
  
  return `${date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${timeString}`;
};

// Hilfsfunktion: Zeit in MM:SS formatieren
const formatDuration = (seconds) => {
  if (!seconds) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { rolle, profile, loading: roleLoading } = useRole()
  
  const [recentActivities, setRecentActivities] = useState([])
  const [loadingActivities, setLoadingActivities] = useState(true)

  const config = rolleConfig[rolle] || rolleConfig.schueler
  const vorname = profile?.vorname || user?.user_metadata?.vorname || user?.email?.split('@')[0] || 'Willkommen'
  
  // Deine Original-Logik für den Admin-Check
  const username = user?.user_metadata?.username || user?.email?.split('@')[0]
  const showAdminLink = rolle === 'admin' || username === 'dfoerster'

  useEffect(() => {
    if (user) {
      loadRecentActivities();
    }
  }, [user]);

  const loadRecentActivities = async () => {
    setLoadingActivities(true);
    const { data, error } = await supabase
      .from('lern_attempts')
      .select(`
        id, created_at, correct_count, question_count, percent_correct, time_taken_seconds,
        faecher(name), vokabel_tests(name)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!error && data) {
      setRecentActivities(data);
    }
    setLoadingActivities(false);
  };

  if (roleLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Lade Dashboard...</div>

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", paddingBottom: "5rem", fontFamily: "sans-serif" }}>
      
      {/* Menüleiste */}
      <div style={{ backgroundColor: "white", padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e5e7eb", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: "bold", fontSize: "1.2rem", color: "#0f5156" }}>
          📚 VokabelApp
        </div>
        <button 
          onClick={logout}
          style={{ background: "none", border: "none", color: "#ef4444", fontSize: "0.9rem", cursor: "pointer", fontWeight: "600" }}
        >
          Abmelden
        </button>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 1rem" }}>
        
        {/* Begrüßungs-Karte mit Verlauf */}
        <div style={{ background: "linear-gradient(135deg, #0f5156 0%, #167a7f 100%)", padding: "1.5rem", borderRadius: "1rem", marginBottom: "2rem", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
            <h1 style={{ margin: 0, color: "white", fontSize: 24, fontWeight: "800" }}>
              Hallo {vorname}! 👋
            </h1>
            
            {/* Deine Admin/Rollen Logik */}
            {showAdminLink ? (
              <Link 
                to="/admin" 
                style={{ textDecoration: 'none', background: "rgba(255,255,255,0.2)", color: "white", padding: "4px 10px", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: "bold", textTransform: "uppercase" }}
              >
                Admin
              </Link>
            ) : (
              <span style={{ background: "rgba(255,255,255,0.2)", color: "white", padding: "4px 10px", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: "bold", textTransform: "uppercase" }}>
                {config.label}
              </span>
            )}
          </div>
          <p style={{ color: "#e5e7eb", margin: "0 0 1rem 0", fontSize: 14, lineHeight: 1.5 }}>
            {config.greeting}
          </p>
          
          {/* Der Link zum Profil */}
          <Link to="/profil" style={{ color: "#2dd4bf", fontSize: "0.875rem", textDecoration: "none", fontWeight: "600", display: "inline-block" }}>
            Profil verwalten ➔
          </Link>
        </div>

        {/* Schnellzugriff */}
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{ fontSize: 12, fontWeight: "bold", color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
            Schnellzugriff
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
            {config.menu.map((item, index) => (
              <Link
                key={index}
                to={item.to}
                style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: 10, background: "white", border: "none", borderRadius: "1rem", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", cursor: "pointer", transition: "transform 0.1s" }}
                onMouseOver={(e) => e.currentTarget.style.transform = "scale(0.98)"}
                onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
              >
                <div style={{ fontSize: 28 }}>{item.icon}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: "bold", color: "#111827", marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.3 }}>{item.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Letzte Aktivitäten */}
        <div>
          <div style={{ fontSize: 12, fontWeight: "bold", color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
            Letzte Aktivität
          </div>
          
          {loadingActivities ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>Lade Aktivitäten...</div>
          ) : recentActivities.length === 0 ? (
            <div style={{ background: "white", padding: "2rem", borderRadius: "1rem", textAlign: "center", color: "#6b7280", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🌱</div>
              Noch keine Aktivitäten vorhanden.<br/>Starte deinen ersten Test, um loszulegen!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {recentActivities.map((activity) => {
                const isPerfect = activity.percent_correct === 100;
                const isGood = activity.percent_correct >= 75;
                
                return (
                  <div 
                    key={activity.id} 
                    style={{ background: "white", padding: "1.25rem", borderRadius: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: "bold", color: "#111827", fontSize: "1.05rem" }}>
                          {activity.vokabel_tests?.name || 'Unbekannter Test'}
                        </span>
                        <span style={{ fontSize: "0.75rem", background: "#f3f4f6", color: "#4b5563", padding: "2px 8px", borderRadius: "9999px", fontWeight: "600" }}>
                          {activity.faecher?.name || 'Fach'}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "#6b7280", display: "flex", alignItems: "center", gap: "8px" }}>
                        <span>🕒 {formatActivityDate(activity.created_at)}</span>
                        <span>•</span>
                        <span>⏱️ {formatDuration(activity.time_taken_seconds)}</span>
                      </div>
                    </div>
                    
                    <div style={{ textAlign: "right" }}>
                      <div style={{ 
                        fontSize: "1.1rem", fontWeight: "900", 
                        color: isPerfect ? "#10b981" : isGood ? "#f59e0b" : "#ef4444" 
                      }}>
                        {activity.percent_correct}%
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "2px", fontWeight: "600" }}>
                        {activity.correct_count} / {activity.question_count}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
