import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/authStore.js'

/**
 * Liest die Rolle des eingeloggten Nutzers aus der Tabelle `profiles`.
 * Erwartete Tabelle in Supabase:
 *   profiles (id uuid references auth.users, rolle text default 'schueler', vorname text, nachname text)
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
        if (data) { setRolle(data.rolle); setProfile(data) }
        else { setRolle('schueler') } // Fallback
        setLoading(false)
      })
  }, [user])

  return { rolle, profile, loading }
}
