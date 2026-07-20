import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient'; // Pfad zu deiner Supabase-Config ggf. anpassen

const MultipleChoicePage = () => {
  const { testId } = useParams();
  const navigate = useNavigate();

  // State-Management
  const [vocabList, setVocabList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [fehlerListe, setFehlerListe] = useState([]); // Speichert die falsch beantworteten Vokabeln

  useEffect(() => {
    fetchVocabs();
  }, [testId]);

  // 1. Vokabeln laden
  const fetchVocabs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vokabeln') // Tabellenname für deine Vokabeln anpassen
      .select('*')
      .eq('vokabel_test_id', testId);

    if (error) {
      console.error('Fehler beim Laden der Vokabeln:', error.message);
    } else if (data && data.length > 0) {
      // Vokabel-Reihenfolge mischen
      const shuffledVocabs = [...data].sort(() => Math.random() - 0.5);
      setVocabList(shuffledVocabs);
      generateOptions(shuffledVocabs, 0);
    }
    setLoading(false);
  };

  // 2. Multiple-Choice-Antworten generieren (4 Optionen)
  const generateOptions = (list, index) => {
    if (index >= list.length) return;

    const currentVocab = list[index];
    
    // 3 zufällige, FALSCHE Antworten aus der restlichen Liste holen
    const incorrectOptions = list
      .filter((v) => v.id !== currentVocab.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map(v => v.uebersetzung); // Spaltenname für die deutsche Übersetzung anpassen

    // Richtige Antwort hinzufügen und alles mischen
    const allOptions = [...incorrectOptions, currentVocab.uebersetzung].sort(() => Math.random() - 0.5);
    setOptions(allOptions);
  };

  // Klick auf eine Antwort verarbeiten
  const handleAnswer = (selectedAnswer) => {
    const currentVocab = vocabList[currentQuestionIndex];
    const isCorrect = selectedAnswer === currentVocab.uebersetzung;

    if (isCorrect) {
      setScore(prev => prev + 1);
    } else {
      setFehlerListe(prev => [...prev, currentVocab]);
    }

    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex < vocabList.length) {
      setCurrentQuestionIndex(nextIndex);
      generateOptions(vocabList, nextIndex);
    } else {
      // Test ist fertig
      setIsFinished(true);
      // Letztes Ergebnis mit übergeben, da der State asynchron updatet
      saveResults(
        isCorrect ? score + 1 : score, 
        isCorrect ? fehlerListe : [...fehlerListe, currentVocab]
      );
    }
  };

  // 3. Ergebnisse in Supabase speichern
  const saveResults = async (finalScore, finalFehlerListe) => {
    // Aktuellen Nutzer abfragen (wegen auth.uid() Policies wichtig!)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // A) In 'lern_attempts' speichern
    const { data: attemptData, error: attemptError } = await supabase
      .from('lern_attempts')
      .insert([{
        user_id: user.id,
        vokabel_test_id: testId,
        score: finalScore,
        total_questions: vocabList.length
      }])
      .select()
      .single();

    if (attemptError || !attemptData) {
      console.error('Fehler beim Speichern des Versuchs:', attemptError);
      return;
    }

    const attemptId = attemptData.id;

    if (finalFehlerListe.length > 0) {
      // B) In 'lern_attempt_fehler' speichern
      const fehlerInserts = finalFehlerListe.map(v => ({
        attempt_id: attemptId,
        vokabel_id: v.id
      }));
      await supabase.from('lern_attempt_fehler').insert(fehlerInserts);

      // C) In 'lern_falsche_woerter' speichern (Upsert, falls das Wort schon mal falsch war)
      const falscheWoerterInserts = finalFehlerListe.map(v => ({
        user_id: user.id,
        vokabel_id: v.id
      }));
      // onConflict sorgt dafür, dass bei bestehender Kombi kein Error fliegt, sondern upgedatet wird
      await supabase.from('lern_falsche_woerter').upsert(falscheWoerterInserts, { onConflict: 'user_id, vokabel_id' });
    }
  };

  // --- UI RENDERING ---
  
  if (loading) return <div className="p-8 text-center text-gray-600">Lade Vokabeln...</div>;
  if (vocabList.length === 0) return <div className="p-8 text-center text-red-500">Keine Vokabeln für diesen Test gefunden.</div>;

  if (isFinished) {
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-xl shadow-md text-center">
        <h2 className="text-3xl font-bold mb-4 text-gray-800">Test beendet! 🎉</h2>
        <p className="text-xl mb-6">Du hast <span className="font-bold text-blue-600">{score}</span> von {vocabList.length} richtig.</p>
        <button
          onClick={() => navigate('/lernen')}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
        >
          Zurück zur Übersicht
        </button>
      </div>
    );
  }

  const currentVocab = vocabList[currentQuestionIndex];

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-xl shadow-md">
      <div className="flex justify-between items-center mb-6 text-sm text-gray-500 font-medium">
        <span>Frage {currentQuestionIndex + 1} von {vocabList.length}</span>
        <span>Score: {score}</span>
      </div>
      
      {/* Das gesuchte Fremdwort */}
      <h2 className="text-4xl font-extrabold text-center mb-8 text-gray-800">
        {currentVocab.begriff} 
      </h2>

      <div className="grid grid-cols-1 gap-3">
        {options.map((option, idx) => (
          <button
            key={idx}
            onClick={() => handleAnswer(option)}
            className="w-full text-left bg-gray-50 hover:bg-blue-50 hover:border-blue-300 border-2 border-gray-100 p-4 rounded-lg text-lg font-medium transition-all"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
};

export default MultipleChoicePage;
