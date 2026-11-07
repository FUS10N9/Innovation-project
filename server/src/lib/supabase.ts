import { createClient, type User } from '@supabase/supabase-js'
import { env } from '../config.js'
import { HttpError, safeDbMessage } from './http.js'

export const admin = createClient(env.supabaseUrl, env.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export async function userRpc<T>(token: string, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: env.publishableKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const text = await response.text()
  let body: { message?: string; code?: string; error?: string } | null = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = { message: text }
    }
  }
  if (!response.ok) {
    const message = body?.message || body?.error || 'Request failed'
    if (body?.code === 'PGRST202' || /does not exist|schema cache/i.test(message)) {
      throw new HttpError(503, 'Apply the SQL migrations in supabase/migrations before using Nabor.')
    }
    console.error(`rpc ${fn} failed`, response.status)
    throw new HttpError(response.status === 401 ? 401 : 400, safeDbMessage(message))
  }
  return body as T
}

export async function userRest(token: string, path: string, init: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
    method: init.method || 'GET',
    headers: {
      apikey: env.publishableKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (!response.ok) {
    const text = await response.text()
    let message = 'Request failed'
    try {
      message = JSON.parse(text).message || message
    } catch {
      message = text || message
    }
    throw new HttpError(response.status === 401 ? 401 : 400, safeDbMessage(message))
  }
}

export type AuthContext = { token: string; user: User }

export async function readUser(authorization?: string): Promise<AuthContext | null> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  return { token, user: data.user }
}

export async function requireUser(authorization?: string) {
  const auth = await readUser(authorization)
  if (!auth) throw new HttpError(401, 'Sign in to continue')
  return auth
}

export async function requireAdmin(auth: AuthContext) {
  const { data, error } = await admin
    .from('users')
    .select('role, is_suspended')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (error?.code === '42P01' || /does not exist/i.test(error?.message || '')) {
    throw new HttpError(503, 'Apply the SQL migrations in supabase/migrations before using Nabor.')
  }
  if (error || !data || data.role !== 'admin' || data.is_suspended) {
    throw new HttpError(403, 'You do not have access to this area')
  }
}
