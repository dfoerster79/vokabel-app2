import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";

export default function KlassenVerwaltung() {
  const user = useAuthStore((s) => s.user);
  const [faecher, setFaecher] = useState([]);
  const [klasseProFach, setKlasseProFach] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erfolgsmeldung, setErfolgsmeldung] = useState("");

  // Hilfsfunktion: Berechnet das aktuelle bayerische Schuljahr
  const getCurrentSchuljahr = () => {
    const now = new Date();
    const y = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12
    // In Bayern beginnt das neue Schuljahr immer im September.
    // Daher: ab September (month >= 9) sind wir im Jahr y/y+1
    return month >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
  };

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("faecher").select("*").order("id"),
      supabase.from("profiles").select("klasse_pro_fach, schuljahr_stand").eq("id", user.id).single()
    ]).then(([faecherRes, profileRes]) => {
      setFaecher(faecherRes.data || []);
      setKlasseProFach(profileRes.data?.klasse_pro_fach || {});
      setLoading(false);
    });
  }, [user]);

  const handleUpdate = (fachId, field, value) => {
    setErfolgsmeldung("");
    setKlasseProFach(prev => ({
      ...prev,
      [fachId]: {
        ...prev[fachId],
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const schuljahr = getCurrentSchuljahr();
    
    const { error } = await supabase.from("profiles").update({
      klasse_pro_fach: klasseProFach,
      schuljahr_stand: schuljahr,
      klassenupdate_erforderlich: false,
      letztes_klassenupdate_at: new Date().toISOString()
    }).eq("id", user.id);

    setSaving(false);
    if (error) {
      alert("Fehler beim Speichern: " + error.message);
    } else {
      setErfolgsmeldung(`✅ Klassen für das Schuljahr ${schuljahr} gespeichert!`);
    }
  };

  if (loading) return <div style={{ padding: 20 }}>Lade Fächer...</div>;

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h3 style={{ margin: "0 0 4px" }}>Meine Fächer & Klassen</h3>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        Aktuelles Schuljahr: <strong>{getCurrentSchuljahr()}</strong>
      </p>

      {faecher.map(f => {
        const data = klasseProFach[f.id] || { jahrgang: "", klasse_name: "" };
        return (
          <div key={f.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ width: 130, fontWeight: 500 }}>
              {f.symbol} {f.name}
            </div>
            <select 
              value={data.jahrgang || ""} 
              onChange={e => handleUpdate(f.id, "jahrgang", parseInt(e.target.value) || "")}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", flex: 1, minWidth: 100 }}
            >
              <option value="">Jahrgang...</option>
              {[5, 6, 7, 8, 9, 10, 11, 12, 13].map(j => (
                <option key={j} value={j}>{j}. Klasse</option>
              ))}
            </select>
            <input 
              placeholder="Bezeichnung (z.B. 7fg)"
              value={data.klasse_name || ""}
              onChange={e => handleUpdate(f.id, "klasse_name", e.target.value)}
              style={{ flex: 2, minWidth: 140, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          </div>
        );
      })}

      {erfolgsmeldung && (
        <div style={{ background: "#dcfce7", color: "#166534", padding: "8px 12px", borderRadius: 8, marginBottom: 12, fontSize: 14 }}>
          {erfolgsmeldung}
        </div>
      )}

      <button 
        onClick={handleSave} 
        disabled={saving}
        className="btn btn-primary" 
        style={{ width: "100%", marginTop: 8 }}
      >
        {saving ? "⏳ Speichere..." : "Klassen speichern"}
      </button>
    </div>
  );
}
