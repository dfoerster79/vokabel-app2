// Vercel Serverless Function – Streaming via SSE
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.VITE_SUPABASE_URL || '')
  .replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, '')
  .replace(/\/$/, '')
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

const BUNDESLAENDER = [
  { kuerzel: 'BB', name: 'Brandenburg',             key: 'Brandenburg' },
  { kuerzel: 'BE', name: 'Berlin',                  key: 'Berlin' },
  { kuerzel: 'BW', name: 'Baden-Württemberg',       key: 'Baden-Württemberg' },
  { kuerzel: 'BY', name: 'Bayern',                  key: 'Bavaria' },
  { kuerzel: 'HB', name: 'Bremen',                  key: 'Bremen' },
  { kuerzel: 'HE', name: 'Hessen',                  key: 'Hesse' },
  { kuerzel: 'HH', name: 'Hamburg',                 key: 'Hamburg' },
  { kuerzel: 'MV', name: 'Mecklenburg-Vorpommern', key: 'Mecklenburg-Vorpommern' },
  { kuerzel: 'NI', name: 'Niedersachsen',           key: 'Lower Saxony' },
  { kuerzel: 'NW', name: 'Nordrhein-Westfalen',     key: 'North Rhine-Westphalia' },
  { kuerzel: 'RP', name: 'Rheinland-Pfalz',         key: 'Rhineland-Palatinate' },
  { kuerzel: 'SH', name: 'Schleswig-Holstein',      key: 'Schleswig-Holstein' },
  { kuerzel: 'SL', name: 'Saarland',                key: 'Saarland' },
  { kuerzel: 'SN', name: 'Sachsen',                 key: 'Saxony' },
  { kuerzel: 'ST', name: 'Sachsen-Anhalt',          key: 'Saxony-Anhalt' },
  { kuerzel: 'TH', name: 'Thüringen',               key: 'Thuringia' },
]

// OpenPLZ API – alle Orte eines Bundeslandes (paginiert)
async function fetchOrteForState(kuerzel) {
  let all = []
  let page = 1
  const pageSize = 500
  while (true) {
    const url = `https://openplzapi.org/de/FederalStates/${kuerzel}/Localities?page=${page}&pageSize=${pageSize}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status} für ${kuerzel}`)
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
    const { kuerzel, name } = BUNDESLAENDER[i]

    send({ type: 'state_start', kuerzel, name, index: i })

    let orte = []
    try {
      orte = await fetchOrteForState(kuerzel)
    } catch (e) {
      send({ type: 'log', kuerzel, msg: `❌ Abruf-Fehler: ${e.message}` })
      send({ type: 'state_done', kuerzel, name, total: 0, imported: 0, errors: 1, index: i })
      totalErrors++
      continue
    }

    // Deduplizierung nach postalCode + name
    const uniqueMap = new Map()
    for (const o of orte) {
      const key = `${o.postalCode ?? o.zip ?? ''}_${o.name ?? ''}`
      if (!uniqueMap.has(key)) uniqueMap.set(key, o)
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
        plz:        o.postalCode ?? o.zip ?? null,
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
