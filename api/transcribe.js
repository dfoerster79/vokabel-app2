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
    const { audioBase64, language } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: 'Missing audio data' });
    }

    const buffer = Buffer.from(audioBase64, 'base64');
    
    // Construct raw multipart/form-data to avoid external dependencies
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    let body = '';
    
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`;
    
    if (language && language !== 'null') {
      const langCode = language.split('-')[0];
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="language"\r\n\r\n${langCode}\r\n`;
    }
    
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="audio.webm"\r\n`;
    body += `Content-Type: audio/webm\r\n\r\n`;

    const payload = Buffer.concat([
      Buffer.from(body, 'utf-8'),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
    ]);

    const openAiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: payload
    });

    if (!openAiRes.ok) {
      const text = await openAiRes.text();
      console.error('OpenAI Error:', text);
      return res.status(openAiRes.status).json({ error: text });
    }

    const data = await openAiRes.json();
    return res.status(200).json({ text: data.text });
  } catch (error) {
    console.error('Transcription error:', error);
    return res.status(500).json({ error: error.message });
  }
}