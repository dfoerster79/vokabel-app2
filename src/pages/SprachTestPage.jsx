import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const normalize = (value = '') => value.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s'-]/gu, '').trim().replace(/\s+/g, ' ');
const dedupeWords = (value = '') => value.split(' ').filter((word, i, all) => i === 0 || word !== all[i - 1]).join(' ');

const expandAnswers = (value = '') => {
  const variants = String(value).split(/[;,]/).flatMap(part => {
    const text = part.trim();
    const dash = text.match(/^(.+?)\/-(\p{L}+)$/u);
    if (dash) return [text, dash[1], dash[1] + dash[2]];
    const slash = text.match(/^(.+?)\/(\p{L}+)$/u);
    if (slash) return [text, slash[1], slash[1] + slash[2]];
    return [text];
  }).flatMap(text => [text, text.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()]).filter(Boolean);
  return [...new Set(variants)];
};

const matchesAnswer = (heard, expected) => {
  const actual = dedupeWords(normalize(heard));
  return Boolean(actual) && expandAnswers(expected).some(answer => normalize(answer) === actual);
};

const audioBlobToWav = async blob => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !window.OfflineAudioContext) throw new Error('Dieser Browser unterstützt keine Audio-Konvertierung für Azure.');
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const rate = 16000;
    const frames = Math.max(1, Math.ceil(decoded.duration * rate));
    const offline = new OfflineAudioContext(1, frames, rate);
    const source = offline.createBufferSource();
    source.buffer = decoded; source.connect(offline.destination); source.start(0);
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const write = (offset, text) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
    write(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    write(36, 'data'); view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  } finally { if (context.close) await context.close().catch(() => {}); }
};

const labels = { noun:'Nomen', verb:'Verb', adjective:'Adjektiv', adverb:'Adverb', pronoun:'Pronomen', preposition:'Präposition', conjunction:'Konjunktion', determiner:'Artikel/Det.', numeral:'Zahlwort', interjection:'Interjektion', particle:'Partikel', phrase:'Wendung', other:'Sonstiges' };
const scoreText = result => Number.isFinite(result?.pronunciationScore) ? ` (Aussprache ${Math.round(result.pronunciationScore)}/100)` : '';
const statusLabel = result => {
  if (!result) return '⏳ Wartet';
  if (result.status === 'recording') return '🔴 Aufnahme...';
  if (result.status === 'uploading') return '⬆️ Upload...';
  if (result.status === 'processing') return '🤖 Azure bewertet...';
  if (result.errorCode === 'NO_SPEECH') return '⚠️ Kein Wort erkannt';
  if (result.status === 'done') return result.correct ? `✅ Richtig${scoreText(result)}` : `❌ Falsch${scoreText(result)} ("${result.text || '–'}")`;
  return '⏳ Wartet';
};
const statusColor = result => !result ? '#9ca3af' : result.status === 'recording' ? '#dc2626' : result.status === 'processing' ? '#2563eb' : result.status === 'uploading' ? '#d97706' : result.status === 'done' ? (result.correct ? '#15803d' : '#b91c1c') : '#9ca3af';

