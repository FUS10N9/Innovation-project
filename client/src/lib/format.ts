import { format, parseISO } from 'date-fns'
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, TASK_STATUS_LABELS, paymentVerificationLabel } from '@shared/constants.js'

export function money(value: number | string | null | undefined, hourly = false) {
  if (value === null || value === undefined || value === '') return '—'
  const amount = Number(value)
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
  return hourly ? `${formatted}/hr` : formatted
}

export function distanceLabel(meters?: number | null) {
  if (meters === null || meters === undefined) return 'Nearby'
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)} m`
  const km = meters / 1000
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

export function whenLabel(iso?: string | null) {
  if (!iso) return 'Flexible time'
  return format(parseISO(iso), 'd MMM, h:mm a')
}

export function ageFromDob(dob?: string | null) {
  if (!dob) return null
  const [year, month, day] = dob.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  const today = new Date()
  let age = today.getFullYear() - year
  const monthDelta = today.getMonth() + 1 - month
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < day)) age -= 1
  return age
}

export function taskStatus(status: string) {
  return TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_LABELS] || status
}

export function payMethod(method: string) {
  return PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] || method
}

export function payStatus(status: string) {
  return PAYMENT_STATUS_LABELS[status as keyof typeof PAYMENT_STATUS_LABELS] || status
}

export { paymentVerificationLabel }

export function priceLabel(task: { task_type: string; budget: number | null; hourly_rate: number | null }) {
  return task.task_type === 'hourly' ? money(task.hourly_rate, true) : money(task.budget)
}
