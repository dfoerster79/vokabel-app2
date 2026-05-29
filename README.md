# VokabelApp

KI-gestützte Vokabel-App als PWA – React + Vite + Supabase

## Deployment

Das Projekt wird über **Vercel** deployed (Projekt `vokabel-app2`).

Erforderliche Umgebungsvariablen in Vercel:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Tech-Stack

| Bereich | Paket |
|---|---|
| Framework | React + Vite |
| Routing | react-router-dom |
| State | Zustand (persisted) |
| Backend/Auth | Supabase |
| PWA | vite-plugin-pwa |
| Forms | react-hook-form |
| Icons | lucide-react |
| KI | openai |

## Modulstruktur

- Authentifizierung & Registrierung
- Fachspezifische Kurs-Zuordnung
- Vokabelset-Verwaltung
- Lern- & Testmodul
- KI-Modul (OpenAI)
- Schuljahreswechsel-Logik
- PWA (offline-fähig, iOS & Android)
