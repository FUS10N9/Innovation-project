import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge, Card, EmptyState } from '@/components/ui'
import { api } from '@/lib/api'
import { money, payMethod, payStatus, paymentVerificationLabel } from '@/lib/format'

type Earnings = {
  verified_total: number
  reported_total: number
  pending_total: number
  payments: Array<{
    id: string
    task_id: string
    task_title: string
    amount: number
    status: string
    payment_method: string
    verification: string | null
    label: string
    direction: 'received' | 'paid'
    created_at: string
  }>
  awaiting_record: Array<{ task_id: string; title: string; amount: number; payment_method: string; payment_status: string }>
}

export function EarningsPage() {
  const earnings = useQuery({ queryKey: ['earnings'], queryFn: () => api<Earnings>('/earnings') })
  if (earnings.isLoading) return <p>Loading earnings…</p>
  if (earnings.error || !earnings.data) return <EmptyState title="Earnings unavailable" body={earnings.error?.message || 'Try again.'} />
  const data = earnings.data
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-4xl">Earnings</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-mute">Verified totals come from a payment provider after the server checks the signature or webhook. Reported totals were confirmed by the two people and are not independently verified.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card><p className="text-sm text-mute">Verified received</p><p className="mt-1 text-2xl font-semibold">{money(data.verified_total)}</p></Card>
        <Card><p className="text-sm text-mute">Self-reported received</p><p className="mt-1 text-2xl font-semibold">{money(data.reported_total)}</p></Card>
        <Card><p className="text-sm text-mute">Pending received</p><p className="mt-1 text-2xl font-semibold">{money(data.pending_total)}</p></Card>
      </div>
      {data.awaiting_record.length ? (
        <section className="space-y-3">
          <h2 className="font-display text-2xl">Waiting for a record</h2>
          {data.awaiting_record.map((item) => (
            <Link key={item.task_id} to={`/tasks/${item.task_id}`} className="block"><Card><strong>{item.title}</strong><p className="text-sm text-mute">{money(item.amount)} · {payMethod(item.payment_method)} · {payStatus(item.payment_status)}</p></Card></Link>
          ))}
        </section>
      ) : null}
      <section className="space-y-3">
        <h2 className="font-display text-2xl">History</h2>
        {data.payments.length === 0 ? <EmptyState title="No payments yet" body="Completed tasks can record cash or UPI here." /> : data.payments.map((payment) => (
          <Link key={payment.id} to={`/tasks/${payment.task_id}`} className="block">
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{payment.task_title}</h3>
                  <p className="text-sm text-mute">{payment.direction === 'received' ? 'Received' : 'Paid'} · {payMethod(payment.payment_method)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{money(payment.amount)}</p>
                  <Badge tone={payment.verification === 'gateway_verified' ? 'pine' : 'amber'}>{paymentVerificationLabel(payment.verification)}</Badge>
                  <p className="mt-1 text-xs text-mute">{payStatus(payment.status)}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  )
}
