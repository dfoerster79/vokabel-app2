import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

export default function FotoTestPage() {
  const [faecher, setFaecher] = useState([]);
  const [selectedFach, setSelectedFach] = useState(null);
  const [buecher, setBuecher] = useState([]);
  const [vorgeschlagenesBuch, setVorgeschlagenesBuch] = useState(null);
  const [selectedBuch, setSelectedBuch] = useState(null);
  const [neuesBuchName, setNeuesBuchName] = useState("");
  const [neuesBuchVerlag, setNeuesBuchVerlag] = useState("");
  const [buchModus, setBuchModus] = useState("liste"); // vorschlag | liste | neu
  const [bild, setBild] = useState(null);
  const [bildPreview, setBildPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [vokabeln, setVokabeln] = useState([]);
  const [seitenzahl, setSeitenzahl] = useState("");
  const [schritt, setSchritt] = useState(1);
  const [user, setUser] = useState(null);
  const [profil, setProfil] = useState(null);
  const [fehler, setFehler] = useState("");
  const fileRef = useRef();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) {
        supabase.from("profiles")
          .select("schule_id")
          .eq("id", data.user.id)
          .single()
          .then(({ data: p }) => setProfil(p));
      }
    });
  }, []);

  useEffect(() => {
    supabase.from("faecher").select("*").order("id")
      .then(({ data }) => setFaecher(data || []));
  }, []);

  useEffect(() => {
    if (!selectedFach || !profil?.schule_id) return;

    // Buchvorschlag: letztes Buch dieser Schule + Fach
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

    // Alle Bücher für dieses Fach laden
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

    // Zurücksetzen
    setSchritt(1);
    setSelectedFach(null);
    setSelectedBuch(null);
    setVokabeln([]);
    setBild(null);
    setBildPreview(null);
    setSeitenzahl("");
    alert(`✅ Test „Seite ${seitenzahl}" mit ${vokabeln.length} Vokabeln gespeichert!`);
  };

  const btnStyle = {
    padding: "12px 20px", fontSize: 15, borderRadius: 8,
    cursor: "pointer", border: "1px solid #ddd", background: "#f5f5f5"
  };
  const btnPrimaryStyle = {
    ...btnStyle, background: "#4CAF50", color: "white", border: "none"
  };
  const btnBlueStyle = {
    ...btnStyle, background: "#2196F3", color: "white", border: "none"
  };

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ marginBottom: 8 }}>📸 Neuer Foto-Test</h1>

      {/* Fortschrittsanzeige */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["Sprache", "Buch", "Foto", "Prüfen"].map((label, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center", padding: "6px 0", borderRadius: 6, fontSize: 13,
            background: schritt === i + 1 ? "#2196F3" : schritt > i + 1 ? "#4CAF50" : "#eee",
            color: schritt >= i + 1 ? "white" : "#999"
          }}>
            {schritt > i + 1 ? "✓ " : ""}{label}
          </div>
        ))}
      </div>

      {fehler && <div style={{ background: "#ffebee", color: "#c62828", padding: 12, borderRadius: 8, marginBottom: 16 }}>{fehler}</div>}

      {/* Schritt 1: Fach wählen */}
      {schritt === 1 && (
        <div>
          <h2>Sprache wählen</h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {faecher.map(f => (
              <button key={f.id} onClick={() => { setSelectedFach(f); setSchritt(2); }}
                style={{ ...btnStyle, fontSize: 18, padding: "16px 24px" }}>
                {f.symbol} {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Schritt 2: Buch wählen */}
      {schritt === 2 && (
        <div>
          <h2>Buch wählen</h2>
          <p style={{ color: "#666" }}>Fach: {selectedFach?.symbol} {selectedFach?.name}</p>

          {buchModus === "vorschlag" && vorgeschlagenesBuch && (
            <div>
              <p>📚 Zuletzt verwendetes Buch an Ihrer Schule:</p>
              <button onClick={() => { setSelectedBuch(vorgeschlagenesBuch); setSchritt(3); }}
                style={{ ...btnPrimaryStyle, width: "100%", marginBottom: 12 }}>
                ✅ {vorgeschlagenesBuch.name}
                {vorgeschlagenesBuch.verlag ? ` (${vorgeschlagenesBuch.verlag})` : ""}
              </button>
              <button onClick={() => setBuchModus("liste")} style={btnStyle}>
                Anderes Buch wählen
              </button>
            </div>
          )}

          {buchModus === "liste" && (
            <div>
              {buecher.length > 0 ? (
                <>
                  <p>Bekannte Bücher für {selectedFach?.name}:</p>
                  {buecher.map(b => (
                    <button key={b.id} onClick={() => { setSelectedBuch(b); setSchritt(3); }}
                      style={{ ...btnStyle, display: "block", width: "100%", marginBottom: 8, textAlign: "left" }}>
                      📖 {b.name}{b.verlag ? ` — ${b.verlag}` : ""}
                    </button>
                  ))}
                </>
              ) : (
                <p>Noch keine Bücher für dieses Fach vorhanden.</p>
              )}
              <br />
              <button onClick={() => setBuchModus("neu")} style={btnBlueStyle}>
                ➕ Neues Buch anlegen
              </button>
            </div>
          )}

          {buchModus === "neu" && (
            <div>
              <p>Neues Buch anlegen:</p>
              <input placeholder="Buchname *" value={neuesBuchName}
                onChange={e => setNeuesBuchName(e.target.value)}
                style={{ display: "block", width: "100%", marginBottom: 10, padding: 10, borderRadius: 6, border: "1px solid #ddd", fontSize: 15 }} />
              <input placeholder="Verlag (optional)" value={neuesBuchVerlag}
                onChange={e => setNeuesBuchVerlag(e.target.value)}
                style={{ display: "block", width: "100%", marginBottom: 14, padding: 10, borderRadius: 6, border: "1px solid #ddd", fontSize: 15 }} />
              <button onClick={() => setSchritt(3)} disabled={!neuesBuchName}
                style={{ ...btnPrimaryStyle, opacity: neuesBuchName ? 1 : 0.5 }}>
                Weiter →
              </button>
              <button onClick={() => setBuchModus("liste")} style={{ ...btnStyle, marginLeft: 8 }}>
                Zurück
              </button>
            </div>
          )}
        </div>
      )}

      {/* Schritt 3: Foto */}
      {schritt === 3 && (
        <div>
          <h2>Seite fotografieren</h2>
          <p style={{ color: "#666" }}>
            📚 {selectedBuch?.name || neuesBuchName} &nbsp;|&nbsp; {selectedFach?.symbol} {selectedFach?.name}
          </p>
          <input type="file" accept="image/*" capture="environment"
            ref={fileRef} onChange={handleBildWahl} style={{ display: "none" }} />
          <button onClick={() => fileRef.current.click()} style={{ ...btnBlueStyle, width: "100%", marginBottom: 16 }}>
            📷 Foto aufnehmen / aus Galerie wählen
          </button>
          {bildPreview && (
            <>
              <img src={bildPreview} alt="Vorschau"
                style={{ width: "100%", borderRadius: 10, marginBottom: 16, border: "1px solid #ddd" }} />
              <button onClick={handleScan} disabled={scanning} style={{ ...btnPrimaryStyle, width: "100%", fontSize: 16 }}>
                {scanning ? "⏳ KI analysiert Bild..." : "🔍 Vokabeln erkennen lassen"}
              </button>
            </>
          )}
          <br /><br />
          <button onClick={() => setSchritt(2)} style={btnStyle}>← Zurück</button>
        </div>
      )}

      {/* Schritt 4: Vorschau & Bestätigung */}
      {schritt === 4 && (
        <div>
          <h2>Vokabeln prüfen & bestätigen</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span>Seitenzahl:</span>
            <input value={seitenzahl} onChange={e => setSeitenzahl(e.target.value)}
              style={{ width: 70, padding: 8, borderRadius: 6, border: "1px solid #ddd", fontSize: 15, textAlign: "center" }} />
            <span style={{ color: "#666", fontSize: 13 }}>({vokabeln.length} Vokabeln erkannt)</span>
          </div>

          {vokabeln.map((v, i) => (
            <div key={i} style={{
              border: v.ki_unsicher ? "2px solid #FF9800" : "1px solid #ddd",
              borderRadius: 8, padding: 10, marginBottom: 10,
              background: v.ki_unsicher ? "#fff8e1" : "white"
            }}>
              {v.ki_unsicher && (
                <div style={{ color: "#E65100", fontSize: 12, marginBottom: 6 }}>⚠️ Unsicher erkannt – bitte prüfen</div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={v.original}
                  onChange={e => handleVokabelEdit(i, "original", e.target.value)}
                  style={{ flex: 1, padding: 8, borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }}
                  placeholder="Original" />
                <span style={{ color: "#999" }}>→</span>
                <input value={v.uebersetzung}
                  onChange={e => handleVokabelEdit(i, "uebersetzung", e.target.value)}
                  style={{ flex: 1, padding: 8, borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }}
                  placeholder="Übersetzung" />
                <button onClick={() => handleVokabelDelete(i)}
                  style={{ background: "#f44336", color: "white", border: "none", borderRadius: 6, padding: "8px 12px", cursor: "pointer", fontSize: 14 }}>
                  ✕
                </button>
              </div>
            </div>
          ))}

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => setSchritt(3)} style={btnStyle}>← Neues Foto</button>
            <button onClick={handleSpeichern}
              disabled={vokabeln.length === 0 || !seitenzahl}
              style={{ ...btnPrimaryStyle, flex: 1, opacity: (vokabeln.length === 0 || !seitenzahl) ? 0.5 : 1 }}>
              💾 Test „Seite {seitenzahl}" speichern ({vokabeln.length} Vokabeln)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
