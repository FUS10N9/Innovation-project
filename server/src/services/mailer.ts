import { env } from '../config.js'
import { admin } from '../lib/supabase.js'

export async function maybeEmail(userId: string, subject: string, text: string) {
  if (!env.resendKey || !userId) return
  const { data: user } = await admin
    .from('users')
    .select('email, notification_settings')
    .eq('id', userId)
    .maybeSingle()
  if (!user?.email || user.notification_settings?.email !== true) return
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to: user.email,
        subject,
        text,
      }),
    })
    if (!response.ok) console.error('Email was not accepted', response.status)
  } catch (error) {
    console.error('Email failed', error instanceof Error ? error.message : 'unknown')
  }
}
