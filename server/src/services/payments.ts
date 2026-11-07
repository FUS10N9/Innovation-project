import type { User } from '@supabase/supabase-js'
import { env, gatewayFlags } from '../config.js'
import { HttpError } from '../lib/http.js'
import { admin, userRpc } from '../lib/supabase.js'
import { verifyCashfreeWebhook, verifyRazorpayCheckout, verifyRazorpayWebhook } from './signatures.js'

type TaskRecord = {
  id: string
  title: string
  status: string
  task_type: 'fixed' | 'hourly'
  budget: number | null
  hourly_rate: number | null
  final_amount: number | null
  requester_id: string
  helper_id: string | null
  viewer_role: string
  payment: {
    id: string
    status: string
    payment_provider: string | null
    provider_reference: string | null
    verification: string | null
  } | null
}

type PaymentRow = {
  id: string
  task_id: string
  payer_id: string
  receiver_id: string
  amount: number
  status: string
  verification: string | null
  payment_provider: string | null
  provider_reference: string | null
}

function agreedAmount(task: TaskRecord) {
  if (task.final_amount) return Number(task.final_amount)
  if (task.task_type === 'fixed' && task.budget) return Number(task.budget)
  return null
}

async function loadPayableTask(token: string, user: User, taskId: string) {
  const task = await userRpc<TaskRecord>(token, 'get_task', { p_task_id: taskId })
  if (task.viewer_role !== 'requester') throw new HttpError(403, 'Only the requester can start an in-app payment')
  if (!['completion_pending', 'completed'].includes(task.status)) {
    throw new HttpError(400, 'In-app payment opens once the work is ready to be confirmed')
  }
  if (!task.helper_id) throw new HttpError(400, 'Assign a helper before paying')
  const amount = agreedAmount(task)
  if (!amount) throw new HttpError(400, 'The final amount is not agreed yet')
  if (task.payment?.status === 'paid') throw new HttpError(409, 'This task already has a confirmed payment')
  if (user.id !== task.requester_id) throw new HttpError(403, 'Only the requester can start an in-app payment')
  return { task, amount }
}

async function notifyVerified(payment: PaymentRow, title: string) {
  const { data: receiver } = await admin
    .from('users')
    .select('notification_settings')
    .eq('id', payment.receiver_id)
    .maybeSingle()
  const settings = receiver?.notification_settings as { tasks?: boolean } | null
  if (settings?.tasks === false) return
  await admin.from('notifications').insert({
    user_id: payment.receiver_id,
    title: 'Payment verified',
    message: `A payment for "${title}" was verified by the payment provider.`,
    type: 'payment',
    related_task_id: payment.task_id,
  })
  await admin.from('notifications').insert({
    user_id: payment.payer_id,
    title: 'Payment verified',
    message: `Your payment for "${title}" was verified by the payment provider.`,
    type: 'payment',
    related_task_id: payment.task_id,
  })
}

