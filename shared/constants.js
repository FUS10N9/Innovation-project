export const DISCOVERY_RADII = [500, 1000, 3000, 5000]

export const RADIUS_OPTIONS = [
  { meters: 500, label: '500 m' },
  { meters: 1000, label: '1 km' },
  { meters: 3000, label: '3 km' },
  { meters: 5000, label: '5 km' },
]

export function isAllowedRadius(value) {
  return DISCOVERY_RADII.includes(Number(value))
}

export const TASK_STATUS_LABELS = {
  open: 'Open',
  applications_received: 'Applications in',
  assigned: 'Assigned',
  in_progress: 'In progress',
  completion_pending: 'Awaiting confirmation',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
}

export const APPLICATION_STATUS_LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
  closed: 'Closed',
}

export const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  upi: 'UPI',
  gateway: 'In-app',
}

export const PAYMENT_STATUS_LABELS = {
  unpaid: 'Unpaid',
  pending: 'Pending confirmation',
  paid: 'Paid',
  refunded: 'Refunded',
  disputed: 'Disputed',
}

export const REPORT_REASONS = [
  { id: 'safety', label: 'Safety concern' },
  { id: 'spam', label: 'Spam' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'scam', label: 'Scam or misleading request' },
  { id: 'prohibited', label: 'Prohibited service' },
  { id: 'other', label: 'Something else' },
]

export const ACTIVITY_TABS = [
  { id: 'posted', label: 'Posted' },
  { id: 'applied', label: 'Applied' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
]

export const SORT_OPTIONS = [
  { id: 'nearest', label: 'Nearest' },
  { id: 'latest', label: 'Latest' },
  { id: 'budget', label: 'Highest budget' },
  { id: 'recommended', label: 'Recommended' },
]

export function paymentVerificationLabel(verification) {
  if (verification === 'gateway_verified') return 'Verified by payment provider'
  if (verification === 'self_reported') return 'Self-reported'
  return 'Not verified'
}

export function normalizeSupabaseUrl(input) {
  if (!input) return ''
  return String(input)
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/, '')
    .replace(/\/auth\/v1$/, '')
}
