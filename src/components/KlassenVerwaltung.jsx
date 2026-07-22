import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export default function KlassenVerwaltung() {
  const { user } = useAuthStore();
  const [faecher, setFaecher] = useState([]);
  const [userKlassen, setUserKlassen] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  // Globaler Jahrgang
  const [globalJahrgang, setGlobalJahrgang] = useState('');

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fächer laden
      const { data: faecherData } = await supabase.from('faecher').select('*').order('name');
      if (faecherData) setFaecher(faecherData);

      // 2. Bisherige Klassen laden
      const { data: profile } = await supabase.from('profiles').select('klasse_pro_fach').eq('id', user.id).single();
      
      if (profile?.klasse_pro_fach && typeof profile.klasse_pro_fach === 'object') {
        setUserKlassen(profile.klasse_pro_fach);
        
        const klassenWerte = Object.values(profile.klasse_pro_fach);
        if (klassenWerte.length > 0 && klassenWerte[0]) {
          const ersteKlasse = String(klassenWerte[0] || ''); 
          const match = ersteKlasse.match(/^(\d+)/);
          if (match) setGlobalJahrgang(match[1]);
        }
      } else {
        setUserKlassen({});
      }
    } catch (err) {
      console.error("Fehler beim Laden der Klassen:", err);
      setUserKlassen({}); 
    } finally {
      setLoading(false);
    }
  };

  const handleZusatzChange = (fachId, zusatz) => {
    // FIX: Sicherstellen, dass zusatz ein String ist, bevor toLowerCase() gerufen wird
    const rawZusatz = zusatz !== null && zusatz !== undefined ? String(zusatz) : '';
    const kleinerZusatz = rawZusatz.toLowerCase();
    
    setUserKlassen(prev => {
      if (!kleinerZusatz && !globalJahrgang) {
        const next = { ...prev };
        delete next[fachId];
        return next;
      }
      return { ...prev, [fachId]: `${globalJahrgang}${kleinerZusatz}` };
    });
  };

  const getZusatz = (fachId) => {
    // FIX: Sicherstellen, dass alles ein String ist
    const gespeicherterWert = String(userKlassen[fachId] || '');
    const gj = String(globalJahrgang || '');
    
    if (!gj) return gespeicherterWert;
    return gespeicherterWert.startsWith(gj) 
      ? gespeicherterWert.substring(gj.length) // sicherer als replace, ersetzt nur am Anfang
      : gespeicherterWert;
  };

  // Wird aufgerufen, wenn sich das Dropdown ändert
  const handleJahrgangChange = (neuerJahrgang) => {
    setGlobalJahrgang(neuerJahrgang);
    
    // Wir passen alle bereits ausgewählten Fächer an den neuen Jahrgang an
    setUserKlassen(prev => {
      const next = { ...prev };
      for (const fachId in next) {
        const alterWert = String(next[fachId] || '');
        // Extrahiere den reinen Zusatz (Buchstaben) vom alten Wert
        const alterZusatz = alterWert.replace(/^\d+/, '');
        // Setze den neuen Jahrgang + alten Zusatz
        if (neuerJahrgang) {
          next[fachId] = `${neuerJahrgang}${alterZusatz}`;
        }
      }
      return next;
    });
  };

  const saveKlassen = async () => {
    setSaving(true);
    setSaveMsg(null);

    const cleanKlassen = {};
    for (const [fachId, wert] of Object.entries(userKlassen)) {
       // Nur speichern, wenn etwas drin steht und es nicht NUR der reine Jahrgang ohne Zusatz ist
       // (Wenn Fächer ohne Zusatz gespeichert werden sollen, entferne "&& wert !== globalJahrgang")
       if (wert && wert !== globalJahrgang) {
           cleanKlassen[fachId] = wert;
       }
    }

    const { error } = await supabase.from('profiles').update({ klasse_pro_fach: cleanKlassen }).eq('id', user.id);
    setSaving(false);
    
    if (error) {
      setSaveMsg({ ok: false, text: 'Fehler beim Speichern: ' + error.message });
    } else {
      setUserKlassen(cleanKlassen);
      setSaveMsg({ ok: true, text: 'Erfolgreich gespeichert ✓' });
    }
  };

  if (loading) return <div style={{ color: '#6b7280', textAlign: 'center', padding: '1rem' }}>Lade Klassen...</div>;

  return (
    <div style={{ background: 'white', padding: "1.5rem", borderRadius: "1rem", marginBottom: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, color: '#111827' }}>
        Meine Fächer & Klassen
      </h2>
      
      {/* GLOBALER JAHRGANG */}
      <div style={{ background: '#f8fafc', padding: 15, borderRadius: 8, marginBottom: 20, border: '1px solid #e5e7eb' }}>
        <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Dein aktueller Jahrgang
        </label>
        <select 
          value={globalJahrgang} 
          onChange={(e) => handleJahrgangChange(e.target.value)}
          style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827', fontSize: '1rem', boxSizing: 'border-box' }}
        >
          <option value="">-- Jahrgang wählen --</option>
          {[5, 6, 7, 8, 9, 10, 11, 12, 13].map(j => (
            <option key={j} value={j}>Klasse {j}</option>
          ))}
        </select>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8, marginBottom: 0 }}>
          Dieser Jahrgang wird automatisch für alle Fächer verwendet.
        </p>
      </div>

      {globalJahrgang ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          {faecher.map(fach => (
            <div key={fach.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 120, fontWeight: 'bold', color: '#1f2937' }}>
                {fach.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1 }}>
                <span style={{ fontSize: 15, fontWeight: 'bold', color: '#6b7280' }}>
                  {globalJahrgang}
                </span>
                <input
                  type="text"
                  placeholder="Zusatz (z.B. 'f')"
                  value={getZusatz(fach.id)}
                  onChange={(e) => handleZusatzChange(fach.id, e.target.value)}
                  autoCapitalize="none" 
                  autoCorrect="off" 
                  spellCheck="false"
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827', fontSize: '1rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          ))}
          
          <button 
            onClick={saveKlassen} 
            disabled={saving} 
            style={{ marginTop: 15, width: '100%', padding: '0.75rem', background: '#0f5156', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {saving ? 'Speichert...' : 'Fächer & Klassen speichern'}
          </button>
          {saveMsg && <div style={{ color: saveMsg.ok ? '#10b981' : '#ef4444', fontWeight: 'bold', marginTop: 10 }}>{saveMsg.text}</div>}
        </div>
      ) : (
        <div style={{ padding: 15, background: '#fef3c7', color: '#d97706', borderRadius: 8, fontSize: 14, border: '1px solid #fde68a' }}>
          Bitte wähle oben zuerst deinen Jahrgang aus.
        </div>
      )}
    </div>
  );
}
