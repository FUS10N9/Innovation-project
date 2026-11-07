import { Heart } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CategoryIcon } from '@/components/tasks/CategoryIcon'
import { Avatar, Badge, statusTone } from '@/components/ui'
import { distanceLabel, payMethod, priceLabel, taskStatus, whenLabel } from '@/lib/format'
import type { TaskSummary } from '@/lib/types'

export function TaskCard({ task, onSave }: { task: TaskSummary; onSave?: (task: TaskSummary) => void }) {
  return (
    <article className="relative rounded-3xl border border-line bg-card p-4 shadow-card">
      <Link to={`/tasks/${task.id}`} className="absolute inset-0 rounded-3xl" aria-label={task.title} />
      <div className="pointer-events-none flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-mute">
            <span className="inline-flex items-center gap-1 rounded-full bg-pine-50 px-2 py-1 text-pine-800">
              <CategoryIcon name={task.category_icon} className="h-3.5 w-3.5" />
              {task.category_name}
            </span>
            <Badge tone={statusTone(task.status)}>{taskStatus(task.status)}</Badge>
          </div>
          <h3 className="text-lg font-semibold leading-6">{task.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-mute">{task.description}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-pine-800">{priceLabel(task)}</p>
          <p className="text-xs text-mute">{payMethod(task.payment_method)}</p>
        </div>
      </div>
      <div className="pointer-events-none relative z-10 mt-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={task.requester_name} url={task.requester_avatar} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{task.requester_name}</p>
            <p className="text-xs text-mute">
              {task.requester_rating_count ? `${Number(task.requester_rating).toFixed(1)} ★` : 'New'} · {distanceLabel(task.distance_m)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-mute">{whenLabel(task.scheduled_at || task.deadline)}</p>
          {onSave ? (
            <button
              className="pointer-events-auto rounded-full border border-line bg-white p-2"
              aria-label={task.saved ? 'Unsave task' : 'Save task'}
              onClick={() => onSave(task)}
            >
              <Heart className={`h-4 w-4 ${task.saved ? 'fill-pine-600 text-pine-600' : ''}`} />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}
