import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore.js";

export default function FotoTestPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const [faecher, setFaecher] = useState([]);
  const [selectedFach, setSelectedFach] = useState(null);
  const [buecher, setBuecher] = useState([]);
  const [vorgeschlagenesBuch, setVorgeschlagenesBuch] = useState(null);
  const [selectedBuch, setSelectedBuch] = useState(null);
  const [neuesBuchName, setNeuesBuchName] = useState("");
  const [neuesBuchVerlag, setNeuesBuchVerlag] = useState("");
  const [buchModus, setBuchModus] = useState("liste");
  const [bild, setBild] = useState(null);
  const [bildPreview, setBildPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [vokabeln, setVokabeln] = useState([]);
  const [seitenzahl, setSeitenzahl] = useState("");
  const [schritt, setSchritt] = useState(1);
  const [profil, setProfil] = useState(null);
  const [fehler, setFehler] = useState("");
  const fileRef = useRef();

  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("schule_id").eq("id", user.id).single()
        .then(({ data }) => setProfil(data));
    }
  }, [user]);

  useEffect(() => {
    supabase.from("faecher").select("*").order("id")
      .then(({ data }) => setFaecher(data || []));
  }, []);

  useEffect(() => {
    if (!selectedFach || !profil?.schule_id) return;
    supabase
      .from("vokabel_tests")
      .select("buch_id, buecher(id, name, verlag)")
      .eq("fach_id", selectedFach.id)
      .eq("schule_id", profil.schule_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.buecher) {
          setVorgeschlagenesBuch(data.buecher);
          setSelectedBuch(data.buecher);
          setBuchModus("vorschlag");
        } else {
          setBuchModus("liste");
        }
      });
    supabase.from("buecher").select("*").eq("fach_id", selectedFach.id)
      .then(({ data }) => setBuecher(data || []));
  }, [selectedFach, profil]);

  const handleBildWahl = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBild(file);
    setBildPreview(URL.createObjectURL(file));
  };

  const handleScan = async () => {
    if (!bild) return;
    setScanning(true);
    setFehler("");
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result.split(",")[1];
        const res = await fetch("/api/scan-vokabeln", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, sprache: selectedFach.name })
        });
        if (!res.ok) throw new Error("Fehler beim KI-Scan");
        const data = await res.json();
        setVokabeln(data.vokabeln || []);
        setSeitenzahl(data.seitenzahl || "");
        setSchritt(4);
      } catch (e) {
        setFehler("KI-Scan fehlgeschlagen: " + e.message);
      } finally {
        setScanning(false);
      }
    };
    reader.readAsDataURL(bild);
  };

  const handleVokabelEdit = (index, field, value) => {
    const neu = [...vokabeln];
    neu[index][field] = value;
    setVokabeln(neu);
  };

  const handleVokabelDelete = (index) => {
    setVokabeln(vokabeln.filter((_, i) => i !== index));
  };

  const handleSpeichern = async () => {
    setFehler("");
    let buchId = selectedBuch?.id;
    if (buchModus === "neu") {
      const { data: neuesBuch, error } = await supabase
        .from("buecher")
        .insert({ name: neuesBuchName, verlag: neuesBuchVerlag || null, fach_id: selectedFach.id })
        .select().single();
      if (error) return setFehler("Fehler beim Buch anlegen: " + error.message);
      buchId = neuesBuch.id;
    }
    const { data: test, error: testError } = await supabase
      .from("vokabel_tests")
      .insert({
        name: `Seite ${seitenzahl}`,
        buch_id: buchId,
        fach_id: selectedFach.id,
        schule_id: profil?.schule_id || null,
        user_id: user.id
      })
      .select().single();
    if (testError) return setFehler("Fehler beim Test anlegen: " + testError.message);
    const { error: vokError } = await supabase.from("vokabeln").insert(
      vokabeln.map(v => ({
        test_id: test.id,
        original: v.original,
        uebersetzung: v.uebersetzung,
        beispielsatz: v.beispielsatz || null,
        ki_unsicher: v.ki_unsicher || false
      }))
    );
    if (vokError) return setFehler("Fehler beim Vokabeln speichern: " + vokError.message);
    navigate("/dashboard");
  };

  const schritte = ["Sprache", "Buch", "Foto", "Prüfen"];

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>

      {/* Nav – identisch zur Startseite */}
      <nav className="nav">
        <Link to="/dashboard" className="nav-logo">
          <div className="nav-logo-icon">📚</div>
          VokabelApp
        </Link>
        <div className="nav-actions">
          <button className="nav-btn" onClick={logout}>Abmelden</button>
        </div>
      </nav>

      <div className="main-content">

        {/* Welcome-Banner im Teal-Stil */}
        <div className="welcome-banner">
          <h2>📸 Neuer Foto-Test</h2>
          <p>Fotografiere eine Buchseite und lass die KI die Vokabeln erkennen.</p>
        </div>

        {/* Fortschrittsanzeige */}
        <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
          {schritte.map((label, i) => (
            <div key={i} style={{
              flex: 1, textAlign: "center", padding: "8px 0",
              borderRadius: 8, fontSize: 13, fontWeight: 500,
              background: schritt === i + 1 ? "var(--primary, #0d9488)"
                : schritt > i + 1 ? "#4CAF50" : "var(--card-bg, white)",
              color: schritt >= i + 1 ? "white" : "var(--text-muted, #999)",
              border: schritt < i + 1 ? "1px solid #e5e7eb" : "none",
              boxShadow: schritt === i + 1 ? "0 2px 8px rgba(13,148,136,0.3)" : "none"
            }}>
              {schritt > i + 1 ? "✓ " : ""}{label}
            </div>
          ))}
        </div>

        {fehler && (
          <div className="card" style={{ background: "#ffebee", color: "#c62828", marginBottom: 12 }}>
            {fehler}
          </div>
        )}

        {/* Schritt 1: Sprache */}
        {schritt === 1 && (
          <div>
            <p className="section-title">Sprache wählen</p>
            <div className="menu-grid">
              {faecher.map(f => (
                <button key={f.id}
                  onClick={() => { setSelectedFach(f); setSchritt(2); }}
                  className="menu-card"
                  style={{ border: "none", cursor: "pointer", textAlign: "center" }}>
                  <span className="menu-card-icon">{f.symbol}</span>
                  <span className="menu-card-label">{f.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Schritt 2: Buch */}
        {schritt === 2 && (
          <div>
            <p className="section-title">Buch wählen</p>
            <div className="card" style={{ marginBottom: 12 }}>
              <p style={{ margin: "0 0 4px", color: "var(--text-muted)", fontSize: 13 }}>Gewählte Sprache</p>
              <strong>{selectedFach?.symbol} {selectedFach?.name}</strong>
            </div>

            {buchModus === "vorschlag" && vorgeschlagenesBuch && (
              <div>
                <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 8 }}>
                  📚 Zuletzt verwendetes Buch an Ihrer Schule:
                </p>
                <button className="menu-card"
                  onClick={() => { setSelectedBuch(vorgeschlagenesBuch); setSchritt(3); }}
                  style={{ width: "100%", border: "2px solid var(--primary, #0d9488)", cursor: "pointer", marginBottom: 10 }}>
                  <span className="menu-card-icon">📖</span>
                  <span className="menu-card-label">{vorgeschlagenesBuch.name}</span>
                  {vorgeschlagenesBuch.verlag && <span className="menu-card-desc">{vorgeschlagenesBuch.verlag}</span>}
                </button>
                <button className="btn btn-secondary" style={{ width: "100%" }}
                  onClick={() => setBuchModus("liste")}>
                  Anderes Buch wählen
                </button>
              </div>
            )}

            {buchModus === "liste" && (
              <div>
                {buecher.length > 0 ? buecher.map(b => (
                  <button key={b.id} className="menu-card"
                    onClick={() => { setSelectedBuch(b); setSchritt(3); }}
                    style={{ width: "100%", cursor: "pointer", marginBottom: 8, border: "none" }}>
                    <span className="menu-card-icon">📖</span>
                    <span className="menu-card-label">{b.name}</span>
                    {b.verlag && <span className="menu-card-desc">{b.verlag}</span>}
                  </button>
                )) : (
                  <div className="card">
                    <div className="empty-state">
                      <div className="empty-state-icon">📚</div>
                      <p>Noch keine Bücher für dieses Fach vorhanden.</p>
                    </div>
                  </div>
                )}
                <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }}
                  onClick={() => setBuchModus("neu")}>
                  ➕ Neues Buch anlegen
                </button>
              </div>
            )}

            {buchModus === "neu" && (
              <div className="card">
                <p style={{ margin: "0 0 12px", fontWeight: 600 }}>Neues Buch anlegen</p>
                <input placeholder="Buchname *" value={neuesBuchName}
                  onChange={e => setNeuesBuchName(e.target.value)}
                  style={{ display: "block", width: "100%", marginBottom: 10, padding: "10px 12px",
                    borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 15, boxSizing: "border-box" }} />
                <input placeholder="Verlag (optional)" value={neuesBuchVerlag}
                  onChange={e => setNeuesBuchVerlag(e.target.value)}
                  style={{ display: "block", width: "100%", marginBottom: 14, padding: "10px 12px",
                    borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 15, boxSizing: "border-box" }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }}
                    onClick={() => setBuchModus("liste")}>Zurück</button>
                  <button className="btn btn-primary" style={{ flex: 2, opacity: neuesBuchName ? 1 : 0.5 }}
                    disabled={!neuesBuchName} onClick={() => setSchritt(3)}>
                    Weiter →
                  </button>
                </div>
              </div>
            )}

            <button className="btn btn-secondary" style={{ width: "100%", marginTop: 12 }}
              onClick={() => setSchritt(1)}>← Zurück</button>
          </div>
        )}

        {/* Schritt 3: Foto */}
        {schritt === 3 && (
          <div>
            <p className="section-title">Seite fotografieren</p>
            <div className="card" style={{ marginBottom: 12 }}>
              <p style={{ margin: "0 0 2px", color: "var(--text-muted)", fontSize: 13 }}>Buch & Sprache</p>
              <strong>📖 {selectedBuch?.name || neuesBuchName}</strong>
              <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
                {selectedFach?.symbol} {selectedFach?.name}
              </span>
            </div>
            <input type="file" accept="image/*" capture="environment"
              ref={fileRef} onChange={handleBildWahl} style={{ display: "none" }} />
            <button className="btn btn-primary" style={{ width: "100%", marginBottom: 12 }}
              onClick={() => fileRef.current.click()}>
              📷 Foto aufnehmen / aus Galerie wählen
            </button>
            {bildPreview && (
              <div className="card" style={{ padding: 8, marginBottom: 12 }}>
                <img src={bildPreview} alt="Vorschau"
                  style={{ width: "100%", borderRadius: 8 }} />
              </div>
            )}
            {bildPreview && (
              <button className="btn btn-primary" style={{ width: "100%", marginBottom: 8 }}
                onClick={handleScan} disabled={scanning}>
                {scanning ? "⏳ KI analysiert Bild..." : "🔍 Vokabeln erkennen lassen"}
              </button>
            )}
            <button className="btn btn-secondary" style={{ width: "100%" }}
              onClick={() => setSchritt(2)}>← Zurück</button>
          </div>
        )}

        {/* Schritt 4: Prüfen & Speichern */}
        {schritt === 4 && (
          <div>
            <p className="section-title">Vokabeln prüfen & bestätigen</p>
            <div className="card" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "var(--text-muted)", fontSize: 14 }}>Seitenzahl:</span>
              <input value={seitenzahl} onChange={e => setSeitenzahl(e.target.value)}
                style={{ width: 70, padding: "6px 10px", borderRadius: 8,
                  border: "1px solid #e5e7eb", fontSize: 15, textAlign: "center" }} />
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                {vokabeln.length} Vokabeln erkannt
              </span>
            </div>

            {vokabeln.map((v, i) => (
              <div key={i} className="card" style={{
                marginBottom: 8, padding: 12,
                border: v.ki_unsicher ? "2px solid #FF9800" : "1px solid #e5e7eb",
                background: v.ki_unsicher ? "#fff8e1" : "white"
              }}>
                {v.ki_unsicher && (
                  <div style={{ color: "#E65100", fontSize: 12, marginBottom: 6 }}>
                    ⚠️ Unsicher erkannt – bitte prüfen
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input value={v.original}
                    onChange={e => handleVokabelEdit(i, "original", e.target.value)}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 8,
                      border: "1px solid #e5e7eb", fontSize: 14 }} />
                  <span style={{ color: "#999" }}>→</span>
                  <input value={v.uebersetzung}
                    onChange={e => handleVokabelEdit(i, "uebersetzung", e.target.value)}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 8,
                      border: "1px solid #e5e7eb", fontSize: 14 }} />
                  <button onClick={() => handleVokabelDelete(i)}
                    style={{ background: "#fee2e2", color: "#dc2626", border: "none",
                      borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 16 }}>
                    ✕
                  </button>
                </div>
              </div>
            ))}

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }}
                onClick={() => setSchritt(3)}>← Neues Foto</button>
              <button className="btn btn-primary" style={{ flex: 2, opacity: (vokabeln.length === 0 || !seitenzahl) ? 0.5 : 1 }}
                disabled={vokabeln.length === 0 || !seitenzahl}
                onClick={handleSpeichern}>
                💾 Seite {seitenzahl} speichern ({vokabeln.length})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
