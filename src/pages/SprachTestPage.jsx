import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const normalize = (value = '') => value.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s'-]/gu, '').trim().replace(/\s+/g, ' ');
const dedupeWords = (value = '') => value.split(' ').filter((word, i, all) => i === 0 || word !== all[i - 1]).join(' ');
const expandAnswers = (value = '') => [...new Set(String(value).split(/[;,]/).flatMap(part => {
  const text = part.trim();
  const dash = text.match(/^(.+?)\/-(\p{L}+)$/u);
  if (dash) return [text, dash[1], dash[1] + dash[2]];
  const slash = text.match(/^(.+?)\/(\p{L}+)$/u);
  if (slash) return [text, slash[1], slash[1] + slash[2]];
  return [text];
}).flatMap(text => [text, text.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()]).filter(Boolean))];
const matchesAnswer = (heard, expected) => {
  const actual = dedupeWords(normalize(heard));
  return Boolean(actual) && expandAnswers(expected).some(answer => normalize(answer) === actual);
};

const buildDebugReport = (words, results, score, startedAt) => {
  const entries = words.map(word => {
    const result = results[word.id] || {};
    const recognized = result.text || '';
    return {
      id: word.id,
      shownWord: word.original,
      expected: word.uebersetzung,
      expectedVariants: expandAnswers(word.uebersetzung),
      recognized,
      recognizedNormalized: dedupeWords(normalize(recognized)),
      matched: Boolean(recognized) && matchesAnswer(recognized, word.uebersetzung),
      correct: Boolean(result.correct),
      status: result.status || 'missing',
      provider: result.provider || 'unknown',
      errorCode: result.errorCode || null,
      pronunciationScore: result.pronunciationScore ?? null,
      accuracyScore: result.accuracyScore ?? null,
      fluencyScore: result.fluencyScore ?? null,
      completenessScore: result.completenessScore ?? null,
    };
  });
  const scores = entries.map(entry => entry.pronunciationScore).filter(value => Number.isFinite(value));
  const matchedCount = entries.filter(entry => entry.matched).length;
  return JSON.stringify({
    reportType: 'vokabel-app-sprachtest-debug',
    createdAt: new Date().toISOString(),
    testStartedAt: startedAt ? new Date(startedAt).toISOString() : null,
    provider: 'azure-pronunciation-assessment',
    language: 'de-DE',
    score: `${score}/${words.length}`,
    totalWords: words.length,
    correctCount: score,
    recognizedCount: entries.filter(entry => entry.recognized && !entry.recognized.startsWith('[')).length,
    matchedCount,
    recognitionAccuracyPercent: words.length ? Math.round((matchedCount / words.length) * 100) : 0,
    averagePronunciationScore: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
    entries,
  }, null, 2);
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
    const write = (offset, value) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };
    write(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    write(36, 'data'); view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i += 1) { const sample = Math.max(-1, Math.min(1, samples[i])); view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); }
    return new Blob([buffer], { type: 'audio/wav' });
  } finally { if (context.close) await context.close().catch(() => {}); }
};

const statusLabel = result => {
  if (!result) return '⏳ Wartet';
  if (result.status === 'recording') return '🔴 Aufnahme...';
  if (result.status === 'uploading') return '⬆️ Upload...';
  if (result.status === 'processing') return '🤖 Azure bewertet...';
  if (result.errorCode === 'NO_SPEECH') return '⚠️ Kein Wort erkannt';
  if (result.status === 'done') return result.correct ? '✅ Richtig' : `❌ Falsch ("${result.text || '–'}")`;
  return '⏳ Wartet';
};
const statusColor = result => !result ? '#9ca3af' : result.status === 'recording' ? '#dc2626' : result.status === 'processing' ? '#2563eb' : result.status === 'uploading' ? '#d97706' : result.status === 'done' ? (result.correct ? '#15803d' : '#b91c1c') : '#9ca3af';

