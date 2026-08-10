# 📚 Projektdokumentation – vokabel-app2

> **Zweck dieser Datei:** Schneller Kontext-Überblick für KI-Assistenten (z. B. Perplexity, Claude, ChatGPT) zu Beginn eines neuen Gesprächs. Einfach den Inhalt dieser Datei einfügen oder darauf verweisen.

---

## 🧭 Projekt-Überblick

| Feld | Wert |
|------|------|
| **Name** | vokabel-app2 |
| **Beschreibung** | KI-gestützte Vokabel-Lern-App als PWA für Schulen |
| **Typ** | Progressive Web App (PWA) |
| **Version** | 0.0.1 (aktiv in Entwicklung) |
| **GitHub** | https://github.com/dfoerster79/vokabel-app2 |
| **Live-URL** | https://project-22hkn.vercel.app |
| **Letzter Commit** | 2026-07-31 |

---

## 🛠️ Tech-Stack

| Schicht | Technologie |
|---------|-------------|
| **Frontend-Framework** | React 18 + Vite 5 |
| **Sprache** | JavaScript (JSX) |
| **Styling** | Tailwind CSS (via CDN in index.html) |
| **Routing** | React Router DOM v6 |
| **State Management** | Zustand (authStore) |
| **Formulare** | React Hook Form |
| **Icons** | Lucide React |
| **Backend/DB** | Supabase (PostgreSQL + Auth + Storage) |
| **KI-Integration** | OpenAI API (Foto-Scan von Vokabeln) |
| **HTTP-Client** | Axios |
| **Hosting** | Vercel |
| **PWA-Plugin** | vite-plugin-pwa |

---

## 📁 Projektstruktur

```
vokabel-app2/
├── api/                          # Vercel Serverless Functions (Node.js)
│   ├── scan-vokabeln.js          # KI-Scan: Foto → Vokabeln via OpenAI
│   ├── schulen-import.js         # Import von Schulen (Admin)
│   └── orte-import.js            # Import von Orten (Admin)
├── public/                       # Statische Assets (PWA-Icons, manifest)
├── src/
│   ├── main.jsx                  # App-Einstiegspunkt
│   ├── App.jsx                   # Routing-Konfiguration
│   ├── index.css                 # Globale CSS-Styles
│   ├── lib/
│   │   └── supabase.js           # Supabase-Client-Initialisierung
│   ├── store/
│   │   └── authStore.js          # Zustand-Store für Auth-State
│   ├── hooks/
│   │   └── useRole.js            # Custom Hook: Benutzerrolle abfragen
│   ├── components/
│   │   └── KlassenVerwaltung.jsx # Komponente: Klassen-Zuordnung pro Fach
│   └── pages/
│       ├── LoginPage.jsx
│       ├── RegisterPage.jsx
│       ├── ProfileSetupPage.jsx
│       ├── ProfilPage.jsx
│       ├── DashboardPage.jsx
│       ├── LernenPage.jsx
│       ├── MultipleChoicePage.jsx
│       ├── FotoTestPage.jsx      # NEU: KI-Foto-Scan-Funktion
│       ├── FaecherPage.jsx
│       ├── SchulenPage.jsx
│       ├── RanglistePage.jsx
│       ├── AdminPage.jsx
│       ├── AdminFachuebersichtPage.jsx
│       ├── SchulenImportPage.jsx
│       ├── OrteImportPage.jsx
│       └── NotFoundPage.jsx
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
├── .env.example
├── README.md
├── SUPABASE_SETUP.md             # SQL-Setup für Supabase-Datenbank
└── PROJEKT_DOKUMENTATION.md     # ← Diese Datei
```

---

## 🗺️ Routen-Übersicht (App.jsx)

| Route | Komponente | Auth-Schutz |
|-------|-----------|-------------|
| `/` | LoginPage | – (Redirect zu /dashboard wenn eingeloggt) |
| `/register` | RegisterPage | – |
| `/profil-einrichten` | ProfileSetupPage | ✅ |
| `/dashboard` | DashboardPage | ✅ |
| `/lernen` | LernenPage | – |
| `/lernen/multiple_choice/:testId` | MultipleChoicePage | – |
| `/neuer-test` | FotoTestPage | ✅ |
| `/profil` | ProfilPage | ✅ |
| `/rangliste` | RanglistePage | – |
| `/admin` | AdminPage | ✅ |
| `/admin/faecher` | FaecherPage | ✅ |
| `/admin/schulen` | SchulenPage | ✅ |
| `/admin/fachuebersicht` | AdminFachuebersichtPage | – |
| `/admin/schulen-import` | SchulenImportPage | ✅ |
| `/admin/orte-import` | OrteImportPage | ✅ |

---

## 🗄️ Supabase Datenbankstruktur (bekannte Tabellen)

