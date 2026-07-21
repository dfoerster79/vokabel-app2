import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuthStore } from "../store/authStore.js";

// Farben aus deinen Screenshots
const BRAND_COLOR = "#0f5156"; // Dunkles Tannengrün
const BRAND_LIGHT = "#e6f0f1"; // Helles Tannengrün für Stepper
const BRAND_TEXT = "#4b5563"; // Grauer Text
const BRAND_ACCENT = "#22c55e"; // Grün für Buttons

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

  // Hilfsfunktion für die kleinen Icons in den Fach-Kacheln
  const getFachIcon = (name) => {
    const n = name.toLowerCase();
    if (n.includes("englisch")) return "🇬🇧";
    if (n.includes("französisch")) return "🇫🇷";
    if (n.includes("spanisch")) return "🇪🇸";
    if (n.includes("latein")) return "🏛️";
    return "📚";
  };

  if (loadingFaecher) return <div style={{ padding: "2rem", textAlign: "center" }}>Lade Daten...</div>;
    return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "1.5rem", fontFamily: "sans-serif", backgroundColor: "#f8fafc", minHeight: "100vh" }}>
      
      {/* Headerbereich im Stil des Foto-Tests */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: "700", color: "#e5e7eb", display: "flex", alignItems: "center", gap: "10px", margin: "0 0 1rem 0" }}>
          <span style={{ fontSize: "1.5rem" }}>🧠</span> Lern-Modus
        </h1>
        <p style={{ color: "#e5e7eb", margin: 0, fontSize: "1rem", lineHeight: "1.5", opacity: 0.8 }}>
          Wähle dein Fach und die Lektion, die du heute trainieren möchtest.
        </p>
      </div>

      {/* --- FAVORITEN SCHNELLZUGRIFF --- */}
      {favoritenDetails.length > 0 && currentStep === 1 && (
        <div style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "1px", color: "#9ca3af", margin: "0 0 1rem 0", fontWeight: "600" }}>
            ⭐ Favoriten Schnellstart
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {favoritenDetails.map((fav) => (
              <button
                key={fav.id}
                onClick={() => handleFavoritStart(fav)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "white", border: "none", borderRadius: "1rem",
                  padding: "1.25rem", cursor: "pointer", textAlign: "left",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)"
                }}
              >
                <div>
                  <div style={{ fontWeight: "700", color: "#1f2937", fontSize: "1.1rem", marginBottom: "4px" }}>{fav.name}</div>
                  <div style={{ fontSize: "0.875rem", color: "#6b7280", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>{getFachIcon(fav.faecher?.name)}</span> {fav.faecher?.name} • {fav.buecher?.name || "Kein Buch"}
                  </div>
                </div>
                <div style={{ background: BRAND_LIGHT, color: BRAND_COLOR, padding: "0.5rem 1rem", borderRadius: "9999px", fontSize: "0.875rem", fontWeight: "600" }}>
                  Start ➔
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Runder Stepper wie im Screenshot */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3rem", position: "relative", padding: "0 1rem" }}>
        {/* Linien im Hintergrund */}
        <div style={{ position: "absolute", top: "15px", left: "15%", right: "15%", height: "2px", backgroundColor: "#e5e7eb", zIndex: 0 }}></div>
        <div style={{ position: "absolute", top: "15px", left: "15%", width: currentStep === 2 ? "35%" : currentStep === 3 ? "70%" : "0%", height: "2px", backgroundColor: BRAND_LIGHT, zIndex: 0, transition: "width 0.3s" }}></div>

        {/* Step 1 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1 }}>
          <div onClick={() => setCurrentStep(1)} style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: currentStep >= 1 ? BRAND_LIGHT : "white", border: `2px solid ${currentStep >= 1 ? BRAND_LIGHT : "#e5e7eb"}`, display: "flex", alignItems: "center", justifyContent: "center", color: currentStep >= 1 ? BRAND_COLOR : "#9ca3af", fontWeight: "bold", fontSize: "0.9rem", cursor: "pointer", marginBottom: "8px" }}>1</div>
          <span style={{ fontSize: "0.8rem", color: currentStep >= 1 ? "#1f2937" : "#9ca3af", fontWeight: currentStep === 1 ? "bold" : "normal" }}>Fach</span>
        </div>

        {/* Step 2 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1 }}>
          <div onClick={() => { if(gewaehltesFach) setCurrentStep(2) }} style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: currentStep >= 2 ? BRAND_LIGHT : "white", border: `2px solid ${currentStep >= 2 ? BRAND_LIGHT : "#e5e7eb"}`, display: "flex", alignItems: "center", justifyContent: "center", color: currentStep >= 2 ? BRAND_COLOR : "#9ca3af", fontWeight: "bold", fontSize: "0.9rem", cursor: gewaehltesFach ? "pointer" : "default", marginBottom: "8px" }}>2</div>
          <span style={{ fontSize: "0.8rem", color: currentStep >= 2 ? "#1f2937" : "#9ca3af", fontWeight: currentStep === 2 ? "bold" : "normal" }}>Lektion</span>
        </div>

        {/* Step 3 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1 }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: currentStep >= 3 ? BRAND_LIGHT : "white", border: `2px solid ${currentStep >= 3 ? BRAND_LIGHT : "#e5e7eb"}`, display: "flex", alignItems: "center", justifyContent: "center", color: currentStep >= 3 ? BRAND_COLOR : "#9ca3af", fontWeight: "bold", fontSize: "0.9rem", marginBottom: "8px" }}>3</div>
          <span style={{ fontSize: "0.8rem", color: currentStep >= 3 ? "#1f2937" : "#9ca3af", fontWeight: currentStep === 3 ? "bold" : "normal" }}>Start</span>
        </div>
      </div>

      {/* SCHRITT 1: Fach wählen (Weiße Boxen, zentriert) */}
      {currentStep === 1 && (
        <div>
          <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "1px", color: "#9ca3af", margin: "0 0 1rem 0", fontWeight: "600" }}>FACH WÄHLEN</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {faecher.map((fach) => (
              <button
                key={fach.id}
                onClick={() => handleFachSelect(fach)}
                style={{ padding: "1.5rem", background: "white", border: "none", borderRadius: "1rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem", cursor: "pointer", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}
              >
                <span style={{ fontSize: "2rem" }}>{getFachIcon(fach.name)}</span>
                <span style={{ fontSize: "1rem", fontWeight: "600", color: "#1f2937" }}>{fach.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SCHRITT 2: Lektion wählen */}
      {currentStep === 2 && (
        <div>
          <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "1px", color: "#9ca3af", margin: "0 0 1rem 0", fontWeight: "600" }}>
            LEKTION FÜR {gewaehltesFach?.name.toUpperCase()} WÄHLEN
          </h2>
          
          {loadingTests ? (
            <div style={{ color: "#6b7280", textAlign: "center", padding: "2rem" }}>Lade Lektionen...</div>
          ) : tests.length === 0 ? (
            <div style={{ padding: "2rem", background: "white", borderRadius: "1rem", textAlign: "center", color: "#6b7280" }}>Keine Lektionen vorhanden.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {tests.map((test) => {
                const isFav = favoriten.includes(test.id);
                return (
                  <div key={test.id} style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
                    
                    {/* Stern-Button */}
                    <button
                      onClick={(e) => toggleFavorit(e, test.id)}
                      style={{ background: "white", border: "none", borderRadius: "1rem", width: "60px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}
                    >
                      <span style={{ fontSize: "1.5rem", filter: isFav ? "none" : "grayscale(100%) opacity(0.3)" }}>⭐</span>
                    </button>

                    {/* Lektion-Button */}
                    <button
                      onClick={() => handleTestSelect(test)}
                      style={{ flex: 1, padding: "1.25rem", background: "white", border: "none", borderRadius: "1rem", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}
                    >
                      <span style={{ fontSize: "1.1rem", fontWeight: "600", color: "#1f2937" }}>{test.name}</span>
                      <span style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: "4px" }}>{test.buecher?.name || "Kein Buch zugeordnet"}</span>
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
          <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "1px", color: "#9ca3af", margin: "0 0 1rem 0", fontWeight: "600" }}>
            TRAININGSMODUS FÜR "{gewaehlterTest?.name}"
          </h2>
            
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "2rem" }}>
            
            <button
              onClick={() => setTestart("multiple_choice")}
              style={{ padding: "1.25rem", background: testart === "multiple_choice" ? BRAND_LIGHT : "white", border: `2px solid ${testart === "multiple_choice" ? BRAND_COLOR : "transparent"}`, borderRadius: "1rem", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: "1rem", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}
            >
              <div style={{ fontSize: "2rem" }}>📝</div>
              <div>
                <div style={{ fontWeight: "700", fontSize: "1.1rem", color: "#1f2937" }}>Multiple Choice</div>
                <div style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: "2px" }}>Wähle aus 4 Antwortmöglichkeiten</div>
              </div>
            </button>

            <button
              disabled
              style={{ padding: "1.25rem", background: "white", border: "none", borderRadius: "1rem", textAlign: "left", display: "flex", alignItems: "center", gap: "1rem", opacity: 0.6, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}
            >
              <div style={{ fontSize: "2rem" }}>🗂️</div>
              <div>
                <div style={{ fontWeight: "700", fontSize: "1.1rem", color: "#1f2937" }}>Karteikarten <span style={{ fontSize: "0.7rem", background: "#e5e7eb", padding: "2px 6px", borderRadius: "4px", marginLeft: "4px" }}>Bald</span></div>
                <div style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: "2px" }}>Klassisches Umdrehen</div>
              </div>
            </button>

          </div>

          <button
            onClick={handleStart}
            style={{ width: "100%", padding: "1.25rem", background: BRAND_COLOR, color: "white", border: "none", borderRadius: "1rem", fontSize: "1.25rem", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 6px -1px rgba(15,81,86,0.3)" }}
          >
            Starten 🚀
          </button>
        </div>
      )}

    </div>
  );
}
