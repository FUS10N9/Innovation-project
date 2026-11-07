import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { TaskMap } from '@/components/map/TaskMap'
import { CategoryIcon } from '@/components/tasks/CategoryIcon'
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Textarea, statusTone } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { distanceLabel, money, payMethod, payStatus, paymentVerificationLabel, priceLabel, taskStatus, whenLabel } from '@/lib/format'
import { readOrigin } from '@/lib/geo'
import { REPORT_REASONS } from '@shared/constants.js'

type TaskDetail = {
  id: string
  title: string
  description: string
  task_type: 'fixed' | 'hourly'
  budget: number | null
  hourly_rate: number | null
  final_amount: number | null
  payment_method: string
  payment_status: string | null
  public_location_label: string
  latitude: number
  longitude: number
  distance_m: number | null
  scheduled_at: string | null
  deadline: string | null
  status: string
  allow_negotiation: boolean
  category_name: string
  category_icon: string
  requester_id: string
  requester_name: string
  requester_avatar: string | null
  requester_rating: number
  requester_rating_count: number
  requester_completed_count: number
  helper_id: string | null
  helper_name: string | null
  application_count: number
  viewer_role: 'requester' | 'helper' | 'applicant' | 'visitor'
  my_application: { id: string; status: string; message: string; proposed_price: number | null } | null
  my_review: { rating: number; comment: string | null } | null
  conversation_id: string | null
  images: Array<{ id: string; url: string }>
  exact_location: { latitude: number; longitude: number; address: string | null } | null
  payment: {
    id: string
    amount: number
    status: string
    payment_method: string
    verification: string | null
    label: string
    confirmed_by_payer: boolean
    confirmed_by_receiver: boolean
    payment_provider: string | null
  } | null
  dispute_reason: string | null
}

