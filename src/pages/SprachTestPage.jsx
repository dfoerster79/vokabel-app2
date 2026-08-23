import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const normalize = (str = '') =>
  str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();

const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = a[i-1] === b[j-1] ? d[i-1][j-1] : 1 + Math.min(d[i-1][j], d[i][j-1], d[i-1][j-1]);
  return d[m][n];
};

const speechMatches = (heard, correct) => {
  const h = normalize(heard), c = normalize(correct);
  return Boolean(h && c) && (
    h === c ||
    h.includes(c) ||
    c.includes(h) ||
    levenshtein(h, c) <= Math.max(2, Math.floor(c.length * 0.3))
  );
};

const WORTART_LABELS = {
  noun:'Nomen', verb:'Verb', adjective:'Adjektiv', adverb:'Adverb',
  pronoun:'Pronomen', preposition:'Präposition', conjunction:'Konjunktion',
  determiner:'Artikel/Det.', numeral:'Zahlwort', interjection:'Interjektion',
  particle:'Partikel', phrase:'Wendung', other:'Sonstiges'
};

const getStatusLabel = (result) => {
  if (!result) return '⏳ Wartet';
  if (result.status === 'uploading') return '⬆️ Upload…';
  if (result.status === 'processing') return '🤖 Whisper…';
  if (result.status === 'done') return result.correct ? '✅ Richtig' : `❌ Falsch ("${result.text || '–'}")` ;
  return '⏳ Wartet';
};

const getStatusColor = (result) => {
  if (!result) return '#9ca3af';
  if (result.status === 'uploading') return '#d97706';
  if (result.status === 'processing') return '#2563eb';
  if (result.status === 'done') return result.correct ? '#15803d' : '#b91c1c';
  return '#9ca3af';
};

