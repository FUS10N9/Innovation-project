import assert from 'node:assert/strict'
import test from 'node:test'
import { assertSafeContent } from '../../../shared/safety.js'
import { isAllowedRadius, normalizeSupabaseUrl } from '../../../shared/constants.js'

test('blocks contact details and unsupported services', () => {
  assert.equal(assertSafeContent('Walk my dog this evening'), null)
  assert.match(assertSafeContent('Email me at ada@example.com') || '', /email/i)
  assert.match(assertSafeContent('Call 9812345678 when you arrive') || '', /phone/i)
  assert.match(assertSafeContent('Need electrical rewiring in the kitchen') || '', /cannot safely support/i)
})

test('normalises the Supabase project URL and discovery radius', () => {
  assert.equal(
    normalizeSupabaseUrl('https://example.supabase.co/rest/v1/'),
    'https://example.supabase.co',
  )
  assert.equal(isAllowedRadius(1000), true)
  assert.equal(isAllowedRadius(1500), false)
})
