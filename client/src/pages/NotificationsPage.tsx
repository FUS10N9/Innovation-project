import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button, Card, EmptyState } from '@/components/ui'
import { api } from '@/lib/api'
import { whenLabel } from '@/lib/format'

type Note = { id: string; title: string; message: string; is_read: boolean; created_at: string; related_task_id: string | null }

export function NotificationsPage() {
  const queryClient = useQueryClient()
  const notes = useQuery({ queryKey: ['notifications'], queryFn: () => api<Note[]>('/notifications') })
  const read = useMutation({
    mutationFn: () => api('/notifications/read', { method: 'POST', body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl">Notifications</h1>
        <Button variant="secondary" onClick={() => read.mutate()}>Mark all read</Button>
      </div>
      {notes.data && notes.data.length === 0 ? <EmptyState title="You are up to date" body="Applications, messages, and task updates appear here." /> : null}
      <div className="space-y-3">
        {notes.data?.map((note) => {
          const body = (
            <Card className={note.is_read ? 'opacity-70' : ''}>
              <h2 className="font-medium">{note.title}</h2>
              <p className="mt-1 text-sm leading-6 text-mute">{note.message}</p>
              <p className="mt-2 text-xs text-mute">{whenLabel(note.created_at)}</p>
            </Card>
          )
          return note.related_task_id ? <Link key={note.id} to={`/tasks/${note.related_task_id}`}>{body}</Link> : <div key={note.id}>{body}</div>
        })}
      </div>
    </div>
  )
}
