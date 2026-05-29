// Vercel Serverless Function – laeuft serverseitig, niemals im Browser
// Verwendet SUPABASE_SECRET_KEY (ohne VITE_-Prefix) – umgeht RLS
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, '').replace(/\/$/, '')
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

// Alle 16 Bundesländer aktiv
const BUNDESLAENDER_AKTIV = ['BB','BE','BW','BY','HB','HE','HH','MV','NI','NW','RP','SH','SL','SN','ST','TH']

const BL_NAMEN = {
  BB:'Brandenburg', BE:'Berlin', BW:'Baden-Württemberg', BY:'Bayern',
  HB:'Bremen', HE:'Hessen', HH:'Hamburg', MV:'Mecklenburg-Vorpommern',
  NI:'Niedersachsen', NW:'Nordrhein-Westfalen', RP:'Rheinland-Pfalz',
  SH:'Schleswig-Holstein', SL:'Saarland', SN:'Sachsen', ST:'Sachsen-Anhalt',
  TH:'Thüringen'
}

async function fetchSchulenForState(kuerzel) {
  let all = [], skip = 0
  const limit = 500
  while (true) {
    const url = `https://jedeschule.codefor.de/schools/?state=${kuerzel}&limit=${limit}&skip=${skip}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status} fuer ${kuerzel}`)
    const items = await res.json()
    all = all.concat(Array.isArray(items) ? items : [])
    if (!Array.isArray(items) || items.length < limit) break
    skip += limit
  }
  return all
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  if (!supabaseUrl || !supabaseSecretKey) {
    return res.status(500).json({ error: 'Supabase-Konfiguration fehlt auf dem Server.' })
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey)

  const logs = []
  const addLog = (msg) => logs.push(msg)
  let totalImported = 0
  let totalErrors = 0
  const BATCH = 100

  addLog('🚀 Starte Import über Server-API …')
  addLog(`ℹ️ Aktiver Import: alle 16 Bundesländer`)

  for (const kuerzel of BUNDESLAENDER_AKTIV) {
    const name = BL_NAMEN[kuerzel]
    let schulen = []
    try {
      schulen = await fetchSchulenForState(kuerzel)
    } catch (e) {
      addLog(`${kuerzel}: ❌ Abruf-Fehler: ${e.message}`)
      totalErrors++
      continue
    }

    // Duplikate innerhalb der API-Antwort nach ID entfernen
    const unique = Array.from(new Map(schulen.map(s => [s.id, s])).values())
    const dupCount = schulen.length - unique.length
    if (dupCount > 0) {
      addLog(`${kuerzel}: ⚠️ ${dupCount} Duplikate aus API-Daten entfernt`)
    }

    let blImported = 0
    let blErrors = 0

    for (let i = 0; i < unique.length; i += BATCH) {
      const batch = unique.slice(i, i + BATCH).map(s => ({
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
          addLog(`${kuerzel}: Upsert-Fehler (Batch ${Math.floor(i/BATCH)+1}): ${error.message}`)
          blErrors++
        } else {
          blImported += batch.length
        }
      } catch (e) {
        addLog(`${kuerzel}: Upsert-Exception (Batch ${Math.floor(i/BATCH)+1}): ${e.message}`)
        blErrors++
      }
    }

    totalImported += blImported
    totalErrors += blErrors
    addLog(`✓ ${name}: ${unique.length.toLocaleString('de-DE')} Schulen (${blImported} importiert, ${blErrors} Fehler)`)
  }

  addLog(`Abgeschlossen: ${totalImported.toLocaleString('de-DE')} Schulen importiert, ${totalErrors} Fehler.`)

  return res.status(200).json({ logs, totalImported, totalErrors })
}