export async function markGatewayPayment(reference: string, provider: string, status: 'paid' | 'refunded', providerPaymentId?: string) {
  const { data: payment } = await admin
    .from('payments')
    .select('*')
    .eq('payment_provider', provider)
    .eq('provider_reference', reference)
    .maybeSingle()
  if (!payment) return { ignored: true }
  if (payment.status === status) return { ignored: false, already: true }
  const { error } = await admin
    .from('payments')
    .update({
      status,
      verification: status === 'paid' ? 'gateway_verified' : payment.verification,
      provider_payment_id: providerPaymentId || payment.provider_payment_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payment.id)
  if (error) throw new HttpError(500, 'The payment record could not be updated')
  if (status === 'paid' || status === 'refunded') {
    await admin.from('tasks').update({ payment_status: status, updated_at: new Date().toISOString() }).eq('id', payment.task_id)
    const { data: task } = await admin.from('tasks').select('title').eq('id', payment.task_id).maybeSingle()
    if (status === 'paid') await notifyVerified(payment as PaymentRow, task?.title || 'your task')
  }
  return { ignored: false }
}

export async function createGatewayOrder(token: string, user: User, taskId: string, provider: 'razorpay' | 'cashfree') {
  const { task, amount } = await loadPayableTask(token, user, taskId)
  const { data: pending } = await admin
    .from('payments')
    .select('*')
    .eq('task_id', taskId)
    .not('payment_provider', 'is', null)
    .eq('status', 'pending')
    .maybeSingle()
  if (pending && pending.payment_provider !== provider) {
    throw new HttpError(409, 'A payment is already in progress for this task')
  }

  if (provider === 'razorpay') {
    if (!gatewayFlags.razorpay) throw new HttpError(503, 'Razorpay is not configured on the server')
    if (pending?.provider_reference) {
      return { provider, orderId: pending.provider_reference, amount: Number(pending.amount), currency: 'INR', keyId: env.razorpay.keyId }
    }
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: 'INR',
        receipt: taskId.replace(/-/g, '').slice(0, 40),
        notes: { task_id: taskId },
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload.id) {
      console.error('Razorpay order failed', response.status)
      throw new HttpError(502, 'The payment provider did not create an order')
    }
    const { error } = await admin.from('payments').insert({
      task_id: taskId,
      payer_id: task.requester_id,
      receiver_id: task.helper_id,
      amount,
      payment_method: 'gateway',
      payment_provider: 'razorpay',
      provider_reference: payload.id,
      status: 'pending',
    })
    if (error) throw new HttpError(500, 'The payment order could not be saved')
    return { provider, orderId: payload.id as string, amount, currency: 'INR', keyId: env.razorpay.keyId }
  }

  if (!gatewayFlags.cashfree) throw new HttpError(503, 'Cashfree is not configured on the server')
  if (pending) throw new HttpError(409, 'A Cashfree payment is already in progress for this task')
  const { data: payer } = await admin.from('users').select('phone, email, full_name').eq('id', user.id).maybeSingle()
  if (!payer?.phone) throw new HttpError(400, 'Add a phone number in settings before using Cashfree')
  const orderId = `nook_${taskId.replace(/-/g, '').slice(0, 18)}_${Date.now().toString(36)}`
  const host = env.cashfree.env === 'production' ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com'
  const response = await fetch(`${host}/pg/orders`, {
    method: 'POST',
    headers: {
      'x-client-id': env.cashfree.clientId,
      'x-client-secret': env.cashfree.clientSecret,
      'x-api-version': '2023-08-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      order_id: orderId,
      order_amount: amount,
      order_currency: 'INR',
      customer_details: {
        customer_id: user.id,
        customer_phone: payer.phone,
        customer_email: payer.email || undefined,
        customer_name: payer.full_name,
      },
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.payment_session_id) {
    console.error('Cashfree order failed', response.status)
    throw new HttpError(502, 'The payment provider did not create an order')
  }
  const { error } = await admin.from('payments').insert({
    task_id: taskId,
    payer_id: task.requester_id,
    receiver_id: task.helper_id,
    amount,
    payment_method: 'gateway',
    payment_provider: 'cashfree',
    provider_reference: orderId,
    status: 'pending',
  })
  if (error) throw new HttpError(500, 'The payment order could not be saved')
  return {
    provider,
    orderId,
    paymentSessionId: payload.payment_session_id as string,
    amount,
    currency: 'INR',
    mode: env.cashfree.env,
  }
}

export async function verifyRazorpayPayment(user: User, input: { orderId: string; paymentId: string; signature: string }) {
  if (!env.razorpay.keySecret) throw new HttpError(503, 'Razorpay is not configured on the server')
  if (!verifyRazorpayCheckout(input.orderId, input.paymentId, input.signature, env.razorpay.keySecret)) {
    throw new HttpError(400, 'Payment verification failed')
  }
  const { data: payment } = await admin
    .from('payments')
    .select('*')
    .eq('payment_provider', 'razorpay')
    .eq('provider_reference', input.orderId)
    .maybeSingle()
  if (!payment || payment.payer_id !== user.id) throw new HttpError(404, 'Payment order not found')
  await markGatewayPayment(input.orderId, 'razorpay', 'paid', input.paymentId)
  return { status: 'paid', verification: 'gateway_verified' }
}

export async function handleRazorpayWebhook(raw: Buffer, signature: string | undefined) {
  if (!env.razorpay.webhookSecret) throw new HttpError(503, 'Razorpay webhooks are not configured')
  if (!verifyRazorpayWebhook(raw, signature, env.razorpay.webhookSecret)) {
    throw new HttpError(400, 'Invalid webhook signature')
  }
  const event = JSON.parse(raw.toString('utf8'))
  const payment = event?.payload?.payment?.entity
  const refund = event?.payload?.refund?.entity
  if (event?.event === 'payment.captured' && payment?.order_id) {
    await markGatewayPayment(payment.order_id, 'razorpay', 'paid', payment.id)
  } else if (event?.event === 'refund.processed' && (refund?.order_id || payment?.order_id)) {
    await markGatewayPayment(refund?.order_id || payment?.order_id, 'razorpay', 'refunded', refund?.id)
  }
  return { ok: true }
}

export async function handleCashfreeWebhook(raw: Buffer, signature: string | undefined, timestamp: string | undefined) {
  const secret = env.cashfree.webhookSecret || env.cashfree.clientSecret
  if (!secret) throw new HttpError(503, 'Cashfree webhooks are not configured')
  if (!verifyCashfreeWebhook(raw, signature, timestamp, secret)) {
    throw new HttpError(400, 'Invalid webhook signature')
  }
  const event = JSON.parse(raw.toString('utf8'))
  const orderId = event?.data?.order?.order_id
  const paymentStatus = event?.data?.payment?.payment_status
  const paymentId = event?.data?.payment?.cf_payment_id ? String(event.data.payment.cf_payment_id) : undefined
  if (!orderId) return { ok: true, ignored: true }
  if (paymentStatus === 'SUCCESS' || event?.type === 'PAYMENT_SUCCESS_WEBHOOK') {
    await markGatewayPayment(orderId, 'cashfree', 'paid', paymentId)
  }
  if (paymentStatus === 'REFUNDED' || event?.type === 'REFUND_STATUS_WEBHOOK') {
    await markGatewayPayment(orderId, 'cashfree', 'refunded', paymentId)
  }
  return { ok: true }
}
