export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { audioBase64, language, prompt } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: 'Missing audio data' });
    }

    const buffer = Buffer.from(audioBase64, 'base64');

    // BUG 1 FIX: FormData korrekt zusammenbauen mit binary-safe Buffer-Konkatenation.
    // Vorher wurde der binary-Audio-Buffer nach einem String-body als UTF-8 enkodiert,
    // was die Audiodaten korrumpierte und Whisper konnte nichts erkennen.
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    const CRLF = '\r\n';

    const parts = [];

    // model
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="model"${CRLF}${CRLF}` +
      `whisper-1${CRLF}`,
      'utf-8'
    ));

    // BUG 2 FIX: language war 'de' (vom Frontend), wurde aber auf 'de'.split('-')[0] = 'de' reduziert –
    // das war eigentlich OK. ABER: Der prompt enthält die deutsche Übersetzung, und language='de'
    // zwang Whisper auf Deutsch. Schüler sprechen die DEUTSCHE Übersetzung – language='de' ist richtig.
    // Problem war, dass language manchmal als undefined ankam. Jetzt Fallback auf 'de'.
    const langCode = (language && language !== 'null' && language !== 'undefined')
      ? language.split('-')[0]
      : 'de';
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="language"${CRLF}${CRLF}` +
      `${langCode}${CRLF}`,
      'utf-8'
    ));

    // prompt (hilft Whisper beim Kontext)
    if (prompt) {
      parts.push(Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="prompt"${CRLF}${CRLF}` +
        `${prompt}${CRLF}`,
        'utf-8'
      ));
    }

    // audio file header
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="audio.webm"${CRLF}` +
      `Content-Type: audio/webm${CRLF}${CRLF}`,
      'utf-8'
    ));

    // audio binary (DIREKT als Buffer, kein String-Encoding!)
    parts.push(buffer);

    // closing boundary
    parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf-8'));

    const payload = Buffer.concat(parts);

    const openAiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(payload.length),
      },
      body: payload,
    });

    if (!openAiRes.ok) {
      const text = await openAiRes.text();
      console.error('OpenAI Error:', openAiRes.status, text);
      return res.status(openAiRes.status).json({ error: text });
    }

    const data = await openAiRes.json();
    console.log('Whisper result:', data.text, '| prompt was:', prompt);
    return res.status(200).json({ text: data.text });
  } catch (error) {
    console.error('Transcription error:', error);
    return res.status(500).json({ error: error.message });
  }
}
