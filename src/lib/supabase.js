import { createClient } from '@supabase/supabase-js'

// Vercel's Supabase integration sets SUPABASE_URL / SUPABASE_ANON_KEY (without VITE_ prefix).
// Vite only exposes VITE_-prefixed vars to the browser, so we fall back to the non-prefixed
// versions as well, which are injected by Vercel at build time via its integration.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_PROJECT_URL ||
  import.meta.env.SUPABASE_URL

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_PUBLIC_KEY ||
  import.meta.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase environment variables are not set. ' +
    'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.'
  )
}

// Strip any trailing path segments (e.g. /rest/v1) that Vercel's integration may append
const cleanUrl = supabaseUrl.replace(/\/(rest|auth|storage|realtime)(\/.*)?$/, '')

export const supabase = createClient(cleanUrl, supabaseAnonKey)
