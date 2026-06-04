import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/authStore.js'

/**
 * Liest die Rolle des eingeloggten Nutzers aus der Tabelle `profiles`.
 * Erwartete Tabelle in Supabase:
 *   profiles (id uuid references auth.users, rolle text default 'schueler', vorname text, nachname text,
 *             bundesland text, ort text, schule_id uuid)
 *
 * Gibt zurück: { rolle: 'schueler'|'lehrer'|'admin', loading, profile }
 */
export function useRole() {
  const user = useAuthStore(s => s.user)
  const [rolle, setRolle] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }

    supabase
      .from('profiles')
      .select('rolle, vorname, nachname, bundesland, ort, schule_id')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          // Fallback: Spalten bundesland/ort/schule_id fehlen evtl. noch in DB
          // Zweiter Versuch nur mit Basisspalten
          return supabase
            .from('profiles')
            .select('rolle, vorname, nachname')
            .eq('id', user.id)
            .single()
            .then(({ data: fallbackData }) => {
              if (fallbackData) {
                setRolle(fallbackData.rolle)
                setProfile({ ...fallbackData, bundesland: null, ort: null, schule_id: null })
              } else {
                setRolle('schueler')
                setProfile({ rolle: 'schueler', vorname: '', nachname: '', bundesland: null, ort: null, schule_id: null })
              }
              setLoading(false)
            })
        }
        if (data) { setRolle(data.rolle); setProfile(data) }
        else {
          setRolle('schueler')
          setProfile({ rolle: 'schueler', vorname: '', nachname: '', bundesland: null, ort: null, schule_id: null })
        }
        setLoading(false)
      })
  }, [user])

  return { rolle, profile, loading }
}