export function TaskDetailPage() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const origin = readOrigin()
  const [message, setMessage] = useState('')
  const [price, setPrice] = useState('')
  const [finalAmount, setFinalAmount] = useState('')
  const [reason, setReason] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethodChoice, setPayMethodChoice] = useState<'cash' | 'upi'>('cash')
  const task = useQuery({
    queryKey: ['task', id, origin?.lat, origin?.lng],
    queryFn: () => api<TaskDetail>(`/tasks/${id}?${origin ? `lat=${origin.lat}&lng=${origin.lng}` : ''}`),
  })
  const providers = useQuery({ queryKey: ['providers'], queryFn: () => api<{ razorpay: boolean; cashfree: boolean; razorpayKeyId: string | null; cashfreeMode: string }>('/payments/providers') })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['task', id] })
  const run = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: () => { toast.success('Saved'); refresh() },
    onError: (error) => toast.error(error.message),
  })
  if (task.isLoading) return <p className="text-sm text-mute">Loading task…</p>
  if (task.error || !task.data) return <EmptyState title="Task unavailable" body={task.error?.message || 'This task is not open to you.'} />
  const item = task.data
  const point = item.exact_location
    ? { lat: item.exact_location.latitude, lng: item.exact_location.longitude }
    : { lat: item.latitude, lng: item.longitude }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_.8fr]">
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-pine-50 px-2 py-1 text-xs text-pine-800"><CategoryIcon name={item.category_icon} className="h-3.5 w-3.5" />{item.category_name}</span>
            <Badge tone={statusTone(item.status)}>{taskStatus(item.status)}</Badge>
          </div>
          <h1 className="font-display text-4xl">{item.title}</h1>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-mute">{item.description}</p>
        </div>
        {item.images.length ? <div className="flex gap-2 overflow-x-auto">{item.images.map((image) => <img key={image.id} src={image.url} alt="" className="h-40 rounded-2xl object-cover" />)}</div> : null}
        <div className="h-72">
          <TaskMap center={point} circleMeters={item.exact_location ? undefined : 180} markers={item.exact_location ? [{ id: item.id, lat: point.lat, lng: point.lng, title: 'Meeting spot' }] : []} />
        </div>
        <p className="text-sm text-mute">{item.exact_location ? `Exact spot, visible only to you and the assigned helper: ${item.exact_location.address}` : `Approximate area around ${item.public_location_label}. ${item.distance_m != null ? distanceLabel(item.distance_m) + ' from your chosen place.' : ''}`}</p>
      </div>
      <div className="space-y-4">
        <Card>
          <p className="text-2xl font-semibold text-pine-800">{priceLabel(item)}</p>
          <p className="text-sm text-mute">{payMethod(item.payment_method)} · {item.allow_negotiation ? 'Price can be discussed' : 'Fixed offer'}</p>
          <p className="mt-3 text-sm">{whenLabel(item.scheduled_at)} {item.deadline ? `· due ${whenLabel(item.deadline)}` : ''}</p>
          <p className="mt-1 text-sm text-mute">{item.application_count} application{item.application_count === 1 ? '' : 's'}</p>
          <Link to={`/profile/${item.requester_id}`} className="mt-4 flex items-center gap-3">
            <Avatar name={item.requester_name} url={item.requester_avatar} />
            <span>
              <span className="block font-medium">{item.requester_name}</span>
              <span className="text-sm text-mute">{item.requester_rating_count ? `${Number(item.requester_rating).toFixed(1)} ★ · ${item.requester_rating_count} reviews` : 'New'} · {item.requester_completed_count} done</span>
            </span>
          </Link>
        </Card>
        {item.viewer_role === 'visitor' && ['open', 'applications_received'].includes(item.status) ? (
          <Card>
            <h2 className="font-semibold">Apply</h2>
            <Field label="Introduction"><Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Say how you can help." /></Field>
            {item.allow_negotiation ? <Field label="Proposed price, optional"><Input type="number" value={price} onChange={(event) => setPrice(event.target.value)} /></Field> : null}
            <Button className="mt-3" disabled={run.isPending} onClick={() => run.mutate(() => api(`/tasks/${item.id}/apply`, { method: 'POST', body: { message, proposed_price: price ? Number(price) : null } }))}>Apply</Button>
          </Card>
        ) : null}
        {item.my_application ? <Card><p className="text-sm">Your application is <strong>{item.my_application.status}</strong>.</p>{item.my_application.status === 'pending' ? <Button className="mt-3" variant="secondary" onClick={() => run.mutate(() => api(`/applications/${item.my_application!.id}/withdraw`, { method: 'POST' }))}>Withdraw</Button> : null}</Card> : null}
        {item.viewer_role === 'requester' ? (
          <Card className="space-y-3">
            <Link to={`/tasks/${item.id}/applications`} className="text-sm font-medium text-pine-800">Review applications</Link>
            {['open', 'applications_received', 'assigned'].includes(item.status) ? <Button variant="secondary" onClick={() => setCancelOpen(true)}>Cancel task</Button> : null}
          </Card>
        ) : null}
        {item.viewer_role === 'helper' && item.status === 'assigned' ? <Button onClick={() => run.mutate(() => api(`/tasks/${item.id}/start`, { method: 'POST' }))}>Mark started</Button> : null}
        {item.viewer_role === 'helper' && item.status === 'in_progress' ? (
          <Card>
            <Field label="Final amount (INR)"><Input type="number" value={finalAmount} onChange={(event) => setFinalAmount(event.target.value)} /></Field>
            <Button className="mt-3" onClick={() => run.mutate(() => api(`/tasks/${item.id}/complete`, { method: 'POST', body: { final_amount: Number(finalAmount) } }))}>Submit completion</Button>
          </Card>
        ) : null}
        {item.viewer_role === 'requester' && item.status === 'completion_pending' ? (
          <Card>
            <p className="text-sm">The helper submitted {money(item.final_amount)}.</p>
            <Button className="mt-3" onClick={() => run.mutate(() => api(`/tasks/${item.id}/confirm`, { method: 'POST' }))}>Confirm completion</Button>
          </Card>
        ) : null}
        {item.conversation_id ? <Link to={`/messages/${item.conversation_id}`} className="inline-flex rounded-full bg-pine-600 px-4 py-2.5 text-sm text-white">Open messages</Link> : null}
        {['assigned', 'in_progress', 'completion_pending'].includes(item.status) && item.viewer_role !== 'visitor' ? (
          <Card>
            <Field label="Report a problem"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
            <Button className="mt-3" variant="danger" onClick={() => run.mutate(() => api(`/tasks/${item.id}/dispute`, { method: 'POST', body: { reason } }))}>Submit dispute</Button>
          </Card>
        ) : null}
        {item.dispute_reason ? <p className="text-sm text-red-800">Dispute: {item.dispute_reason}</p> : null}
        {item.status === 'completed' && !item.my_review && item.viewer_role !== 'visitor' ? <ReviewForm taskId={item.id} onDone={refresh} /> : null}
        {item.viewer_role !== 'visitor' && item.helper_id ? (
          <Card>
            <h2 className="font-semibold">Payment</h2>
            <p className="mt-1 text-sm text-mute">{item.payment ? `${payStatus(item.payment.status)} · ${paymentVerificationLabel(item.payment.verification)}` : `No payment recorded yet. Task status: ${payStatus(item.payment_status || 'unpaid')}.`}</p>
            {item.payment?.verification === 'self_reported' ? <p className="mt-2 text-sm">Payer confirmed: {item.payment.confirmed_by_payer ? 'yes' : 'no'} · Helper confirmed: {item.payment.confirmed_by_receiver ? 'yes' : 'no'}</p> : null}
            <div className="mt-3 space-y-3">
              <Field label="Amount"><Input type="number" value={payAmount} onChange={(event) => setPayAmount(event.target.value)} /></Field>
              <Select value={payMethodChoice} onChange={(event) => setPayMethodChoice(event.target.value as 'cash' | 'upi')}><option value="cash">Cash</option><option value="upi">UPI</option></Select>
              <Button variant="secondary" onClick={() => run.mutate(() => api('/payments/direct', { method: 'POST', body: { task_id: item.id, amount: Number(payAmount || item.final_amount || item.budget || item.hourly_rate), method: payMethodChoice } }))}>Record {profile?.id === item.requester_id ? 'payment' : 'receipt'}</Button>
              {profile?.id === item.requester_id && providers.data?.razorpay ? <Button onClick={() => run.mutate(() => startRazorpay(item.id, providers.data!.razorpayKeyId, profile))}>Pay with Razorpay</Button> : null}
              {profile?.id === item.requester_id && providers.data?.cashfree ? <Button variant="secondary" onClick={() => run.mutate(() => startCashfree(item.id, providers.data!.cashfreeMode))}>Pay with Cashfree</Button> : null}
              {profile?.id === item.requester_id && !providers.data?.razorpay && !providers.data?.cashfree ? <p className="text-sm text-mute">In-app checkout is not configured. Cash and UPI records stay self-reported until both people confirm.</p> : null}
            </div>
          </Card>
        ) : null}
        <Button variant="ghost" onClick={() => setReportOpen(true)}>Report</Button>
      </div>
      {reportOpen ? <ReportModal taskId={item.id} userId={item.viewer_role === 'requester' ? item.helper_id : item.requester_id} onClose={() => setReportOpen(false)} /> : null}
      {cancelOpen ? <Modal title="Cancel this task" onClose={() => setCancelOpen(false)}><Field label="Reason"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Field><Button className="mt-3" variant="danger" onClick={() => run.mutate(async () => { await api(`/tasks/${item.id}/cancel`, { method: 'POST', body: { reason } }); setCancelOpen(false) })}>Cancel task</Button></Modal> : null}
    </div>
  )
}

