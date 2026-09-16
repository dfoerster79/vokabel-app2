import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const normalize = (str = '') => str
  .toLowerCase()
  .replace(/ß/g, 'ss')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}\s'-]/gu, '')
  .trim()
  .replace(/\s+/g, ' ');

// Bei einzelnen Vokabeln keine Teilstring- oder Levenshtein-Treffer:
// Whisper muss das normalisierte Zielwort vollständig erkennen.
const speechMatches = (heard, correct) => {
  const h = normalize(heard);
  const c = normalize(correct);
  return Boolean(h && c && h === c);
};

const WORTART_LABELS = {
  noun: 'Nomen', verb: 'Verb', adjective: 'Adjektiv', adverb: 'Adverb',
  pronoun: 'Pronomen', preposition: 'Präposition', conjunction: 'Konjunktion',
  determiner: 'Artikel/Det.', numeral: 'Zahlwort', interjection: 'Interjektion',
  particle: 'Partikel', phrase: 'Wendung', other: 'Sonstiges',
};

const statusLabel = (result) => {
  if (!result) return '⏳ Wartet';
  if (result.status === 'recording') return '🔴 Aufnahme...';
  if (result.status === 'uploading') return '⬆️ Upload...';
  if (result.status === 'processing') return '🤖 Whisper...';
  if (result.status === 'done') return result.correct
    ? '✅ Richtig'
    : `❌ Falsch ("${result.text || '–'}")`;
  return '⏳ Wartet';
};

