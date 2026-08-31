import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------
const normalize = (str = '') =>
  str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim();

const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = a[i-1] === b[j-1] ? d[i-1][j-1] : 1 + Math.min(d[i-1][j], d[i][j-1], d[i-1][j-1]);
  return d[m][n];
};

const speechMatches = (heard, correct) => {
  const h = normalize(heard), c = normalize(correct);
  return Boolean(h && c) && (
    h === c || h.includes(c) || c.includes(h) ||
    levenshtein(h, c) <= Math.max(2, Math.floor(c.length * 0.3))
  );
};

const WORTART_LABELS = {
  noun:'Nomen', verb:'Verb', adjective:'Adjektiv', adverb:'Adverb',
  pronoun:'Pronomen', preposition:'Präposition', conjunction:'Konjunktion',
  determiner:'Artikel/Det.', numeral:'Zahlwort', interjection:'Interjektion',
  particle:'Partikel', phrase:'Wendung', other:'Sonstiges',
};

const statusLabel = (r) => {
  if (!r) return '⏳ Wartet';
  if (r.status === 'recording') return '🔴 Aufnahme...';
  if (r.status === 'uploading') return '⬆️ Upload...';
  if (r.status === 'processing') return '🤖 Whisper...';
  if (r.status === 'done') return r.correct ? '✅ Richtig' : `❌ Falsch ("${r.text || '–'}")`;
  return '⏳ Wartet';
};

const statusColor = (r) => {
  if (!r) return '#9ca3af';
  if (r.status === 'recording') return '#dc2626';
  if (r.status === 'uploading') return '#d97706';
  if (r.status === 'processing') return '#2563eb';
  if (r.status === 'done') return r.correct ? '#15803d' : '#b91c1c';
  return '#9ca3af';
};