function ReviewForm({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  return (
    <Card>
      <h2 className="font-semibold">Leave a review</h2>
      <div className="mt-2 flex gap-1">{[1, 2, 3, 4, 5].map((value) => <button key={value} className={value <= rating ? 'text-pine-700' : 'text-stone-300'} onClick={() => setRating(value)}>★</button>)}</div>
      <Textarea className="mt-3" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Optional comment" />
      <Button className="mt-3" onClick={async () => {
        try {
          await api('/reviews', { method: 'POST', body: { task_id: taskId, rating, comment } })
          toast.success('Review saved')
          onDone()
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not save the review')
        }
      }}>Publish review</Button>
    </Card>
  )
}

function ReportModal({ taskId, userId, onClose }: { taskId: string; userId: string | null; onClose: () => void }) {
  const [reason, setReason] = useState('safety')
  const [description, setDescription] = useState('')
  return (
    <Modal title="Report" onClose={onClose}>
      <Select value={reason} onChange={(event) => setReason(event.target.value)}>{REPORT_REASONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select>
      <Textarea className="mt-3" value={description} onChange={(event) => setDescription(event.target.value)} />
      <Button className="mt-3" onClick={async () => {
        try {
          await api('/reports', { method: 'POST', body: { task_id: taskId, reported_user_id: userId, reason, description } })
          toast.success('Report sent')
          onClose()
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not send the report')
        }
      }}>Send report</Button>
    </Modal>
  )
}

async function startRazorpay(taskId: string, keyId: string | null, profile: { full_name: string; email: string; phone: string | null }) {
  const order = await api<{ orderId: string; amount: number; currency: string; keyId: string }>('/payments/orders', { method: 'POST', body: { task_id: taskId, provider: 'razorpay' } })
  await loadScript('https://checkout.razorpay.com/v1/checkout.js')
  const Razorpay = (window as unknown as { Razorpay: new (options: unknown) => { open: () => void } }).Razorpay
  const checkout = new Razorpay({
    key: keyId || order.keyId,
    amount: Math.round(order.amount * 100),
    currency: order.currency,
    order_id: order.orderId,
    name: 'Nabor',
    prefill: { name: profile.full_name, email: profile.email, contact: profile.phone || undefined },
    handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
      await api('/payments/verify/razorpay', {
        method: 'POST',
        body: { orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature },
      })
      toast.success('Payment verified by Razorpay')
    },
  })
  checkout.open()
}

async function startCashfree(taskId: string, mode: string) {
  const order = await api<{ paymentSessionId: string }>('/payments/orders', { method: 'POST', body: { task_id: taskId, provider: 'cashfree' } })
  await loadScript('https://sdk.cashfree.com/js/v3/cashfree.js')
  const Cashfree = (window as unknown as { Cashfree: (options: { mode: string }) => { checkout: (options: { paymentSessionId: string; redirectTarget: string }) => Promise<unknown> } }).Cashfree
  await Cashfree({ mode }).checkout({ paymentSessionId: order.paymentSessionId, redirectTarget: '_modal' })
  toast.message('Waiting for Cashfree to confirm the payment. It is not paid until the status changes.')
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('The payment checkout could not be loaded'))
    document.body.appendChild(script)
  })
}

