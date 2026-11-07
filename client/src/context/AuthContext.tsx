import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { api } from '@/lib/api'
import { isConfigured, supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'

type AuthValue = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  profileError: Error | null
  configured: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(isConfigured)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setAuthLoading(false)
      if (!next) queryClient.removeQueries({ queryKey: ['me'] })
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  const profileQuery = useQuery({
    queryKey: ['me', session?.user.id],
    enabled: Boolean(session),
    queryFn: () => api<Profile>('/me'),
  })

  async function signOut() {
    await supabase?.auth.signOut()
    queryClient.clear()
  }

  return (
    <AuthContext.Provider value={{
      session,
      profile: profileQuery.data ?? null,
      loading: authLoading || Boolean(session && profileQuery.isLoading),
      profileError: profileQuery.error instanceof Error ? profileQuery.error : null,
      configured: isConfigured,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is missing')
  return value
}
