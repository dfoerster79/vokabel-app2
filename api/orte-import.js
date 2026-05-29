// Vercel Serverless Function – Streaming via SSE
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.VITE_SUPABASE_URL || '')
  .replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, '')
  .replace(/\/$/, '')
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

// key = numerischer Bundesland-Schlüssel laut openplzapi.org/de/FederalStates
// kuerzel = ISO 3166-2 Kürzel, wird in der DB gespeichert
const BUNDESLAENDER = [
  { key: '01', kuerzel: 'SH', name: 'Schleswig-Holstein' },
  { key: '02', kuerzel: 'HH', name: 'Hamburg' },
  { key: '03', kuerzel: 'NI', name: 'Niedersachsen' },
  { key: '04', kuerzel: 'HB', name: 'Bremen' },
  { key: '05', kuerzel: 'NW', name: 'Nordrhein-Westfalen' },
  { key: '06', kuerzel: 'HE', name: 'Hessen' },
  { key: '07', kuerzel: 'RP', name: 'Rheinland-Pfalz' },
  { key: '08', kuerzel: 'BW', name: 'Baden-Württemberg' },
  { key: '09', kuerzel: 'BY', name: 'Bayern' },
  { key: '10', kuerzel: 'SL', name: 'Saarland' },
  { key: '11', kuerzel: 'BE', name: 'Berlin' },
  { key: '12', kuerzel: 'BB', name: 'Brandenburg' },
  { key: '13', kuerzel: 'MV', name: 'Mecklenburg-Vorpommern' },
  { key: '14', kuerzel: 'SN', name: 'Sachsen' },
  { key: '15', kuerzel: 'ST', name: 'Sachsen-Anhalt' },
  { key: '16', kuerzel: 'TH', name: 'Thüringen' },
]

// OpenPLZ API – alle Orte eines Bundeslandes (paginiert)
async function fetchOrteForState(apiKey) {
  let all = []
  let page = 1
  const pageSize = 500
  while (true) {
    const url = `https://openplzapi.org/de/FederalStates/${apiKey}/Localities?page=${page}&pageSize=${pageSize}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status} für Key ${apiKey}`)
    const items = await res.json()
    const arr = Array.isArray(items) ? items : (items.data ?? [])
    all = all.concat(arr)
    if (arr.length < pageSize) break
    page++
  }
  return all
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  if (!supabaseUrl || !supabaseSecretKey) {
    return res.status(500).json({ error: 'Supabase-Konfiguration fehlt.' })
  }

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

  const BATCH = 100
  let totalImported = 0
  let totalErrors = 0

  send({ type: 'start', total: BUNDESLAENDER.length })

  for (let i = 0; i < BUNDESLAENDER.length; i++) {
    const { key, kuerzel, name } = BUNDESLAENDER[i]

    send({ type: 'state_start', kuerzel, name, index: i })

    let orte = []
    try {
      orte = await fetchOrteForState(key)
    } catch (e) {
      send({ type: 'log', kuerzel, msg: `❌ Abruf-Fehler: ${e.message}` })
      send({ type: 'state_done', kuerzel, name, total: 0, imported: 0, errors: 1, index: i })
      totalErrors++
      continue
    }

    // Deduplizierung nach postalCode + name
    const uniqueMap = new Map()
    for (const o of orte) {
      const uniqueKey = `${o.postalCode ?? ''}_${o.name ?? ''}`
      if (!uniqueMap.has(uniqueKey)) uniqueMap.set(uniqueKey, o)
    }
    const unique = Array.from(uniqueMap.values())
    const dupCount = orte.length - unique.length
    if (dupCount > 0) {
      send({ type: 'log', kuerzel, msg: `⚠️ ${dupCount} Duplikate entfernt` })
    }

    let blImported = 0
    let blErrors = 0

    for (let b = 0; b < unique.length; b += BATCH) {
      const batch = unique.slice(b, b + BATCH).map(o => ({
        plz:        o.postalCode ?? null,
        name:       o.name ?? null,
        bundesland: kuerzel,
      }))

      try {
        const { error } = await supabase
          .from('orte')
          .upsert(batch, { onConflict: 'plz,name', ignoreDuplicates: false })

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
