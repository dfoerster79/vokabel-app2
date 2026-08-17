import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const normalize = (str = '') => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
const levenshtein = (a, b) => { const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)); for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]); return d[m][n]; };
const speechMatches = (heard, correct) => { const h = normalize(heard), c = normalize(correct); return Boolean(h && c) && (h === c || h.includes(c) || c.includes(h) || levenshtein(h, c) <= Math.max(2, Math.floor(c.length * 0.3))); };
const WORTART_LABELS = { noun: 'Nomen', verb: 'Verb', adjective: 'Adjektiv', adverb: 'Adverb', pronoun: 'Pronomen', preposition: 'Präposition', conjunction: 'Konjunktion', determiner: 'Artikel/Det.', numeral: 'Zahlwort', interjection: 'Interjektion', particle: 'Partikel', phrase: 'Wendung', other: 'Sonstiges' };

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
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const activeVocabRef = useRef(null);
  const finishedRef = useRef(false);

  useEffect(() => { fetchData(); }, [testId]);
  useEffect(() => { if (!startTime || isFinished) return undefined; const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000); return () => clearInterval(id); }, [startTime, isFinished]);
  useEffect(() => { if (micPermissionGranted && mode === 'speech' && !isFinished && vocabList.length) startRecordingFor(vocabList[currentIndex]); }, [currentIndex, micPermissionGranted, mode, isFinished, vocabList]);
  useEffect(() => { if (!evaluating || resultsReady || !vocabList.length) return; if (vocabList.every(v => transcriptions[v.id]?.status === 'done')) finishTest(transcriptions); }, [evaluating, resultsReady, transcriptions, vocabList]);
  useEffect(() => () => stopMicrophone(), []);

  const fetchData = async () => {
    setLoading(true);
    const { data: testData } = await supabase.from('vokabel_tests').select('fach_id, faecher(id, name)').eq('id', testId).single();
    const selectedFachId = testData?.fach_id || null;
    const selectedFachName = testData?.faecher?.name || '';
    setFachId(selectedFachId); setFachName(selectedFachName);
    if (selectedFachName.toLowerCase().includes('lat')) setMode('mc');
    const { data: vocabData } = await supabase.from('vokabeln').select('*').eq('test_id', testId);
    if (!vocabData?.length) { setLoading(false); return; }
    const ids = vocabData.map(v => v.id);
    const { data: waData } = await supabase.from('vokabeln_wortarten').select('vokabel_id, wortart_id').in('vokabel_id', ids);
    const waMap = {}; (waData || []).forEach(w => { waMap[w.vokabel_id] = w.wortart_id; }); setWortartMap(waMap);
    let pool = [];
    if (selectedFachId) {
      const { data: allTests } = await supabase.from('vokabel_tests').select('id').eq('fach_id', selectedFachId);
      const testIds = (allTests || []).map(t => t.id);
      if (testIds.length) {
        const { data: poolData } = await supabase.from('vokabeln').select('id, uebersetzung').in('test_id', testIds);
        const poolIds = (poolData || []).map(v => v.id);
        const { data: poolWa } = poolIds.length ? await supabase.from('vokabeln_wortarten').select('vokabel_id, wortart_id').in('vokabel_id', poolIds) : { data: [] };
        const map = {}; (poolWa || []).forEach(w => { map[w.vokabel_id] = w.wortart_id; });
        pool = (poolData || []).map(v => ({ ...v, wortart_id: map[v.id] || 'other' }));
      }
    }
    setFachVokabelPool(pool);
    const shuffled = [...vocabData].sort(() => Math.random() - 0.5);
    setVocabList(shuffled); buildMcOptions(shuffled, 0, waMap, pool); setStartTime(Date.now()); setLoading(false);
  };

  const buildMcOptions = (list, index, waMap, pool) => {
    const current = list[index]; if (!current) return;
    const ordered = [...pool.filter(v => v.id !== current.id && v.wortart_id === (waMap[current.id] || 'other')), ...pool.filter(v => v.id !== current.id && v.wortart_id !== (waMap[current.id] || 'other')), ...list.filter(v => v.id !== current.id)].sort(() => Math.random() - 0.5);
    const distractors = ordered.map(v => v.uebersetzung).filter((v, i, a) => v !== current.uebersetzung && a.indexOf(v) === i).slice(0, 3);
    setMcOptions([...distractors, current.uebersetzung].sort(() => Math.random() - 0.5));
  };

  const requestMicrophoneAccess = async () => {
    setMicError('');
    try { mediaRecorderRef.current = new MediaRecorder(await navigator.mediaDevices.getUserMedia({ audio: true })); setMicPermissionGranted(true); }
    catch (error) { console.error(error); setMicError('Mikrofon-Zugriff fehlgeschlagen. Bitte erlaube das Mikrofon im Browser.'); }
  };

  const stopMicrophone = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
    recorder?.stream?.getTracks().forEach(track => track.stop());
    mediaRecorderRef.current = null; setIsRecording(false);
  };

  const startRecordingFor = vocabItem => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'inactive' || !vocabItem) return;
    activeVocabRef.current = vocabItem; audioChunksRef.current = [];
    recorder.ondataavailable = event => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
    recorder.onstop = () => {
      const item = activeVocabRef.current;
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      audioChunksRef.current = [];
      if (item && blob.size > 0) processAudio(blob, item);
    };
    recorder.start(); setIsRecording(true);
  };

  const processAudio = (blob, vocabItem) => {
    setTranscriptions(prev => ({ ...prev, [vocabItem.id]: { status: 'uploading', type: 'speech', text: '', correct: false } }));
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      try {
        setTranscriptions(prev => ({ ...prev, [vocabItem.id]: { ...prev[vocabItem.id], status: 'processing' } }));
        const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audioBase64: String(reader.result).split(',')[1], language: 'de', prompt: vocabItem.uebersetzung }) });
        if (!response.ok) throw new Error(`Whisper API Fehler (${response.status})`);
        const data = await response.json(); const text = data.text || '';
        setTranscriptions(prev => ({ ...prev, [vocabItem.id]: { status: 'done', type: 'speech', text, correct: speechMatches(text, vocabItem.uebersetzung) } }));
      } catch (error) {
        console.error('Transcription error:', error);
        setTranscriptions(prev => ({ ...prev, [vocabItem.id]: { status: 'done', type: 'speech', text: `[Erkennungsfehler: ${error.message}]`, correct: false } }));
      }
    };
  };

  const handleWeiter = () => {
    const current = vocabList[currentIndex]; if (!current) return;
    const isLast = currentIndex === vocabList.length - 1;
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === 'recording') { activeVocabRef.current = current; recorder.stop(); setIsRecording(false); }
    else if (!transcriptions[current.id]) setTranscriptions(prev => ({ ...prev, [current.id]: { status: 'done', type: 'speech', text: '[Nichts gesprochen]', correct: false } }));
    if (isLast) { stopMicrophone(); setIsFinished(true); setEvaluating(true); return; }
    const next = currentIndex + 1; setCurrentIndex(next); buildMcOptions(vocabList, next, wortartMap, fachVokabelPool);
  };

  const handleMcAnswer = option => {
    const current = vocabList[currentIndex]; if (!current) return;
    setTranscriptions(prev => ({ ...prev, [current.id]: { status: 'done', type: 'mc', text: option, correct: option === current.uebersetzung } }));
    if (currentIndex === vocabList.length - 1) { setIsFinished(true); setEvaluating(true); return; }
    const next = currentIndex + 1; setCurrentIndex(next); buildMcOptions(vocabList, next, wortartMap, fachVokabelPool);
  };

  const finishTest = finalTranscriptions => {
    if (finishedRef.current) return;
    finishedRef.current = true; stopMicrophone();
    const errors = vocabList.filter(v => !finalTranscriptions[v.id]?.correct);
    const finalScore = vocabList.length - errors.length;
    const total = Math.max(1, (Date.now() - startTime) / 1000);
    setScore(finalScore); setFehlerListe(errors); setTimeStats({ total: total.toFixed(1), average: (total / vocabList.length).toFixed(1) }); setEvaluating(false); setResultsReady(true);
    saveResults(finalScore, errors, total, total / vocabList.length, finalTranscriptions);
  };

  const saveResults = async (finalScore, errors, timeTaken, avgTime, results) => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const { data: attempt, error } = await supabase.from('lern_attempts').insert([{ user_id: user.id, fach_id: fachId, vokabel_test_id: testId, testart: 'sprache', correct_count: finalScore, question_count: vocabList.length, percent_correct: Math.round((finalScore / vocabList.length) * 100), time_taken_seconds: timeTaken, avg_time_per_word: avgTime, started_at: new Date(startTime).toISOString(), finished_at: new Date().toISOString() }]).select().single();
    if (error || !attempt || !errors.length) return;
    await supabase.from('lern_attempt_fehler').insert(errors.map(v => ({ attempt_id: attempt.id, user_id: user.id, fach_id: fachId, vokabel_test_id: testId, vokabel_id: v.id, frage: v.original, gegebene_antwort: results[v.id]?.text || 'Falsch beantwortet', richtige_antwort: v.uebersetzung, ist_richtig: false })));
  };

  const abortTest = () => { if (window.confirm('Möchtest du den Test wirklich abbrechen? Der Fortschritt wird nicht gespeichert.')) { stopMicrophone(); navigate('/lernen'); } };
  const fmt = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const current = vocabList[currentIndex];
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Lade Vokabeln...</div>;
  if (!vocabList.length) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Keine Vokabeln gefunden.</div>;

  if (isFinished && evaluating) {
    const entries = vocabList.map(v => ({ vocab: v, result: transcriptions[v.id] }));
    const done = entries.filter(e => e.result?.status === 'done').length;
    const active = entries.find(e => ['uploading', 'processing'].includes(e.result?.status));
    return <div style={{ maxWidth: '34rem', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '1rem', textAlign: 'center', fontFamily: 'sans-serif', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
      <h2 style={{ fontSize: '1.6rem', color: '#0f5156', margin: '0 0 1rem' }}>🧠 KI wertet Antworten aus...</h2>
      <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>Fertig: {done} / {vocabList.length} · Noch offen: {vocabList.length - done}</p>
      <div style={{ background: active ? '#f0fdfa' : '#f3f4f6', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem', textAlign: 'left' }}>
        <div style={{ fontSize: '0.75rem', color: '#0f766e', fontWeight: 'bold', textTransform: 'uppercase' }}>Aktuelle Bearbeitung</div>
        <div style={{ fontSize: '1.2rem', color: '#134e4a', fontWeight: 'bold', marginTop: 4 }}>{active?.vocab.original || 'Warte auf die letzte Audioaufnahme …'}</div>
        {active && <div style={{ color: '#0f766e', marginTop: 4 }}>{active.result.status === 'uploading' ? 'Audio wird hochgeladen …' : 'Whisper erkennt die deutsche Antwort …'}</div>}
      </div>
      <div style={{ maxHeight: 240, overflowY: 'auto', textAlign: 'left', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>{entries.map(({ vocab, result }) => <div key={vocab.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '0.45rem 0', borderBottom: '1px solid #f3f4f6', color: '#374151' }}><span>{vocab.original}</span><span style={{ fontSize: '0.85rem', color: result?.status === 'done' ? '#15803d' : '#6b7280' }}>{result?.status === 'done' ? '✓ fertig' : result?.status === 'uploading' ? '↑ Upload' : result?.status === 'processing' ? '⏳ KI erkennt' : 'wartet'}</span></div>)}</div>
    </div>;
  }

  if (isFinished && resultsReady) return <div style={{ maxWidth: '32rem', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '1rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', textAlign: 'center', borderTop: '8px solid #0f5156', fontFamily: 'sans-serif' }}>
    <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Test beendet! 🎉</h2>
    <div style={{ background: '#f0fdfa', padding: '1.5rem', borderRadius: '1rem', marginBottom: '1.5rem' }}><p style={{ fontSize: '1.25rem', margin: '0 0 0.5rem', color: '#4b5563' }}>Dein Ergebnis:</p><p style={{ fontSize: '3rem', fontWeight: 'bold', color: '#0f5156', margin: 0 }}>{score} <span style={{ fontSize: '1.5rem', color: '#9ca3af' }}>/ {vocabList.length}</span></p></div>
    {fehlerListe.length > 0 && <div style={{ textAlign: 'left', marginBottom: '2rem', background: '#fef2f2', padding: '1.5rem', borderRadius: '0.75rem' }}><h3 style={{ color: '#991b1b', marginTop: 0, fontSize: '1.1rem' }}>Deine Fehler:</h3>{fehlerListe.map(v => <div key={v.id} style={{ marginBottom: '1rem', borderBottom: '1px solid #fecaca', paddingBottom: '0.5rem' }}><div style={{ fontWeight: 'bold', color: '#7f1d1d' }}>{v.original}</div><div style={{ color: '#166534', fontSize: '0.9rem' }}>Richtig: {v.uebersetzung}</div><div style={{ color: '#991b1b', fontSize: '0.9rem', marginTop: 4 }}>Du sagtest: <i>{transcriptions[v.id]?.text || '[Nichts]'}</i></div></div>)}</div>}
    <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}><div style={{ flex: 1, background: '#f3f4f6', padding: '1rem', borderRadius: '0.75rem' }}><p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Gesamtzeit</p><p style={{ margin: '0.25rem 0 0', fontSize: '1.25rem', fontWeight: 'bold' }}>{timeStats.total} s</p></div><div style={{ flex: 1, background: '#f3f4f6', padding: '1rem', borderRadius: '0.75rem' }}><p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Ø pro Wort</p><p style={{ margin: '0.25rem 0 0', fontSize: '1.25rem', fontWeight: 'bold' }}>{timeStats.average} s</p></div></div>
    <button onClick={() => navigate('/lernen')} style={{ width: '100%', background: '#0f5156', color: 'white', fontSize: '1.25rem', fontWeight: 'bold', padding: '1rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer' }}>Zurück zur Übersicht</button>
  </div>;

  const progress = (currentIndex / vocabList.length) * 100;
  const waId = wortartMap[current?.id];
  const showMc = mode === 'mc' || fachName.toLowerCase().includes('lat');
  return <div style={{ maxWidth: '42rem', margin: '2rem auto 5rem', padding: '0 1rem', fontFamily: 'sans-serif' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', fontSize: '1.125rem', fontWeight: 600, color: '#4b5563' }}><span>Frage {currentIndex + 1} <span style={{ fontSize: '0.875rem', fontWeight: 'normal' }}>von {vocabList.length}</span></span><div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}><span style={{ fontSize: '0.875rem', color: '#6b7280' }}>⏱ {fmt(elapsed)}</span><button onClick={abortTest} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer' }}>✕ Abbrechen</button></div></div>
    <div style={{ width: '100%', background: '#e5e7eb', borderRadius: '9999px', height: '0.75rem', marginBottom: '2rem' }}><div style={{ background: '#0f5156', height: '100%', borderRadius: '9999px', width: `${progress}%`, transition: 'width 0.3s' }} /></div>
    <div style={{ background: 'white', border: '2px solid #e5e7eb', borderRadius: '1rem', padding: '3rem 2rem', marginBottom: '1.5rem', textAlign: 'center' }}>{waId && <span style={{ fontSize: 11, fontWeight: 600, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 6, padding: '2px 9px', display: 'inline-block', marginBottom: 10 }}>🏷️ {WORTART_LABELS[waId] || waId}</span>}<h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1f2937', margin: 0 }}>{current.original}</h2></div>
    {!showMc ? <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>{!micPermissionGranted ? <button onClick={requestMicrophoneAccess} style={{ width: '100%', padding: '1.5rem', fontSize: '1.4rem', fontWeight: 'bold', background: '#0f5156', color: 'white', border: 'none', borderRadius: '1rem', cursor: 'pointer' }}>🎤 Mikrofon aktivieren</button> : <><div style={{ padding: '1.2rem', borderRadius: '1rem', background: '#fee2e2', color: '#b91c1c', fontWeight: 'bold', fontSize: '1.25rem' }}>{isRecording ? '🔴 Sprich jetzt …' : '⏳ Aufnahme wird vorbereitet …'}</div><button onClick={handleWeiter} style={{ width: '100%', padding: '1.5rem', fontSize: '1.35rem', fontWeight: 'bold', background: '#22c55e', color: 'white', border: 'none', borderRadius: '1rem', cursor: 'pointer' }}>{currentIndex === vocabList.length - 1 ? 'Test auswerten ➞' : 'Nächstes Wort ➞'}</button></>}{micError && <p style={{ color: '#dc2626' }}>{micError}</p>}<button onClick={() => { stopMicrophone(); setMode('mc'); }} style={{ background: 'none', border: '1px solid #d1d5db', color: '#6b7280', padding: '0.5rem 1.5rem', borderRadius: '9999px', cursor: 'pointer', alignSelf: 'center' }}>📝 Lieber Auswahl zeigen</button></div> : <div style={{ display: 'grid', gap: '1rem' }}>{mcOptions.map(option => <button key={option} onClick={() => handleMcAnswer(option)} style={{ textAlign: 'left', padding: '1.25rem', borderRadius: '1rem', fontSize: '1.2rem', background: 'white', border: '2px solid #e5e7eb', cursor: 'pointer' }}>{option}</button>)}</div>}
  </div>;
};

export default SprachTestPage;