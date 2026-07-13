import OpenAI from "openai";

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
              text: `Du bist ein Vokabel-Erkennungs-Assistent für Schulbücher.
Analysiere dieses Bild einer Schulbuchseite für das Fach ${sprache}.

Aufgaben:
1. Extrahiere ALLE Vokabelpaare (${sprache} → Deutsch)
2. Erkenne die Seitenzahl (steht unten links oder rechts in der Ecke)
3. Markiere Einträge als ki_unsicher=true wenn das Bild unscharf oder der Text schwer lesbar ist

Antworte NUR als gültiges JSON in exakt diesem Format:
{
  "seitenzahl": "42",
  "vokabeln": [
    { "original": "house", "uebersetzung": "das Haus", "beispielsatz": "", "ki_unsicher": false },
    { "original": "...", "uebersetzung": "...", "beispielsatz": "", "ki_unsicher": false }
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
      max_tokens: 2000,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content);
    return res.status(200).json(result);

  } catch (error) {
    console.error("OpenAI Fehler:", error);
    return res.status(500).json({ error: "KI-Scan fehlgeschlagen: " + error.message });
  }
}
