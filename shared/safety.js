/** Phrases for services this marketplace cannot safely mediate. Keep in sync with assert_safe_text() in the database migration. */
export const PROHIBITED_TERMS = [
  'firearm',
  'ammunition',
  'explosive',
  'cocaine',
  'heroin',
  'methamphetamine',
  'childcare',
  'babysitting',
  'escort service',
  'phishing',
  'locksmith',
  'electrical rewiring',
  'gas fitting',
  'prescription medication',
  'controlled substance',
  'fake passport',
  'counterfeit',
  'weapon delivery',
  'break into account',
]

export function findProhibitedTerm(text) {
  const value = String(text || '').toLowerCase()
  return PROHIBITED_TERMS.find((term) => value.includes(term)) || null
}

export function containsContactInfo(text) {
  const value = String(text || '')
  const email = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
  const longNumber = /\d{10,}/
  return email.test(value) || longNumber.test(value)
}

/** @returns {string | null} A person-facing error, or null when the text is allowed. */
export function assertSafeContent(text) {
  if (containsContactInfo(text)) {
    return 'Remove phone numbers and email addresses. You can message each other in the app after you connect.'
  }
  if (findProhibitedTerm(text)) {
    return 'This request includes a service Nabor cannot safely support.'
  }
  return null
}
