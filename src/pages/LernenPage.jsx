import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuthStore } from "../store/authStore.js";

// Farben aus deinen Screenshots
const BRAND_COLOR = "#0f5156"; // Dunkles Tannengrün
const BRAND_LIGHT = "#ccfbf1"; // Heller Schein für die Stepper-Kreise
const BRAND_TEXT = "#4b5563"; 

export default function LernenPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Daten
  const [faecher, setFaecher] = useState([]);
  const [tests, setTests] = useState([]);
  const [favoriten, setFavoriten] = useState([]);
  const [favoritenDetails, setFavoritenDetails] = useState([]);

  // Auswahl
  const [gewaehltesFach, setGewaehltesFach] = useState(null);
  const [gewaehlterTest, setGewaehlterTest] = useState(null);
  const [testart, setTestart] = useState("multiple_choice");

  // UI States
  const [currentStep, setCurrentStep] = useState(1);
  const [loadingFaecher, setLoadingFaecher] = useState(true);
  const [loadingTests, setLoadingTests] = useState(false);

  // 1. Initiale Daten laden
  useEffect(() => {
    supabase
      .from("faecher")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        setFaecher(data || []);
        setLoadingFaecher(false);
      });

    if (user) {
      fetchFavoriten();
    }
  }, [user]);

  const fetchFavoriten = async () => {
    const { data } = await supabase
      .from("lern_favoriten")
      .select(`
        vokabel_test_id,
        vokabel_tests ( id, name, jahrgang, buecher(name), faecher(id, name) )
      `)
      .eq("user_id", user.id);

    if (data) {
      setFavoriten(data.map((f) => f.vokabel_test_id));
      setFavoritenDetails(data.map((f) => f.vokabel_tests).filter(Boolean));
    }
  };

  // 2. Tests laden, wenn Fach gewählt
  useEffect(() => {
    if (!gewaehltesFach) return;
    setLoadingTests(true);
    supabase
      .from("vokabel_tests")
      .select("id, name, jahrgang, buecher(name)")
      .eq("fach_id", gewaehltesFach.id)
      .order("jahrgang")
      .order("name")
      .then(({ data }) => {
        setTests(data || []);
        setLoadingTests(false);
      });
  }, [gewaehltesFach]);

  // --- Handlers ---
  const handleFachSelect = (fach) => {
    setGewaehltesFach(fach);
    setGewaehlterTest(null);
    setCurrentStep(2);
  };

  const handleTestSelect = (test) => {
    setGewaehlterTest(test);
    setCurrentStep(3);
  };

  const handleStart = () => {
    if (!gewaehltesFach || !gewaehlterTest || !testart) return;
    navigate(`/lernen/${testart}/${gewaehlterTest.id}`);
  };

  const handleFavoritStart = (testData) => {
    setGewaehltesFach(testData.faecher);
    setGewaehlterTest({ id: testData.id, name: testData.name });
    setCurrentStep(3);
  };

  const toggleFavorit = async (e, testId) => {
    e.stopPropagation();
    const isFav = favoriten.includes(testId);

    if (isFav) {
      setFavoriten((prev) => prev.filter((id) => id !== testId));
      await supabase.from("lern_favoriten").delete().eq("user_id", user.id).eq("vokabel_test_id", testId);
    } else {
      setFavoriten((prev) => [...prev, testId]);
      await supabase.from("lern_favoriten").insert([{ user_id: user.id, vokabel_test_id: testId }]);
    }
    fetchFavoriten();
  };

  const getFachIcon = (name) => {
    const n = name.toLowerCase();
    if (n.includes("englisch")) return "🇬🇧";
    if (n.includes("französisch")) return "🇫🇷";
    if (n.includes("spanisch")) return "🇪🇸";
    if (n.includes("latein")) return "🏛️";
    return "📚";
  };

  const schritte = ["Fach", "Lektion", "Start"];

  if (loadingFaecher) return <div style={{ padding: "2rem", textAlign: "center" }}>Lade Daten...</div>;
    return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", paddingBottom: "5rem", fontFamily: "sans-serif" }}>
      
      {/* --- NEU: Menüleiste ganz oben --- */}
      <div style={{ backgroundColor: "white", padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e5e7eb", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: "bold", fontSize: "1.2rem", color: "#0f5156" }}>
          📚 VokabelApp
        </div>
        <button 
          onClick={() => navigate('/dashboard')}
          style={{ background: "none", border: "none", color: "#6b7280", fontSize: "0.9rem", cursor: "pointer" }}
        >
          Abbrechen
        </button>
      </div>
      {/* ------------------------------- */}

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 1rem" }}>
        
        {/* 1) Große grüne Karte als Header */}
        <div style={{ backgroundColor: "#0f5156", padding: "1.5rem", borderRadius: "1rem", marginBottom: "2.5rem", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
          <h2 style={{ margin: 0, color: "white", fontSize: 22, display: "flex", alignItems: "center", gap: 8 }}>
            🧠 Lern-Modus
          </h2>
          <p style={{ color: "#e5e7eb", marginTop: 10, fontSize: 14, lineHeight: 1.5, opacity: 0.9 }}>
            Wähle dein Fach und die Lektion, die du heute trainieren möchtest.
          </p>
        </div>
        
        {/* 2) Stepper */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3rem", position: "relative" }}>
          {/* Graue Linie im Hintergrund */}
          <div style={{ position: "absolute", top: 15, left: "15%", right: "15%", height: 2, backgroundColor: "#e5e7eb", zIndex: 0 }} />
          {/* Grüne Linie für Fortschritt */}
          <div style={{ position: "absolute", top: 15, left: "15%", width: currentStep === 1 ? "0%" : currentStep === 2 ? "35%" : "70%", height: 2, backgroundColor: "#0f5156", zIndex: 0, transition: "width 0.3s ease-in-out" }} />
          
          {schritte.map((s, i) => {
            const stepNum = i + 1;
            const active = currentStep >= stepNum;
            const isCurrent = currentStep === stepNum;
            return (
              <div key={s} style={{ zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "33%" }}>
                <div 
                  onClick={() => {
                     if (active && stepNum === 1) setCurrentStep(1);
                     if (active && stepNum === 2 && gewaehltesFach) setCurrentStep(2);
                  }}
                  style={{ 
                    width: 32, height: 32, borderRadius: "50%", 
                    backgroundColor: active ? "#0f5156" : "white", 
                    border: active ? "none" : "2px solid #e5e7eb", 
                    boxShadow: active ? `0 0 0 4px ${BRAND_LIGHT}` : "none", 
                    color: active ? "white" : "#9ca3af", 
                    display: "flex", alignItems: "center", justifyContent: "center", 
                    fontWeight: "bold", fontSize: 14, cursor: active ? "pointer" : "default",
                    transition: "all 0.2s"
                  }}
                >
                  {stepNum}
                </div>
                <div style={{ fontSize: 12, color: isCurrent ? "#111827" : "#9ca3af", fontWeight: isCurrent ? "bold" : "normal", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {s}
                </div>
              </div>
            );
          })}
        </div>

        {/* --- FAVORITEN SCHNELLZUGRIFF --- */}
        {favoritenDetails.length > 0 && currentStep === 1 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ fontSize: 12, fontWeight: "bold", color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
              ⭐ Favoriten Schnellstart
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {favoritenDetails.map((fav) => (
                <button
                  key={fav.id}
                  onClick={() => handleFavoritStart(fav)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "white", border: "none", borderRadius: "1rem", padding: "1.25rem", cursor: "pointer", textAlign: "left", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
                >
                  <div>
                    <div style={{ fontWeight: "700", color: "#1f2937", fontSize: "1.1rem", marginBottom: "4px" }}>{fav.name}</div>
                    <div style={{ fontSize: "0.875rem", color: "#6b7280", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>{getFachIcon(fav.faecher?.name)}</span> {fav.faecher?.name} • {fav.buecher?.name || "Kein Buch"}
                    </div>
                  </div>
                  <div style={{ background: "#ccfbf1", color: "#0f5156", padding: "0.5rem 1rem", borderRadius: "9999px", fontSize: "0.875rem", fontWeight: "700" }}>
                    Start ➔
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SCHRITT 1: Fach wählen */}
        {currentStep === 1 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: "bold", color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
              Fach wählen
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
              {faecher.map((fach) => (
                <button
                  key={fach.id}
                  onClick={() => handleFachSelect(fach)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "white", border: "none", borderRadius: "1rem", padding: "2rem 1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", cursor: "pointer", transition: "transform 0.1s" }}
                  onMouseOver={(e) => e.currentTarget.style.transform = "scale(0.98)"}
                  onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
                >
                  <span style={{ fontSize: 36 }}>{getFachIcon(fach.name)}</span>
                  <span style={{ fontSize: 15, fontWeight: "bold", color: "#111827" }}>{fach.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SCHRITT 2: Lektion wählen */}
        {currentStep === 2 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: "bold", color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
              Lektion für {gewaehltesFach?.name}
            </div>
            
            {loadingTests ? (
              <div style={{ color: "#6b7280", textAlign: "center", padding: "2rem" }}>Lade Lektionen...</div>
            ) : tests.length === 0 ? (
              <div style={{ padding: "2rem", background: "white", borderRadius: "1rem", textAlign: "center", color: "#6b7280", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>Keine Lektionen vorhanden.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {tests.map((test) => {
                  const isFav = favoriten.includes(test.id);
                  return (
                    <div key={test.id} style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                      
                      <button
                        onClick={(e) => toggleFavorit(e, test.id)}
                        style={{ background: "white", border: "none", borderRadius: "1rem", width: 50, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "transform 0.1s" }}
                        onMouseOver={(e) => e.currentTarget.style.transform = "scale(0.95)"}
                        onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
                      >
                        <span style={{ fontSize: 20, filter: isFav ? "none" : "grayscale(100%) opacity(0.3)" }}>⭐</span>
                      </button>

                      <button
                        onClick={() => handleTestSelect(test)}
                        style={{ flex: 1, padding: "1.25rem", background: "white", border: "none", borderRadius: "1rem", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "transform 0.1s" }}
                        onMouseOver={(e) => e.currentTarget.style.transform = "scale(0.98)"}
                        onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
                      >
                        <span style={{ fontSize: 15, fontWeight: "bold", color: "#111827" }}>{test.name}</span>
                        <span style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{test.buecher?.name || "Kein Buch zugeordnet"}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SCHRITT 3: Testart & Start */}
        {currentStep === 3 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: "bold", color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
              Trainingsmodus für "{gewaehlterTest?.name}"
            </div>
              
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 30 }}>
              <button
                onClick={() => setTestart("multiple_choice")}
                style={{ padding: "1.25rem", background: testart === "multiple_choice" ? "#f0fdfa" : "white", border: testart === "multiple_choice" ? "2px solid #0f5156" : "2px solid transparent", borderRadius: "1rem", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 15, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
              >
                <div style={{ fontSize: 28 }}>📝</div>
                <div>
                  <div style={{ fontWeight: "bold", fontSize: 15, color: "#111827" }}>Multiple Choice</div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Wähle aus 4 Antwortmöglichkeiten</div>
                </div>
              </button>

              <button
                disabled
                style={{ padding: "1.25rem", background: "white", border: "2px solid transparent", borderRadius: "1rem", textAlign: "left", display: "flex", alignItems: "center", gap: 15, opacity: 0.6, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
              >
                <div style={{ fontSize: 28 }}>🗂️</div>
                <div>
                  <div style={{ fontWeight: "bold", fontSize: 15, color: "#111827" }}>Karteikarten <span style={{ fontSize: 10, background: "#e5e7eb", padding: "2px 6px", borderRadius: 4, marginLeft: 4 }}>Bald</span></div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Klassisches Umdrehen</div>
                </div>
              </button>
            </div>

            <button
              onClick={handleStart}
              style={{ width: "100%", padding: "1.25rem", background: "#0f5156", color: "white", border: "none", borderRadius: "1rem", fontSize: 16, fontWeight: "bold", cursor: "pointer", display: "block", boxShadow: "0 4px 6px -1px rgba(15,81,86,0.3)" }}
            >
              Starten 🚀
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
