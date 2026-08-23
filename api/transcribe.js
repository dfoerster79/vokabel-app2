import OpenAI, { toFile } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { audioBase64, language = 'de', prompt = '', mimeType = '' } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'Keine Audio-Daten empfangen' });
    }

    const buffer = Buffer.from(audioBase64, 'base64');

    if (buffer.length === 0) {
      return res.status(400).json({ error: 'Audio-Puffer ist leer' });
    }

    // Dateiendung und MIME-Type robust ermitteln (besonders für iOS Safari audio/mp4 vs Chrome audio/webm)
    let filename = 'audio.webm';
    let detectedType = mimeType || 'audio/webm';

    // Magic Bytes Prüfung
    const isMp4 = (buffer.length >= 12 && buffer.subarray(4, 8).toString('utf8') === 'ftyp') ||
                  mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac');
    const isOgg = buffer.length >= 4 && buffer.subarray(0, 4).toString('utf8') === 'OggS';
    const isWav = buffer.length >= 4 && buffer.subarray(0, 4).toString('utf8') === 'RIFF';

    if (isMp4) {
      filename = 'audio.mp4';
      detectedType = 'audio/mp4';
    } else if (isOgg) {
      filename = 'audio.ogg';
      detectedType = 'audio/ogg';
    } else if (isWav) {
      filename = 'audio.wav';
      detectedType = 'audio/wav';
    } else {
      filename = 'audio.webm';
      detectedType = 'audio/webm';
    }

    const file = await toFile(buffer, filename, { type: detectedType });

    const response = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language,
      prompt: prompt ? `Die Antwort ist wahrscheinlich: ${prompt}` : undefined,
    });

    return res.status(200).json({ text: response.text || '' });
  } catch (error) {
    console.error('Whisper transcription error:', error);
    const status = error.status || 500;
    return res.status(status).json({
      error: error.message || 'Whisper Transkription fehlgeschlagen',
      details: error.error || null,
    });
  }
}
