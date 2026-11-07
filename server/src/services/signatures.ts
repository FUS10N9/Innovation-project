import { createHmac, timingSafeEqual } from 'node:crypto'

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function razorpayCheckoutSignature(orderId: string, paymentId: string, secret: string) {
  return createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
}

export function verifyRazorpayCheckout(orderId: string, paymentId: string, signature: string, secret: string) {
  return safeEqual(razorpayCheckoutSignature(orderId, paymentId, secret), signature)
}

export function verifyRazorpayWebhook(rawBody: Buffer, signature: string | undefined, secret: string) {
  if (!signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  return safeEqual(expected, signature)
}

export function verifyCashfreeWebhook(
  rawBody: Buffer,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string,
) {
  if (!signature || !timestamp) return false
  const expected = createHmac('sha256', secret).update(timestamp + rawBody.toString('utf8')).digest('base64')
  return safeEqual(expected, signature)
}
