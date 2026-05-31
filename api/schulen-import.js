// Vercel Serverless Function – Streaming via SSE
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.VITE_SUPABASE_URL || '')
  .replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, '')
  .replace(/\/$/, '')
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

const BUNDESLAENDER = [
  { kuerzel: 'BB', name: 'Brandenburg' },
  { kuerzel: 'BE', name: 'Berlin' },
  { kuerzel: 'BW', name: 'Baden-Württemberg' },
  { kuerzel: 'BY', name: 'Bayern' },
  { kuerzel: 'HB', name: 'Bremen' },
  { kuerzel: 'HE', name: 'Hessen' },
  { kuerzel: 'HH', name: 'Hamburg' },
  { kuerzel: 'MV', name: 'Mecklenburg-Vorpommern' },
  { kuerzel: 'NI', name: 'Niedersachsen' },
  { kuerzel: 'NW', name: 'Nordrhein-Westfalen' },
  { kuerzel: 'RP', name: 'Rheinland-Pfalz' },
  { kuerzel: 'SH', name: 'Schleswig-Holstein' },
  { kuerzel: 'SL', name: 'Saarland' },
  { kuerzel: 'SN', name: 'Sachsen' },
  { kuerzel: 'ST', name: 'Sachsen-Anhalt' },
  { kuerzel: 'TH', name: 'Thüringen' },
]

function normalizeOrt(val) {
  if (!val) return null
  const trimmed = String(val).trim()
  return trimmed.length > 0 ? trimmed : null
}

async function fetchSchulenForState(kuerzel) {
  let all = [], skip = 0
  const limit = 500
  while (true) {
    const url = `https://jedeschule.codefor.de/schools/?state=${kuerzel}&limit=${limit}&skip=${skip}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status} für ${kuerzel}`)
    const items = await res.json()
    all = all.concat(Array.isArray(items) ? items : [])
    if (!Array.isArray(items) || items.length < limit) break
    skip += limit
  }
  return all
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  if (!supabaseUrl || !supabaseSecretKey) {
    return res.status(500).json({ error: 'Supabase-Konfiguration fehlt.' })
  }

  const debugState = req.query?.debug || null

  const supabase = createClient(supabaseUrl, supabaseSecretKey)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
    if (res.flush) res.flush()
  }

  const zuImportieren = debugState
    ? BUNDESLAENDER.filter(b => b.kuerzel === debugState)
    : BUNDESLAENDER

  const BATCH = 100
  let totalImported = 0
  let totalErrors = 0

  send({ type: 'start', total: zuImportieren.length })

  for (let i = 0; i < zuImportieren.length; i++) {
    const { kuerzel, name } = zuImportieren[i]

    send({ type: 'state_start', kuerzel, name, index: i })

    let schulen = []
    try {
      schulen = await fetchSchulenForState(kuerzel)
    } catch (e) {
      send({ type: 'log', kuerzel, msg: `❌ Abruf-Fehler: ${e.message}` })
      send({ type: 'state_done', kuerzel, name, imported: 0, errors: 1, index: i })
      totalErrors++
      continue
    }

    send({ type: 'log', kuerzel, msg: `📦 API lieferte ${schulen.length} Einträge (vor Deduplizierung)` })

    // DEBUG: Zirndorf in den ROHDATEN (vor Deduplizierung)
    const zirndorfRoh = schulen.filter(s =>
      (s.city && s.city.toLowerCase().includes('zirndorf')) ||
      (s.name && s.name.toLowerCase().includes('zirndorf'))
    )
    if (zirndorfRoh.length > 0) {
      send({ type: 'log', kuerzel, msg: `✅ Zirndorf in Rohdaten: ${zirndorfRoh.length} Einträge` })
      zirndorfRoh.forEach(s => {
        send({ type: 'log', kuerzel, msg: `   id="${s.id}" | name="${s.name}" | city="${s.city}"` })
      })
    } else {
      send({ type: 'log', kuerzel, msg: `❌ Zirndorf NICHT in Rohdaten – API liefert diese Schulen gar nicht!` })
      // Zeige alle verfügbaren Städte als Stichprobe (erste 20)
      const staedte = [...new Set(schulen.map(s => s.city).filter(Boolean))].slice(0, 20)
      send({ type: 'log', kuerzel, msg: `   Stichprobe Städte: ${staedte.join(', ')}` })
    }

    // Deduplizierung: Map behält letzten Eintrag pro ID
    const idMap = new Map()
    for (const s of schulen) {
      idMap.set(s.id, s)
    }
    const unique = Array.from(idMap.values())
    const dupCount = schulen.length - unique.length

    if (dupCount > 0) {
      send({ type: 'log', kuerzel, msg: `⚠️ ${dupCount} Duplikate entfernt (${schulen.length} → ${unique.length})` })
    }

    // DEBUG: Zirndorf nach Deduplizierung
    const zirndorfNach = unique.filter(s =>
      (s.city && s.city.toLowerCase().includes('zirndorf')) ||
      (s.name && s.name.toLowerCase().includes('zirndorf'))
    )
    if (zirndorfRoh.length > 0 && zirndorfNach.length === 0) {
      send({ type: 'log', kuerzel, msg: `❌ Zirndorf durch Deduplizierung verloren! IDs wurden überschrieben.` })
    } else if (zirndorfNach.length > 0) {
      send({ type: 'log', kuerzel, msg: `✅ Zirndorf nach Deduplizierung noch vorhanden: ${zirndorfNach.length} Schulen` })
    }

    let blImported = 0
    let blErrors = 0

    for (let b = 0; b < unique.length; b += BATCH) {
      const batch = unique.slice(b, b + BATCH).map(s => ({
        id:         s.id,
        name:       s.name || null,
        schulart:   s.school_type || null,
        bundesland: kuerzel,
        ort:        normalizeOrt(s.city),
        adresse:    [s.address, s.zip, s.city].filter(Boolean).join(', ') || null,
      }))

      try {
        const { error } = await supabase
          .from('schulen')
          .upsert(batch, { onConflict: 'id', ignoreDuplicates: false })

        if (error) {
          blErrors++
          send({ type: 'log', kuerzel, msg: `Batch-Fehler: ${error.message}` })
        } else {
          blImported += batch.length
        }
      } catch (e) {
        blErrors++
      }
    }

    totalImported += blImported
    totalErrors += blErrors

    send({
      type: 'state_done',
      kuerzel, name,
      total: unique.length,
      imported: blImported,
      errors: blErrors,
      index: i,
    })
  }

  send({ type: 'done', totalImported, totalErrors })
  res.end()
}
