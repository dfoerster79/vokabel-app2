import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ─── Sprachcode je Fach ───────────────────────────────────────────────────────
const getFachLang = (fachName = '') => {
  const n = fachName.toLowerCase();
  if (n.includes('franz')) return 'fr-FR';
  if (n.includes('engl'))  return 'en-GB';
  if (n.includes('span'))  return 'es-ES';
  if (n.includes('lat'))   return null;   // Latein → immer MC-Fallback
  return 'de-DE';
};

// ─── Normalisierung für Vergleich (Akzente, Groß/Klein, Trim) ────────────────
const normalize = (str = '') =>
  str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();

const speechMatches = (heard, correct) => {
  const h = normalize(heard);
  const c = normalize(correct);
  if (!h || !c) return false;
  return h === c || h.includes(c) || c.includes(h);
};

const WORTART_LABELS = {
  noun: 'Nomen', verb: 'Verb', adjective: 'Adjektiv', adverb: 'Adverb',
  pronoun: 'Pronomen', preposition: 'Präposition', conjunction: 'Konjunktion',
  determiner: 'Artikel/Det.', numeral: 'Zahlwort', interjection: 'Interjektion',
  particle: 'Partikel', phrase: 'Wendung', other: 'Sonstiges'
};

// ─── Hauptkomponente ──────────────────────────────────────────────────────────
const SprachTestPage = () => {
  const { testId } = useParams();
  const navigate   = useNavigate();

  const [vocabList,       setVocabList]      = useState([]);
  const [wortartMap,      setWortartMap]     = useState({});
  const [fachVokabelPool, setFachVokabelPool] = useState([]);
  const [fachId,          setFachId]         = useState(null);
  const [fachName,        setFachName]       = useState('');
  const [loading,         setLoading]        = useState(true);

  const [currentIndex,   setCurrentIndex]   = useState(0);
  const [score,          setScore]          = useState(0);
  const [fehlerListe,    setFehlerListe]    = useState([]);
  const [isFinished,     setIsFinished]     = useState(false);

  // Modus: 'speech' | 'mc'
  const [mode,           setMode]           = useState('speech');
  const [speechFailed,   setSpeechFailed]   = useState(false);

  const [listening,      setListening]      = useState(false);
  const [transcript,     setTranscript]     = useState('');
  const [speechError,    setSpeechError]    = useState('');
  const recognitionRef = useRef(null);

  const [mcOptions,      setMcOptions]      = useState([]);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isCorrect,      setIsCorrect]      = useState(null);
  const [showFeedback,   setShowFeedback]   = useState(false);

  const [startTime,      setStartTime]      = useState(null);
  const [elapsed,        setElapsed]        = useState(0);
  const [timeStats,      setTimeStats]      = useState({ total: 0, average: 0 });

  useEffect(() => { fetchData(); }, [testId]);

  useEffect(() => {
    let iv;
    if (startTime && !isFinished)
      iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [startTime, isFinished]);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) setSpeechFailed(true);
  }, []);

  // ─── Daten laden ─────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);

    const { data: testData } = await supabase
      .from('vokabel_tests')
      .select('fach_id, faecher(id, name)')
      .eq('id', testId)
      .single();

    const cFachId   = testData?.fach_id || null;
    const cFachName = testData?.faecher?.name || '';
    if (cFachId)   setFachId(cFachId);
    if (cFachName) setFachName(cFachName);

    const { data: vocabData } = await supabase
      .from('vokabeln').select('*').eq('test_id', testId);

    if (!vocabData || vocabData.length === 0) { setLoading(false); return; }

    const vocabIds = vocabData.map(v => v.id);
    const { data: waData } = await supabase
      .from('vokabeln_wortarten').select('vokabel_id, wortart_id').in('vokabel_id', vocabIds);
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

  // ─── MC-Optionen generieren ───────────────────────────────────────────────────
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

  // ─── Spracheingabe ────────────────────────────────────────────────────────────
  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSpeechFailed(true); setMode('mc'); return; }
    const lang = getFachLang(fachName);
    if (!lang) { setMode('mc'); return; }

    setSpeechError('');
    setTranscript('');
    setListening(true);

    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 5;

    rec.onresult = (e) => {
      const alts    = Array.from(e.results[0]).map(r => r.transcript);
      const cur     = vocabList[currentIndex];
      const matched = alts.find(r => speechMatches(r, cur.uebersetzung));
      setTranscript(alts[0]);
      setListening(false);
      evaluateSpeech(matched ? cur.uebersetzung : alts[0], cur);
    };

    rec.onerror = (e) => {
      setListening(false);
      if (e.error === 'no-speech')    setSpeechError('Keine Sprache erkannt – versuche es nochmal oder wechsle zu Auswahl.');
      else if (e.error === 'not-allowed') { setSpeechFailed(true); setSpeechError('Mikrofon-Zugriff verweigert.'); setMode('mc'); }
      else setSpeechError(`Fehler: ${e.error}`);
    };

    rec.onend = () => setListening(false);
    rec.start();
  };

  const stopListening = () => { recognitionRef.current?.stop(); setListening(false); };

  const evaluateSpeech = (heard, cur) => {
    const ok = speechMatches(heard, cur.uebersetzung);
    setIsCorrect(ok);
    setShowFeedback(true);
    if (ok) setScore(s => s + 1);
    else    setFehlerListe(prev => [...prev, cur]);
    setTimeout(() => advanceQuestion(ok), 1200);
  };

  // ─── MC-Antwort ───────────────────────────────────────────────────────────────
  const handleMcAnswer = (option) => {
    if (showFeedback) return;
    const cur = vocabList[currentIndex];
    const ok  = option === cur.uebersetzung;
    setSelectedAnswer(option);
    setIsCorrect(ok);
    setShowFeedback(true);
    if (ok) setScore(s => s + 1);
    else    setFehlerListe(prev => [...prev, cur]);
    setTimeout(() => advanceQuestion(ok), 700);
  };

  // ─── Nächste Frage ────────────────────────────────────────────────────────────
  const advanceQuestion = (wasCorrect) => {
    setShowFeedback(false);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setTranscript('');
    setSpeechError('');

    const next = currentIndex + 1;
    if (next < vocabList.length) {
      setCurrentIndex(next);
      if (!speechFailed && getFachLang(fachName)) setMode('speech');
      buildMcOptions(vocabList, next, wortartMap, fachVokabelPool);
    } else {
      setIsFinished(true);
      const rawMs  = Date.now() - startTime - vocabList.length * 1000;
      const totSec = Math.max(1, rawMs / 1000);
      setTimeStats({ total: totSec.toFixed(1), average: (totSec / vocabList.length).toFixed(1) });
      saveResults(
        wasCorrect ? score + 1 : score,
        wasCorrect ? fehlerListe : [...fehlerListe, vocabList[currentIndex]],
        totSec, totSec / vocabList.length
      );
    }
  };

  // ─── Ergebnis speichern ───────────────────────────────────────────────────────
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
          frage: v.original, gegebene_antwort: 'Sprache: falsch',
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

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ─── Render: Laden ────────────────────────────────────────────────────────────
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Lade Vokabeln...</div>;
  if (vocabList.length === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Keine Vokabeln gefunden.</div>;

  // ─── Render: Fertig ───────────────────────────────────────────────────────────
  if (isFinished) {
    return (
      <div style={{ maxWidth: '32rem', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '1rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', textAlign: 'center', borderTop: '8px solid #0f5156', fontFamily: 'sans-serif' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Test beendet! 🎉</h2>
        <div style={{ background: '#f0fdfa', padding: '1.5rem', borderRadius: '1rem', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '1.25rem', margin: '0 0 0.5rem 0', color: '#4b5563' }}>Dein Ergebnis:</p>
          <p style={{ fontSize: '3rem', fontWeight: 'bold', color: '#0f5156', margin: 0 }}>
            {score} <span style={{ fontSize: '1.5rem', color: '#9ca3af' }}>/ {vocabList.length}</span>
          </p>
        </div>
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
  const showMc   = mode === 'mc' || speechFailed || !getFachLang(fachName);

  let cardBg = 'white', cardBorder = '#e5e7eb';
  if (showFeedback) { cardBg = isCorrect ? '#dcfce7' : '#fee2e2'; cardBorder = isCorrect ? '#22c55e' : '#ef4444'; }

  return (
    <div style={{ maxWidth: '42rem', margin: '2rem auto 5rem', padding: '0 1rem', fontFamily: 'sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', fontSize: '1.125rem', fontWeight: '600', color: '#4b5563' }}>
        <span>Frage {currentIndex + 1} <span style={{ fontSize: '0.875rem', fontWeight: 'normal' }}>von {vocabList.length}</span></span>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>⏱ {fmt(elapsed)}</span>
          <span style={{ background: '#ccfbf1', color: '#0f5156', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.875rem' }}>Score: {score}</span>
        </div>
      </div>

      {/* Fortschrittsbalken */}
      <div style={{ width: '100%', background: '#e5e7eb', borderRadius: '9999px', height: '0.75rem', marginBottom: '2rem' }}>
        <div style={{ background: '#0f5156', height: '100%', borderRadius: '9999px', width: `${progress}%`, transition: 'width 0.3s' }} />
      </div>

      {/* Vokabel-Karte */}
      <div style={{ background: cardBg, border: `2px solid ${cardBorder}`, borderRadius: '1rem', padding: '2rem', marginBottom: '1.5rem', textAlign: 'center', minHeight: '160px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
        {waId && (
          <span style={{ fontSize: 11, fontWeight: 600, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 6, padding: '2px 9px', marginBottom: 10 }}>
            🏷️ {WORTART_LABELS[waId] || waId}
          </span>
        )}
        <h2 style={{ fontSize: '2.5rem', fontWeight: '800', color: '#1f2937', margin: 0 }}>{cur.original}</h2>
        {showFeedback && (
          <div style={{ marginTop: '0.75rem' }}>
            <span style={{ fontSize: '2rem' }}>{isCorrect ? '✅' : '❌'}</span>
            {!isCorrect && <p style={{ marginTop: '0.5rem', fontSize: '1.1rem', fontWeight: 'bold', color: '#b91c1c' }}>Richtig: <em>{cur.uebersetzung}</em></p>}
            {transcript && <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: 4 }}>Du hast gesagt: „{transcript}"</p>}
          </div>
        )}
      </div>

      {/* ── Modus: Spracheingabe ── */}
      {!showMc && (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={listening ? stopListening : startListening}
            disabled={showFeedback}
            style={{
              width: '100%', padding: '1.5rem', fontSize: '1.5rem', fontWeight: 'bold',
              background: showFeedback ? '#e5e7eb' : listening ? '#ef4444' : '#0f5156',
              color: 'white', border: 'none', borderRadius: '1rem',
              cursor: showFeedback ? 'not-allowed' : 'pointer', marginBottom: '1rem', transition: 'background 0.2s'
            }}>
            {listening ? '🔴 Läuft... jetzt sprechen!' : '🎤 Sprechen'}
          </button>
          {speechError && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '0.75rem' }}>{speechError}</p>}
          <button
            onClick={() => { setMode('mc'); setSpeechError(''); }}
            style={{ background: 'none', border: '1px solid #d1d5db', color: '#6b7280', padding: '0.5rem 1.5rem', borderRadius: '9999px', cursor: 'pointer', fontSize: '0.875rem' }}>
            📝 Lieber Auswahl zeigen
          </button>
        </div>
      )}

      {/* ── Modus: Multiple Choice (Fallback) ── */}
      {showMc && (
        <div>
          {!speechFailed && getFachLang(fachName) && (
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#9ca3af', background: '#f3f4f6', padding: '3px 10px', borderRadius: '9999px' }}>📝 Auswahl-Modus</span>
              <button onClick={() => { setMode('speech'); setSpeechError(''); }}
                style={{ background: 'none', border: 'none', color: '#0f5156', fontSize: '0.875rem', cursor: 'pointer', marginLeft: 12 }}>
                🎤 Zurück zu Sprache
              </button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
            {mcOptions.map((opt, i) => {
              let s = { width: '100%', textAlign: 'left', padding: '1.25rem', borderRadius: '1rem', fontSize: '1.25rem', fontWeight: '500', cursor: showFeedback ? 'not-allowed' : 'pointer', background: 'white', border: '2px solid #e5e7eb', color: '#374151' };
              if (showFeedback) {
                if (opt === cur.uebersetzung)     s = { ...s, background: '#22c55e', borderColor: '#22c55e', color: 'white' };
                else if (opt === selectedAnswer)  s = { ...s, background: '#ef4444', borderColor: '#ef4444', color: 'white' };
                else                              s = { ...s, background: '#f3f4f6', borderColor: '#f3f4f6', color: '#9ca3af', opacity: 0.5 };
              }
              return <button key={i} onClick={() => handleMcAnswer(opt)} disabled={showFeedback} style={s}>{opt}</button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SprachTestPage;
