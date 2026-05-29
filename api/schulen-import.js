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

  const supabase = createClient(supabaseUrl, supabaseSecretKey)

  // Server-Sent Events Headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
    if (res.flush) res.flush()
  }

  const BATCH = 100
  let totalImported = 0
  let totalErrors = 0

  send({ type: 'start', total: BUNDESLAENDER.length })

  for (let i = 0; i < BUNDESLAENDER.length; i++) {
    const { kuerzel, name } = BUNDESLAENDER[i]

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

    const unique = Array.from(new Map(schulen.map(s => [s.id, s])).values())
    const dupCount = schulen.length - unique.length
    if (dupCount > 0) {
      send({ type: 'log', kuerzel, msg: `⚠️ ${dupCount} Duplikate entfernt` })
    }

    let blImported = 0
    let blErrors = 0

    for (let b = 0; b < unique.length; b += BATCH) {
      const batch = unique.slice(b, b + BATCH).map(s => ({
        id:         s.id,
        name:       s.name || null,
        schulart:   s.school_type || null,
        bundesland: kuerzel,
        ort:        s.city || null,
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