// ---------------------------------------------------------------------------
// Hauptkomponente
// ---------------------------------------------------------------------------
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
  const [phase, setPhase] = useState('test'); // 'test' | 'evaluating' | 'results'
  const [score, setScore] = useState(0);
  const [fehlerListe, setFehlerListe] = useState([]);
  const [mode, setMode] = useState('speech');
  const [micError, setMicError] = useState('');
  const [micReady, setMicReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  // transcriptions: { [vocabId]: { status, text, correct } }
  const [transcriptions, setTranscriptions] = useState({});
  const [mcOptions, setMcOptions] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [timeStats, setTimeStats] = useState({ total: 0, average: 0 });
  const [showDebug, setShowDebug] = useState(false);

  // Refs für synchrone Steuerung ohne Timing-Probleme
  const streamRef = useRef(null);
  const currentRecorderRef = useRef(null);
  const currentChunksRef = useRef([]);
  const currentVocabRef = useRef(null);
  const transcriptionsRef = useRef({});
  const finishedRef = useRef(false);
  const vocabListRef = useRef([]);
  const startTimeRef = useRef(null);
  const currentIndexRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Mikrofon: Stream EINMALIG anfordern beim Klick auf "Mikrofon erlauben"
  // ---------------------------------------------------------------------------
  const requestMic = async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicReady(true);
      // Sofort Aufnahme für die 1. Vokabel starten
      const firstVocab = vocabListRef.current[currentIndexRef.current] || vocabList[0];
      if (firstVocab) {
        startRecording(firstVocab);
      }
    } catch (err) {
      console.error(err);
      setMicError('Mikrofon-Zugriff fehlgeschlagen. Bitte erlaube das Mikrofon im Browser.');
    }
  };

  // Stream WIRKLICH stoppen (Browser-Icon erlischt erst nach Auswertung aller Wörter)
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch (_) {}
      });
      streamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Aufnahme für genau EINE Vokabel starten
  // ---------------------------------------------------------------------------
  const startRecording = (vocab) => {
    if (!streamRef.current || !vocab) return;

    // Laufenden Recorder vorher sicher stoppen
    if (currentRecorderRef.current && currentRecorderRef.current.state !== 'inactive') {
      try { currentRecorderRef.current.stop(); } catch (_) {}
    }

    currentChunksRef.current = [];
    currentVocabRef.current = vocab;

    let mimeType = '';
    const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (const m of mimes) {
      if (MediaRecorder.isTypeSupported(m)) { mimeType = m; break; }
    }

    try {
      const recorder = mimeType
        ? new MediaRecorder(streamRef.current, { mimeType })
        : new MediaRecorder(streamRef.current);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          currentChunksRef.current.push(e.data);
        }
      };

      currentRecorderRef.current = recorder;
      updateTranscription(vocab.id, { status: 'recording', text: '', correct: false });
      // WICHTIG: start() OHNE timeslice aufrufen! Nur so erzeugt iOS Safari eine vollständige, gültige MP4-Datei mit Header beim stop()
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('MediaRecorder start error:', err);
    }
  };

  // ---------------------------------------------------------------------------
  // Aufnahme für die aktuelle Vokabel stoppen und Audio an Whisper übergeben
  // ---------------------------------------------------------------------------
  const stopRecordingAndTranscribe = (vocab) => {
    const recorder = currentRecorderRef.current;
    const targetVocab = vocab || currentVocabRef.current;
    if (!targetVocab) return;

    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(currentChunksRef.current, { type: mime });
        currentChunksRef.current = [];
        if (blob.size > 0) {
          transcribeBlob(blob, targetVocab);
        } else {
          updateTranscription(targetVocab.id, { status: 'done', text: '[Keine Aufnahme]', correct: false });
        }
      };
      try { recorder.stop(); } catch (_) {}
      currentRecorderRef.current = null;
      setIsRecording(false);
    } else if (!transcriptionsRef.current[targetVocab.id]) {
      updateTranscription(targetVocab.id, { status: 'done', text: '[Keine Aufnahme]', correct: false });
    }
  };

  // ---------------------------------------------------------------------------
  // Whisper-Transkription
  // ---------------------------------------------------------------------------
  const transcribeBlob = async (blob, vocabItem) => {
    updateTranscription(vocabItem.id, { status: 'uploading' });
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        try {
          updateTranscription(vocabItem.id, { status: 'processing' });
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: String(reader.result).split(',')[1],
              mimeType: blob.type || 'audio/webm',
              language: 'de',
              prompt: vocabItem.uebersetzung,
            }),
          });
          if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
          const { text = '' } = await res.json();
          const correct = speechMatches(text, vocabItem.uebersetzung);
          updateTranscription(vocabItem.id, { status: 'done', text, correct });
          resolve({ text, correct });
        } catch (err) {
          console.error('Whisper error:', err);
          updateTranscription(vocabItem.id, { status: 'done', text: `[Fehler: ${err.message}]`, correct: false });
          resolve({ text: '', correct: false });
        }
      };
    });
  };

  // Helper: State + Ref synchron halten
  const updateTranscription = (id, update) => {
    const next = { ...(transcriptionsRef.current[id] || {}), ...update };
    transcriptionsRef.current = { ...transcriptionsRef.current, [id]: next };
    setTranscriptions(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...update } }));
  };

  // ---------------------------------------------------------------------------
  // Weiter-Button: Aktuelle Vokabel abschließen → Nächste Vokabel starten
  // ---------------------------------------------------------------------------
  const handleWeiter = () => {
    const currentVocab = vocabListRef.current[currentIndexRef.current];
    const isLast = currentIndexRef.current === vocabListRef.current.length - 1;

    // 1. Aufnahme der AKTUELLEN Vokabel beenden und transkribieren
    stopRecordingAndTranscribe(currentVocab);

    // 2. Weiterschalten
    if (isLast) {
      setPhase('evaluating');
    } else {
      const nextIndex = currentIndexRef.current + 1;
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);

      // Aufnahme für nächste Vokabel nach kurzem Puffer direkt starten
      const nextVocab = vocabListRef.current[nextIndex];
      if (nextVocab && mode === 'speech' && micReady) {
        setTimeout(() => {
          startRecording(nextVocab);
        }, 80);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // MC-Modus
  // ---------------------------------------------------------------------------
  const handleMcAnswer = (option) => {
    const vocab = vocabListRef.current[currentIndexRef.current];
    if (!vocab) return;
    updateTranscription(vocab.id, {
      status: 'done', type: 'mc',
      text: option, correct: option === vocab.uebersetzung,
    });
    const isLast = currentIndexRef.current === vocabListRef.current.length - 1;
    if (isLast) {
      setPhase('evaluating');
    } else {
      const nextIndex = currentIndexRef.current + 1;
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
    }
  };

  // ---------------------------------------------------------------------------
  // Effekte
  // ---------------------------------------------------------------------------

  // Daten laden
  useEffect(() => { fetchData(); }, [testId]);

  // Refs synchron halten
  useEffect(() => { vocabListRef.current = vocabList; }, [vocabList]);
  useEffect(() => { startTimeRef.current = startTime; }, [startTime]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  // Timer
  useEffect(() => {
    if (!startTime || phase !== 'test') return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startTime, phase]);

  // Falls Mikrofon nach dem Vokabel-Laden aktiviert wurde: 1. Vokabel aufnehmen
  useEffect(() => {
    if (mode === 'speech' && micReady && phase === 'test' && vocabList.length > 0) {
      const current = vocabList[currentIndex];
      if (current && !currentRecorderRef.current && !transcriptionsRef.current[current.id]) {
        startRecording(current);
      }
    }
  }, [micReady, phase, vocabList, currentIndex, mode]);

  // Evaluierungs-Phase: Warten bis alle Transkriptionen fertig sind
  useEffect(() => {
    if (phase !== 'evaluating' || !vocabList.length) return;
    const checkDone = () => {
      const all = vocabListRef.current;
      const pending = all.filter(v => {
        const t = transcriptionsRef.current[v.id];
        return !t || t.status !== 'done';
      });
      if (pending.length === 0) finishTest();
    };
    checkDone();
    const id = setInterval(checkDone, 250);
    return () => clearInterval(id);
  }, [phase, vocabList.length]);

  // Cleanup beim Verlassen der Seite
  useEffect(() => () => {
    if (currentRecorderRef.current && currentRecorderRef.current.state !== 'inactive') {
      try { currentRecorderRef.current.stop(); } catch (_) {}
    }
    stopStream();
  }, [stopStream]);

  // ---------------------------------------------------------------------------
  // Test abschließen (Mikrofon wird hier endgültig gestoppt)
  // ---------------------------------------------------------------------------
  const finishTest = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    if (currentRecorderRef.current && currentRecorderRef.current.state !== 'inactive') {
      try { currentRecorderRef.current.stop(); } catch (_) {}
    }
    // Stream jetzt stoppen -> Mikrofon-Icon im Browser erlischt
    stopStream();

    const all = vocabListRef.current;
    const results = transcriptionsRef.current;
    const errors = all.filter(v => !results[v.id]?.correct);
    const finalScore = all.length - errors.length;
    const total = Math.max(1, (Date.now() - startTimeRef.current) / 1000);

    setScore(finalScore);
    setFehlerListe(errors);
    setTimeStats({ total: total.toFixed(1), average: (total / all.length).toFixed(1) });
    setPhase('results');
    saveResults(finalScore, errors, total, total / all.length, results);
  };

  const saveResults = async (finalScore, errors, timeTaken, avgTime, results) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: attempt, error } = await supabase.from('lern_attempts').insert([{
      user_id: user.id, fach_id: fachId, vokabel_test_id: testId, testart: 'sprache',
      correct_count: finalScore, question_count: vocabListRef.current.length,
      percent_correct: Math.round((finalScore / vocabListRef.current.length) * 100),
      time_taken_seconds: timeTaken, avg_time_per_word: avgTime,
      started_at: new Date(startTimeRef.current).toISOString(),
      finished_at: new Date().toISOString(),
    }]).select().single();
    if (error || !attempt || !errors.length) return;
    await supabase.from('lern_attempt_fehler').insert(errors.map(v => ({
      attempt_id: attempt.id, user_id: user.id, fach_id: fachId,
      vokabel_test_id: testId, vokabel_id: v.id,
      frage: v.original, gegebene_antwort: results[v.id]?.text || 'Falsch',
      richtige_antwort: v.uebersetzung, ist_richtig: false,
    })));
  };

  // ---------------------------------------------------------------------------
  // Daten laden
  // ---------------------------------------------------------------------------
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
          ? await supabase.from('vokabeln_wortarten')
            .select('vokabel_id, wortart_id').in('vokabel_id', poolIds)
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

  useEffect(() => {
    if (vocabList.length && currentIndex < vocabList.length)
      buildMcOptions(vocabList, currentIndex, wortartMap, fachVokabelPool);
  }, [currentIndex]);

  const abortTest = () => {
    if (window.confirm('Test wirklich abbrechen? Fortschritt wird nicht gespeichert.')) {
      if (currentRecorderRef.current && currentRecorderRef.current.state !== 'inactive') {
        try { currentRecorderRef.current.stop(); } catch (_) {}
      }
      stopStream();
      navigate('/lernen');
    }
  };

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) return <div style={{padding:'2rem',textAlign:'center'}}>Lade Vokabeln...</div>;
  if (!vocabList.length) return <div style={{padding:'2rem',textAlign:'center',color:'red'}}>Keine Vokabeln gefunden.</div>;

  // EVALUATING SCREEN
  if (phase === 'evaluating') {
    const entries = vocabList.map(v => ({ vocab: v, result: transcriptions[v.id] }));
    const done = entries.filter(e => e.result?.status === 'done').length;
    const active = entries.find(e => ['uploading','processing','recording'].includes(e.result?.status));
    return (
      <div style={{maxWidth:'34rem',margin:'4rem auto',padding:'2rem',background:'white',borderRadius:'1rem',textAlign:'center',fontFamily:'sans-serif',boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}}>
        <h2 style={{fontSize:'1.6rem',color:'#0f5156',margin:'0 0 1rem'}}>🧠 KI wertet Antworten aus...</h2>
        <p style={{color:'#6b7280',margin:'0 0 1rem'}}>Fertig: {done} / {vocabList.length} · Noch offen: {vocabList.length - done}</p>
        <div style={{background: active ? '#f0fdfa' : '#f3f4f6',borderRadius:'0.75rem',padding:'1rem',marginBottom:'1rem',textAlign:'left'}}>
          <div style={{fontSize:'0.75rem',color:'#0f766e',fontWeight:'bold',textTransform:'uppercase',letterSpacing:1}}>Aktuelle Bearbeitung</div>
          <div style={{fontSize:'1.1rem',color:'#134e4a',fontWeight:'bold',marginTop:4}}>
            {active
              ? `${active.result?.status==='uploading'?'⬆️':active.result?.status==='recording'?'🔴':'🤖'} ${active.vocab.original}`
              : '✅ Alle Aufnahmen verarbeitet'}
          </div>
          {active && <div style={{color:'#0f766e',fontSize:'0.85rem',marginTop:4}}>
            {active.result.status==='recording' ? 'Letzte Aufnahme läuft noch...' : active.result.status==='uploading' ? 'Audio wird hochgeladen...' : 'Whisper erkennt die Antwort...'}
          </div>}
        </div>
        <div style={{maxHeight:300,overflowY:'auto',textAlign:'left',borderTop:'1px solid #e5e7eb',paddingTop:'0.75rem'}}>
          {entries.map(({vocab,result}) => (
            <div key={vocab.id} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'0.45rem 0',borderBottom:'1px solid #f3f4f6',color:'#374151',fontSize:'0.9rem'}}>
              <span style={{fontWeight:500}}>{vocab.original}</span>
              <span style={{color:statusColor(result),textAlign:'right',maxWidth:'55%',wordBreak:'break-word'}}>{statusLabel(result)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // RESULTS SCREEN
  if (phase === 'results') return (
    <div style={{maxWidth:'32rem',margin:'4rem auto',padding:'2rem',background:'white',borderRadius:'1rem',boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)',textAlign:'center',borderTop:'8px solid #0f5156',fontFamily:'sans-serif'}}>
      <h2 style={{fontSize:'2rem',marginBottom:'1rem'}}>Test beendet! 🎉</h2>
      <div style={{background:'#f0fdfa',padding:'1.5rem',borderRadius:'1rem',marginBottom:'1.5rem'}}>
        <p style={{fontSize:'1.25rem',margin:'0 0 0.5rem',color:'#4b5563'}}>Dein Ergebnis:</p>
        <p style={{fontSize:'3rem',fontWeight:'bold',color:'#0f5156',margin:0}}>
          {score} <span style={{fontSize:'1.5rem',color:'#9ca3af'}}>/ {vocabList.length}</span>
        </p>
      </div>
      {fehlerListe.length > 0 && (
        <div style={{textAlign:'left',marginBottom:'2rem',background:'#fef2f2',padding:'1.5rem',borderRadius:'0.75rem'}}>
          <h3 style={{color:'#991b1b',marginTop:0}}>Deine Fehler:</h3>
          {fehlerListe.map(v => (
            <div key={v.id} style={{marginBottom:'1rem',borderBottom:'1px solid #fecaca',paddingBottom:'0.5rem'}}>
              <div style={{fontWeight:'bold',color:'#7f1d1d'}}>{v.original}</div>
              <div style={{color:'#166534',fontSize:'0.9rem'}}>Richtig: {v.uebersetzung}</div>
              <div style={{color:'#991b1b',fontSize:'0.9rem',marginTop:2}}>Du sagtest: <i>{transcriptions[v.id]?.text || '[Nichts]'}</i></div>
            </div>
          ))}
        </div>
      )}
      <div style={{display:'flex',gap:'1rem',marginBottom:'2rem'}}>
        <div style={{flex:1,background:'#f3f4f6',padding:'1rem',borderRadius:'0.75rem'}}>
          <p style={{margin:0,color:'#6b7280',fontSize:'0.875rem'}}>Gesamtzeit</p>
          <p style={{margin:'0.25rem 0 0',fontSize:'1.25rem',fontWeight:'bold'}}>{timeStats.total} s</p>
        </div>
        <div style={{flex:1,background:'#f3f4f6',padding:'1rem',borderRadius:'0.75rem'}}>
          <p style={{margin:0,color:'#6b7280',fontSize:'0.875rem'}}>Ø pro Wort</p>
          <p style={{margin:'0.25rem 0 0',fontSize:'1.25rem',fontWeight:'bold'}}>{timeStats.average} s</p>
        </div>
      </div>
      <button onClick={() => navigate('/lernen')} style={{width:'100%',background:'#0f5156',color:'white',fontSize:'1.25rem',fontWeight:'bold',padding:'1rem',borderRadius:'0.75rem',border:'none',cursor:'pointer'}}>
        Zurück zur Übersicht
      </button>
    </div>
  );

  // TEST SCREEN
  const current = vocabList[currentIndex];
  const progress = ((currentIndex + 1) / vocabList.length) * 100;
  const waId = wortartMap[current?.id];
  const showMc = mode === 'mc' || fachName.toLowerCase().includes('lat');
  const activeTxCount = vocabList.filter(v => transcriptions[v.id] && transcriptions[v.id].status !== 'done').length;
  const doneTxCount = vocabList.filter(v => transcriptions[v.id]?.status === 'done').length;

  return (
    <div style={{maxWidth:'42rem',margin:'2rem auto 5rem',padding:'0 1rem',fontFamily:'sans-serif'}}>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
        <span style={{fontSize:'1.125rem',fontWeight:600,color:'#4b5563'}}>
          Frage {currentIndex+1} <span style={{fontSize:'0.875rem',fontWeight:'normal'}}>von {vocabList.length}</span>
        </span>
        <div style={{display:'flex',gap:'0.75rem',alignItems:'center'}}>
          <span style={{fontSize:'0.875rem',color:'#6b7280'}}>&nbsp;⏱ {fmt(elapsed)}</span>
          <button onClick={() => setShowDebug(v => !v)}
            style={{background: activeTxCount>0 ? '#fef3c7' : '#f3f4f6', border:'1px solid #e5e7eb',
              color: activeTxCount>0 ? '#d97706' : '#6b7280', padding:'0.25rem 0.6rem',
              borderRadius:'9999px', cursor:'pointer', fontSize:'0.8rem'}}>
            🤖 {doneTxCount}/{currentIndex+1}
          </button>
          <button onClick={abortTest}
            style={{background:'none',border:'1px solid #e5e7eb',color:'#9ca3af',
              padding:'0.25rem 0.6rem',borderRadius:'0.5rem',cursor:'pointer',fontSize:'0.8rem'}}>
            ✕ Abbruch
          </button>
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div style={{background:'#1e293b',color:'#94a3b8',borderRadius:'0.75rem',padding:'1rem',
          marginBottom:'1rem',fontSize:'0.78rem',fontFamily:'monospace',maxHeight:220,overflowY:'auto'}}>
          <div style={{color:'#38bdf8',fontWeight:'bold',marginBottom:'0.5rem'}}>
            🔍 KI-Debug ({doneTxCount}/{vocabList.length} fertig)
          </div>
          {vocabList.slice(0, currentIndex+1).map(v => (
            <div key={v.id} style={{display:'flex',gap:8,padding:'2px 0',borderBottom:'1px solid #334155'}}>
              <span style={{minWidth:110,color:'#e2e8f0'}}>{v.original}</span>
              <span style={{color:statusColor(transcriptions[v.id])}}>
                {statusLabel(transcriptions[v.id])}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Fortschrittsbalken */}
      <div style={{height:6,background:'#e5e7eb',borderRadius:99,marginBottom:'1.5rem',overflow:'hidden'}}>
        <div style={{height:'100%',width:`${progress}%`,background:'#0f5156',borderRadius:99,transition:'width 0.3s ease'}} />
      </div>

      {/* Fach-Badge */}
      {fachName && (
        <div style={{display:'inline-block',background:'#f0fdfa',color:'#0f766e',
          padding:'0.25rem 0.75rem',borderRadius:'9999px',fontSize:'0.8rem',
          marginBottom:'1rem',fontWeight:500}}>
          {fachName}
        </div>
      )}

      {/* Vokabel-Karte */}
      {current && (
        <div style={{background:'white',borderRadius:'1.25rem',padding:'2.5rem 2rem',
          textAlign:'center',boxShadow:'0 10px 15px -3px rgba(0,0,0,0.07)',
          marginBottom:'1.5rem',border:'1px solid #e5e7eb'}}>
          {waId && (
            <div style={{display:'inline-block',background:'#f3f4f6',color:'#6b7280',
              padding:'0.15rem 0.6rem',borderRadius:'9999px',fontSize:'0.75rem',marginBottom:'1rem'}}>
              {WORTART_LABELS[waId] || waId}
            </div>
          )}
          <div style={{fontSize:'2.5rem',fontWeight:700,color:'#111827',letterSpacing:'-0.02em'}}>
            {current.original}
          </div>
          {current.beispiel && (
            <div style={{marginTop:'1rem',color:'#6b7280',fontSize:'0.9rem',fontStyle:'italic'}}>
              {current.beispiel}
            </div>
          )}
        </div>
      )}

      {/* Mikrofon-Anfrage (nur 1x zu Beginn des Tests) */}
      {mode === 'speech' && !micReady && (
        <div style={{textAlign:'center',padding:'2rem',background:'#f0fdfa',borderRadius:'1rem',marginBottom:'1rem'}}>
          <div style={{fontSize:'3rem',marginBottom:'0.75rem'}}>🎙️</div>
          <p style={{color:'#4b5563',marginBottom:'1rem'}}>Bitte erlaube den Mikrofon-Zugriff für den Sprachtest.<br/><small style={{color:'#9ca3af'}}>Das Mikrofon bleibt während des gesamten Tests aktiv.</small></p>
          {micError && <p style={{color:'#dc2626',marginBottom:'1rem',fontSize:'0.875rem'}}>{micError}</p>}
          <button onClick={requestMic}
            style={{background:'#0f5156',color:'white',padding:'0.75rem 2rem',
              borderRadius:'0.75rem',border:'none',fontSize:'1rem',cursor:'pointer',fontWeight:600}}>
            Mikrofon erlauben
          </button>
        </div>
      )}

      {/* Aufnahme-Indikator */}
      {mode === 'speech' && micReady && (
        <div style={{textAlign:'center',marginBottom:'1.5rem'}}>
          <div style={{
            display:'inline-flex',alignItems:'center',gap:'0.5rem',
            background: isRecording ? '#fef2f2' : '#f3f4f6',
            color: isRecording ? '#dc2626' : '#6b7280',
            padding:'0.5rem 1.25rem',borderRadius:'9999px',fontSize:'0.9rem',
            border:`1px solid ${isRecording ? '#fecaca' : '#e5e7eb'}`,
          }}>
            <span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',
              background: isRecording ? '#dc2626' : '#d1d5db',
              animation: isRecording ? 'pulse 1.5s infinite' : 'none'}} />
            {isRecording ? 'Aufnahme läuft... Sprich jetzt!' : 'Bereit'}
          </div>
        </div>
      )}

      {/* MC-Optionen */}
      {showMc && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem',marginBottom:'1.5rem'}}>
          {mcOptions.map(opt => (
            <button key={opt} onClick={() => handleMcAnswer(opt)}
              style={{background:'white',border:'2px solid #e5e7eb',borderRadius:'0.75rem',
                padding:'0.85rem',fontSize:'1rem',cursor:'pointer',fontWeight:500}}
              onMouseOver={e => e.currentTarget.style.borderColor='#0f5156'}
              onMouseOut={e => e.currentTarget.style.borderColor='#e5e7eb'}>
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* Weiter-Button */}
      {!showMc && micReady && (
        <button onClick={handleWeiter}
          style={{width:'100%',background:'#0f5156',color:'white',fontSize:'1.25rem',
            fontWeight:700,padding:'1rem',borderRadius:'0.75rem',border:'none',cursor:'pointer'}}>
          {currentIndex === vocabList.length-1 ? 'Test beenden ✓' : 'Weiter →'}
        </button>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
};

export default SprachTestPage;