const SprachTestPage = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [vocabList, setVocabList] = useState([]), [fachName, setFachName] = useState(''), [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0), [phase, setPhase] = useState('test'), [score, setScore] = useState(0), [fehlerListe, setFehlerListe] = useState([]);
  const [micError, setMicError] = useState(''), [micReady, setMicReady] = useState(false), [isRecording, setIsRecording] = useState(false), [transcriptions, setTranscriptions] = useState({});
  const [startTime, setStartTime] = useState(null), [elapsed, setElapsed] = useState(0), [timeStats, setTimeStats] = useState({ total: 0, average: 0 }), [debugCopied, setDebugCopied] = useState(false);
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
      if (!text) { updateResult(vocab.id, { status: 'done', text: '[Kein Wort erkannt – bitte erneut versuchen]', correct: false, errorCode: 'NO_SPEECH', provider: 'azure' }); return; }
      updateResult(vocab.id, { status: 'done', text, correct: matchesAnswer(text, vocab.uebersetzung), pronunciationScore: Number.isFinite(Number(result.pronunciationScore)) ? Number(result.pronunciationScore) : null, accuracyScore: result.accuracyScore ?? null, fluencyScore: result.fluencyScore ?? null, completenessScore: result.completenessScore ?? null, provider: 'azure' });
    } catch (error) { console.error('Azure pronunciation assessment error:', error); updateResult(vocab.id, { status: 'done', text: `[Fehler: ${error.message}]`, correct: false, provider: 'azure' }); }
  }, [updateResult]);

  const startRecording = useCallback(vocab => {
    if (!streamRef.current || !vocab || recorderRef.current) return;
    const chunks = [], mimeType = getMime();
    try { const recorder = mimeType ? new MediaRecorder(streamRef.current, { mimeType }) : new MediaRecorder(streamRef.current); recorder.__chunks = chunks; recorder.ondataavailable = event => { if (event.data?.size > 0) chunks.push(event.data); }; recorderRef.current = recorder; vocabRef.current = vocab; updateResult(vocab.id, { status: 'recording', text: '', correct: false, errorCode: null }); recorder.start(); setIsRecording(true); } catch (error) { updateResult(vocab.id, { status: 'done', text: `[Aufnahmefehler: ${error.message}]`, correct: false }); }
  }, [updateResult]);
  const stopRecording = useCallback(vocab => {
    const recorder = recorderRef.current, target = vocab || vocabRef.current;
    if (!target || !recorder || recorder.state === 'inactive') return Promise.resolve();
    return new Promise(resolve => { recorder.onstop = async () => { const blob = new Blob(recorder.__chunks || [], { type: recorder.mimeType || 'audio/webm' }); if (blob.size > 0) await transcribeBlob(blob, target); else updateResult(target.id, { status: 'done', text: '[Keine Aufnahme]', correct: false, errorCode: 'NO_SPEECH' }); resolve(); }; try { recorder.stop(); } catch (_) { updateResult(target.id, { status: 'done', text: '[Aufnahme konnte nicht beendet werden]', correct: false }); resolve(); } recorderRef.current = null; setIsRecording(false); });
  }, [transcribeBlob, updateResult]);
  const requestMic = async () => { setMicError(''); try { streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true }); setMicReady(true); } catch (error) { console.error(error); setMicError('Mikrofon-Zugriff fehlgeschlagen. Bitte erlaube das Mikrofon im Browser.'); } };
  const nextQuestion = () => { const current = vocabListRef.current[indexRef.current], result = resultsRef.current[current?.id]; if (!current || isRecording || result?.status !== 'done' || result.errorCode === 'NO_SPEECH') return; if (indexRef.current === vocabListRef.current.length - 1) setPhase('evaluating'); else { indexRef.current += 1; setCurrentIndex(indexRef.current); } };
  const copyDebugReport = async report => { try { await navigator.clipboard.writeText(report); setDebugCopied(true); setTimeout(() => setDebugCopied(false), 2500); } catch (error) { console.error('Debug report copy error:', error); } };

  const fetchData = async () => {
    setLoading(true);
    const { data: test } = await supabase.from('vokabel_tests').select('fach_id, faecher(name)').eq('id', testId).single();
    setFachName(test?.faecher?.name || '');
    const { data: words } = await supabase.from('vokabeln').select('*').eq('test_id', testId);
    const shuffled = [...(words || [])].sort(() => Math.random() - 0.5);
    setVocabList(shuffled); setStartTime(Date.now()); setLoading(false);
  };

  const finishTest = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true; stopStream();
    const all = vocabListRef.current, results = resultsRef.current;
    const errors = all.filter(word => !results[word.id]?.correct), finalScore = all.length - errors.length;
    const total = Math.max(1, (Date.now() - startTimeRef.current) / 1000);
    setScore(finalScore); setFehlerListe(errors); setTimeStats({ total: total.toFixed(1), average: (total / all.length).toFixed(1) }); setPhase('results');
  }, [stopStream]);

  useEffect(() => { fetchData(); }, [testId]);
  useEffect(() => { vocabListRef.current = vocabList; }, [vocabList]);
  useEffect(() => { indexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { startTimeRef.current = startTime; }, [startTime]);
  useEffect(() => { if (!startTime || phase !== 'test') return undefined; const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000); return () => clearInterval(timer); }, [startTime, phase]);
  useEffect(() => { if (phase !== 'evaluating' || !vocabList.length) return undefined; const timer = setInterval(() => { if (vocabListRef.current.every(word => resultsRef.current[word.id]?.status === 'done')) finishTest(); }, 250); return () => clearInterval(timer); }, [phase, vocabList.length, finishTest]);
  useEffect(() => { if (mode !== 'speech' || !micReady || phase !== 'test' || !vocabList.length) return; const current = vocabList[currentIndex]; if (current && !recorderRef.current && !resultsRef.current[current.id]) startRecording(current); }, [micReady, phase, vocabList, currentIndex, startRecording]);
  useEffect(() => () => { if (recorderRef.current?.state !== 'inactive') { try { recorderRef.current.stop(); } catch (_) {} } stopStream(); }, [stopStream]);

  const abortTest = () => { if (window.confirm('Test wirklich abbrechen? Fortschritt wird nicht gespeichert.')) { stopStream(); navigate('/lernen'); } };
  const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Lade Vokabeln...</div>;
  if (!vocabList.length) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Keine Vokabeln gefunden.</div>;

  if (phase === 'evaluating') return <div style={{ maxWidth: '34rem', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '1rem' }}><h2>🧠 Azure wertet Antworten aus...</h2><p>Bitte warten...</p></div>;
  if (phase === 'results') {
    const report = buildDebugReport(vocabList, transcriptions, score, startTime);
    return <div style={{ maxWidth: '32rem', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '1rem', textAlign: 'center', fontFamily: 'sans-serif' }}><h2>Test beendet! 🎉</h2><p style={{ fontSize: '3rem', fontWeight: 'bold', color: '#0f5156' }}>{score} / {vocabList.length}</p>{fehlerListe.length > 0 && <div style={{ textAlign: 'left', background: '#fef2f2', padding: '1rem', borderRadius: '0.75rem' }}><h3 style={{ color: '#991b1b' }}>Deine Fehler:</h3>{fehlerListe.map(word => <div key={word.id} style={{ marginBottom: '0.8rem' }}><strong>{word.original}</strong><br /><span style={{ color: '#166534' }}>Richtig: {word.uebersetzung}</span><br /><span style={{ color: '#991b1b' }}>Du sagtest: {transcriptions[word.id]?.text || '[Nichts]'}</span></div>)}</div>}<details style={{ textAlign: 'left', marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem' }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Debugbericht anzeigen</summary><p style={{ color: '#475569', fontSize: '0.85rem' }}>Trefferquote, erkannte Antworten und Azure-Werte pro Vokabel.</p><button onClick={() => copyDebugReport(report)} style={{ background: '#0f5156', color: 'white', border: 'none', borderRadius: '0.5rem', padding: '0.7rem 1rem', cursor: 'pointer', fontWeight: 600 }}>{debugCopied ? '✅ Kopiert' : '📋 Debugbericht kopieren'}</button><pre style={{ marginTop: '1rem', maxHeight: '22rem', overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: '0.72rem', background: '#0f172a', color: '#e2e8f0', padding: '0.75rem', borderRadius: '0.5rem' }}>{report}</pre></details><button onClick={() => navigate('/lernen')} style={{ width: '100%', marginTop: '1.5rem', background: '#0f5156', color: 'white', padding: '1rem', borderRadius: '0.75rem', border: 'none' }}>Zurück zur Übersicht</button></div>;
  }

  const current = vocabList[currentIndex], currentResult = transcriptions[current.id], canContinue = currentResult?.status === 'done' && !currentResult.errorCode;
  return <div style={{ maxWidth: '42rem', margin: '2rem auto 5rem', padding: '0 1rem', fontFamily: 'sans-serif' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}><span>Frage {currentIndex + 1} von {vocabList.length}</span><button onClick={abortTest}>✕ Abbruch</button></div>{fachName && <div style={{ color: '#0f766e', marginBottom: '1rem' }}>{fachName}</div>}<div style={{ background: 'white', borderRadius: '1.25rem', padding: '2.5rem 2rem', textAlign: 'center', marginBottom: '1.5rem', border: '1px solid #e5e7eb' }}><div style={{ fontSize: '2.5rem', fontWeight: 700 }}>{current.original}</div></div>{!micReady && <div style={{ textAlign: 'center', padding: '2rem', background: '#f0fdfa', borderRadius: '1rem' }}><p>Bitte erlaube den Mikrofon-Zugriff.</p>{micError && <p style={{ color: '#dc2626' }}>{micError}</p>}<button onClick={requestMic}>Mikrofon erlauben</button></div>}{micReady && <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}><div style={{ color: isRecording ? '#dc2626' : currentResult?.errorCode === 'NO_SPEECH' ? '#b45309' : '#6b7280', marginBottom: '0.75rem' }}>{isRecording ? '🔴 Aufnahme läuft... Sprich jetzt!' : currentResult?.errorCode === 'NO_SPEECH' ? '⚠️ Kein Wort erkannt – bitte erneut versuchen.' : currentResult?.status === 'processing' ? '🤖 Azure wertet aus...' : 'Bereit zur Aufnahme'}</div>{!isRecording && currentResult?.status !== 'processing' && <button onClick={() => startRecording(current)}>{currentResult?.errorCode === 'NO_SPEECH' ? 'Erneut aufnehmen' : 'Aufnahme starten'}</button>}{isRecording && <button onClick={() => stopRecording(current)}>Aufnahme beenden</button>}</div>}<button onClick={nextQuestion} disabled={!canContinue || isRecording} style={{ width: '100%', padding: '1rem', background: !canContinue || isRecording ? '#9ca3af' : '#0f5156', color: 'white', border: 'none', borderRadius: '0.75rem' }}>{currentIndex === vocabList.length - 1 ? 'Test beenden ✓' : 'Weiter →'}</button></div>;
};

export default SprachTestPage;
