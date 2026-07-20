import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const MultipleChoicePage = () => {
  const { testId } = useParams();
  const navigate = useNavigate();

  // State-Management
  const [vocabList, setVocabList] = useState([]);
  const [fachId, setFachId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [fehlerListe, setFehlerListe] = useState([]);

  // States für visuelles Feedback
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isCorrectFeedback, setIsCorrectFeedback] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    fetchTestDataAndVocabs();
  }, [testId]);

  const fetchTestDataAndVocabs = async () => {
    setLoading(true);
    const { data: testData } = await supabase
      .from('vokabel_tests')
      .select('fach_id')
      .eq('id', testId)
      .single();

    if (testData) setFachId(testData.fach_id);

    const { data: vocabData } = await supabase
      .from('vokabeln')
      .select('*')
      .eq('test_id', testId);

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
    if (showFeedback) return; // Verhindert mehrfaches Klicken während Feedback angezeigt wird

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

    // Warte kurz, zeige dann die nächste Frage
    setTimeout(() => {
      moveToNextQuestion(isCorrect);
    }, 1500); // 1.5 Sekunden Feedback anzeigen
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
      // Letztes Ergebnis mit übergeben
      saveResults(
        wasCorrect ? score + 1 : score, 
        wasCorrect ? fehlerListe : [...fehlerListe, vocabList[currentQuestionIndex]]
      );
    }
  };

  const saveResults = async (finalScore, finalFehlerListe) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: attemptData } = await supabase
      .from('lern_attempts')
      .insert([{
        user_id: user.id,
        vokabel_test_id: testId,
        score: finalScore,
        total_questions: vocabList.length
      }])
      .select()
      .single();

    if (attemptData && finalFehlerListe.length > 0) {
      const fehlerInserts = finalFehlerListe.map(v => ({
        attempt_id: attemptData.id,
        vokabel_id: v.id
      }));
      await supabase.from('lern_attempt_fehler').insert(fehlerInserts);

      if (fachId) {
        const falscheWoerterInserts = finalFehlerListe.map(v => ({
          user_id: user.id,
          fach_id: fachId,
          vokabel_id: v.id
        }));
        await supabase
          .from('lern_falsche_woerter')
          .upsert(falscheWoerterInserts, { onConflict: 'user_id, fach_id, vokabel_id' });
      }
    }
  };

  if (loading) return <div className="p-8 text-center text-xl font-medium text-gray-600 mt-20">Lade Vokabeln...</div>;
  if (vocabList.length === 0) return <div className="p-8 text-center text-xl font-medium text-red-500 mt-20">Keine Vokabeln gefunden.</div>;

  if (isFinished) {
    return (
      <div className="max-w-lg mx-auto mt-16 p-8 bg-white rounded-2xl shadow-xl text-center border-t-8 border-green-500">
        <h2 className="text-4xl font-bold mb-6 text-gray-800">Test beendet! 🎉</h2>
        <div className="bg-gray-50 p-6 rounded-xl mb-8">
          <p className="text-2xl mb-2 text-gray-600">Dein Ergebnis:</p>
          <p className="text-5xl font-extrabold text-green-600">{score} <span className="text-2xl text-gray-400">/ {vocabList.length}</span></p>
        </div>
        <button
          onClick={() => navigate('/lernen')}
          className="w-full bg-green-500 hover:bg-green-600 text-white text-xl font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-green-500/30"
        >
          Zurück zur Übersicht
        </button>
      </div>
    );
  }

  const currentVocab = vocabList[currentQuestionIndex];
  const progressPercentage = ((currentQuestionIndex) / vocabList.length) * 100;

  return (
    <div className="max-w-2xl mx-auto mt-8 mb-20 px-4">
      
      {/* Fortschrittsbalken & Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-3 text-lg font-semibold text-gray-600">
          <span>Frage {currentQuestionIndex + 1} <span className="text-gray-400 text-sm font-normal">von {vocabList.length}</span></span>
          <span className="bg-green-100 text-green-700 py-1 px-3 rounded-full text-sm">Score: {score}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div className="bg-green-500 h-3 rounded-full transition-all duration-300" style={{ width: `${progressPercentage}%` }}></div>
        </div>
      </div>
      
      {/* Das gesuchte Fremdwort */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8 text-center min-h-[160px] flex items-center justify-center">
        <h2 className="text-4xl sm:text-5xl font-extrabold text-gray-800 tracking-tight">
          {currentVocab.original}
        </h2>
      </div>

      {/* Feedback Bereich (erscheint nach Klick) */}
      <div className={`h-16 mb-4 flex items-center justify-center rounded-xl transition-all duration-300 ${
        showFeedback 
          ? isCorrectFeedback 
            ? 'bg-green-100 text-green-700' 
            : 'bg-red-100 text-red-700'
          : 'opacity-0'
      }`}>
        <p className="text-xl font-bold flex items-center gap-2">
          {showFeedback && (
            isCorrectFeedback ? '✅ Richtig!' : `❌ Falsch! Richtig wäre: ${currentVocab.uebersetzung}`
          )}
        </p>
      </div>

      {/* Antwortmöglichkeiten */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5">
        {options.map((option, idx) => {
          
          // Styling Logik für die Buttons basierend auf Feedback
          let buttonClass = "bg-white hover:bg-gray-50 border-2 border-gray-200 text-gray-700";
          
          if (showFeedback) {
            if (option === currentVocab.uebersetzung) {
              buttonClass = "bg-green-500 border-green-500 text-white font-bold shadow-lg shadow-green-500/30 scale-[1.02]";
            } else if (option === selectedAnswer && !isCorrectFeedback) {
              buttonClass = "bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/30 scale-[1.02]";
            } else {
              buttonClass = "bg-gray-100 border-gray-100 text-gray-400 opacity-50";
            }
          }

          return (
            <button
              key={idx}
              onClick={() => handleAnswerClick(option)}
              disabled={showFeedback}
              className={`w-full text-left p-5 rounded-2xl text-xl sm:text-2xl font-medium transition-all duration-200 active:scale-95 ${buttonClass}`}
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
