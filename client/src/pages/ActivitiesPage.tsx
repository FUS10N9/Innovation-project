import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, EmptyState, Skeleton, statusTone } from '@/components/ui'
import { api } from '@/lib/api'
import { payStatus, priceLabel, taskStatus, whenLabel } from '@/lib/format'
import { ACTIVITY_TABS, APPLICATION_STATUS_LABELS } from '@shared/constants.js'

type Row = {
  id: string
  title: string
  status: string
  task_type: 'fixed' | 'hourly'
  budget: number | null
  hourly_rate: number | null
  payment_method: string
  payment_status: string
  scheduled_at: string | null
  public_location_label: string
  viewer_role: string
  application_status: string | null
  counterpart_name: string | null
  category_name: string
}

const emptyCopy: Record<string, string> = {
  posted: 'Tasks you post will show up here.',
  applied: 'Applications you send will show up here.',
  active: 'Accepted work in progress will show up here.',
  completed: 'Finished tasks will show up here.',
  cancelled: 'Cancelled tasks will show up here.',
}

export function ActivitiesPage() {
  const [tab, setTab] = useState('posted')
  const rows = useQuery({ queryKey: ['activities', tab], queryFn: () => api<Row[]>(`/activities?tab=${tab}`) })
  return (
    <div className="space-y-5">
      <h1 className="font-display text-4xl">My activities</h1>
      <div className="flex gap-2 overflow-x-auto">
        {ACTIVITY_TABS.map((item) => (
          <button key={item.id} className={`rounded-full px-3 py-2 text-sm ${tab === item.id ? 'bg-pine-600 text-white' : 'bg-white'}`} onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </div>
      {rows.isLoading ? <Skeleton className="h-24" /> : null}
      {rows.error ? <p className="text-sm text-red-700">{rows.error.message}</p> : null}
      {rows.data && rows.data.length === 0 ? <EmptyState title="Nothing in this tab" body={emptyCopy[tab]} /> : null}
      <div className="grid gap-3">
        {rows.data?.map((row) => (
          <Link key={row.id} to={`/tasks/${row.id}`}>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-mute">{row.category_name} · {row.public_location_label}</p>
                  <h2 className="text-lg font-semibold">{row.title}</h2>
                  <p className="text-sm text-mute">{whenLabel(row.scheduled_at)} · {row.counterpart_name || (row.viewer_role === 'requester' ? 'No helper yet' : 'Your application')}</p>
                </div>
                <div className="text-right">
                  <Badge tone={statusTone(row.status)}>{taskStatus(row.status)}</Badge>
                  <p className="mt-2 text-sm">{priceLabel(row)}</p>
                  {row.application_status ? <p className="text-xs text-mute">{APPLICATION_STATUS_LABELS[row.application_status as keyof typeof APPLICATION_STATUS_LABELS]}</p> : null}
                  <p className="text-xs text-mute">{payStatus(row.payment_status)}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
