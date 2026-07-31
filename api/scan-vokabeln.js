import OpenAI from "openai";

// Gültige Wortart-IDs (müssen mit der DB-Tabelle wortarten übereinstimmen)
const GUELTIGE_WORTARTEN = [
  "noun", "verb", "adjective", "adverb", "pronoun",
  "preposition", "conjunction", "determiner", "numeral",
  "interjection", "particle", "phrase", "other"
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { imageBase64, sprache } = req.body;

  if (!imageBase64 || !sprache) {
    return res.status(400).json({ error: "imageBase64 und sprache sind erforderlich" });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Du bist ein Vokabel-Erkennungs-Assistent f\u00fcr Schulb\u00fccher.
Analysiere dieses Bild einer Schulbuchseite f\u00fcr das Fach ${sprache}.

Aufgaben:
1. Extrahiere ALLE Vokabelpaare (${sprache} \u2192 Deutsch)
2. Erkenne die Seitenzahl (steht unten links oder rechts in der Ecke)
3. Markiere Eintr\u00e4ge als ki_unsicher=true wenn das Bild unscharf oder der Text schwer lesbar ist
4. Bestimme f\u00fcr jedes Wort die grammatische Wortart als wortart_id.
   Verwende NUR einen dieser exakten Werte:
   - "noun"        = Nomen / Substantiv (z.B. house, maison, amor)
   - "verb"        = Verb (z.B. to run, parler, amare) \u2013 auch Phrasal Verbs und Verb-Wendungen
   - "adjective"   = Adjektiv (z.B. fast, grand, bonus)
   - "adverb"      = Adverb (z.B. quickly, tr\u00e8s, saepe)
   - "pronoun"     = Pronomen (z.B. he, lui, ille)
   - "preposition" = Pr\u00e4position (z.B. in, avec, in+Abl.)
   - "conjunction" = Konjunktion (z.B. and, mais, et)
   - "determiner"  = Artikel / Determinativ (z.B. the, un, le)
   - "numeral"     = Zahlwort (z.B. five, cinq, quinque)
   - "interjection"= Interjektion / Ausruf (z.B. oh!, ah!)
   - "particle"    = Partikel (z.B. ne...pas, nicht-flektierbare W\u00f6rter)
   - "phrase"      = Feste Wendung / Redewendung / Satzfragment (z.B. On y va!, au revoir)
   - "other"       = Sonstiges / unklar
5. Gib au\u00dferdem wortart_konfidenz als Dezimalzahl zwischen 0.0 und 1.0 an
   (1.0 = absolut sicher, 0.5 = unsicher, unter 0.5 nur bei echten Zweifsf\u00e4llen)

Antworte NUR als g\u00fcltiges JSON in exakt diesem Format:
{
  "seitenzahl": "42",
  "vokabeln": [
    {
      "original": "house",
      "uebersetzung": "das Haus",
      "beispielsatz": "",
      "ki_unsicher": false,
      "wortart_id": "noun",
      "wortart_konfidenz": 0.99
    }
  ]
}`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 3000,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content);

    // Sicherheits-Validierung: wortart_id auf g\u00fcltige Werte beschr\u00e4nken
    if (Array.isArray(result.vokabeln)) {
      result.vokabeln = result.vokabeln.map(v => ({
        ...v,
        wortart_id: GUELTIGE_WORTARTEN.includes(v.wortart_id) ? v.wortart_id : "other",
        wortart_konfidenz: (typeof v.wortart_konfidenz === "number" && v.wortart_konfidenz >= 0 && v.wortart_konfidenz <= 1)
          ? Math.round(v.wortart_konfidenz * 1000) / 1000
          : null
      }));
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error("OpenAI Fehler:", error);
    return res.status(500).json({ error: "KI-Scan fehlgeschlagen: " + error.message });
  }
}
