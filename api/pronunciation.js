const toScore = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const firstNumber = (...values) => {
  for (const value of values) {
    const score = toScore(value);
    if (score !== null) return score;
  }
  return null;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { audioBase64, referenceText, language = 'de-DE' } = req.body || {};
    if (!audioBase64) {
      return res.status(400).json({ error: 'Keine Audio-Daten empfangen' });
    }
    if (!referenceText || !String(referenceText).trim()) {
      return res.status(400).json({ error: 'Kein Referenztext empfangen' });
    }
    if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_ENDPOINT) {
      return res.status(500).json({ error: 'Azure Speech ist auf dem Server nicht konfiguriert' });
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    if (!audioBuffer.length) {
      return res.status(400).json({ error: 'Audio-Puffer ist leer' });
    }

    const endpoint = process.env.AZURE_SPEECH_ENDPOINT.replace(/\/+$/, '');
    const url = `${endpoint}/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(language)}&format=detailed`;
    const assessmentConfig = {
      ReferenceText: String(referenceText).trim(),
      GradingSystem: 'HundredMark',
      Granularity: 'Word',
      Dimension: 'Comprehensive',
      EnableMiscue: true,
    };
    const assessmentHeader = Buffer.from(JSON.stringify(assessmentConfig), 'utf8').toString('base64');

    const azureResponse = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json;text/xml',
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY,
        'Pronunciation-Assessment': assessmentHeader,
      },
      body: audioBuffer,
    });

    const responseText = await azureResponse.text();
    let payload;
    try {
      payload = JSON.parse(responseText);
    } catch (_) {
      payload = { error: responseText };
    }

    if (!azureResponse.ok) {
      console.error('Azure Speech response error:', azureResponse.status, payload);
      return res.status(azureResponse.status).json({
        error: payload.error?.message || payload.error || 'Azure Speech Anfrage fehlgeschlagen',
      });
    }

    if (payload.RecognitionStatus && payload.RecognitionStatus !== 'Success') {
      return res.status(422).json({
        error: `Azure konnte die Aufnahme nicht erkennen (${payload.RecognitionStatus})`,
      });
    }

    const best = payload.NBest?.[0] || {};
    const nested = best.PronunciationAssessment || {};
    const text = best.Display || best.ITN || payload.DisplayText || payload.RecognitionText || '';
    const pronunciationScore = firstNumber(
      best.PronScore,
      best.PronunciationScore,
      nested.PronScore,
      nested.PronunciationScore,
    );
    const accuracyScore = firstNumber(best.AccuracyScore, nested.AccuracyScore);
    const fluencyScore = firstNumber(best.FluencyScore, nested.FluencyScore);
    const completenessScore = firstNumber(best.CompletenessScore, nested.CompletenessScore);

    return res.status(200).json({
      text,
      pronunciationScore,
      accuracyScore,
      fluencyScore,
      completenessScore,
    });
  } catch (error) {
    console.error('Azure pronunciation assessment error:', error);
    return res.status(500).json({
      error: error.message || 'Azure Aussprachebewertung fehlgeschlagen',
    });
  }
}