const SprachTestPage = () => {
  const { testId } = useParams();
  const navigate = useNavigate();

  const [vocabList, setVocabList] = useState([]);
  const [wortartMap, setWortartMap] = useState({});
  const [fachVokabelPool, setFachVokabelPool] = useState([]);
  const [fachId, setFachId] = useState(null);
  const [fachName, setFachName] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [resultsReady, setResultsReady] = useState(false);
  const [score, setScore] = useState(0);
  const [fehlerListe, setFehlerListe] = useState([]);
  const [mode, setMode] = useState('speech');
  const [micError, setMicError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [transcriptions, setTranscriptions] = useState({});
  const [mcOptions, setMcOptions] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [timeStats, setTimeStats] = useState({ total: 0, average: 0 });
  const [showDebug, setShowDebug] = useState(false);

  const mediaRecorderRef = useRef(null);
  const streamTracksRef = useRef([]);
  const audioChunksRef = useRef([]);
  const activeVocabRef = useRef(null);
  const finishedRef = useRef(false);
  // BUG 3 FIX: transcriptions-Ref parallel zum State, damit finishTest immer den aktuellen
  // Stand lesen kann ohne veralteten Closure-Zustand (stale closure deadlock).
  const transcriptionsRef = useRef({});

  const stopAllTracks = useCallback(() => {
    streamTracksRef.current.forEach(t => { try { t.stop(); } catch (_) {} });
    streamTracksRef.current = [];
  }, []);

  useEffect(() => { fetchData(); }, [testId]);

  useEffect(() => {
    if (!startTime || isFinished) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startTime, isFinished]);

  useEffect(() => {
    if (micPermissionGranted && mode === 'speech' && !isFinished && vocabList.length)
      startRecordingFor(vocabList[currentIndex]);
  }, [currentIndex, micPermissionGranted, mode, isFinished, vocabList]);

  // BUG 3 FIX: useEffect beobachtet evaluating + Anzahl fertiger Transkriptionen,
  // NICHT das transcriptions-Objekt direkt (würde bei jedem Status-Update neu feuern
  // aber trotzdem mit altem Closure-Wert arbeiten).
  // Zähle done-Einträge als abgeleitete Zahl → stabiler Trigger.
  const doneCount = Object.values(transcriptions).filter(t => t.status === 'done').length;
  useEffect(() => {
    if (!evaluating || resultsReady || !vocabList.length) return;
    if (doneCount === vocabList.length) {
      // Lese aktuellen Stand aus Ref, nicht aus State (kein stale closure)
      finishTest(transcriptionsRef.current);
    }
  }, [evaluating, resultsReady, doneCount, vocabList.length]);

  useEffect(() => () => {
    stopAllTracks();
    const r = mediaRecorderRef.current;
    if (r?.state === 'recording') r.stop();
    mediaRecorderRef.current = null;
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: testData } = await supabase
      .from('vokabel_tests').select('fach_id, faecher(id, name)').eq('id', testId).single();
    const selectedFachId = testData?.fach_id || null;
    const selectedFachName = testData?.faecher?.name || '';
    setFachId(selectedFachId); setFachName(selectedFachName);
    if (selectedFachName.toLowerCase().includes('lat')) setMode('mc');

    const { data: vocabData } = await supabase.from('vokabeln').select('*').eq('test_id', testId);
    if (!vocabData?.length) { setLoading(false); return; }

    const ids = vocabData.map(v => v.id);
    const { data: waData } = await supabase
      .from('vokabeln_wortarten').select('vokabel_id, wortart_id').in('vokabel_id', ids);
    const waMap = {};
    (waData || []).forEach(w => { waMap[w.vokabel_id] = w.wortart_id; });
    setWortartMap(waMap);

    let pool = [];
    if (selectedFachId) {
      const { data: allTests } = await supabase
        .from('vokabel_tests').select('id').eq('fach_id', selectedFachId);
      const testIds = (allTests || []).map(t => t.id);
      if (testIds.length) {
        const { data: poolData } = await supabase
          .from('vokabeln').select('id, uebersetzung').in('test_id', testIds);
        const poolIds = (poolData || []).map(v => v.id);
        const { data: poolWa } = poolIds.length
          ? await supabase.from('vokabeln_wortarten').select('vokabel_id, wortart_id').in('vokabel_id', poolIds)
          : { data: [] };
        const map = {};
        (poolWa || []).forEach(w => { map[w.vokabel_id] = w.wortart_id; });
        pool = (poolData || []).map(v => ({ ...v, wortart_id: map[v.id] || 'other' }));
      }
    }
    setFachVokabelPool(pool);

    const shuffled = [...vocabData].sort(() => Math.random() - 0.5);
    setVocabList(shuffled);
    buildMcOptions(shuffled, 0, waMap, pool);
    setStartTime(Date.now());
    setLoading(false);
  };

  const buildMcOptions = (list, index, waMap, pool) => {
    const current = list[index]; if (!current) return;
    const same = pool.filter(v => v.id !== current.id && v.wortart_id === (waMap[current.id] || 'other'));
    const diff = pool.filter(v => v.id !== current.id && v.wortart_id !== (waMap[current.id] || 'other'));
    const fallback = list.filter(v => v.id !== current.id);
    const ordered = [...same, ...diff, ...fallback].sort(() => Math.random() - 0.5);
    const distractors = ordered
      .map(v => v.uebersetzung)
      .filter((v, i, a) => v !== current.uebersetzung && a.indexOf(v) === i)
      .slice(0, 3);
    setMcOptions([...distractors, current.uebersetzung].sort(() => Math.random() - 0.5));
  };

  const requestMicrophoneAccess = async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamTracksRef.current = stream.getTracks();
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      setMicPermissionGranted(true);
    } catch (error) {
      console.error(error);
      setMicError('Mikrofon-Zugriff fehlgeschlagen. Bitte erlaube das Mikrofon im Browser.');
    }
  };

  const startRecordingFor = (vocabItem) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'inactive' || !vocabItem) return;
    activeVocabRef.current = vocabItem;
    audioChunksRef.current = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const item = activeVocabRef.current;
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      audioChunksRef.current = [];
      if (item && blob.size > 0) {
        processAudio(blob, item);
      } else if (item) {
        const result = { status: 'done', type: 'speech', text: '[Keine Aufnahme]', correct: false };
        transcriptionsRef.current = { ...transcriptionsRef.current, [item.id]: result };
        setTranscriptions(prev => ({ ...prev, [item.id]: result }));
      }
    };
    recorder.start();
    setIsRecording(true);
  };

  const processAudio = (blob, vocabItem) => {
    const setStatus = (update) => {
      transcriptionsRef.current = { ...transcriptionsRef.current, [vocabItem.id]: { ...transcriptionsRef.current[vocabItem.id], ...update } };
      setTranscriptions(prev => ({ ...prev, [vocabItem.id]: { ...prev[vocabItem.id], ...update } }));
    };

    setStatus({ status: 'uploading', type: 'speech', text: '', correct: false });

    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      try {
        setStatus({ status: 'processing' });
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: String(reader.result).split(',')[1],
            language: 'de',
            prompt: vocabItem.uebersetzung,
          }),
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Whisper ${response.status}: ${errText}`);
        }
        const data = await response.json();
        const text = data.text || '';
        setStatus({ status: 'done', text, correct: speechMatches(text, vocabItem.uebersetzung) });
      } catch (error) {
        console.error('Transcription error:', error);
        setStatus({ status: 'done', text: `[Fehler: ${error.message}]`, correct: false });
      }
    };
  };

  const handleWeiter = () => {
    const current = vocabList[currentIndex];
    if (!current) return;
    const isLast = currentIndex === vocabList.length - 1;
    const recorder = mediaRecorderRef.current;

    if (recorder?.state === 'recording') {
      activeVocabRef.current = current;
      recorder.stop();
      setIsRecording(false);
    } else if (!transcriptionsRef.current[current.id]) {
      const result = { status: 'done', type: 'speech', text: '[Nichts gesprochen]', correct: false };
      transcriptionsRef.current = { ...transcriptionsRef.current, [current.id]: result };
      setTranscriptions(prev => ({ ...prev, [current.id]: result }));
    }

    if (isLast) {
      mediaRecorderRef.current = null;
      setIsFinished(true);
      setEvaluating(true);
      return;
    }
    const next = currentIndex + 1;
    setCurrentIndex(next);
    buildMcOptions(vocabList, next, wortartMap, fachVokabelPool);
  };

  const handleMcAnswer = (option) => {
    const current = vocabList[currentIndex];
    if (!current) return;
    const result = { status: 'done', type: 'mc', text: option, correct: option === current.uebersetzung };
    transcriptionsRef.current = { ...transcriptionsRef.current, [current.id]: result };
    setTranscriptions(prev => ({ ...prev, [current.id]: result }));
    if (currentIndex === vocabList.length - 1) { setIsFinished(true); setEvaluating(true); return; }
    const next = currentIndex + 1;
    setCurrentIndex(next);
    buildMcOptions(vocabList, next, wortartMap, fachVokabelPool);
  };

  const finishTest = (finalTranscriptions) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    stopAllTracks();
    mediaRecorderRef.current = null;
    setIsRecording(false);
    const errors = vocabList.filter(v => !finalTranscriptions[v.id]?.correct);
    const finalScore = vocabList.length - errors.length;
    const total = Math.max(1, (Date.now() - startTime) / 1000);
    setScore(finalScore);
    setFehlerListe(errors);
    setTimeStats({ total: total.toFixed(1), average: (total / vocabList.length).toFixed(1) });
    setEvaluating(false);
    setResultsReady(true);
    saveResults(finalScore, errors, total, total / vocabList.length, finalTranscriptions);
  };

  const saveResults = async (finalScore, errors, timeTaken, avgTime, results) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: attempt, error } = await supabase.from('lern_attempts').insert([{
      user_id: user.id, fach_id: fachId, vokabel_test_id: testId, testart: 'sprache',
      correct_count: finalScore, question_count: vocabList.length,
      percent_correct: Math.round((finalScore / vocabList.length) * 100),
      time_taken_seconds: timeTaken, avg_time_per_word: avgTime,
      started_at: new Date(startTime).toISOString(), finished_at: new Date().toISOString(),
    }]).select().single();
    if (error || !attempt || !errors.length) return;
    await supabase.from('lern_attempt_fehler').insert(errors.map(v => ({
      attempt_id: attempt.id, user_id: user.id, fach_id: fachId,
      vokabel_test_id: testId, vokabel_id: v.id,
      frage: v.original, gegebene_antwort: results[v.id]?.text || 'Falsch',
      richtige_antwort: v.uebersetzung, ist_richtig: false,
    })));
  };

  const abortTest = () => {
    if (window.confirm('Test wirklich abbrechen? Fortschritt wird nicht gespeichert.')) {
      stopAllTracks();
      const r = mediaRecorderRef.current;
      if (r?.state === 'recording') r.stop();
      mediaRecorderRef.current = null;
      navigate('/lernen');
    }
  };

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const current = vocabList[currentIndex];

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Lade Vokabeln...</div>;
  if (!vocabList.length) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Keine Vokabeln gefunden.</div>;

  // --- EVALUATING SCREEN ---
  if (isFinished && evaluating) {
    const entries = vocabList.map(v => ({ vocab: v, result: transcriptions[v.id] }));
    const done = entries.filter(e => e.result?.status === 'done').length;
    const active = entries.find(e => ['uploading', 'processing'].includes(e.result?.status));
    return (
      <div style={{ maxWidth: '34rem', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '1rem', textAlign: 'center', fontFamily: 'sans-serif', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '1.6rem', color: '#0f5156', margin: '0 0 1rem' }}>🧠 KI wertet Antworten aus...</h2>
        <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>Fertig: {done} / {vocabList.length} · Noch offen: {vocabList.length - done}</p>
        <div style={{ background: active ? '#f0fdfa' : '#f3f4f6', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem', textAlign: 'left' }}>
          <div style={{ fontSize: '0.75rem', color: '#0f766e', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Aktuelle Bearbeitung</div>
          <div style={{ fontSize: '1.1rem', color: '#134e4a', fontWeight: 'bold', marginTop: 4 }}>
            {active ? `${active.result?.status === 'uploading' ? '⬆️' : '🤖'} ${active.vocab.original}` : '✅ Alle Aufnahmen verarbeitet'}
          </div>
          {active && (
            <div style={{ color: '#0f766e', fontSize: '0.85rem', marginTop: 4 }}>
              {active.result.status === 'uploading' ? 'Audio wird hochgeladen…' : 'Whisper erkennt die Antwort…'}
            </div>
          )}
        </div>
        <div style={{ maxHeight: 300, overflowY: 'auto', textAlign: 'left', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
          {entries.map(({ vocab, result }) => (
            <div key={vocab.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0.45rem 0', borderBottom: '1px solid #f3f4f6', color: '#374151', fontSize: '0.9rem' }}>
              <span style={{ fontWeight: 500 }}>{vocab.original}</span>
              <span style={{ color: getStatusColor(result), textAlign: 'right', maxWidth: '55%', wordBreak: 'break-word' }}>{getStatusLabel(result)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- RESULTS SCREEN ---
  if (isFinished && resultsReady) return (
    <div style={{ maxWidth: '32rem', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '1rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', textAlign: 'center', borderTop: '8px solid #0f5156', fontFamily: 'sans-serif' }}>
      <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Test beendet! 🎉</h2>
      <div style={{ background: '#f0fdfa', padding: '1.5rem', borderRadius: '1rem', marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '1.25rem', margin: '0 0 0.5rem', color: '#4b5563' }}>Dein Ergebnis:</p>
        <p style={{ fontSize: '3rem', fontWeight: 'bold', color: '#0f5156', margin: 0 }}>
          {score} <span style={{ fontSize: '1.5rem', color: '#9ca3af' }}>/ {vocabList.length}</span>
        </p>
      </div>
      {fehlerListe.length > 0 && (
        <div style={{ textAlign: 'left', marginBottom: '2rem', background: '#fef2f2', padding: '1.5rem', borderRadius: '0.75rem' }}>
          <h3 style={{ color: '#991b1b', marginTop: 0 }}>Deine Fehler:</h3>
          {fehlerListe.map(v => (
            <div key={v.id} style={{ marginBottom: '1rem', borderBottom: '1px solid #fecaca', paddingBottom: '0.5rem' }}>
              <div style={{ fontWeight: 'bold', color: '#7f1d1d' }}>{v.original}</div>
              <div style={{ color: '#166534', fontSize: '0.9rem' }}>Richtig: {v.uebersetzung}</div>
              <div style={{ color: '#991b1b', fontSize: '0.9rem', marginTop: 2 }}>Du sagtest: <i>{transcriptions[v.id]?.text || '[Nichts]'}</i></div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ flex: 1, background: '#f3f4f6', padding: '1rem', borderRadius: '0.75rem' }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Gesamtzeit</p>
          <p style={{ margin: '0.25rem 0 0', fontSize: '1.25rem', fontWeight: 'bold' }}>{timeStats.total} s</p>
        </div>
        <div style={{ flex: 1, background: '#f3f4f6', padding: '1rem', borderRadius: '0.75rem' }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Ø pro Wort</p>
          <p style={{ margin: '0.25rem 0 0', fontSize: '1.25rem', fontWeight: 'bold' }}>{timeStats.average} s</p>
        </div>
      </div>
      <button onClick={() => navigate('/lernen')} style={{ width: '100%', background: '#0f5156', color: 'white', fontSize: '1.25rem', fontWeight: 'bold', padding: '1rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer' }}>
        Zurück zur Übersicht
      </button>
    </div>
  );

  // --- TEST SCREEN ---
  const progress = ((currentIndex + 1) / vocabList.length) * 100;
  const waId = wortartMap[current?.id];
  const showMc = mode === 'mc' || fachName.toLowerCase().includes('lat');
  const activeTranscriptions = vocabList.filter(v => transcriptions[v.id] && transcriptions[v.id].status !== 'done');
  const doneTranscriptions = vocabList.filter(v => transcriptions[v.id]?.status === 'done');

  return (
    <div style={{ maxWidth: '42rem', margin: '2rem auto 5rem', padding: '0 1rem', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '1.125rem', fontWeight: 600, color: '#4b5563' }}>
          Frage {currentIndex + 1} <span style={{ fontSize: '0.875rem', fontWeight: 'normal' }}>von {vocabList.length}</span>
        </span>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>⏱ {fmt(elapsed)}</span>
          <button
            onClick={() => setShowDebug(v => !v)}
            title="KI-Debug-Status"
            style={{
              background: activeTranscriptions.length > 0 ? '#fef3c7' : '#f3f4f6',
              border: '1px solid #e5e7eb',
              color: activeTranscriptions.length > 0 ? '#d97706' : '#6b7280',
              padding: '0.25rem 0.6rem',
              borderRadius: '9999px',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            🤖 {doneTranscriptions.length}/{currentIndex + 1}
          </button>
          <button
            onClick={abortTest}
            style={{ background: 'none', border: '1px solid #e5e7eb', color: '#9ca3af', padding: '0.25rem 0.6rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            ✕ Abbruch
          </button>
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div style={{ background: '#1e293b', color: '#94a3b8', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem', fontSize: '0.78rem', fontFamily: 'monospace', maxHeight: 200, overflowY: 'auto' }}>
          <div style={{ color: '#38bdf8', fontWeight: 'bold', marginBottom: '0.5rem' }}>🔍 KI-Debug ({doneTranscriptions.length}/{vocabList.length} fertig)</div>
          {vocabList.slice(0, currentIndex + 1).map(v => {
            const r = transcriptions[v.id];
            return (
              <div key={v.id} style={{ display: 'flex', gap: 8, padding: '2px 0', borderBottom: '1px solid #334155' }}>
                <span style={{ minWidth: 100, color: '#e2e8f0' }}>{v.original}</span>
                <span style={{ color: getStatusColor(r) }}>{getStatusLabel(r)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Fortschrittsbalken */}
      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 99, marginBottom: '1.5rem', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: '#0f5156', borderRadius: 99, transition: 'width 0.3s ease' }} />
      </div>

      {/* Fach-Badge */}
      {fachName && (
        <div style={{ display: 'inline-block', background: '#f0fdfa', color: '#0f766e', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', marginBottom: '1rem', fontWeight: 500 }}>
          {fachName}
        </div>
      )}

      {/* Vokabel-Karte */}
      {current && (
        <div style={{ background: 'white', borderRadius: '1.25rem', padding: '2.5rem 2rem', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.07)', marginBottom: '1.5rem', border: '1px solid #e5e7eb' }}>
          {waId && (
            <div style={{ display: 'inline-block', background: '#f3f4f6', color: '#6b7280', padding: '0.15rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', marginBottom: '1rem' }}>
              {WORTART_LABELS[waId] || waId}
            </div>
          )}
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>{current.original}</div>
          {current.beispiel && (
            <div style={{ marginTop: '1rem', color: '#6b7280', fontSize: '0.9rem', fontStyle: 'italic' }}>{current.beispiel}</div>
          )}
        </div>
      )}

      {/* Mikrofon-Anfrage */}
      {mode === 'speech' && !micPermissionGranted && (
        <div style={{ textAlign: 'center', padding: '2rem', background: '#f0fdfa', borderRadius: '1rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎙️</div>
          <p style={{ color: '#4b5563', marginBottom: '1rem' }}>Bitte erlaube den Mikrofon-Zugriff für den Sprachtest.</p>
          {micError && <p style={{ color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' }}>{micError}</p>}
          <button
            onClick={requestMicrophoneAccess}
            style={{ background: '#0f5156', color: 'white', padding: '0.75rem 2rem', borderRadius: '0.75rem', border: 'none', fontSize: '1rem', cursor: 'pointer', fontWeight: 600 }}
          >
            Mikrofon erlauben
          </button>
        </div>
      )}

      {/* Aufnahme-Indikator */}
      {mode === 'speech' && micPermissionGranted && (
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            background: isRecording ? '#fef2f2' : '#f3f4f6',
            color: isRecording ? '#dc2626' : '#6b7280',
            padding: '0.5rem 1.25rem', borderRadius: '9999px', fontSize: '0.9rem',
            border: `1px solid ${isRecording ? '#fecaca' : '#e5e7eb'}`,
          }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: isRecording ? '#dc2626' : '#d1d5db', animation: isRecording ? 'pulse 1.5s infinite' : 'none' }} />
            {isRecording ? 'Aufnahme läuft…' : 'Bereit'}
          </div>
        </div>
      )}

      {/* MC-Optionen */}
      {showMc && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {mcOptions.map(opt => (
            <button key={opt} onClick={() => handleMcAnswer(opt)}
              style={{ background: 'white', border: '2px solid #e5e7eb', borderRadius: '0.75rem', padding: '0.85rem', fontSize: '1rem', cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s' }}
              onMouseOver={e => e.currentTarget.style.borderColor = '#0f5156'}
              onMouseOut={e => e.currentTarget.style.borderColor = '#e5e7eb'}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* Weiter-Button */}
      {!showMc && micPermissionGranted && (
        <button
          onClick={handleWeiter}
          style={{ width: '100%', background: '#0f5156', color: 'white', fontSize: '1.25rem', fontWeight: 700, padding: '1rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer' }}
        >
          {currentIndex === vocabList.length - 1 ? 'Test beenden ✓' : 'Weiter →'}
        </button>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
};

export default SprachTestPage;
