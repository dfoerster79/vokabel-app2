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

  useEffect(() => {
    fetchTestDataAndVocabs();
  }, [testId]);

  const fetchTestDataAndVocabs = async () => {
    setLoading(true);
    const { data: testData } = await supabase.from('vokabel_tests').select('fach_id').eq('id', testId).single();
    if (testData) setFachId(testData.fach_id);

    const { data: vocabData } = await supabase.from('vokabeln').select('*').eq('test_id', testId);
    if (vocabData && vocabData.length > 0) {
      const shuffledVocabs = [...vocabData].sort(() => Math.random() - 0.5);
      setVocabList(shuffledVocabs);
      generateOptions(shuffledVocabs, 0);
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

    setTimeout(() => {
      moveToNextQuestion(isCorrect);
    }, 1500);
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
      saveResults(wasCorrect ? score + 1 : score, wasCorrect ? fehlerListe : [...fehlerListe, vocabList[currentQuestionIndex]]);
    }
  };

  const saveResults = async (finalScore, finalFehlerListe) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: attemptData } = await supabase.from('lern_attempts').insert([{
        user_id: user.id, vokabel_test_id: testId, score: finalScore, total_questions: vocabList.length
    }]).select().single();

    if (attemptData && finalFehlerListe.length > 0) {
      const fehlerInserts = finalFehlerListe.map(v => ({ attempt_id: attemptData.id, vokabel_id: v.id }));
      await supabase.from('lern_attempt_fehler').insert(fehlerInserts);

      if (fachId) {
        const falscheWoerterInserts = finalFehlerListe.map(v => ({ user_id: user.id, fach_id: fachId, vokabel_id: v.id }));
        await supabase.from('lern_falsche_woerter').upsert(falscheWoerterInserts, { onConflict: 'user_id, fach_id, vokabel_id' });
      }
    }
  };

  if (loading) return <div style={{padding: '2rem', textAlign: 'center'}}>Lade Vokabeln...</div>;
  if (vocabList.length === 0) return <div style={{padding: '2rem', textAlign: 'center', color: 'red'}}>Keine Vokabeln gefunden.</div>;

  if (isFinished) {
    return (
      <div style={{ maxWidth: '32rem', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '1rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', textAlign: 'center', borderTop: '8px solid #22c55e', fontFamily: 'sans-serif' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#1f2937' }}>Test beendet! 🎉</h2>
        <div style={{ background: '#f9fafb', padding: '1.5rem', borderRadius: '1rem', marginBottom: '2rem' }}>
          <p style={{ fontSize: '1.25rem', margin: '0 0 0.5rem 0', color: '#4b5563' }}>Dein Ergebnis:</p>
          <p style={{ fontSize: '3rem', fontWeight: 'bold', color: '#16a34a', margin: 0 }}>
            {score} <span style={{ fontSize: '1.5rem', color: '#9ca3af' }}>/ {vocabList.length}</span>
          </p>
        </div>
        <button 
          onClick={() => navigate('/lernen')} 
          style={{ width: '100%', background: '#22c55e', color: 'white', fontSize: '1.25rem', fontWeight: 'bold', padding: '1rem 1.5rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', marginTop: '1rem' }}
        >
          Zurück zur Übersicht
        </button>
      </div>
    );
  }

  const currentVocab = vocabList[currentQuestionIndex];
  const progressPercentage = ((currentQuestionIndex) / vocabList.length) * 100;

  // Stile für das dynamische Feedback definieren
  let feedbackStyle = { height: '4rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0.75rem', fontWeight: 'bold', fontSize: '1.25rem', opacity: showFeedback ? 1 : 0, transition: 'opacity 0.3s' };
  if (showFeedback) {
    if (isCorrectFeedback) {
      feedbackStyle = { ...feedbackStyle, backgroundColor: '#dcfce7', color: '#15803d' };
    } else {
      feedbackStyle = { ...feedbackStyle, backgroundColor: '#fee2e2', color: '#b91c1c' };
    }
  }

  return (
    <div style={{ maxWidth: '42rem', margin: '2rem auto 5rem', padding: '0 1rem', fontFamily: 'sans-serif' }}>
      
      {/* Header & Fortschritt */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', fontSize: '1.125rem', fontWeight: '600', color: '#4b5563' }}>
        <span>Frage {currentQuestionIndex + 1} <span style={{ fontSize: '0.875rem', fontWeight: 'normal' }}>- von {vocabList.length}</span></span>
        <span style={{ backgroundColor: '#dcfce7', color: '#15803d', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.875rem' }}>Score: {score}</span>
      </div>
      
      <div style={{ width: '100%', backgroundColor: '#e5e7eb', borderRadius: '9999px', height: '0.75rem', marginBottom: '2rem' }}>
        <div style={{ backgroundColor: '#22c55e', height: '100%', borderRadius: '9999px', width: `${progressPercentage}%`, transition: 'width 0.3s' }}></div>
      </div>
      
      {/* Vokabel Karte */}
      <div style={{ background: 'white', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #f3f4f6', padding: '2rem', marginBottom: '2rem', textAlign: 'center', minHeight: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ fontSize: '2.5rem', fontWeight: '800', color: '#1f2937', margin: 0 }}>{currentVocab.original}</h2>
      </div>

      {/* Feedback Balken */}
      <div style={feedbackStyle}>
        {showFeedback && (isCorrectFeedback ? '✅ Richtig!' : `❌ Falsch! Richtig wäre: ${currentVocab.uebersetzung}`)}
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
