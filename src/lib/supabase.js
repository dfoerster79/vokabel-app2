import { createClient } from '@supabase/supabase-js'

// Supabase URL – gesetzt in Vercel als VITE_SUPABASE_URL
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

// Publishable Key (ersetzt den alten anon-Key) – sicher fuer den Browser
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY // Fallback fuer alte Deployments

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Supabase Umgebungsvariablen fehlen. ' +
    'Bitte VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY in Vercel setzen.'
  )
}

// Trailing Pfade entfernen (Vercel-Integration haengt manchmal /rest/v1 an)
const cleanUrl = supabaseUrl.replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, '')

export const supabase = createClient(cleanUrl, supabasePublishableKey)