const statusColor = (result) => {
  if (!result) return '#9ca3af';
  if (result.status === 'recording') return '#dc2626';
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
  const [phase, setPhase] = useState('test');
  const [score, setScore] = useState(0);
  const [fehlerListe, setFehlerListe] = useState([]);
  const [mode, setMode] = useState('speech');
  const [micError, setMicError] = useState('');
  const [micReady, setMicReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptions, setTranscriptions] = useState({});
  const [mcOptions, setMcOptions] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [timeStats, setTimeStats] = useState({ total: 0, average: 0 });
  const [showDebug, setShowDebug] = useState(false);

  const streamRef = useRef(null);
  const currentRecorderRef = useRef(null);
  const currentVocabRef = useRef(null);
  const transcriptionsRef = useRef({});
  const finishedRef = useRef(false);
  const vocabListRef = useRef([]);
  const startTimeRef = useRef(null);
  const currentIndexRef = useRef(0);

  const updateTranscription = useCallback((id, update) => {
    const next = { ...(transcriptionsRef.current[id] || {}), ...update };
    transcriptionsRef.current = { ...transcriptionsRef.current, [id]: next };
    setTranscriptions(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...update } }));
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch (_) {}
      });
      streamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const getRecorderMimeType = () => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
  };

  const transcribeBlob = useCallback(async (blob, vocabItem) => {
    updateTranscription(vocabItem.id, { status: 'uploading' });
    try {
      const audioBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      updateTranscription(vocabItem.id, { status: 'processing' });
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64, mimeType: blob.type || 'audio/webm', language: 'de' }),
      });
      if (!response.ok) throw new Error(`Whisper ${response.status}: ${await response.text()}`);
      const { text = '' } = await response.json();
      const correct = speechMatches(text, vocabItem.uebersetzung);
      updateTranscription(vocabItem.id, { status: 'done', text, correct });
      return { text, correct };
    } catch (error) {
      console.error('Whisper error:', error);
      updateTranscription(vocabItem.id, { status: 'done', text: `[Fehler: ${error.message}]`, correct: false });
      return { text: '', correct: false };
    }
  }, [updateTranscription]);

  const startRecording = useCallback((vocab) => {
    if (!streamRef.current || !vocab) return;
    if (currentRecorderRef.current && currentRecorderRef.current.state !== 'inactive') {
      try { currentRecorderRef.current.stop(); } catch (_) {}
    }

    const chunks = [];
    const mimeType = getRecorderMimeType();
    try {
      const recorder = mimeType
        ? new MediaRecorder(streamRef.current, { mimeType })
        : new MediaRecorder(streamRef.current);

      recorder.__chunks = chunks;
      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      currentRecorderRef.current = recorder;
      currentVocabRef.current = vocab;
      updateTranscription(vocab.id, { status: 'recording', text: '', correct: false });
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('MediaRecorder start error:', error);
      updateTranscription(vocab.id, { status: 'done', text: `[Aufnahmefehler: ${error.message}]`, correct: false });
    }
  }, [updateTranscription]);

  const stopRecordingAndTranscribe = useCallback((vocab) => {
    const recorder = currentRecorderRef.current;
    const targetVocab = vocab || currentVocabRef.current;
    if (!targetVocab) return Promise.resolve();

    if (!recorder || recorder.state === 'inactive') {
      if (!transcriptionsRef.current[targetVocab.id]) {
        updateTranscription(targetVocab.id, { status: 'done', text: '[Keine Aufnahme]', correct: false });
      }
      return Promise.resolve();
    }

    return new Promise(resolve => {
      recorder.onstop = async () => {
        const blob = new Blob(recorder.__chunks || [], { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 0) await transcribeBlob(blob, targetVocab);
        else updateTranscription(targetVocab.id, { status: 'done', text: '[Keine Aufnahme]', correct: false });
        resolve();
      };
      try {
        recorder.stop();
      } catch (_) {
        updateTranscription(targetVocab.id, { status: 'done', text: '[Aufnahme konnte nicht beendet werden]', correct: false });
        resolve();
      }
      currentRecorderRef.current = null;
      setIsRecording(false);
    });
  }, [transcribeBlob, updateTranscription]);

  const requestMic = async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicReady(true);
      const firstVocab = vocabListRef.current[currentIndexRef.current];
      if (firstVocab) startRecording(firstVocab);
    } catch (error) {
      console.error(error);
      setMicError('Mikrofon-Zugriff fehlgeschlagen. Bitte erlaube das Mikrofon im Browser.');
    }
  };

  const handleWeiter = async () => {
    const currentVocab = vocabListRef.current[currentIndexRef.current];
    const isLast = currentIndexRef.current === vocabListRef.current.length - 1;
    await stopRecordingAndTranscribe(currentVocab);
    if (isLast) {
      setPhase('evaluating');
      return;
    }
    const nextIndex = currentIndexRef.current + 1;
    currentIndexRef.current = nextIndex;
    setCurrentIndex(nextIndex);
  };

  const handleMcAnswer = option => {
    const vocab = vocabListRef.current[currentIndexRef.current];
    if (!vocab) return;
    updateTranscription(vocab.id, { status: 'done', type: 'mc', text: option, correct: option === vocab.uebersetzung });
    const isLast = currentIndexRef.current === vocabListRef.current.length - 1;
    if (isLast) setPhase('evaluating');
    else {
      const nextIndex = currentIndexRef.current + 1;
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
    }
  };

  const buildMcOptions = useCallback((list, index, waMap, pool) => {
    const current = list[index];
    if (!current) return;
    const currentWortart = waMap[current.id] || 'other';
    const same = pool.filter(v => v.id !== current.id && v.wortart_id === currentWortart);
    const diff = pool.filter(v => v.id !== current.id && v.wortart_id !== currentWortart);
    const fallback = list.filter(v => v.id !== current.id);
    const ordered = [...same, ...diff, ...fallback].sort(() => Math.random() - 0.5);
    const distractors = ordered.map(v => v.uebersetzung).filter((v, i, all) => v !== current.uebersetzung && all.indexOf(v) === i).slice(0, 3);
    setMcOptions([...distractors, current.uebersetzung].sort(() => Math.random() - 0.5));
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: testData } = await supabase.from('vokabel_tests').select('fach_id, faecher(id, name)').eq('id', testId).single();
    const selectedFachId = testData?.fach_id || null;
    const selectedFachName = testData?.faecher?.name || '';
    setFachId(selectedFachId);
    setFachName(selectedFachName);
    if (selectedFachName.toLowerCase().includes('lat')) setMode('mc');

    const { data: vocabData } = await supabase.from('vokabeln').select('*').eq('test_id', testId);
    if (!vocabData?.length) { setLoading(false); return; }

    const ids = vocabData.map(v => v.id);
    const { data: waData } = await supabase.from('vokabeln_wortarten').select('vokabel_id, wortart_id').in('vokabel_id', ids);
    const waMap = {};
    (waData || []).forEach(item => { waMap[item.vokabel_id] = item.wortart_id; });
    setWortartMap(waMap);

    let pool = [];
    if (selectedFachId) {
      const { data: allTests } = await supabase.from('vokabel_tests').select('id').eq('fach_id', selectedFachId);
      const testIds = (allTests || []).map(t => t.id);
      if (testIds.length) {
        const { data: poolData } = await supabase.from('vokabeln').select('id, uebersetzung').in('test_id', testIds);
        const poolIds = (poolData || []).map(v => v.id);
        const { data: poolWa } = poolIds.length ? await supabase.from('vokabeln_wortarten').select('vokabel_id, wortart_id').in('vokabel_id', poolIds) : { data: [] };
        const map = {};
        (poolWa || []).forEach(item => { map[item.vokabel_id] = item.wortart_id; });
        pool = (poolData || []).map(v => ({ ...v, wortart_id: map[v.id] || 'other' }));
      }
    }

    const shuffled = [...vocabData].sort(() => Math.random() - 0.5);
    setFachVokabelPool(pool);
    setVocabList(shuffled);
    buildMcOptions(shuffled, 0, waMap, pool);
    setStartTime(Date.now());
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [testId]);
  useEffect(() => { vocabListRef.current = vocabList; }, [vocabList]);
  useEffect(() => { startTimeRef.current = startTime; }, [startTime]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => {
    if (!startTime || phase !== 'test') return undefined;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [startTime, phase]);

  useEffect(() => {
    if (mode !== 'speech' || !micReady || phase !== 'test' || !vocabList.length) return;
    const current = vocabList[currentIndex];
    if (current && !currentRecorderRef.current && !transcriptionsRef.current[current.id]) startRecording(current);
  }, [micReady, phase, vocabList, currentIndex, mode, startRecording]);

  useEffect(() => {
    if (vocabList.length && currentIndex < vocabList.length) buildMcOptions(vocabList, currentIndex, wortartMap, fachVokabelPool);
  }, [currentIndex, vocabList, wortartMap, fachVokabelPool, buildMcOptions]);

  useEffect(() => {
    if (phase !== 'evaluating' || !vocabList.length) return undefined;
    const checkDone = () => {
      const pending = vocabListRef.current.some(v => !transcriptionsRef.current[v.id] || transcriptionsRef.current[v.id].status !== 'done');
      if (!pending) finishTest();
    };
    checkDone();
    const timer = setInterval(checkDone, 250);
    return () => clearInterval(timer);
  }, [phase, vocabList.length]);

  useEffect(() => () => {
    if (currentRecorderRef.current && currentRecorderRef.current.state !== 'inactive') {
      try { currentRecorderRef.current.stop(); } catch (_) {}
    }
    stopStream();
  }, [stopStream]);

  const saveResults = async (finalScore, errors, timeTaken, avgTime, results) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: attempt, error } = await supabase.from('lern_attempts').insert([{
      user_id: user.id, fach_id: fachId, vokabel_test_id: testId, testart: 'sprache',
      correct_count: finalScore, question_count: vocabListRef.current.length,
      percent_correct: Math.round((finalScore / vocabListRef.current.length) * 100),
      time_taken_seconds: timeTaken, avg_time_per_word: avgTime,
      started_at: new Date(startTimeRef.current).toISOString(), finished_at: new Date().toISOString(),
    }]).select().single();
    if (error || !attempt || !errors.length) return;
    await supabase.from('lern_attempt_fehler').insert(errors.map(v => ({
      attempt_id: attempt.id, user_id: user.id, fach_id: fachId, vokabel_test_id: testId,
      vokabel_id: v.id, frage: v.original, gegebene_antwort: results[v.id]?.text || 'Falsch',
      richtige_antwort: v.uebersetzung, ist_richtig: false,
    })));
  };

  const finishTest = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
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

  const abortTest = () => {
    if (window.confirm('Test wirklich abbrechen? Fortschritt wird nicht gespeichert.')) {
      stopStream();
      navigate('/lernen');
    }
  };

  const fmt = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Lade Vokabeln...</div>;
  if (!vocabList.length) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Keine Vokabeln gefunden.</div>;

  if (phase === 'evaluating') {
    const entries = vocabList.map(v => ({ vocab: v, result: transcriptions[v.id] }));
    const done = entries.filter(entry => entry.result?.status === 'done').length;
    const active = entries.find(entry => ['uploading', 'processing', 'recording'].includes(entry.result?.status));
    return <div style={{ maxWidth: '34rem', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '1rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#0f5156' }}>🧠 KI wertet Antworten aus...</h2>
      <p style={{ color: '#6b7280' }}>Fertig: {done} / {vocabList.length}</p>
      <p style={{ color: '#0f766e' }}>{active ? `${active.vocab.original}: ${statusLabel(active.result)}` : '✅ Alle Aufnahmen verarbeitet'}</p>
      {entries.map(({ vocab, result }) => <div key={vocab.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0' }}><span>{vocab.original}</span><span style={{ color: statusColor(result) }}>{statusLabel(result)}</span></div>)}
    </div>;
  }

  if (phase === 'results') return <div style={{ maxWidth: '32rem', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '1rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
    <h2>Test beendet! 🎉</h2>
    <p style={{ fontSize: '3rem', fontWeight: 'bold', color: '#0f5156' }}>{score} / {vocabList.length}</p>
    {fehlerListe.length > 0 && <div style={{ textAlign: 'left', background: '#fef2f2', padding: '1rem', borderRadius: '0.75rem' }}><h3 style={{ color: '#991b1b' }}>Deine Fehler:</h3>{fehlerListe.map(v => <div key={v.id} style={{ marginBottom: '0.8rem' }}><strong>{v.original}</strong><br /><span style={{ color: '#166534' }}>Richtig: {v.uebersetzung}</span><br /><span style={{ color: '#991b1b' }}>Du sagtest: {transcriptions[v.id]?.text || '[Nichts]'}</span></div>)}</div>}
    <div style={{ display: 'flex', gap: '1rem', margin: '1.5rem 0' }}><div style={{ flex: 1, background: '#f3f4f6', padding: '1rem' }}>Gesamtzeit<br /><strong>{timeStats.total} s</strong></div><div style={{ flex: 1, background: '#f3f4f6', padding: '1rem' }}>Ø pro Wort<br /><strong>{timeStats.average} s</strong></div></div>
    <button onClick={() => navigate('/lernen')} style={{ width: '100%', background: '#0f5156', color: 'white', padding: '1rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer' }}>Zurück zur Übersicht</button>
  </div>;

  const current = vocabList[currentIndex];
  const progress = ((currentIndex + 1) / vocabList.length) * 100;
  const showMc = mode === 'mc' || fachName.toLowerCase().includes('lat');
  const doneTxCount = vocabList.filter(v => transcriptions[v.id]?.status === 'done').length;

  return <div style={{ maxWidth: '42rem', margin: '2rem auto 5rem', padding: '0 1rem', fontFamily: 'sans-serif' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}><span>Frage {currentIndex + 1} von {vocabList.length}</span><div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}><span>⏱ {fmt(elapsed)}</span><button onClick={() => setShowDebug(value => !value)} style={{ border: '1px solid #e5e7eb', borderRadius: '9999px', padding: '0.25rem 0.6rem', cursor: 'pointer' }}>🤖 {doneTxCount}/{currentIndex + 1}</button><button onClick={abortTest} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.25rem 0.6rem', cursor: 'pointer' }}>✕ Abbruch</button></div></div>
    {showDebug && <div style={{ background: '#1e293b', color: '#e2e8f0', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem', fontSize: '0.8rem', fontFamily: 'monospace' }}>{vocabList.slice(0, currentIndex + 1).map(v => <div key={v.id}>{v.original}: <span style={{ color: statusColor(transcriptions[v.id]) }}>{statusLabel(transcriptions[v.id])}</span></div>)}</div>}
    <div style={{ height: 6, background: '#e5e7eb', borderRadius: 99, marginBottom: '1.5rem', overflow: 'hidden' }}><div style={{ height: '100%', width: `${progress}%`, background: '#0f5156', borderRadius: 99 }} /></div>
    {fachName && <div style={{ display: 'inline-block', background: '#f0fdfa', color: '#0f766e', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', marginBottom: '1rem' }}>{fachName}</div>}
    <div style={{ background: 'white', borderRadius: '1.25rem', padding: '2.5rem 2rem', textAlign: 'center', marginBottom: '1.5rem', border: '1px solid #e5e7eb' }}>{wortartMap[current.id] && <div style={{ color: '#6b7280', marginBottom: '1rem' }}>{WORTART_LABELS[wortartMap[current.id]] || wortartMap[current.id]}</div>}<div style={{ fontSize: '2.5rem', fontWeight: 700 }}>{current.original}</div>{current.beispiel && <div style={{ marginTop: '1rem', color: '#6b7280', fontStyle: 'italic' }}>{current.beispiel}</div>}</div>
    {mode === 'speech' && !micReady && <div style={{ textAlign: 'center', padding: '2rem', background: '#f0fdfa', borderRadius: '1rem', marginBottom: '1rem' }}><div style={{ fontSize: '3rem' }}>🎙️</div><p>Bitte erlaube den Mikrofon-Zugriff für den Sprachtest.</p>{micError && <p style={{ color: '#dc2626' }}>{micError}</p>}<button onClick={requestMic} style={{ background: '#0f5156', color: 'white', padding: '0.75rem 2rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer' }}>Mikrofon erlauben</button></div>}
    {mode === 'speech' && micReady && <div style={{ textAlign: 'center', marginBottom: '1.5rem', color: isRecording ? '#dc2626' : '#6b7280' }}>{isRecording ? '🔴 Aufnahme läuft... Sprich jetzt!' : 'Bereit'}</div>}
    {showMc && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>{mcOptions.map(option => <button key={option} onClick={() => handleMcAnswer(option)} style={{ background: 'white', border: '2px solid #e5e7eb', borderRadius: '0.75rem', padding: '0.85rem', cursor: 'pointer' }}>{option}</button>)}</div>}
    {!showMc && micReady && <button onClick={handleWeiter} style={{ width: '100%', background: '#0f5156', color: 'white', fontSize: '1.25rem', fontWeight: 700, padding: '1rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer' }}>{currentIndex === vocabList.length - 1 ? 'Test beenden ✓' : 'Weiter →'}</button>}
  </div>;
};

export default SprachTestPage;
