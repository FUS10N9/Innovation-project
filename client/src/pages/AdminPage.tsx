import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, Card, Input } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { taskStatus } from '@/lib/format'

type Overview = { users: number; active_users: number; tasks: number; open_tasks: number; completed_tasks: number; open_reports: number; disputed_tasks: number }
type AdminUser = { id: string; full_name: string; email: string; role: string; is_suspended: boolean; verification_status: string }
type AdminTask = { id: string; title: string; status: string; public_location_label: string }
type Report = { id: string; reason: string; description: string; status: string; created_at: string }
type AdminCategory = { id: string; name: string; is_active: boolean; min_age: number; parent_id: string | null }

export function AdminPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('overview')
  if (profile && profile.role !== 'admin') return <Navigate to="/home" replace />
  return (
    <div className="space-y-5">
      <h1 className="font-display text-4xl">Moderation</h1>
      <div className="flex gap-2">
        {['overview', 'users', 'tasks', 'reports', 'categories'].map((item) => (
          <button key={item} className={`rounded-full px-3 py-2 text-sm capitalize ${tab === item ? 'bg-pine-600 text-white' : 'bg-white'}`} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {tab === 'overview' ? <OverviewPanel /> : null}
      {tab === 'users' ? <UsersPanel /> : null}
      {tab === 'tasks' ? <TasksPanel /> : null}
      {tab === 'reports' ? <ReportsPanel /> : null}
      {tab === 'categories' ? <CategoriesPanel /> : null}
    </div>
  )
}

function OverviewPanel() {
  const overview = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api<Overview>('/admin/overview') })
  if (!overview.data) return <p className="text-sm text-mute">{overview.error?.message || 'Loading…'}</p>
  const cards = [
    ['People', overview.data.users],
    ['Active in 7 days', overview.data.active_users],
    ['Tasks', overview.data.tasks],
    ['Open tasks', overview.data.open_tasks],
    ['Completed', overview.data.completed_tasks],
    ['Open reports', overview.data.open_reports],
    ['Disputed', overview.data.disputed_tasks],
  ]
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <Card key={String(label)}><p className="text-sm text-mute">{label}</p><p className="mt-1 text-3xl font-semibold">{value}</p></Card>)}</div>
}

function UsersPanel() {
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()
  const users = useQuery({ queryKey: ['admin', 'users', search], queryFn: () => api<AdminUser[]>(`/admin/users?search=${encodeURIComponent(search)}`) })
  const suspend = useMutation({
    mutationFn: (input: { id: string; suspended: boolean }) => api(`/admin/users/${input.id}/suspension`, { method: 'POST', body: { suspended: input.suspended } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })
  return (
    <div className="space-y-3">
      <Input placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} />
      {users.data?.map((user) => (
        <Card key={user.id}>
          <div className="flex items-center justify-between gap-3">
            <div><p className="font-medium">{user.full_name}</p><p className="text-sm text-mute">{user.email} · {user.verification_status}</p></div>
            <Button variant={user.is_suspended ? 'secondary' : 'danger'} onClick={() => suspend.mutate({ id: user.id, suspended: !user.is_suspended })}>{user.is_suspended ? 'Reinstate' : 'Suspend'}</Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

function TasksPanel() {
  const queryClient = useQueryClient()
  const tasks = useQuery({ queryKey: ['admin', 'tasks'], queryFn: () => api<AdminTask[]>('/admin/tasks') })
  return (
    <div className="space-y-3">{tasks.data?.map((task) => (
      <Card key={task.id}>
        <div className="flex items-center justify-between gap-3">
          <div><p className="font-medium">{task.title}</p><p className="text-sm text-mute">{taskStatus(task.status)} · {task.public_location_label}</p></div>
          {task.status !== 'completed' && task.status !== 'cancelled' ? <Button variant="danger" onClick={async () => {
            const reason = window.prompt('Why is this task being removed?')
            if (!reason) return
            try {
              await api(`/admin/tasks/${task.id}/cancel`, { method: 'POST', body: { reason } })
              queryClient.invalidateQueries({ queryKey: ['admin', 'tasks'] })
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Could not cancel')
            }
          }}>Remove</Button> : null}
        </div>
      </Card>
    ))}</div>
  )
}

function ReportsPanel() {
  const queryClient = useQueryClient()
  const reports = useQuery({ queryKey: ['admin', 'reports'], queryFn: () => api<Report[]>('/admin/reports') })
  return <div className="space-y-3">{reports.data?.map((report) => (
    <Card key={report.id}>
      <p className="text-sm font-medium capitalize">{report.reason} · {report.status}</p>
      <p className="mt-1 text-sm leading-6">{report.description}</p>
      <div className="mt-3 flex gap-2">
        {(['reviewing', 'resolved', 'dismissed'] as const).map((status) => (
          <Button key={status} variant="secondary" onClick={async () => {
            await api(`/admin/reports/${report.id}`, { method: 'POST', body: { status } })
            queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] })
          }}>{status}</Button>
        ))}
      </div>
    </Card>
  ))}</div>
}

function CategoriesPanel() {
  const queryClient = useQueryClient()
  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api<AdminCategory[]>('/admin/categories') })
  return <div className="space-y-2">{categories.data?.map((category) => (
    <Card key={category.id}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">{category.parent_id ? '– ' : ''}{category.name} · age {category.min_age}</p>
        <Button variant="secondary" onClick={async () => {
          await api(`/admin/categories/${category.id}`, { method: 'PATCH', body: { is_active: !category.is_active } })
          queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] })
        }}>{category.is_active ? 'Disable' : 'Enable'}</Button>
      </div>
    </Card>
  ))}</div>
}