### `profiles` (auth.users erweitert)
| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | uuid (PK) | Verknüpft mit auth.users |
| `benutzername` | text (unique) | Anzeigename |
| `vorname` | text | |
| `nachname` | text | |
| `rolle` | text | `schueler`, `lehrer`, `admin` |
| `klasse_pro_fach` | jsonb | Klassen-Zuordnung je Fach (z. B. `{fach_id: {jahrgang, zusatz}}`) |
| `created_at` | timestamptz | |

### Weitere Tabellen (aus Seitencode abgeleitet)
- **`schulen`** – Schulen mit Ort-Zuordnung
- **`orte`** – Ortsdaten (für Schulen)
- **`faecher`** – Unterrichtsfächer
- **`vokabeln`** – Vokabel-Einträge (mit `wortart_id`, `wortart_konfidenz`)
- **`wortarten`** – Wortart-Kategorien (Nomen, Verb, Adjektiv etc.)
- **`tests`** – Vokabel-Tests, verknüpft mit Fach/Schule/Jahrgang

### Row Level Security (RLS)
- Jeder Nutzer kann nur sein eigenes Profil lesen/schreiben
- Rolle kann NICHT selbst geändert werden (nur Admin via Dashboard)

---

## 🤖 KI-Funktionen (OpenAI)

### FotoTestPage.jsx + api/scan-vokabeln.js
- Schüler fotografiert eine Vokabelseite (z. B. aus Schulbuch)
- Bild wird via Vercel Serverless Function an OpenAI Vision API gesendet
- KI extrahiert: Vokabeln, Übersetzungen, **Wortart** (`wortart_id`) und **Konfidenz** (`wortart_konfidenz`)
- Ergebnis wird in Supabase-Tabelle `vokabeln` gespeichert

---

## 🎮 Lernmodi

### LernenPage.jsx
- Zeigt verfügbare Tests gefiltert nach: Schule des Schülers + Jahrgang (aus `klasse_pro_fach`)

### MultipleChoicePage.jsx (`/lernen/multiple_choice/:testId`)
- Multiple-Choice-Abfrage für einen Test
- Antwortoptionen werden nach **gleicher Wortart** gefiltert (sinnvolle Distraktoren)
- Routing mit dynamischer testId

---

## 👥 Rollen-System

| Rolle | Zugang |
|-------|--------|
| `schueler` | Dashboard, Lernen, Rangliste, Profil, FotoTest |
| `lehrer` | + Admin-Bereich (lesend?) |
| `admin` | + Schulen/Orte/Fächer-Verwaltung, Import-Funktionen |

Custom Hook `useRole.js` liefert die Rolle des eingeloggten Nutzers aus dem `profiles`-Eintrag.

---

## 🔗 Externe Dienste & Umgebungsvariablen

```env
# Supabase
VITE_SUPABASE_URL=https://<projekt-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>

# OpenAI (nur in Vercel Serverless Functions, NICHT im Frontend)
OPENAI_API_KEY=<key>
```

---

## 🚀 Deployment

- **Hosting:** Vercel (automatisches Deploy bei Push auf `main`)
- **Build-Befehl:** `vite build`
- **Vercel Serverless Functions:** `/api/`-Ordner wird automatisch als Funktionen erkannt
- **PWA:** Service Worker via `vite-plugin-pwa` – App kann auf Mobilgeräten installiert werden

---

## 📋 Entwicklungshistorie (letzte Commits, Stand 2026-07-31)

| Datum | Beschreibung |
|-------|-------------|
| 2026-07-31 | feat: Multiple-Choice-Antworten auf gleiche Wortart gefiltert |
| 2026-07-31 | feat: Wortart-Erkennung (wortart_id + wortart_konfidenz) im KI-Scan-Prompt |
| 2026-07-31 | feat: Wortart-Erkennung in FotoTestPage integriert |
| 2026-07-26 | fix: Jahrgang fach-spezifisch aus klasse_pro_fach JSONB lesen |
| 2026-07-26 | fix: Tests nach Jahrgang des Schülers filtern |
| 2026-07-26 | fix: fach_id korrekt aus Objekt extrahieren (Henri-Bug) |
| 2026-07-22 | Include Tailwind CSS in index.html |
| 2026-07-22 | Refactor ProfilPage (Passwort, Schule, Ort) |
| 2026-07-21 | Datenfeld `klassen` → `klasse_pro_fach` umbenannt |
| 2026-07-21 | Refactor KlassenVerwaltung-Komponente |

---

## ⚠️ Bekannte Offene Punkte / TODOs

- Kein TypeScript (reines JavaScript/JSX)
- Noch kein automatisiertes Testing
- Admin-Rollenprüfung auf manchen Routen fehlt (z. B. `/admin/fachuebersicht` ohne Auth-Guard)
- PWA-Offline-Funktionalität noch nicht vollständig getestet

---

*Dokumentation automatisch erstellt am 2026-08-10 via Perplexity AI. Bei größeren Änderungen am Projekt bitte diese Datei aktualisieren.*
