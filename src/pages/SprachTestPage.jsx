import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ─── Normalisierung & Levenshtein ─────────────────────────────────────────────
const normalize = (str = '') =>
  str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();

const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
};

const speechMatches = (heard, correct) => {
  const h = normalize(heard);
  const c = normalize(correct);
  if (!h || !c) return false;
  if (h === c || h.includes(c) || c.includes(h)) return true;
  const maxDist = Math.max(2, Math.floor(c.length * 0.3));
  return levenshtein(h, c) <= maxDist;
};

const WORTART_LABELS = {
  noun: 'Nomen', verb: 'Verb', adjective: 'Adjektiv', adverb: 'Adverb',
  pronoun: 'Pronomen', preposition: 'Präposition', conjunction: 'Konjunktion',
  determiner: 'Artikel/Det.', numeral: 'Zahlwort', interjection: 'Interjektion',
  particle: 'Partikel', phrase: 'Wendung', other: 'Sonstiges'
};

const SprachTestPage = () => {
  const { testId } = useParams();
  const navigate   = useNavigate();

  const [vocabList,       setVocabList]       = useState([]);
  const [wortartMap,      setWortartMap]      = useState({});
  const [fachVokabelPool, setFachVokabelPool] = useState([]);
  const [fachId,          setFachId]          = useState(null);
  const [fachName,        setFachName]        = useState('');
  const [loading,         setLoading]         = useState(true);

  const [currentIndex,    setCurrentIndex]    = useState(0);
  const [score,           setScore]           = useState(0);
  const [fehlerListe,     setFehlerListe]     = useState([]);
  const [isFinished,      setIsFinished]      = useState(false);
  const [evaluating,      setEvaluating]      = useState(false);

  const [mode,            setMode]            = useState('speech');
  const [micError,        setMicError]        = useState('');
  
  // Audio state
  const mediaRecorderRef  = useRef(null);
  const audioChunksRef    = useRef([]);
  const [isRecording,     setIsRecording]     = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);

  // Speichert Erkennungen im Hintergrund: { [id]: { status, type, text, correct } }
  const [transcriptions,  setTranscriptions]  = useState({}); 
  const [mcOptions,       setMcOptions]       = useState([]);

  const [startTime,       setStartTime]       = useState(null);
  const [elapsed,         setElapsed]         = useState(0);
  const [timeStats,       setTimeStats]       = useState({ total: 0, average: 0 });

  useEffect(() => { fetchData(); }, [testId]);

  useEffect(() => {
    let iv;
    if (startTime && !isFinished)
      iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [startTime, isFinished]);

  // Prüfen, ob nach Testende alle Hintergrund-Auswertungen fertig sind
  useEffect(() => {
    if (isFinished && evaluating) {
      const allDone = vocabList.every(v => transcriptions[v.id] && transcriptions[v.id].status === 'done');
      if (allDone) {
        finishTest();
      }
    }
  }, [isFinished, evaluating, transcriptions, vocabList]);

  // Wenn Mikrofon-Erlaubnis erteilt wurde und wir nicht in MC sind, starte automatisch Aufnahme
  useEffect(() => {
    if (micPermissionGranted && mode === 'speech' && !isFinished && vocabList.length > 0) {
      startRecording();
    }
  }, [currentIndex, micPermissionGranted, mode, isFinished, vocabList]);

  // Aufräumen, wenn Komponente unmountet
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: testData } = await supabase.from('vokabel_tests').select('fach_id, faecher(id, name)').eq('id', testId).single();
    const cFachId   = testData?.fach_id || null;
    const cFachName = testData?.faecher?.name || '';
    if (cFachId)   setFachId(cFachId);
    if (cFachName) setFachName(cFachName);

    // Wenn es Latein ist, zwingen wir den Nutzer in den MC-Modus (da Spracheingabe für Latein meist nicht sinnvoll ist)
    if (cFachName.toLowerCase().includes('lat')) {
      setMode('mc');
    }

    const { data: vocabData } = await supabase.from('vokabeln').select('*').eq('test_id', testId);
    if (!vocabData || vocabData.length === 0) { setLoading(false); return; }

    const vocabIds = vocabData.map(v => v.id);
    const { data: waData } = await supabase.from('vokabeln_wortarten').select('vokabel_id, wortart_id').in('vokabel_id', vocabIds);
    const waMap = {};
    (waData || []).forEach(w => { waMap[w.vokabel_id] = w.wortart_id; });
    setWortartMap(waMap);

    let pool = [];
    if (cFachId) {
      const { data: allTests } = await supabase.from('vokabel_tests').select('id').eq('fach_id', cFachId);
      const allIds = (allTests || []).map(t => t.id);
      if (allIds.length > 0) {
        const { data: poolData } = await supabase.from('vokabeln').select('id, uebersetzung').in('test_id', allIds);
        if (poolData?.length > 0) {
          const { data: poolWa } = await supabase.from('vokabeln_wortarten').select('vokabel_id, wortart_id').in('vokabel_id', poolData.map(v => v.id));
          const poolWaMap = {};
          (poolWa || []).forEach(w => { poolWaMap[w.vokabel_id] = w.wortart_id; });
          pool = poolData.map(v => ({ ...v, wortart_id: poolWaMap[v.id] || 'other' }));
        }
      }
    }
    setFachVokabelPool(pool);

    const shuffled = [...vocabData].sort(() => Math.random() - 0.5);
    setVocabList(shuffled);
    buildMcOptions(shuffled, 0, waMap, pool);
    setStartTime(Date.now());
    setLoading(false);
  };

  const buildMcOptions = (list, idx, waMap, pool) => {
    if (idx >= list.length) return;
    const cur   = list[idx];
    const waId  = waMap[cur.id] || 'other';
    const rest  = pool.filter(v => v.id !== cur.id);
    const same  = rest.filter(v => v.wortart_id === waId).sort(() => Math.random() - 0.5);
    const other = rest.filter(v => v.wortart_id !== waId).sort(() => Math.random() - 0.5);
    const fb    = list.filter(v => v.id !== cur.id).sort(() => Math.random() - 0.5);
    let dis = [];
    if      (same.length >= 3)  dis = same.slice(0, 3).map(v => v.uebersetzung);
    else if (same.length > 0)   dis = [...same.map(v => v.uebersetzung), ...other.slice(0, 3 - same.length).map(v => v.uebersetzung)];
    else if (pool.length >= 4)  dis = other.slice(0, 3).map(v => v.uebersetzung);
    else                        dis = fb.slice(0, 3).map(v => v.uebersetzung);
    const unique = [...new Set(dis)].filter(u => u !== cur.uebersetzung).slice(0, 3);
    setMcOptions([...unique, cur.uebersetzung].sort(() => Math.random() - 0.5));
  };

  // Erlaubnis explizit abfragen (nur beim ersten Mal)
  const requestMicrophoneAccess = async () => {
    setMicError('');
    try {
      // Nur einmal Permission holen
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stream wird offen gehalten, damit das Device nicht jedes Mal neu initialisiert werden muss!
      
      // Wir initialisieren den MediaRecorder auf diesem persistenten Stream
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      setMicPermissionGranted(true);
      
    } catch (err) {
      console.error(err);
      setMicError('Mikrofon-Zugriff fehlgeschlagen. Bitte erlaube das Mikrofon im Browser.');
    }
  };

  const startRecording = () => {
    if (!mediaRecorderRef.current) return;
    const recorder = mediaRecorderRef.current;
    
    // Wenn er noch aufnimmt, abbrechen (Sicherheitsnetz)
    if (recorder.state === 'recording') {
      recorder.stop();
    }
    
    audioChunksRef.current = [];
    
    recorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    
    recorder.onstop = () => {
      // Beim Stop schicken wir das gesammelte Audio an Whisper
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      processAudio(audioBlob, vocabList[currentIndex]);
    };
    
    recorder.start();
    setIsRecording(true);
  };

  const processAudio = (blob, vocabItem) => {
    const vocabId = vocabItem.id;
    setTranscriptions(prev => ({ ...prev, [vocabId]: { status: 'pending', type: 'speech' } }));

    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      try {
        const base64data = reader.result.split(',')[1];
        
        // Da das englische/französische Wort angezeigt wird und der Schüler AUF DEUTSCH antwortet,
        // muss Whisper zwingend auf Deutsch ('de') lauschen! 
        // Wir geben außerdem die gesuchte deutsche Übersetzung als Prompt mit, um die Erkennung massiv zu verbessern.
        
        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            audioBase64: base64data, 
            language: 'de', // ZWINGEND DEUTSCH, da der Schüler die deutsche Übersetzung spricht
            prompt: vocabItem.uebersetzung // HILFT Whisper: Gib das erwartete deutsche Wort als Kontext!
          })
        });
        
        if (!res.ok) throw new Error('API Fehler bei Whisper');
        const data = await res.json();
        const heard = data.text || '';
        const correct = speechMatches(heard, vocabItem.uebersetzung);
        
        setTranscriptions(prev => ({
          ...prev,
          [vocabId]: { status: 'done', type: 'speech', text: heard, correct }
        }));
      } catch (err) {
        console.error('Transcription error:', err);
        setTranscriptions(prev => ({
          ...prev,
          [vocabId]: { status: 'done', type: 'speech', text: '[Audio-Erkennungsfehler]', correct: false }
        }));
      }
    };
  };

  const handleWeiter = () => {
    if (isRecording && mediaRecorderRef.current) {
      // Das löst recorder.onstop aus -> processAudio wird für das *aktuelle* Wort aufgerufen
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else {
      // Falls der Nutzer ohne Aufnahme auf Weiter klickt
      setTranscriptions(prev => ({
        ...prev,
        [vocabList[currentIndex].id]: { status: 'done', type: 'speech', text: '[Nichts gesprochen]', correct: false }
      }));
    }
    advanceQuestion();
  };

  const handleMcAnswer = (option) => {
    const cur = vocabList[currentIndex];
    const correct = option === cur.uebersetzung;
    setTranscriptions(prev => ({
      ...prev,
      [cur.id]: { status: 'done', type: 'mc', text: option, correct }
    }));
    advanceQuestion();
  };

  const advanceQuestion = () => {
    const next = currentIndex + 1;
    if (next < vocabList.length) {
      setCurrentIndex(next);
      buildMcOptions(vocabList, next, wortartMap, fachVokabelPool);
      // startRecording() wird automatisch durch useEffect aufgerufen, da sich currentIndex ändert!
    } else {
      setIsFinished(true);
      setEvaluating(true);
    }
  };

  const finishTest = () => {
    // Wenn der Test fertig ist, schließe den Stream
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }

    let fScore = 0;
    let fFehler = [];
    vocabList.forEach(v => {
      const t = transcriptions[v.id];
      if (t && t.correct) fScore++;
      else fFehler.push(v);
    });
    setScore(fScore);
    setFehlerListe(fFehler);

    const rawMs = Date.now() - startTime;
    const totSec = Math.max(1, rawMs / 1000);
    setTimeStats({ total: totSec.toFixed(1), average: (totSec / vocabList.length).toFixed(1) });
    saveResults(fScore, fFehler, totSec, totSec / vocabList.length);
    setEvaluating(false);
  };

  const saveResults = async (finalScore, finalFehler, timeTaken, avgTime) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const percent = Math.round((finalScore / vocabList.length) * 100);
    const { data: attempt, error } = await supabase.from('lern_attempts').insert([{
      user_id: user.id, fach_id: fachId, vokabel_test_id: testId,
      testart: 'sprache', correct_count: finalScore,
      question_count: vocabList.length, percent_correct: percent,
      time_taken_seconds: timeTaken, avg_time_per_word: avgTime,
      started_at: new Date(startTime).toISOString(), finished_at: new Date().toISOString()
    }]).select().single();
    if (error) { console.error('Speicherfehler:', error); return; }
    if (attempt && finalFehler.length > 0) {
      await supabase.from('lern_attempt_fehler').insert(
        finalFehler.map(v => ({
          attempt_id: attempt.id, user_id: user.id, fach_id: fachId,
          vokabel_test_id: testId, vokabel_id: v.id,
          frage: v.original, 
          gegebene_antwort: transcriptions[v.id]?.text || 'Falsch beantwortet',
          richtige_antwort: v.uebersetzung, ist_richtig: false
        }))
      );
      if (fachId) {
        await supabase.from('lern_falsche_woerter').upsert(
          finalFehler.map(v => ({
            user_id: user.id, fach_id: fachId, vokabel_test_id: testId, vokabel_id: v.id,
            fehler_anzahl: 1, zuletzt_falsch_am: new Date().toISOString()
          })),
          { onConflict: 'user_id, fach_id, vokabel_id' }
        );
      }
    }
  };

  const abortTest = () => {
    if (window.confirm('Möchtest du den Test wirklich abbrechen? Der Fortschritt wird nicht gespeichert.')) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
      navigate('/lernen');
    }
  };

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Lade Vokabeln...</div>;
  if (vocabList.length === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Keine Vokabeln gefunden.</div>;

  // ─── Render: Auswertung läuft ────────────────────────────────────────────────
  if (isFinished && evaluating) {
    const doneCount = Object.values(transcriptions).filter(t => t.status === 'done').length;
    return (
      <div style={{ maxWidth: '32rem', margin: '4rem auto', padding: '3rem', background: 'white', borderRadius: '1rem', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '1.5rem', color: '#0f5156', marginBottom: '1rem' }}>🧠 KI wertet Antworten aus...</h2>
        <p style={{ color: '#6b7280', marginBottom: '2rem' }}>Bitte kurz warten. Analysiere Audioaufnahmen: {doneCount} / {vocabList.length}</p>
        <div style={{ width: '40px', height: '40px', border: '4px solid #ccfbf1', borderTopColor: '#0f5156', borderRadius: '50%', margin: '0 auto', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ─── Render: Fertig ───────────────────────────────────────────────────────────
  if (isFinished && !evaluating) {
    return (
      <div style={{ maxWidth: '32rem', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '1rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', textAlign: 'center', borderTop: '8px solid #0f5156', fontFamily: 'sans-serif' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Test beendet! 🎉</h2>
        <div style={{ background: '#f0fdfa', padding: '1.5rem', borderRadius: '1rem', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '1.25rem', margin: '0 0 0.5rem 0', color: '#4b5563' }}>Dein Ergebnis:</p>
          <p style={{ fontSize: '3rem', fontWeight: 'bold', color: '#0f5156', margin: 0 }}>
            {score} <span style={{ fontSize: '1.5rem', color: '#9ca3af' }}>/ {vocabList.length}</span>
          </p>
        </div>
        
        {fehlerListe.length > 0 && (
          <div style={{ textAlign: 'left', marginBottom: '2rem', background: '#fef2f2', padding: '1.5rem', borderRadius: '0.75rem' }}>
            <h3 style={{ color: '#991b1b', marginTop: 0, fontSize: '1.1rem' }}>Deine Fehler:</h3>
            {fehlerListe.map((f, i) => {
              const t = transcriptions[f.id];
              return (
                <div key={i} style={{ marginBottom: '1rem', borderBottom: '1px solid #fecaca', paddingBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 'bold', color: '#7f1d1d' }}>{f.original}</div>
                  <div style={{ color: '#166534', fontSize: '0.9rem' }}>Richtig: {f.uebersetzung}</div>
                  <div style={{ color: '#991b1b', fontSize: '0.9rem', marginTop: 4 }}>
                    Du sagtest: <i>{t?.text || '[Nichts]'}</i> {t?.type === 'mc' ? '(Auswahl)' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ flex: 1, background: '#f3f4f6', padding: '1rem', borderRadius: '0.75rem' }}>
            <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', color: '#6b7280' }}>Gesamtzeit</p>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>{timeStats.total} s</p>
          </div>
          <div style={{ flex: 1, background: '#f3f4f6', padding: '1rem', borderRadius: '0.75rem' }}>
            <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', color: '#6b7280' }}>Ø pro Wort</p>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>{timeStats.average} s</p>
          </div>
        </div>
        <button onClick={() => navigate('/lernen')}
          style={{ width: '100%', background: '#0f5156', color: 'white', fontSize: '1.25rem', fontWeight: 'bold', padding: '1rem 1.5rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer' }}>
          Zurück zur Übersicht
        </button>
      </div>
    );
  }

  // ─── Render: Test läuft ───────────────────────────────────────────────────────
  const cur      = vocabList[currentIndex];
  const progress = (currentIndex / vocabList.length) * 100;
  const waId     = wortartMap[cur?.id];
  const showMc   = mode === 'mc' || (!fachName.toLowerCase().includes('lat') && false); // Temporär für die Logik angepasst.

  return (
    <div style={{ maxWidth: '42rem', margin: '2rem auto 5rem', padding: '0 1rem', fontFamily: 'sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', fontSize: '1.125rem', fontWeight: '600', color: '#4b5563' }}>
        <span>Frage {currentIndex + 1} <span style={{ fontSize: '0.875rem', fontWeight: 'normal' }}>von {vocabList.length}</span></span>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>⏱ {fmt(elapsed)}</span>
          <button onClick={abortTest} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.875rem' }}>
            ✕ Abbrechen
          </button>
        </div>
      </div>

      {/* Fortschrittsbalken */}
      <div style={{ width: '100%', background: '#e5e7eb', borderRadius: '9999px', height: '0.75rem', marginBottom: '2rem' }}>
        <div style={{ background: '#0f5156', height: '100%', borderRadius: '9999px', width: `${progress}%`, transition: 'width 0.3s' }} />
      </div>

      {/* Vokabel-Karte */}
      <div style={{ background: 'white', border: '2px solid #e5e7eb', borderRadius: '1rem', padding: '3rem 2rem', marginBottom: '1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {waId && (
          <span style={{ fontSize: 11, fontWeight: 600, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 6, padding: '2px 9px', marginBottom: 10 }}>
            🏷️ {WORTART_LABELS[waId] || waId}
          </span>
        )}
        <h2 style={{ fontSize: '2.5rem', fontWeight: '800', color: '#1f2937', margin: 0 }}>{cur.original}</h2>
      </div>

      {/* ── Modus: Spracheingabe ── */}
      {!showMc && (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Start-Button NUR anzeigen, wenn noch keine Rechte da sind */}
          {!micPermissionGranted ? (
            <button onClick={requestMicrophoneAccess}
              style={{ width: '100%', padding: '1.5rem', fontSize: '1.5rem', fontWeight: 'bold', background: '#0f5156', color: 'white', border: 'none', borderRadius: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <span style={{ fontSize: '2rem' }}>🎤</span> Mikrofon aktivieren
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ width: '100%', padding: '1.5rem', fontSize: '1.5rem', fontWeight: 'bold', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <div style={{ width: '16px', height: '16px', backgroundColor: '#dc2626', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
                Sprich jetzt...
                <style>{`@keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.2); } 100% { opacity: 1; transform: scale(1); } }`}</style>
              </div>

              <button onClick={handleWeiter}
                style={{ width: '100%', padding: '1.5rem', fontSize: '1.5rem', fontWeight: 'bold', background: '#22c55e', color: 'white', border: 'none', borderRadius: '1rem', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(34, 197, 94, 0.4)' }}>
                Nächstes Wort ➞
              </button>
            </div>
          )}

          {micError && <p style={{ color: '#dc2626', fontSize: '0.875rem' }}>{micError}</p>}
          
          <div style={{ marginTop: '1rem' }}>
            <button onClick={() => {
              setMode('mc');
              // Mikrofon ausstellen, wenn man in den MC-Modus wechselt
              if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
                mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
              }
            }}
              style={{ background: 'none', border: '1px solid #d1d5db', color: '#6b7280', padding: '0.5rem 1.5rem', borderRadius: '9999px', cursor: 'pointer', fontSize: '0.875rem' }}>
              📝 Lieber Auswahl zeigen
            </button>
          </div>
        </div>
      )}

      {/* ── Modus: Multiple Choice (Fallback) ── */}
      {showMc && (
        <div>
          {!fachName.toLowerCase().includes('lat') && (
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#9ca3af', background: '#f3f4f6', padding: '3px 10px', borderRadius: '9999px' }}>📝 Auswahl-Modus</span>
              <button onClick={() => {
                setMode('speech');
                setMicPermissionGranted(false); // Rechte beim Zurückwechseln neu anfragen
              }}
                style={{ background: 'none', border: 'none', color: '#0f5156', fontSize: '0.875rem', cursor: 'pointer', marginLeft: 12 }}>
                🎤 Zurück zu Sprache
              </button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
            {mcOptions.map((opt, i) => (
              <button key={i} onClick={() => handleMcAnswer(opt)}
                style={{ width: '100%', textAlign: 'left', padding: '1.25rem', borderRadius: '1rem', fontSize: '1.25rem', fontWeight: '500', cursor: 'pointer', background: 'white', border: '2px solid #e5e7eb', color: '#374151' }}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SprachTestPage;