type Application = {
  id: string
  message: string
  proposed_price: number | null
  status: string
  created_at: string
  helper_id: string
  helper_name: string
  helper_avatar: string | null
  helper_rating: number
  helper_rating_count: number
  helper_completed_count: number
  helper_bio: string | null
  skills: string[]
}

export function ApplicationsPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const applications = useQuery({ queryKey: ['applications', id], queryFn: () => api<Application[]>(`/tasks/${id}/applications`) })
  const action = useMutation({
    mutationFn: (input: { applicationId: string; type: 'accept' | 'reject' }) => api(`/applications/${input.applicationId}/${input.type}`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Application updated')
      queryClient.invalidateQueries({ queryKey: ['applications', id] })
    },
    onError: (error) => toast.error(error.message),
  })
  if (applications.isLoading) return <p>Loading applications…</p>
  if (applications.error) return <EmptyState title="Applications are private" body={applications.error.message} />
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Applications</h1>
      {!applications.data?.length ? <EmptyState title="No applications yet" body="People nearby can apply while the task is open." /> : null}
      {applications.data?.map((application) => (
        <Card key={application.id}>
          <div className="flex items-start justify-between gap-3">
            <Link to={`/profile/${application.helper_id}`} className="flex items-center gap-3">
              <Avatar name={application.helper_name} url={application.helper_avatar} />
              <span>
                <span className="block font-medium">{application.helper_name}</span>
                <span className="text-sm text-mute">{application.helper_rating_count ? `${Number(application.helper_rating).toFixed(1)} ★` : 'New'} · {application.helper_completed_count} completed</span>
              </span>
            </Link>
            <Badge>{application.status}</Badge>
          </div>
          <p className="mt-3 text-sm leading-6">{application.message}</p>
          {application.proposed_price ? <p className="mt-2 text-sm font-medium">Proposed {money(application.proposed_price)}</p> : null}
          {application.skills?.length ? <p className="mt-2 text-xs text-mute">{application.skills.join(' · ')}</p> : null}
          {application.status === 'pending' ? (
            <div className="mt-4 flex gap-2">
              <Button onClick={() => action.mutate({ applicationId: application.id, type: 'accept' })}>Accept</Button>
              <Button variant="secondary" onClick={() => action.mutate({ applicationId: application.id, type: 'reject' })}>Decline</Button>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  )
}
