import { supabase } from './supabase'

const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!supabase) throw new ApiError(500, 'Add the Supabase URL and publishable key to .env.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const response = await fetch(`${base}/api${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, payload.error || 'Something went wrong')
  return payload as T
}

export async function uploadImage(bucket: 'avatars' | 'task-images' | 'message-attachments', file: File) {
  if (!supabase) throw new Error('Supabase is not configured')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Use a JPG, PNG, or WebP image')
  }
  const max = bucket === 'avatars' ? 2 : 5
  if (file.size > max * 1024 * 1024) throw new Error(`Use an image under ${max} MB`)
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) throw new Error('Sign in to upload')
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type })
  if (error) throw new Error(error.message)
  if (bucket === 'message-attachments') return path
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
