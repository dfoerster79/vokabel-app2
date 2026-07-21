import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";

export default function RanglistePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  const [faecher, setFaecher] = useState([]);
  const [selectedFach, setSelectedFach] = useState(null);
  const [rangliste, setRangliste] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingRangliste, setLoadingRangliste] = useState(false);
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    loadInitialData();
  }, [user]);

  const loadInitialData = async () => {
    setLoading(true);
    
    // 1. Hole Profil des aktuellen Nutzers (für Schule und Klasse)
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, vorname, nachname, schule_id")
        .eq("id", user.id)
        .single();
        
      setUserProfile(profile);
    }

    // 2. Lade alle Fächer für die Auswahl
    const { data: faecherData } = await supabase
      .from("faecher")
      .select("*")
      .order("name");
      
    if (faecherData) setFaecher(faecherData);
    setLoading(false);
  };

  // Wird aufgerufen, wenn ein Fach angeklickt wird
  const handleFachSelect = async (fach) => {
    setSelectedFach(fach);
    setLoadingRangliste(true);

    if (!userProfile || !userProfile.schule_id) {
      setLoadingRangliste(false);
      return;
    }

    // Wir rufen die neue Datenbank-Funktion (RPC) auf
    const { data, error } = await supabase.rpc('get_rangliste', {
      p_fach_id: fach.id,
      p_schule_id: userProfile.schule_id
    });

    if (error) {
      console.error("Fehler beim Laden der Rangliste:", error);
      setRangliste([]);
    } else if (data) {
      // Das fertige Ergebnis ins richtige Format für unsere Anzeige umwandeln
      const formatierteListe = data.map(row => ({
        userId: row.user_id,
        vorname: row.vorname || "Unbekannt",
        nachname: row.nachname ? row.nachname.charAt(0) + "." : "",
        punkte: row.punkte,
        anzahlTests: row.anzahl_tests
      }));
      setRangliste(formatierteListe);
    }
    
    setLoadingRangliste(false);
  };

    // 3. Lade alle Versuche für dieses Fach an dieser Schule
    // Wir nutzen hier einen Join zu den Profilen, um sicherzugehen, 
    // dass wir nur Schüler der gleichen Schule (und idealerweise Klasse) vergleichen.
    
    const { data: attempts, error } = await supabase
      .from("lern_attempts")
      .select(`
        user_id,
        correct_count,
        profiles!inner(id, vorname, nachname, schule_id)
      `)
      .eq("fach_id", fach.id)
      .eq("profiles.schule_id", userProfile.schule_id);

    if (error || !attempts) {
      console.error("Fehler beim Laden der Rangliste:", error);
      setRangliste([]);
      setLoadingRangliste(false);
      return;
    }

    // 4. Punkte pro Nutzer zusammenrechnen
    const punkteProNutzer = {};

    attempts.forEach(attempt => {
      const uId = attempt.user_id;
      if (!punkteProNutzer[uId]) {
        // Initiale Anlage des Nutzers im Objekt
        punkteProNutzer[uId] = {
          userId: uId,
          vorname: attempt.profiles.vorname || "Unbekannt",
          nachname: attempt.profiles.nachname ? attempt.profiles.nachname.charAt(0) + "." : "",
          punkte: 0,
          anzahlTests: 0
        };
      }
      // Punkte addieren
      punkteProNutzer[uId].punkte += (attempt.correct_count || 0);
      punkteProNutzer[uId].anzahlTests += 1;
    });

    // 5. In ein Array umwandeln und nach Punkten sortieren
    const sortierteListe = Object.values(punkteProNutzer).sort((a, b) => b.punkte - a.punkte);
    
    setRangliste(sortierteListe);
    setLoadingRangliste(false);
  };

  const getFachIcon = (name) => {
    const n = name.toLowerCase();
    if (n.includes("englisch")) return "🇬🇧";
    if (n.includes("französisch")) return "🇫🇷";
    if (n.includes("spanisch")) return "🇪🇸";
    if (n.includes("latein")) return "🏛️";
    return "📚";
  };

  if (loading) return <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>Lade Daten...</div>;

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", paddingBottom: "5rem", fontFamily: "sans-serif" }}>
      
      {/* Menüleiste */}
      <div style={{ backgroundColor: "white", padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e5e7eb", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: "bold", fontSize: "1.2rem", color: "#0f5156" }}>
          🏆 Rangliste
        </div>
        <button 
          onClick={() => navigate('/dashboard')}
          style={{ background: "none", border: "none", color: "#6b7280", fontSize: "0.9rem", cursor: "pointer" }}
        >
          Zurück
        </button>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 1rem" }}>
        
        {/* Header Karte */}
        <div style={{ backgroundColor: "#0f5156", padding: "1.5rem", borderRadius: "1rem", marginBottom: "2rem", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
          <h2 style={{ margin: 0, color: "white", fontSize: 22, display: "flex", alignItems: "center", gap: 8 }}>
            Vergleiche dich!
          </h2>
          <p style={{ color: "#e5e7eb", marginTop: 10, fontSize: 14, lineHeight: 1.5, opacity: 0.9 }}>
            Wähle ein Fach, um zu sehen, wer an deiner Schule die meisten Vokabel-Punkte gesammelt hat.
          </p>
        </div>

        {/* Fach-Auswahl */}
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{ fontSize: 12, fontWeight: "bold", color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
            Fach wählen
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: "10px", scrollbarWidth: "none" }}>
            {faecher.map((fach) => (
              <button
                key={fach.id}
                onClick={() => handleFachSelect(fach)}
                style={{ 
                  flex: "0 0 auto",
                  padding: "0.75rem 1.25rem", 
                  background: selectedFach?.id === fach.id ? "#0f5156" : "white", 
                  color: selectedFach?.id === fach.id ? "white" : "#1f2937",
                  border: "none", 
                  borderRadius: "9999px", 
                  fontWeight: "bold",
                  display: "flex", alignItems: "center", gap: 8,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)", 
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                <span>{getFachIcon(fach.name)}</span> {fach.name}
              </button>
            ))}
          </div>
        </div>

        {/* Die eigentliche Rangliste */}
        {selectedFach && (
          <div>
            <div style={{ fontSize: 12, fontWeight: "bold", color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
              Topliste {selectedFach.name}
            </div>

            {loadingRangliste ? (
              <div style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>Berechne Punkte...</div>
            ) : rangliste.length === 0 ? (
              <div style={{ background: "white", padding: "2rem", borderRadius: "1rem", textAlign: "center", color: "#6b7280", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                Noch keine Punkte in diesem Fach gesammelt. Sei der Erste!
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {rangliste.map((teilnehmer, index) => {
                  const isMe = teilnehmer.userId === user?.id;
                  let platzIcon = `${index + 1}.`;
                  if (index === 0) platzIcon = "🥇";
                  if (index === 1) platzIcon = "🥈";
                  if (index === 2) platzIcon = "🥉";

                  return (
                    <div 
                      key={teilnehmer.userId}
                      style={{ 
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        background: isMe ? "#ccfbf1" : "white", 
                        padding: "1rem", 
                        borderRadius: "1rem", 
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                        border: isMe ? "1px solid #2dd4bf" : "1px solid transparent"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <div style={{ width: 30, textAlign: "center", fontSize: index < 3 ? "1.5rem" : "1.1rem", fontWeight: "bold", color: "#9ca3af" }}>
                          {platzIcon}
                        </div>
                        <div>
                          <div style={{ fontWeight: "bold", color: isMe ? "#0f5156" : "#1f2937", fontSize: "1.1rem" }}>
                            {teilnehmer.vorname} {teilnehmer.nachname} {isMe && "(Du)"}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                            {teilnehmer.anzahlTests} Tests absolviert
                          </div>
                        </div>
                      </div>
                      <div style={{ fontWeight: "900", fontSize: "1.2rem", color: isMe ? "#0f5156" : "#2dd4bf" }}>
                        {teilnehmer.punkte} Pkt.
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