const SprachTestPage = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [vocabList, setVocabList] = useState([]), [wortartMap, setWortartMap] = useState({}), [fachVokabelPool, setFachVokabelPool] = useState([]);
  const [fachId, setFachId] = useState(null), [fachName, setFachName] = useState(''), [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0), [phase, setPhase] = useState('test'), [score, setScore] = useState(0), [fehlerListe, setFehlerListe] = useState([]);
  const [mode, setMode] = useState('speech'), [micError, setMicError] = useState(''), [micReady, setMicReady] = useState(false), [isRecording, setIsRecording] = useState(false);
  const [transcriptions, setTranscriptions] = useState({}), [mcOptions, setMcOptions] = useState([]), [startTime, setStartTime] = useState(null), [elapsed, setElapsed] = useState(0), [timeStats, setTimeStats] = useState({ total: 0, average: 0 }), [showDebug, setShowDebug] = useState(false);

  const streamRef = useRef(null), recorderRef = useRef(null), vocabRef = useRef(null), resultsRef = useRef({}), vocabListRef = useRef([]), indexRef = useRef(0), startTimeRef = useRef(null), finishedRef = useRef(false);
  const updateResult = useCallback((id, update) => {
    const next = { ...(resultsRef.current[id] || {}), ...update };
    resultsRef.current = { ...resultsRef.current, [id]: next };
    setTranscriptions(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...update } }));
  }, []);
  const stopStream = useCallback(() => { streamRef.current?.getTracks().forEach(track => { try { track.stop(); } catch (_) {} }); streamRef.current = null; setIsRecording(false); }, []);
  const getMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type)) || '';

  const transcribeBlob = useCallback(async (blob, vocab) => {
    updateResult(vocab.id, { status: 'uploading', errorCode: null });
    try {
      const wav = await audioBlobToWav(blob);
      const audioBase64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onloadend = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = reject; reader.readAsDataURL(wav); });
      updateResult(vocab.id, { status: 'processing' });
      const referenceText = (expandAnswers(vocab.uebersetzung)[0] || vocab.uebersetzung).replace(/[()]/g, '').trim();
      const response = await fetch('/api/pronunciation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audioBase64, referenceText, language: 'de-DE' }) });
      if (!response.ok) throw new Error(`Azure ${response.status}: ${await response.text()}`);
      const result = await response.json();
      const text = String(result.text || '').trim();
      if (!text) {
        updateResult(vocab.id, { status: 'done', text: '[Kein Wort erkannt – bitte erneut versuchen]', correct: false, errorCode: 'NO_SPEECH', provider: 'azure' });
        return;
      }
      updateResult(vocab.id, { status: 'done', text, correct: matchesAnswer(text, vocab.uebersetzung), pronunciationScore: Number.isFinite(Number(result.pronunciationScore)) ? Number(result.pronunciationScore) : null, accuracyScore: result.accuracyScore ?? null, fluencyScore: result.fluencyScore ?? null, completenessScore: result.completenessScore ?? null, provider: 'azure' });
    } catch (error) {
      console.error('Azure pronunciation assessment error:', error);
      updateResult(vocab.id, { status: 'done', text: `[Fehler: ${error.message}]`, correct: false, provider: 'azure' });
    }
  }, [updateResult]);

  const startRecording = useCallback(vocab => {
    if (!streamRef.current || !vocab || recorderRef.current) return;
    const chunks = [], mimeType = getMime();
    try {
      const recorder = mimeType ? new MediaRecorder(streamRef.current, { mimeType }) : new MediaRecorder(streamRef.current);
      recorder.__chunks = chunks; recorder.ondataavailable = event => { if (event.data?.size > 0) chunks.push(event.data); };
      recorderRef.current = recorder; vocabRef.current = vocab;
      updateResult(vocab.id, { status: 'recording', text: '', correct: false, errorCode: null });
      recorder.start(); setIsRecording(true);
    } catch (error) { updateResult(vocab.id, { status: 'done', text: `[Aufnahmefehler: ${error.message}]`, correct: false }); }
  }, [updateResult]);

  const stopRecording = useCallback(vocab => {
    const recorder = recorderRef.current, target = vocab || vocabRef.current;
    if (!target || !recorder || recorder.state === 'inactive') return Promise.resolve();
    return new Promise(resolve => {
      recorder.onstop = async () => { const blob = new Blob(recorder.__chunks || [], { type: recorder.mimeType || 'audio/webm' }); if (blob.size > 0) await transcribeBlob(blob, target); else updateResult(target.id, { status: 'done', text: '[Keine Aufnahme]', correct: false, errorCode: 'NO_SPEECH' }); resolve(); };
      try { recorder.stop(); } catch (_) { updateResult(target.id, { status: 'done', text: '[Aufnahme konnte nicht beendet werden]', correct: false }); resolve(); }
      recorderRef.current = null; setIsRecording(false);
    });
  }, [transcribeBlob, updateResult]);

  const requestMic = async () => { setMicError(''); try { streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true }); setMicReady(true); } catch (error) { console.error(error); setMicError('Mikrofon-Zugriff fehlgeschlagen. Bitte erlaube das Mikrofon im Browser.'); } };
  const nextQuestion = () => { const current = vocabListRef.current[indexRef.current], result = resultsRef.current[current?.id]; if (!current || isRecording || result?.status !== 'done' || result.errorCode === 'NO_SPEECH') return; if (indexRef.current === vocabListRef.current.length - 1) setPhase('evaluating'); else { indexRef.current += 1; setCurrentIndex(indexRef.current); } };

  const buildMcOptions = useCallback((list, index, map, pool) => { const current = list[index]; if (!current) return; const type = map[current.id] || 'other'; const ordered = [...pool.filter(v => v.id !== current.id && v.wortart_id === type), ...pool.filter(v => v.id !== current.id && v.wortart_id !== type), ...list.filter(v => v.id !== current.id)].sort(() => Math.random() - 0.5); const distractors = ordered.map(v => v.uebersetzung).filter((v, i, all) => v !== current.uebersetzung && all.indexOf(v) === i).slice(0, 3); setMcOptions([...distractors, current.uebersetzung].sort(() => Math.random() - 0.5)); }, []);
  const answerMc = option => { const vocab = vocabListRef.current[indexRef.current]; if (!vocab) return; updateResult(vocab.id, { status: 'done', type: 'mc', text: option, correct: option === vocab.uebersetzung }); if (indexRef.current === vocabListRef.current.length - 1) setPhase('evaluating'); else { indexRef.current += 1; setCurrentIndex(indexRef.current); } };

  const fetchData = async () => {
    setLoading(true);
    const { data: test } = await supabase.from('vokabel_tests').select('fach_id, faecher(id, name)').eq('id', testId).single();
    const subjectId = test?.fach_id || null, subjectName = test?.faecher?.name || '';
    setFachId(subjectId); setFachName(subjectName); if (subjectName.toLowerCase().includes('lat')) setMode('mc');
    const { data: words } = await supabase.from('vokabeln').select('*').eq('test_id', testId); if (!words?.length) { setLoading(false); return; }
    const ids = words.map(word => word.id), { data: wordTypes } = await supabase.from('vokabeln_wortarten').select('vokabel_id, wortart_id').in('vokabel_id', ids), map = {};
    (wordTypes || []).forEach(item => { map[item.vokabel_id] = item.wortart_id; }); setWortartMap(map);
    let pool = [];
    if (subjectId) { const { data: tests } = await supabase.from('vokabel_tests').select('id').eq('fach_id', subjectId); const testIds = (tests || []).map(item => item.id); const { data: poolWords } = testIds.length ? await supabase.from('vokabeln').select('id, uebersetzung').in('test_id', testIds) : { data: [] }; const poolIds = (poolWords || []).map(word => word.id); const { data: poolTypes } = poolIds.length ? await supabase.from('vokabeln_wortarten').select('vokabel_id, wortart_id').in('vokabel_id', poolIds) : { data: [] }; const poolMap = {}; (poolTypes || []).forEach(item => { poolMap[item.vokabel_id] = item.wortart_id; }); pool = (poolWords || []).map(word => ({ ...word, wortart_id: poolMap[word.id] || 'other' })); }
    const shuffled = [...words].sort(() => Math.random() - 0.5); setFachVokabelPool(pool); setVocabList(shuffled); buildMcOptions(shuffled, 0, map, pool); setStartTime(Date.now()); setLoading(false);
  };

  const saveResults = async (finalScore, errors, total, average, results) => { const { data: { user } } = await supabase.auth.getUser(); if (!user) return; const { data: attempt, error } = await supabase.from('lern_attempts').insert([{ user_id: user.id, fach_id: fachId, vokabel_test_id: testId, testart: 'sprache', correct_count: finalScore, question_count: vocabListRef.current.length, percent_correct: Math.round((finalScore / vocabListRef.current.length) * 100), time_taken_seconds: total, avg_time_per_word: average, started_at: new Date(startTimeRef.current).toISOString(), finished_at: new Date().toISOString() }]).select().single(); if (error || !attempt || !errors.length) return; await supabase.from('lern_attempt_fehler').insert(errors.map(word => ({ attempt_id: attempt.id, user_id: user.id, fach_id: fachId, vokabel_test_id: testId, vokabel_id: word.id, frage: word.original, gegebene_antwort: results[word.id]?.text || 'Falsch', richtige_antwort: word.uebersetzung, ist_richtig: false }))); };
  const finishTest = () => { if (finishedRef.current) return; finishedRef.current = true; stopStream(); const all = vocabListRef.current, results = resultsRef.current, errors = all.filter(word => !results[word.id]?.correct), finalScore = all.length - errors.length, total = Math.max(1, (Date.now() - startTimeRef.current) / 1000); setScore(finalScore); setFehlerListe(errors); setTimeStats({ total: total.toFixed(1), average: (total / all.length).toFixed(1) }); setPhase('results'); saveResults(finalScore, errors, total, total / all.length, results); };

  useEffect(() => { fetchData(); }, [testId]);
  useEffect(() => { vocabListRef.current = vocabList; }, [vocabList]);
  useEffect(() => { indexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { startTimeRef.current = startTime; }, [startTime]);
  useEffect(() => { if (!startTime || phase !== 'test') return undefined; const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000); return () => clearInterval(timer); }, [startTime, phase]);
  useEffect(() => { if (mode !== 'speech' || !micReady || phase !== 'test' || !vocabList.length) return; const current = vocabList[currentIndex]; if (current && !recorderRef.current && !resultsRef.current[current.id]) startRecording(current); }, [mode, micReady, phase, vocabList, currentIndex, startRecording]);
  useEffect(() => { if (vocabList.length) buildMcOptions(vocabList, currentIndex, wortartMap, fachVokabelPool); }, [vocabList, currentIndex, wortartMap, fachVokabelPool, buildMcOptions]);
  useEffect(() => { if (phase !== 'evaluating' || !vocabList.length) return undefined; const timer = setInterval(() => { if (vocabListRef.current.every(word => resultsRef.current[word.id]?.status === 'done')) finishTest(); }, 250); return () => clearInterval(timer); }, [phase, vocabList.length]);
  useEffect(() => () => { if (recorderRef.current?.state !== 'inactive') { try { recorderRef.current.stop(); } catch (_) {} } stopStream(); }, [stopStream]);

  const abortTest = () => { if (window.confirm('Test wirklich abbrechen? Fortschritt wird nicht gespeichert.')) { stopStream(); navigate('/lernen'); } };
  const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Lade Vokabeln...</div>;
  if (!vocabList.length) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Keine Vokabeln gefunden.</div>;
  if (phase === 'evaluating') { const entries = vocabList.map(word => ({ word, result: transcriptions[word.id] })); const done = entries.filter(entry => entry.result?.status === 'done').length; return <div style={{ maxWidth: '34rem', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '1rem', fontFamily: 'sans-serif' }}><h2 style={{ color: '#0f5156' }}>🧠 Azure wertet Antworten aus...</h2><p style={{ color: '#6b7280' }}>Fertig: {done} / {vocabList.length}</p>{entries.map(({ word, result }) => <div key={word.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0.45rem 0' }}><span>{word.original}</span><span style={{ color: statusColor(result) }}>{statusLabel(result)}</span></div>)}</div>; }
  if (phase === 'results') return <div style={{ maxWidth: '32rem', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '1rem', textAlign: 'center', fontFamily: 'sans-serif' }}><h2>Test beendet! 🎉</h2><p style={{ fontSize: '3rem', fontWeight: 'bold', color: '#0f5156' }}>{score} / {vocabList.length}</p>{fehlerListe.length > 0 && <div style={{ textAlign: 'left', background: '#fef2f2', padding: '1rem', borderRadius: '0.75rem' }}><h3 style={{ color: '#991b1b' }}>Deine Fehler:</h3>{fehlerListe.map(word => <div key={word.id} style={{ marginBottom: '0.8rem' }}><strong>{word.original}</strong><br /><span style={{ color: '#166534' }}>Richtig: {word.uebersetzung}</span><br /><span style={{ color: '#991b1b' }}>Du sagtest: {transcriptions[word.id]?.text || '[Nichts]'}</span></div>)}</div>}<div style={{ display: 'flex', gap: '1rem', margin: '1.5rem 0' }}><div style={{ flex: 1, background: '#f3f4f6', padding: '1rem' }}>Gesamtzeit<br /><strong>{timeStats.total} s</strong></div><div style={{ flex: 1, background: '#f3f4f6', padding: '1rem' }}>Ø pro Wort<br /><strong>{timeStats.average} s</strong></div></div><button onClick={() => navigate('/lernen')} style={{ width: '100%', background: '#0f5156', color: 'white', padding: '1rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer' }}>Zurück zur Übersicht</button></div>;

  const current = vocabList[currentIndex], currentResult = transcriptions[current.id], progress = ((currentIndex + 1) / vocabList.length) * 100, showMc = mode === 'mc' || fachName.toLowerCase().includes('lat'), canContinue = currentResult?.status === 'done' && !currentResult.errorCode;
  return <div style={{ maxWidth: '42rem', margin: '2rem auto 5rem', padding: '0 1rem', fontFamily: 'sans-serif' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}><span>Frage {currentIndex + 1} von {vocabList.length}</span><div><span>⏱ {formatTime(elapsed)} </span><button onClick={() => setShowDebug(value => !value)}>🤖</button> <button onClick={abortTest}>✕ Abbruch</button></div></div>{showDebug && <div style={{ background: '#1e293b', color: '#e2e8f0', padding: '1rem', marginBottom: '1rem', fontFamily: 'monospace' }}>{vocabList.slice(0, currentIndex + 1).map(word => <div key={word.id}>{word.original}: <span style={{ color: statusColor(transcriptions[word.id]) }}>{statusLabel(transcriptions[word.id])}</span></div>)}</div>}<div style={{ height: 6, background: '#e5e7eb', marginBottom: '1.5rem' }}><div style={{ height: '100%', width: `${progress}%`, background: '#0f5156' }} /></div>{fachName && <div style={{ color: '#0f766e', marginBottom: '1rem' }}>{fachName}</div>}<div style={{ background: 'white', borderRadius: '1.25rem', padding: '2.5rem 2rem', textAlign: 'center', marginBottom: '1.5rem', border: '1px solid #e5e7eb' }}>{wortartMap[current.id] && <div style={{ color: '#6b7280', marginBottom: '1rem' }}>{labels[wortartMap[current.id]] || wortartMap[current.id]}</div>}<div style={{ fontSize: '2.5rem', fontWeight: 700 }}>{current.original}</div>{current.beispiel && <div style={{ marginTop: '1rem', color: '#6b7280', fontStyle: 'italic' }}>{current.beispiel}</div>}</div>{mode === 'speech' && !micReady && <div style={{ textAlign: 'center', padding: '2rem', background: '#f0fdfa', borderRadius: '1rem', marginBottom: '1rem' }}><div style={{ fontSize: '3rem' }}>🎙️</div><p>Bitte erlaube den Mikrofon-Zugriff für den Sprachtest.</p>{micError && <p style={{ color: '#dc2626' }}>{micError}</p>}<button onClick={requestMic}>Mikrofon erlauben</button></div>}{mode === 'speech' && micReady && <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}><div style={{ color: isRecording ? '#dc2626' : currentResult?.errorCode === 'NO_SPEECH' ? '#b45309' : '#6b7280', marginBottom: '0.75rem' }}>{isRecording ? '🔴 Aufnahme läuft... Sprich jetzt!' : currentResult?.errorCode === 'NO_SPEECH' ? '⚠️ Kein Wort erkannt – bitte erneut versuchen.' : currentResult?.status === 'processing' ? '🤖 Azure wertet aus...' : 'Bereit zur Aufnahme'}</div>{!isRecording && currentResult?.status !== 'processing' && <button onClick={() => startRecording(current)}>{currentResult?.errorCode === 'NO_SPEECH' ? 'Erneut aufnehmen' : 'Aufnahme starten'}</button>}{isRecording && <button onClick={() => stopRecording(current)}>Aufnahme beenden</button>}</div>}{showMc && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>{mcOptions.map(option => <button key={option} onClick={() => answerMc(option)}>{option}</button>)}</div>}{!showMc && micReady && <button onClick={nextQuestion} disabled={!canContinue || isRecording} style={{ width: '100%', padding: '1rem', background: !canContinue || isRecording ? '#9ca3af' : '#0f5156', color: 'white', border: 'none', borderRadius: '0.75rem' }}>{currentIndex === vocabList.length - 1 ? 'Test beenden ✓' : 'Weiter →'}</button>}</div>;
};

export default SprachTestPage;
