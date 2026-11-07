export const DISCOVERY_RADII: number[]
export const RADIUS_OPTIONS: Array<{ meters: number; label: string }>
export function isAllowedRadius(value: number): boolean
export const TASK_STATUS_LABELS: Record<string, string>
export const APPLICATION_STATUS_LABELS: Record<string, string>
export const PAYMENT_METHOD_LABELS: Record<string, string>
export const PAYMENT_STATUS_LABELS: Record<string, string>
export const REPORT_REASONS: Array<{ id: string; label: string }>
export const ACTIVITY_TABS: Array<{ id: string; label: string }>
export const SORT_OPTIONS: Array<{ id: string; label: string }>
export function paymentVerificationLabel(verification: string | null | undefined): string
export function normalizeSupabaseUrl(input: string): string
