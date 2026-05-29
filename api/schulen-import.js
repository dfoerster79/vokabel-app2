// Vercel Serverless Function – laeuft serverseitig, niemals im Browser
// Verwendet SUPABASE_SECRET_KEY (ohne VITE_-Prefix) – umgeht RLS
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

const BUNDESLAENDER = [
  'BB','BE','BW','BY','HB','HE','HH','MV','NI','NW','RP','SH','SL','SN','ST','TH'
]

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
  // Nur POST erlauben
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  if (!supabaseUrl || !supabaseSecretKey) {
    return res.status(500).json({ error: 'Supabase-Konfiguration fehlt auf dem Server.' })
  }

  // Admin-Client mit Secret Key – umgeht RLS vollstaendig
  const supabase = createClient(supabaseUrl.replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, ''), supabaseSecretKey)

  const logs = []
  const addLog = (msg) => logs.push(msg)
  let totalImported = 0
  let totalErrors = 0
  const BATCH = 100

  addLog('🚀 Starte API-Abgleich von jedeschule.codefor.de …')

  for (const kuerzel of BUNDESLAENDER) {
    const name = BL_NAMEN[kuerzel]
    let schulen = []
    try {
      schulen = await fetchSchulenForState(kuerzel)
    } catch (e) {
      addLog(`${kuerzel}: ❌ Abruf-Fehler: ${e.message}`)
      totalErrors++
      continue
    }

    for (let i = 0; i < schulen.length; i += BATCH) {
      const batch = schulen.slice(i, i + BATCH).map(s => ({
        id:           s.id,
        name:         s.name || null,
        schulart:     s.school_type || null,
        bundesland:   kuerzel,
        ort:          s.city || null,
        plz:          s.zip || null,
        strasse:      s.address || null,
        telefon:      s.phone || null,
        email:        s.email || null,
        website:      s.website || null,
        traeger:      s.provider || null,
        legal_status: s.legal_status || null,
        latitude:     s.latitude || null,
        longitude:    s.longitude || null,
      }))

      const { error } = await supabase
        .from('schulen')
        .upsert(batch, { onConflict: 'id' })

      if (error) {
        addLog(`${kuerzel}: Upsert-Fehler: ${error.message}`)
        totalErrors += batch.length
      } else {
        totalImported += batch.length
      }
    }

    addLog(`✓ ${name}: ${schulen.length.toLocaleString('de-DE')} Schulen`)
  }

  addLog(`Abgeschlossen: ${totalImported.toLocaleString('de-DE')} Schulen importiert, ${totalErrors} Fehler.`)

  return res.status(200).json({ logs, totalImported, totalErrors })
}
