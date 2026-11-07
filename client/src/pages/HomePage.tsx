import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CategoryIcon } from '@/components/tasks/CategoryIcon'
import { TaskCard } from '@/components/tasks/TaskCard'
import { Button, EmptyState, Select, Skeleton } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { readOrigin, saveOrigin } from '@/lib/geo'
import type { Category, TaskSummary } from '@/lib/types'
import { RADIUS_OPTIONS, SORT_OPTIONS } from '@shared/constants.js'

export function HomePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const stored = readOrigin()
  const origin = stored || (profile?.home_lat && profile.home_lng ? { lat: profile.home_lat, lng: profile.home_lng, label: profile.neighbourhood || 'Your neighbourhood' } : null)
  const [sort, setSort] = useState('nearest')
  const [category, setCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const radius = profile?.discovery_radius_m || 1000
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') })
  const tasks = useQuery({
    queryKey: ['nearby', origin?.lat, origin?.lng, radius, sort, category],
    enabled: Boolean(origin),
    queryFn: () => {
      const params = new URLSearchParams({
        lat: String(origin!.lat),
        lng: String(origin!.lng),
        radius: String(radius),
        sort,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      if (category) params.set('category', category)
      return api<TaskSummary[]>(`/tasks/nearby?${params}`)
    },
  })
  const save = useMutation({
    mutationFn: (task: TaskSummary) => api(`/tasks/${task.id}/save`, { method: task.saved ? 'DELETE' : 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nearby'] }),
  })
  const groups = (categories.data || []).filter((item) => !item.parent_id)
  const visible = useMemo(() => {
    const rows = tasks.data || []
    const term = search.trim().toLowerCase()
    return term ? rows.filter((task) => `${task.title} ${task.description}`.toLowerCase().includes(term)) : rows
  }, [tasks.data, search])
  const sections = useMemo(() => splitSections(visible), [visible])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Hello, {profile?.full_name.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-mute">{origin?.label || 'Set a neighbourhood to see nearby tasks'} · {RADIUS_OPTIONS.find((item) => item.meters === radius)?.label || '1 km'}</p>
        </div>
        {!profile?.email || profile.verification_status === 'unverified' ? (
          <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Confirm your email before posting or applying.</p>
        ) : null}
      </div>
      {!origin ? (
        <EmptyState title="Where should Nook look?" body="Use your neighbourhood from onboarding, or set a place for this session." action={<Button onClick={() => navigate('/explore')}>Choose a place</Button>} />
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row">
            <input className="w-full rounded-full border border-line bg-white px-4 py-3 text-sm" placeholder="Search tasks" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Select value={sort} onChange={(event) => setSort(event.target.value)} className="md:max-w-52">
              {SORT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </Select>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button className={`rounded-full px-3 py-2 text-sm ${category ? 'bg-white' : 'bg-pine-600 text-white'}`} onClick={() => setCategory(null)}>All</button>
            {groups.map((group) => (
              <button key={group.id} className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-line px-3 py-2 text-sm ${category === group.id ? 'bg-pine-600 text-white' : 'bg-white'}`} onClick={() => setCategory(group.id)}>
                <CategoryIcon name={group.icon} className="h-4 w-4" /> {group.name}
              </button>
            ))}
          </div>
          {tasks.isLoading ? <div className="grid gap-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-36" />)}</div> : null}
          {tasks.error ? <p className="text-sm text-red-700">{tasks.error.message}</p> : null}
          {!tasks.isLoading && visible.length === 0 ? (
            <EmptyState title="No tasks in this radius" body="Widen the radius on the Explore page, or post the first task in the neighbourhood." action={<Link to="/tasks/new" className="rounded-full bg-pine-600 px-4 py-2 text-sm text-white">Post a task</Link>} />
          ) : null}
          {sections.single ? <TaskList tasks={visible} onSave={(task) => save.mutate(task)} /> : (
            <div className="space-y-8">
              <Section title="Nearby opportunities" tasks={sections.nearby} onSave={(task) => save.mutate(task)} />
              <Section title="Recommended" tasks={sections.recommended} onSave={(task) => save.mutate(task)} />
              <Section title="Recently posted" tasks={sections.recent} onSave={(task) => save.mutate(task)} />
              <Section title="Featured" tasks={sections.featured} onSave={(task) => save.mutate(task)} />
            </div>
          )}
          <button className="text-sm text-pine-800" onClick={() => { if (origin) saveOrigin(origin); navigate('/explore') }}>Open map and filters</button>
        </>
      )}
    </div>
  )
}

function TaskList({ tasks, onSave }: { tasks: TaskSummary[]; onSave: (task: TaskSummary) => void }) {
  return <div className="grid gap-3">{tasks.map((task) => <TaskCard key={task.id} task={task} onSave={onSave} />)}</div>
}

function Section({ title, tasks, onSave }: { title: string; tasks: TaskSummary[]; onSave: (task: TaskSummary) => void }) {
  if (!tasks.length) return null
  return (
    <section>
      <h2 className="mb-3 font-display text-2xl">{title}</h2>
      <TaskList tasks={tasks} onSave={onSave} />
    </section>
  )
}

function splitSections(tasks: TaskSummary[]) {
  if (tasks.length <= 4) return { single: true, nearby: tasks, recommended: [], recent: [], featured: [] }
  const used = new Set<string>()
  const take = (rows: TaskSummary[]) => rows.filter((task) => {
    if (used.has(task.id)) return false
    used.add(task.id)
    return true
  }).slice(0, 3)
  return {
    single: false,
    nearby: take([...tasks].sort((a, b) => a.distance_m - b.distance_m)),
    recommended: take([...tasks].sort((a, b) => b.requester_rating - a.requester_rating || b.created_at.localeCompare(a.created_at))),
    recent: take([...tasks].sort((a, b) => b.created_at.localeCompare(a.created_at))),
    featured: take([...tasks].sort((a, b) => Number(b.budget || b.hourly_rate) - Number(a.budget || a.hourly_rate))),
  }
}
