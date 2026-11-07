import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeSupabaseUrl } from '../../shared/constants.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
dotenv.config({ path: path.join(root, '.env') })

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill in the Supabase values.`)
  }
  return value
}

const supabaseUrl = normalizeSupabaseUrl(required('SUPABASE_URL'))
const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

export const env = {
  port: Number(process.env.PORT || 5000),
  supabaseUrl,
  publishableKey: required('SUPABASE_PUBLISHABLE_KEY'),
  secretKey: required('SUPABASE_SECRET_KEY'),
  origins,
  emailFrom: process.env.EMAIL_FROM || 'Nabor <onboarding@resend.dev>',
  resendKey: process.env.RESEND_API_KEY?.trim() || '',
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID?.trim() || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET?.trim() || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || '',
  },
  cashfree: {
    clientId: process.env.CASHFREE_CLIENT_ID?.trim() || '',
    clientSecret: process.env.CASHFREE_CLIENT_SECRET?.trim() || '',
    webhookSecret: process.env.CASHFREE_WEBHOOK_SECRET?.trim() || '',
    env: process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox',
  },
}

export const gatewayFlags = {
  razorpay: Boolean(env.razorpay.keyId && env.razorpay.keySecret),
  cashfree: Boolean(env.cashfree.clientId && env.cashfree.clientSecret),
}
