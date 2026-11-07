import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { TaskMap } from '@/components/map/TaskMap'
import { LocationPicker } from '@/components/map/LocationPicker'
import { TaskCard } from '@/components/tasks/TaskCard'
import { Button, EmptyState, Input, Select, Skeleton } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { readOrigin, saveOrigin } from '@/lib/geo'
import type { Category, TaskSummary } from '@/lib/types'
import { RADIUS_OPTIONS } from '@shared/constants.js'

export function ExplorePage() {
  const { profile } = useAuth()
  const stored = readOrigin()
  const [origin, setOrigin] = useState(stored || (profile?.home_lat ? { lat: profile.home_lat, lng: profile.home_lng!, label: profile.neighbourhood || '' } : null))
  const [draft, setDraft] = useState({ lat: origin?.lat ?? null, lng: origin?.lng ?? null, label: origin?.label || '', address: '' })
  const [radius, setRadius] = useState(profile?.discovery_radius_m || 1000)
  const [category, setCategory] = useState('')
  const [pricing, setPricing] = useState('')
  const [payment, setPayment] = useState('')
  const [available, setAvailable] = useState('any')
  const [minBudget, setMinBudget] = useState('')
  const [maxBudget, setMaxBudget] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'map'>('list')
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') })
  const tasks = useQuery({
    queryKey: ['explore', origin, radius, category, pricing, payment, available, minBudget, maxBudget, search],
    enabled: Boolean(origin),
    queryFn: () => {
      const params = new URLSearchParams({
        lat: String(origin!.lat),
        lng: String(origin!.lng),
        radius: String(radius),
        sort: 'nearest',
        available,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      if (category) params.set('category', category)
      if (pricing) params.set('pricing', pricing)
      if (payment) params.set('payment', payment)
      if (minBudget) params.set('min_budget', minBudget)
      if (maxBudget) params.set('max_budget', maxBudget)
      if (search.trim()) params.set('search', search.trim())
      return api<TaskSummary[]>(`/tasks/nearby?${params}`)
    },
  })
  const leaves = useMemo(() => (categories.data || []).filter((item) => item.parent_id), [categories.data])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Explore</h1>
          <p className="text-sm text-mute">Open tasks inside your chosen radius. Exact addresses stay hidden.</p>
        </div>
        <div className="flex rounded-full bg-white p-1">
          <button className={`rounded-full px-3 py-1.5 text-sm ${view === 'list' ? 'bg-pine-600 text-white' : ''}`} onClick={() => setView('list')}>List</button>
          <button className={`rounded-full px-3 py-1.5 text-sm ${view === 'map' ? 'bg-pine-600 text-white' : ''}`} onClick={() => setView('map')}>Map</button>
        </div>
      </div>
      <div className="rounded-3xl border border-line bg-white p-4">
        <LocationPicker value={draft} onChange={setDraft} />
        <Button className="mt-3" onClick={() => {
          if (draft.lat === null || draft.lng === null) return
          const next = { lat: draft.lat, lng: draft.lng, label: draft.label || 'Chosen area' }
          setOrigin(next)
          saveOrigin(next)
        }}>Search this area</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Input placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select value={String(radius)} onChange={(event) => setRadius(Number(event.target.value))}>
          {RADIUS_OPTIONS.map((option) => <option key={option.meters} value={option.meters}>{option.label}</option>)}
        </Select>
        <Select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {leaves.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
        <Select value={pricing} onChange={(event) => setPricing(event.target.value)}>
          <option value="">Fixed or hourly</option>
          <option value="fixed">Fixed price</option>
          <option value="hourly">Hourly</option>
        </Select>
        <Select value={payment} onChange={(event) => setPayment(event.target.value)}>
          <option value="">Cash or UPI</option>
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
        </Select>
        <Select value={available} onChange={(event) => setAvailable(event.target.value)}>
          <option value="any">Any time</option>
          <option value="today">Today</option>
          <option value="week">Next 7 days</option>
        </Select>
        <Input type="number" placeholder="Min budget" value={minBudget} onChange={(event) => setMinBudget(event.target.value)} />
        <Input type="number" placeholder="Max budget" value={maxBudget} onChange={(event) => setMaxBudget(event.target.value)} />
      </div>
      {!origin ? <EmptyState title="Choose a place" body="Search for a neighbourhood or use your current location. The default radius is 1 kilometre." /> : null}
      {tasks.isLoading ? <Skeleton className="h-40" /> : null}
      {tasks.error ? <p className="text-sm text-red-700">{tasks.error.message}</p> : null}
      {origin && view === 'map' ? (
        <div className="h-[480px]">
          <TaskMap
            center={origin}
            markers={(tasks.data || []).map((task) => ({ id: task.id, lat: task.latitude, lng: task.longitude, title: task.title }))}
          />
        </div>
      ) : null}
      {origin && view === 'list' && tasks.data && tasks.data.length === 0 ? <EmptyState title="Nothing open here" body="Try 3 or 5 kilometres, or another category." /> : null}
      {view === 'list' ? <div className="grid gap-3">{(tasks.data || []).map((task) => <TaskCard key={task.id} task={task} />)}</div> : null}
    </div>
  )
}
