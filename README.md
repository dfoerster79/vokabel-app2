# VokabelApp

KI-gestützte Vokabel-App als PWA – React + Vite + Supabase

## Lokale Entwicklung

```bash
npm install
cp .env.example .env.local   # Supabase-Keys eintragen
npm run dev
```

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
