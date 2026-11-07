import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import {
  verifyCashfreeWebhook,
  verifyRazorpayCheckout,
  verifyRazorpayWebhook,
} from './signatures.js'

test('verifies a Razorpay checkout signature and rejects a mismatch', () => {
  const secret = 'key_secret'
  const signature = createHmac('sha256', secret).update('order_1|pay_1').digest('hex')
  assert.equal(verifyRazorpayCheckout('order_1', 'pay_1', signature, secret), true)
  assert.equal(verifyRazorpayCheckout('order_1', 'pay_1', signature, 'other'), false)
  assert.equal(verifyRazorpayCheckout('order_1', 'pay_2', signature, secret), false)
})

test('verifies Razorpay and Cashfree webhook signatures', () => {
  const raw = Buffer.from('{"event":"payment.captured"}')
  const secret = 'whsec'
  const razorpay = createHmac('sha256', secret).update(raw).digest('hex')
  assert.equal(verifyRazorpayWebhook(raw, razorpay, secret), true)
  assert.equal(verifyRazorpayWebhook(raw, 'short', secret), false)

  const timestamp = '1710000000'
  const cashfree = createHmac('sha256', secret).update(timestamp + raw.toString('utf8')).digest('base64')
  assert.equal(verifyCashfreeWebhook(raw, cashfree, timestamp, secret), true)
  assert.equal(verifyCashfreeWebhook(raw, cashfree, '1710000001', secret), false)
})
