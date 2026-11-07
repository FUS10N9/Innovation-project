export const PROHIBITED_TERMS: string[]
export function findProhibitedTerm(text: string): string | null
export function containsContactInfo(text: string): boolean
export function assertSafeContent(text: string): string | null
