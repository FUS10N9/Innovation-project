import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { LocationPicker } from '@/components/map/LocationPicker'
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui'
import { api, uploadImage } from '@/lib/api'
import { priceLabel } from '@/lib/format'
import { assertSafeContent } from '@shared/safety.js'
import type { Category } from '@/lib/types'

const schema = z.object({
  title: z.string().trim().min(6, 'Use at least 6 characters').max(80),
  description: z.string().trim().min(20, 'Describe the task in at least 20 characters').max(2000),
  category_id: z.string().uuid('Choose a category'),
  task_type: z.enum(['fixed', 'hourly']),
  amount: z.coerce.number().positive('Enter an amount').max(100000),
  payment_method: z.enum(['cash', 'upi']),
  scheduled_at: z.string().optional(),
  deadline: z.string().optional(),
  allow_negotiation: z.boolean(),
}).superRefine((value, context) => {
  const problem = assertSafeContent(`${value.title} ${value.description}`)
  if (problem) context.addIssue({ code: 'custom', message: problem, path: ['description'] })
})

export function PostTaskPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [images, setImages] = useState<string[]>([])
  const [location, setLocation] = useState({ lat: null as number | null, lng: null as number | null, label: '', address: '' })
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') })
  const leaves = (categories.data || []).filter((category) => category.parent_id)
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      category_id: '',
      task_type: 'fixed',
      payment_method: 'cash',
      allow_negotiation: true,
      amount: 0,
      scheduled_at: '',
      deadline: '',
    },
  })
  const values = form.watch()
  const publish = useMutation({
    mutationFn: async () => {
      if (location.lat === null || location.lng === null) throw new Error('Choose a location')
      const payload = form.getValues()
      return api<{ id: string }>('/tasks', {
        method: 'POST',
        body: {
          title: payload.title,
          description: payload.description,
          category_id: payload.category_id,
          task_type: payload.task_type,
          budget: payload.task_type === 'fixed' ? Number(payload.amount) : null,
          hourly_rate: payload.task_type === 'hourly' ? Number(payload.amount) : null,
          payment_method: payload.payment_method,
          lat: location.lat,
          lng: location.lng,
          address: location.address,
          public_label: location.label,
          scheduled_at: payload.scheduled_at ? new Date(payload.scheduled_at).toISOString() : null,
          deadline: payload.deadline ? new Date(payload.deadline).toISOString() : null,
          allow_negotiation: payload.allow_negotiation,
          image_urls: images,
        },
      })
    },
    onSuccess: (task) => {
      toast.success('Your task is live')
      navigate(`/tasks/${task.id}`)
    },
  })

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-sm text-mute">Step {step + 1} of 4</p>
        <h1 className="font-display text-4xl">Post a task</h1>
      </div>
      {step === 0 ? (
        <div className="space-y-4">
          <Field label="Title" error={form.formState.errors.title?.message}><Input {...form.register('title')} placeholder="Walk the dog this evening" /></Field>
          <Field label="Description" error={form.formState.errors.description?.message}><Textarea {...form.register('description')} placeholder="What needs doing, what you will provide, and anything a helper should know." /></Field>
          <Field label="Category" error={form.formState.errors.category_id?.message}>
            <Select {...form.register('category_id')} defaultValue="">
              <option value="" disabled>Choose one</option>
              {leaves.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </Select>
          </Field>
          <Field label="Photos" hint="Optional. Up to 4.">
            <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              try {
                const url = await uploadImage('task-images', file)
                setImages((current) => [...current, url].slice(0, 4))
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Upload failed')
              }
            }} />
          </Field>
          <div className="flex gap-2">{images.map((url) => <img key={url} src={url} alt="" className="h-16 w-16 rounded-xl object-cover" />)}</div>
        </div>
      ) : null}
      {step === 1 ? (
        <div className="space-y-4">
          <Field label="Pricing">
            <Select {...form.register('task_type')}>
              <option value="fixed">Fixed price</option>
              <option value="hourly">Hourly</option>
            </Select>
          </Field>
          <Field label={values.task_type === 'hourly' ? 'Hourly rate (INR)' : 'Budget (INR)'} error={form.formState.errors.amount?.message}><Input type="number" min="1" {...form.register('amount')} /></Field>
          <Field label="Payment method">
            <Select {...form.register('payment_method')}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...form.register('allow_negotiation')} /> Helpers can propose another price</label>
          <Field label="Preferred start"><Input type="datetime-local" {...form.register('scheduled_at')} /></Field>
          <Field label="Deadline"><Input type="datetime-local" {...form.register('deadline')} /></Field>
        </div>
      ) : null}
      {step === 2 ? <LocationPicker value={location} onChange={setLocation} /> : null}
      {step === 3 ? (
        <Card>
          <p className="text-xs uppercase tracking-wide text-mute">Preview · others will not see the exact address</p>
          <h2 className="mt-2 text-2xl font-semibold">{values.title || 'Untitled task'}</h2>
          <p className="mt-2 text-sm leading-6 text-mute">{values.description}</p>
          <p className="mt-4 font-semibold text-pine-800">{priceLabel({ task_type: values.task_type, budget: values.task_type === 'fixed' ? Number(values.amount) : null, hourly_rate: values.task_type === 'hourly' ? Number(values.amount) : null })} · {values.payment_method === 'upi' ? 'UPI' : 'Cash'}</p>
          <p className="mt-1 text-sm text-mute">{location.label || 'Add a neighbourhood'}</p>
        </Card>
      ) : null}
      {publish.error ? <p className="text-sm text-red-700">{publish.error.message}</p> : null}
      <div className="flex justify-between">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>Back</Button>
        {step < 3 ? (
          <Button onClick={async () => {
            if (step === 0) {
              const valid = await form.trigger(['title', 'description', 'category_id'])
              if (!valid) return
            }
            if (step === 1) {
              const valid = await form.trigger(['amount'])
              if (!valid) return
            }
            setStep((current) => current + 1)
          }}>Continue</Button>
        ) : <Button disabled={publish.isPending} onClick={() => publish.mutate()}>{publish.isPending ? 'Publishing…' : 'Publish task'}</Button>}
      </div>
    </div>
  )
}
