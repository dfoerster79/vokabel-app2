import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore.js";

// Wortarten-Katalog (spiegelt die DB-Tabelle wider, für Offline-Fallback)
const WORTARTEN_FALLBACK = [
  { id: "noun",        label_de: "Nomen" },
  { id: "verb",        label_de: "Verb" },
  { id: "adjective",   label_de: "Adjektiv" },
  { id: "adverb",      label_de: "Adverb" },
  { id: "pronoun",     label_de: "Pronomen" },
  { id: "preposition", label_de: "Präposition" },
  { id: "conjunction", label_de: "Konjunktion" },
  { id: "determiner",  label_de: "Artikel/Det." },
  { id: "numeral",     label_de: "Zahlwort" },
  { id: "interjection",label_de: "Interjektion" },
  { id: "particle",    label_de: "Partikel" },
  { id: "phrase",      label_de: "Wendung" },
  { id: "other",       label_de: "Sonstiges" },
];

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
  const [existingTestId, setExistingTestId] = useState(null);
  const [existingVokabeln, setExistingVokabeln] = useState([]);

  // Wortarten aus der DB laden
  const [wortarten, setWortarten] = useState(WORTARTEN_FALLBACK);

  const [schritt, setSchritt] = useState(1);
  const [profil, setProfil] = useState(null);
  const [fehler, setFehler] = useState("");
  const fileRef = useRef();

  // Wortarten aus Supabase laden
  useEffect(() => {
    supabase.from("wortarten").select("id, label_de").order("id")
      .then(({ data }) => { if (data && data.length > 0) setWortarten(data); });
  }, []);

  useEffect(() => {
    if (user) {
      supabase.from("profiles")
        .select("schule_id, klasse_pro_fach")
        .eq("id", user.id)
        .single()
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

  const checkSeitenzahl = async (sz) => {
    setSeitenzahl(sz);
    if (!sz || !selectedBuch?.id) {
      setExistingTestId(null);
      setExistingVokabeln([]);
      return;
    }
    const { data: test } = await supabase
      .from("vokabel_tests")
      .select("id")
      .eq("buch_id", selectedBuch.id)
      .eq("name", `Seite ${sz}`)
      .maybeSingle();

    if (test) {
      setExistingTestId(test.id);
      const { data: voks } = await supabase
        .from("vokabeln")
        .select("original, uebersetzung")
        .eq("test_id", test.id);
      setExistingVokabeln(voks || []);
    } else {
      setExistingTestId(null);
      setExistingVokabeln([]);
    }
  };

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
        // API-Aufruf: jetzt auch wortart_id + wortart_konfidenz im Response erwartet
        const res = await fetch("/api/scan-vokabeln", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, sprache: selectedFach.name })
        });
        if (!res.ok) throw new Error("Fehler beim KI-Scan");
        const data = await res.json();
        // Wortart-Felder ergänzen falls die API sie noch nicht liefert
        const mitWortart = (data.vokabeln || []).map(v => ({
          ...v,
          wortart_id: v.wortart_id || "other",
          wortart_konfidenz: v.wortart_konfidenz || null,
          wortart_bestaetigt: false,
        }));
        setVokabeln(mitWortart);
        await checkSeitenzahl(data.seitenzahl || "");
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
    // Wenn Nutzer Wortart manuell ändert: als bestätigt markieren
    if (field === "wortart_id") {
      neu[index].wortart_bestaetigt = true;
    }
    setVokabeln(neu);
  };

  const handleVokabelDelete = (index) => {
    setVokabeln(vokabeln.filter((_, i) => i !== index));
  };

  const getVokabelStatus = (vok) => {
    if (!existingTestId || existingVokabeln.length === 0) return "new";
    const vOriginal = (vok.original || "").trim().toLowerCase();
    const vUebersetzung = (vok.uebersetzung || "").trim().toLowerCase();
    const match = existingVokabeln.find(ev => (ev.original || "").trim().toLowerCase() === vOriginal);
    if (!match) return "new";
    if ((match.uebersetzung || "").trim().toLowerCase() !== vUebersetzung) return "conflict";
    return "duplicate";
  };

  const handleSpeichern = async () => {
    setFehler("");
    let testId = existingTestId;

    if (!testId) {
      let buchId = selectedBuch?.id;
      if (buchModus === "neu") {
        const { data: neuesBuch, error } = await supabase
          .from("buecher")
          .insert({ name: neuesBuchName, verlag: neuesBuchVerlag || null, fach_id: selectedFach.id })
          .select().single();
        if (error) return setFehler("Fehler beim Buch anlegen: " + error.message);
        buchId = neuesBuch.id;
      }
      const fachInfo = profil?.klasse_pro_fach?.[selectedFach.id] || {};
      const { data: test, error: testError } = await supabase
        .from("vokabel_tests")
        .insert({
          name: `Seite ${seitenzahl}`,
          buch_id: buchId,
          fach_id: selectedFach.id,
          schule_id: profil?.schule_id || null,
          user_id: user.id,
          jahrgang: fachInfo.jahrgang || null,
          klasse: fachInfo.klasse_name || null
        })
        .select().single();
      if (testError) return setFehler("Fehler beim Test anlegen: " + testError.message);
      testId = test.id;
    }

    const voksToSave = vokabeln.filter(v => getVokabelStatus(v) !== "duplicate");

    if (voksToSave.length > 0) {
      // 1) Vokabeln speichern
      const { data: gespeichert, error: vokError } = await supabase
        .from("vokabeln")
        .insert(
          voksToSave.map(v => ({
            test_id: testId,
            original: v.original,
            uebersetzung: v.uebersetzung,
            beispielsatz: v.beispielsatz || null,
            ki_unsicher: v.ki_unsicher || false
          }))
        )
        .select("id");
      if (vokError) return setFehler("Fehler beim Vokabeln speichern: " + vokError.message);

      // 2) Wortart-Zuordnungen speichern
      const wortartZuordnungen = gespeichert
        .map((row, idx) => {
          const v = voksToSave[idx];
          if (!v.wortart_id || v.wortart_id === "") return null;
          return {
            vokabel_id: row.id,
            wortart_id: v.wortart_id,
            quelle: v.wortart_bestaetigt ? "nutzer" : "ki",
            konfidenz: v.wortart_konfidenz ?? null,
            bestaetigt: v.wortart_bestaetigt || false,
          };
        })
        .filter(Boolean);

      if (wortartZuordnungen.length > 0) {
        const { error: waError } = await supabase
          .from("vokabeln_wortarten")
          .insert(wortartZuordnungen);
        if (waError) {
          // Wortart-Fehler nicht blockierend – Vokabeln wurden bereits gespeichert
          console.warn("Wortart-Zuordnung fehlgeschlagen:", waError.message);
        }
      }
    }

    navigate("/dashboard");
  };

  const schritte = ["Sprache", "Buch", "Foto", "Prüfen"];

  // Hilfsfunktion: Label einer Wortart-ID
  const wortartLabel = (id) => wortarten.find(w => w.id === id)?.label_de || id;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
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
        <div className="welcome-banner">
          <h2>📸 Neuer Foto-Test</h2>
          <p>Fotografiere eine Buchseite und lass die KI die Vokabeln erkennen.</p>
        </div>

        {/* Fortschrittsbalken */}
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", margin: "24px 0 32px" }}>
          <div style={{ position: "absolute", top: 14, left: "10%", right: "10%", height: 4, background: "#e5e7eb", zIndex: 0, borderRadius: 2 }}></div>
          <div style={{ position: "absolute", top: 14, left: "10%", width: `${((schritt - 1) / 3) * 80}%`, height: 4, background: "var(--primary, #0d9488)", zIndex: 0, borderRadius: 2, transition: "width 0.3s ease" }}></div>
          {schritte.map((label, i) => {
            const isActive = schritt >= i + 1;
            const isCurrent = schritt === i + 1;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1, width: "25%" }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: isActive ? "var(--primary, #0d9488)" : "#e5e7eb",
                  color: isActive ? "white" : "var(--text-muted, #999)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: "bold", fontSize: 14, transition: "all 0.3s ease",
                  boxShadow: isCurrent ? "0 0 0 4px #ccfbf1" : "none"
                }}>
                  {schritt > i + 1 ? "✓" : i + 1}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: isCurrent ? 600 : 400, color: isActive ? "var(--text)" : "var(--text-muted)" }}>
                  {label}
                </div>
              </div>
            );
          })}
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
                <button key={f.id} onClick={() => { setSelectedFach(f); setSchritt(2); }}
                  className="menu-card" style={{ border: "none", cursor: "pointer", textAlign: "center" }}>
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
                <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 8 }}>📚 Zuletzt verwendetes Buch an Ihrer Schule:</p>
                <button className="menu-card"
                  onClick={() => { setSelectedBuch(vorgeschlagenesBuch); setSchritt(3); }}
                  style={{ width: "100%", border: "2px solid var(--primary, #0d9488)", cursor: "pointer", marginBottom: 10 }}>
                  <span className="menu-card-icon">📖</span>
                  <span className="menu-card-label">{vorgeschlagenesBuch.name}</span>
                  {vorgeschlagenesBuch.verlag && <span className="menu-card-desc">{vorgeschlagenesBuch.verlag}</span>}
                </button>
                <button className="btn btn-secondary" style={{ width: "100%" }} onClick={() => setBuchModus("liste")}>
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
                <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} onClick={() => setBuchModus("neu")}>
                  ➕ Neues Buch anlegen
                </button>
              </div>
            )}
            {buchModus === "neu" && (
              <div className="card">
                <p style={{ margin: "0 0 12px", fontWeight: 600 }}>Neues Buch anlegen</p>
                <input placeholder="Buchname *" value={neuesBuchName} onChange={e => setNeuesBuchName(e.target.value)}
                  style={{ display: "block", width: "100%", marginBottom: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 15, boxSizing: "border-box" }} />
                <input placeholder="Verlag (optional)" value={neuesBuchVerlag} onChange={e => setNeuesBuchVerlag(e.target.value)}
                  style={{ display: "block", width: "100%", marginBottom: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 15, boxSizing: "border-box" }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setBuchModus("liste")}>Zurück</button>
                  <button className="btn btn-primary" style={{ flex: 2, opacity: neuesBuchName ? 1 : 0.5 }} disabled={!neuesBuchName} onClick={() => setSchritt(3)}>
                    Weiter →
                  </button>
                </div>
              </div>
            )}
            <button className="btn btn-secondary" style={{ width: "100%", marginTop: 12 }} onClick={() => setSchritt(1)}>← Zurück</button>
          </div>
        )}

        {/* Schritt 3: Foto */}
        {schritt === 3 && (
          <div>
            <p className="section-title">Seite fotografieren</p>
            <div className="card" style={{ marginBottom: 12 }}>
              <p style={{ margin: "0 0 2px", color: "var(--text-muted)", fontSize: 13 }}>Buch & Sprache</p>
              <strong>📖 {selectedBuch?.name || neuesBuchName}</strong>
              <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>{selectedFach?.symbol} {selectedFach?.name}</span>
            </div>
            <input type="file" accept="image/*" capture="environment" ref={fileRef} onChange={handleBildWahl} style={{ display: "none" }} />
            <button className="btn btn-primary" style={{ width: "100%", marginBottom: 12 }} onClick={() => fileRef.current.click()}>
              📷 Foto aufnehmen / aus Galerie wählen
            </button>
            {bildPreview && (
              <div className="card" style={{ padding: 8, marginBottom: 12 }}>
                <img src={bildPreview} alt="Vorschau" style={{ width: "100%", borderRadius: 8 }} />
              </div>
            )}
            {bildPreview && (
              <button className="btn btn-primary" style={{ width: "100%", marginBottom: 8 }} onClick={handleScan} disabled={scanning}>
                {scanning ? "⏳ KI analysiert Bild..." : "🔍 Vokabeln erkennen lassen"}
              </button>
            )}
            <button className="btn btn-secondary" style={{ width: "100%" }} onClick={() => setSchritt(2)}>← Zurück</button>
          </div>
        )}

        {/* Schritt 4: Prüfen & Speichern */}
        {schritt === 4 && (
          <div>
            <p className="section-title">Vokabeln prüfen & bestätigen</p>

            <div className="card" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "var(--text-muted)", fontSize: 14 }}>Seitenzahl:</span>
              <input value={seitenzahl} onChange={e => checkSeitenzahl(e.target.value)}
                style={{ width: 70, padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 15, textAlign: "center" }} />
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{vokabeln.length} erkannt</span>
            </div>

            {existingTestId && (
              <div className="card" style={{ background: "#e0f2fe", border: "1px solid #bae6fd", marginBottom: 16 }}>
                <h4 style={{ color: "#0369a1", margin: "0 0 8px", fontSize: 15 }}>ℹ️ Diese Seite existiert bereits!</h4>
                <p style={{ fontSize: 13, margin: "0 0 8px", color: "#075985" }}>
                  Die DB hat bereits {existingVokabeln.length} Vokabeln für Seite {seitenzahl}.
                </p>
                <div style={{ display: "flex", gap: 12, fontSize: 12, marginTop: 8 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{width: 10, height: 10, borderRadius: 2, background: "#dcfce7"}}></div> Neu</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{width: 10, height: 10, borderRadius: 2, background: "#fef08a"}}></div> Abweichung</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{width: 10, height: 10, borderRadius: 2, background: "#f3f4f6"}}></div> Duplikat</span>
                </div>
              </div>
            )}

            {/* Wortarten-Legende */}
            <div className="card" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", marginBottom: 16, fontSize: 13, color: "#166534" }}>
              🏷️ <strong>Wortart</strong>: Die KI schlägt automatisch eine Wortart vor. Du kannst sie vor dem Speichern korrigieren.
              Beim Test werden dann nur Wörter der gleichen Wortart als falsche Antworten angeboten.
            </div>

            {vokabeln.map((v, i) => {
              const status = getVokabelStatus(v);
              let bgColor = "white";
              let borderColor = "#e5e7eb";
              if (v.ki_unsicher) { bgColor = "#fff8e1"; borderColor = "#FF9800"; }
              else if (existingTestId) {
                if (status === "new") { bgColor = "#dcfce7"; borderColor = "#86efac"; }
                else if (status === "conflict") { bgColor = "#fef08a"; borderColor = "#fde047"; }
                else { bgColor = "#f3f4f6"; borderColor = "#e5e7eb"; }
              }

              return (
                <div key={i} className="card" style={{
                  marginBottom: 10, padding: 12, border: `1px solid ${borderColor}`,
                  background: bgColor, opacity: status === "duplicate" ? 0.7 : 1
                }}>
                  {v.ki_unsicher && (
                    <div style={{ color: "#E65100", fontSize: 12, marginBottom: 6 }}>⚠️ Unsicher erkannt – bitte prüfen</div>
                  )}
                  {status === "conflict" && (
                    <div style={{ color: "#a16207", fontSize: 12, marginBottom: 6 }}>
                      ⚠️ <strong>Abweichung!</strong> Bisherige Übersetzung: <em>{existingVokabeln.find(ev => ev.original.toLowerCase() === v.original.toLowerCase())?.uebersetzung}</em>
                    </div>
                  )}
                  {status === "duplicate" && (
                    <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 6 }}>ℹ️ Wird übersprungen (bereits vorhanden)</div>
                  )}

                  {/* Zeile 1: Original → Übersetzung + Löschen */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <input value={v.original} onChange={e => handleVokabelEdit(i, "original", e.target.value)}
                      disabled={status === "duplicate"}
                      style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, background: "transparent" }} />
                    <span style={{ color: "#999" }}>→</span>
                    <input value={v.uebersetzung} onChange={e => handleVokabelEdit(i, "uebersetzung", e.target.value)}
                      disabled={status === "duplicate"}
                      style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, background: "transparent" }} />
                    <button onClick={() => handleVokabelDelete(i)}
                      style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 16 }}>
                      ✕
                    </button>
                  </div>

                  {/* Zeile 2: Wortart-Auswahl */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>🏷️ Wortart:</span>
                    <select
                      value={v.wortart_id || "other"}
                      disabled={status === "duplicate"}
                      onChange={e => handleVokabelEdit(i, "wortart_id", e.target.value)}
                      style={{
                        padding: "5px 8px", borderRadius: 8, fontSize: 13,
                        border: v.wortart_bestaetigt
                          ? "2px solid var(--primary, #0d9488)"
                          : "1px solid #d1d5db",
                        background: v.wortart_bestaetigt ? "#f0fdf4" : "white",
                        cursor: status === "duplicate" ? "default" : "pointer",
                        color: "var(--text)"
                      }}
                    >
                      {wortarten.map(w => (
                        <option key={w.id} value={w.id}>{w.label_de}</option>
                      ))}
                    </select>
                    {/* KI-Konfidenz-Anzeige */}
                    {v.wortart_konfidenz != null && !v.wortart_bestaetigt && (
                      <span style={{
                        fontSize: 11,
                        color: v.wortart_konfidenz >= 0.8 ? "#166534" : v.wortart_konfidenz >= 0.5 ? "#92400e" : "#991b1b",
                        background: v.wortart_konfidenz >= 0.8 ? "#dcfce7" : v.wortart_konfidenz >= 0.5 ? "#fef3c7" : "#fee2e2",
                        borderRadius: 6, padding: "2px 7px"
                      }}>
                        KI: {Math.round(v.wortart_konfidenz * 100)}%
                      </span>
                    )}
                    {v.wortart_bestaetigt && (
                      <span style={{ fontSize: 11, color: "#166534", background: "#dcfce7", borderRadius: 6, padding: "2px 7px" }}>
                        ✓ bestätigt
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setSchritt(3)}>← Neues Foto</button>
              <button className="btn btn-primary" style={{ flex: 2, opacity: (vokabeln.length === 0 || !seitenzahl) ? 0.5 : 1 }}
                disabled={vokabeln.length === 0 || !seitenzahl} onClick={handleSpeichern}>
                {existingTestId ? "💾 Aktualisieren" : `💾 Seite ${seitenzahl} speichern`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
