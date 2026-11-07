import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizeSupabaseUrl } from '@shared/constants.js'

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL || '')
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

export const isConfigured = Boolean(url && key)
export const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
