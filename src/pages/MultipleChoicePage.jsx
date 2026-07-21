import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const MultipleChoicePage = () => {
  const { testId } = useParams();
  const navigate = useNavigate();

  const [vocabList, setVocabList] = useState([]);
  const [fachId, setFachId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [fehlerListe, setFehlerListe] = useState([]);

  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isCorrectFeedback, setIsCorrectFeedback] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const [startTime, setStartTime] = useState(null);
  const [timeStats, setTimeStats] = useState({ total: 0, average: 0 });
  
  // --- NEU: Live-Zeitmessung ---
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    fetchTestDataAndVocabs();
  }, [testId]);

  // --- NEU: Timer-Logik, die jede Sekunde hochzählt ---
  useEffect(() => {
    let timerInterval;
    if (startTime && !isFinished) {
      timerInterval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(timerInterval);
  }, [startTime, isFinished]);

  const fetchTestDataAndVocabs = async () => {
    setLoading(true);
    const { data: testData } = await supabase.from('vokabel_tests').select('fach_id').eq('id', testId).single();
    if (testData) setFachId(testData.fach_id);

    const { data: vocabData } = await supabase.from('vokabeln').select('*').eq('test_id', testId);
    if (vocabData && vocabData.length > 0) {
      const shuffledVocabs = [...vocabData].sort(() => Math.random() - 0.5);
      setVocabList(shuffledVocabs);
      generateOptions(shuffledVocabs, 0);
      setStartTime(Date.now());
    }
    setLoading(false);
  };

  const generateOptions = (list, index) => {
    if (index >= list.length) return;
    const currentVocab = list[index];
    const incorrectOptions = list
      .filter((v) => v.id !== currentVocab.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map(v => v.uebersetzung);

    const allOptions = [...incorrectOptions, currentVocab.uebersetzung].sort(() => Math.random() - 0.5);
    setOptions(allOptions);
  };

  const handleAnswerClick = (option) => {
    if (showFeedback) return;

    const currentVocab = vocabList[currentQuestionIndex];
    const isCorrect = option === currentVocab.uebersetzung;

    setSelectedAnswer(option);
    setIsCorrectFeedback(isCorrect);
    setShowFeedback(true);

    if (isCorrect) {
      setScore(prev => prev + 1);
    } else {
      setFehlerListe(prev => [...prev, currentVocab]);
    }

    // --- GEÄNDERT: Kürzere Wartezeit (700ms statt 1500ms) ---
    setTimeout(() => {
      moveToNextQuestion(isCorrect);
    }, 700);
  };

  const moveToNextQuestion = (wasCorrect) => {
    setShowFeedback(false);
    setSelectedAnswer(null);
    setIsCorrectFeedback(null);

    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex < vocabList.length) {
      setCurrentQuestionIndex(nextIndex);
      generateOptions(vocabList, nextIndex);
    } else {
      setIsFinished(true);
      
      const endTime = Date.now();
      // Abzug von 700ms pro Pause
      const totalPauseTime = vocabList.length * 700; 
      const rawTimeTakenMs = endTime - startTime - totalPauseTime;
      const finalTimeTakenSec = Math.max(1, rawTimeTakenMs / 1000); 
      const averageTimeSec = finalTimeTakenSec / vocabList.length;

      setTimeStats({
        total: finalTimeTakenSec.toFixed(1),
        average: averageTimeSec.toFixed(1)
      });

      saveResults(
        wasCorrect ? score + 1 : score, 
        wasCorrect ? fehlerListe : [...fehlerListe, vocabList[currentQuestionIndex]],
        finalTimeTakenSec,
        averageTimeSec
      );
    }
  };

  const saveResults = async (finalScore, finalFehlerListe, timeTaken, avgTime) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const percent = Math.round((finalScore / vocabList.length) * 100);

    // 1. In 'lern_attempts' speichern (angepasst an die echte DB-Struktur)
    const { data: attemptData, error: attemptError } = await supabase.from('lern_attempts').insert([{
        user_id: user.id, 
        fach_id: fachId,
        vokabel_test_id: testId, 
        testart: 'multiple_choice',
        correct_count: finalScore, 
        question_count: vocabList.length,
        percent_correct: percent,
        time_taken_seconds: timeTaken,
        avg_time_per_word: avgTime,
        started_at: new Date(startTime).toISOString(),
        finished_at: new Date().toISOString()
    }]).select().single();

    if (attemptError) {
      console.error("Fehler beim Speichern der Ergebnisse:", attemptError);
      return;
    }

    if (attemptData && finalFehlerListe.length > 0) {
      // 2. In 'lern_attempt_fehler' speichern
      const fehlerInserts = finalFehlerListe.map(v => ({ 
        attempt_id: attemptData.id, 
        user_id: user.id,
        fach_id: fachId,
        vokabel_test_id: testId,
        vokabel_id: v.id,
        frage: v.original,
        gegebene_antwort: "Falsch beantwortet",
        richtige_antwort: v.uebersetzung,
        ist_richtig: false
      }));
      await supabase.from('lern_attempt_fehler').insert(fehlerInserts);

      // 3. In 'lern_falsche_woerter' speichern
      if (fachId) {
        const falscheWoerterInserts = finalFehlerListe.map(v => ({ 
          user_id: user.id, 
          fach_id: fachId, 
          vokabel_test_id: testId,
          vokabel_id: v.id,
          fehler_anzahl: 1, 
          zuletzt_falsch_am: new Date().toISOString()
        }));
        await supabase.from('lern_falsche_woerter').upsert(falscheWoerterInserts, { onConflict: 'user_id, fach_id, vokabel_id' });
      }
    }
  };

  // --- Hilfsfunktion zum Formatieren der Live-Zeit (z.B. 01:05) ---
  const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading) return <div style={{padding: '2rem', textAlign: 'center'}}>Lade Vokabeln...</div>;
  if (vocabList.length === 0) return <div style={{padding: '2rem', textAlign: 'center', color: 'red'}}>Keine Vokabeln gefunden.</div>;

  if (isFinished) {
    return (
      <div style={{ maxWidth: '32rem', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '1rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', textAlign: 'center', borderTop: '8px solid #22c55e', fontFamily: 'sans-serif' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#1f2937' }}>Test beendet! 🎉</h2>
        
        <div style={{ background: '#f9fafb', padding: '1.5rem', borderRadius: '1rem', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '1.25rem', margin: '0 0 0.5rem 0', color: '#4b5563' }}>Dein Ergebnis:</p>
          <p style={{ fontSize: '3rem', fontWeight: 'bold', color: '#16a34a', margin: 0 }}>
            {score} <span style={{ fontSize: '1.5rem', color: '#9ca3af' }}>/ {vocabList.length}</span>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ flex: 1, background: '#f3f4f6', padding: '1rem', borderRadius: '0.75rem' }}>
            <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', color: '#6b7280' }}>Gesamtzeit</p>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', color: '#374151' }}>{timeStats.total} s</p>
          </div>
          <div style={{ flex: 1, background: '#f3f4f6', padding: '1rem', borderRadius: '0.75rem' }}>
            <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', color: '#6b7280' }}>Ø pro Wort</p>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', color: '#374151' }}>{timeStats.average} s</p>
          </div>
        </div>

        <button 
          onClick={() => navigate('/lernen')} 
          style={{ width: '100%', background: '#22c55e', color: 'white', fontSize: '1.25rem', fontWeight: 'bold', padding: '1rem 1.5rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', transition: 'background 0.2s' }}
          onMouseOver={(e) => e.target.style.background = '#16a34a'}
          onMouseOut={(e) => e.target.style.background = '#22c55e'}
        >
          Zurück zur Übersicht
        </button>
      </div>
    );
  }

  const currentVocab = vocabList[currentQuestionIndex];
  const progressPercentage = ((currentQuestionIndex) / vocabList.length) * 100;

  // --- NEU: Dynamische Styles für die Vokabel-Karte ---
  let cardStyle = { 
    background: 'white', 
    borderRadius: '1rem', 
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', 
    border: '1px solid #f3f4f6', 
    padding: '2rem', 
    marginBottom: '2rem', 
    textAlign: 'center', 
    minHeight: '160px', 
    display: 'flex', 
    flexDirection: 'column',
    alignItems: 'center', 
    justifyContent: 'center',
    transition: 'all 0.2s ease-in-out'
  };

  let vocabTextColor = '#1f2937';

  if (showFeedback) {
    if (isCorrectFeedback) {
      cardStyle.background = '#dcfce7'; // Hellgrün
      cardStyle.borderColor = '#22c55e';
      vocabTextColor = '#15803d'; // Dunkelgrün
    } else {
      cardStyle.background = '#fee2e2'; // Hellrot
      cardStyle.borderColor = '#ef4444';
      vocabTextColor = '#b91c1c'; // Dunkelrot
    }
  }

  return (
    <div style={{ maxWidth: '42rem', margin: '2rem auto 5rem', padding: '0 1rem', fontFamily: 'sans-serif' }}>
      
      {/* Header mit Uhr und Score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', fontSize: '1.125rem', fontWeight: '600', color: '#4b5563' }}>
        <span>Frage {currentQuestionIndex + 1} <span style={{ fontSize: '0.875rem', fontWeight: 'normal' }}>- von {vocabList.length}</span></span>
        
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* Live Uhr */}
          <span style={{ fontSize: '1rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
            ⏱ {formatTime(elapsedTime)}
          </span>
          <span style={{ backgroundColor: '#dcfce7', color: '#15803d', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.875rem' }}>Score: {score}</span>
        </div>
      </div>
      
      {/* Fortschrittsbalken */}
      <div style={{ width: '100%', backgroundColor: '#e5e7eb', borderRadius: '9999px', height: '0.75rem', marginBottom: '2rem' }}>
        <div style={{ backgroundColor: '#22c55e', height: '100%', borderRadius: '9999px', width: `${progressPercentage}%`, transition: 'width 0.3s' }}></div>
      </div>
      
      {/* Vokabel Karte (färbt sich ein) */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: '800', color: vocabTextColor, margin: 0, transition: 'color 0.2s' }}>
            {currentVocab.original}
          </h2>
          {/* Haken oder Kreuz */}
          {showFeedback && (
            <span style={{ fontSize: '2.5rem' }}>
              {isCorrectFeedback ? '✅' : '❌'}
            </span>
          )}
        </div>
        
        {/* Anzeige der richtigen Lösung bei Fehler */}
        {showFeedback && !isCorrectFeedback && (
          <p style={{ marginTop: '0.5rem', fontSize: '1.25rem', fontWeight: 'bold', color: '#b91c1c' }}>
            Richtig: {currentVocab.uebersetzung}
          </p>
        )}
      </div>

      {/* Antwort Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
        {options.map((option, idx) => {
          
          let btnStyle = { width: '100%', textAlign: 'left', padding: '1.25rem', borderRadius: '1rem', fontSize: '1.25rem', fontWeight: '500', cursor: showFeedback ? 'not-allowed' : 'pointer', background: 'white', border: '2px solid #e5e7eb', color: '#374151' };
          
          if (showFeedback) {
            if (option === currentVocab.uebersetzung) {
              btnStyle = { ...btnStyle, backgroundColor: '#22c55e', borderColor: '#22c55e', color: 'white' };
            } else if (option === selectedAnswer && !isCorrectFeedback) {
              btnStyle = { ...btnStyle, backgroundColor: '#ef4444', borderColor: '#ef4444', color: 'white' };
            } else {
              btnStyle = { ...btnStyle, backgroundColor: '#f3f4f6', borderColor: '#f3f4f6', color: '#9ca3af', opacity: 0.5 };
            }
          }

          return (
            <button
              key={idx}
              onClick={() => handleAnswerClick(option)}
              disabled={showFeedback}
              style={btnStyle}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MultipleChoicePage;
