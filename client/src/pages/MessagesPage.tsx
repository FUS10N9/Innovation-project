import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Avatar, Button, EmptyState, Modal, Select, Textarea } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { api, uploadImage } from '@/lib/api'
import { whenLabel } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { REPORT_REASONS } from '@shared/constants.js'

type ConversationListItem = {
  id: string
  task_id: string
  task_title: string
  task_status: string
  last_message: string | null
  last_attachment: boolean
  unread_count: number
  other_user: { id: string; full_name: string; avatar_url: string | null }
}

type Conversation = {
  id: string
  task: { id: string; title: string; status: string; budget: number | null; hourly_rate: number | null; task_type: string; public_location_label: string }
  other_user: { id: string; full_name: string; avatar_url: string | null; rating_avg: number }
  messages: Array<{ id: string; sender_id: string; content: string; attachment_url: string | null; created_at: string; read_at: string | null }>
}

export function MessagesPage() {
  const { conversationId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [menu, setMenu] = useState(false)
  const [report, setReport] = useState(false)
  const list = useQuery({ queryKey: ['conversations'], queryFn: () => api<ConversationListItem[]>('/conversations') })
  const thread = useQuery({
    queryKey: ['conversation', conversationId],
    enabled: Boolean(conversationId),
    queryFn: () => api<Conversation>(`/conversations/${conversationId}`),
  })

  useEffect(() => {
    if (!conversationId) return
    api(`/conversations/${conversationId}/read`, { method: 'POST' }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }).catch(() => undefined)
  }, [conversationId, thread.data?.messages.length, queryClient])

  useEffect(() => {
    const client = supabase
    if (!client || !conversationId) return
    const channel = client.channel(`messages-${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
        queryClient.invalidateQueries({ queryKey: ['conversations'] })
      })
      .subscribe()
    return () => { client.removeChannel(channel) }
  }, [conversationId, queryClient])

  const send = useMutation({
    mutationFn: (body: { content?: string; attachment?: string | null }) => api(`/conversations/${conversationId}/messages`, { method: 'POST', body }),
    onSuccess: () => {
      setText('')
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <div className="grid min-h-[70vh] overflow-hidden rounded-3xl border border-line bg-white md:grid-cols-[280px_1fr]">
      <aside className={`${conversationId ? 'hidden md:block' : ''} border-r border-line`}>
        <h1 className="px-4 py-4 font-display text-3xl">Messages</h1>
        {list.data?.length ? list.data.map((item) => (
          <button key={item.id} className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left hover:bg-paper" onClick={() => navigate(`/messages/${item.id}`)}>
            <Avatar name={item.other_user.full_name} url={item.other_user.avatar_url} size="sm" />
            <span className="min-w-0">
              <span className="flex items-center gap-2"><span className="truncate text-sm font-medium">{item.other_user.full_name}</span>{item.unread_count ? <span className="rounded-full bg-pine-600 px-1.5 text-[10px] text-white">{item.unread_count}</span> : null}</span>
              <span className="block truncate text-xs text-mute">{item.last_attachment && !item.last_message ? 'Photo' : item.last_message || item.task_title}</span>
            </span>
          </button>
        )) : <p className="px-4 text-sm text-mute">Conversations open after you accept an application.</p>}
      </aside>
      <section className={`${conversationId ? '' : 'hidden md:flex'} flex min-h-[70vh] flex-col`}>
        {!conversationId ? <div className="m-auto"><EmptyState title="Choose a conversation" body="Task messages stay between the requester and the selected helper." /></div> : null}
        {thread.data ? (
          <>
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <button className="text-sm text-pine-800 md:hidden" onClick={() => navigate('/messages')}>Back</button>
                <Link to={`/tasks/${thread.data.task.id}`} className="block font-medium">{thread.data.task.title}</Link>
                <p className="text-xs text-mute">{thread.data.other_user.full_name} · {thread.data.task.public_location_label}</p>
              </div>
              <button className="text-sm" onClick={() => setMenu(true)}>Safety</button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {thread.data.messages.map((message) => {
                const mine = message.sender_id === profile?.id
                return (
                  <div key={message.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'ml-auto bg-pine-600 text-white' : 'bg-paper'}`}>
                    {message.content ? <p>{message.content}</p> : null}
                    {message.attachment_url ? <img src={message.attachment_url} alt="" className="mt-2 max-h-48 rounded-xl" /> : null}
                    <p className={`mt-1 text-[11px] ${mine ? 'text-pine-50' : 'text-mute'}`}>{whenLabel(message.created_at)}{message.read_at && mine ? ' · Read' : ''}</p>
                  </div>
                )
              })}
            </div>
            <form className="flex gap-2 border-t border-line p-3" onSubmit={(event) => { event.preventDefault(); if (text.trim()) send.mutate({ content: text }) }}>
              <Textarea className="min-h-12" value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a message" />
              <input aria-label="Attach a photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                try {
                  const path = await uploadImage('message-attachments', file)
                  send.mutate({ content: text, attachment: path })
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Upload failed')
                }
              }} />
              <Button type="submit" disabled={send.isPending}>Send</Button>
            </form>
          </>
        ) : null}
      </section>
      {menu && thread.data ? (
        <Modal title="Safety" onClose={() => setMenu(false)}>
          <div className="space-y-3">
            <Button variant="secondary" onClick={async () => {
              await api('/blocks', { method: 'POST', body: { user_id: thread.data!.other_user.id } })
              toast.success('Blocked. You will not see each other’s tasks or messages.')
              setMenu(false)
            }}>Block {thread.data.other_user.full_name}</Button>
            <Button variant="danger" onClick={() => { setMenu(false); setReport(true) }}>Report</Button>
          </div>
        </Modal>
      ) : null}
      {report && thread.data ? <ReportBox userId={thread.data.other_user.id} taskId={thread.data.task.id} onClose={() => setReport(false)} /> : null}
    </div>
  )
}

function ReportBox({ userId, taskId, onClose }: { userId: string; taskId: string; onClose: () => void }) {
  const [reason, setReason] = useState('harassment')
  const [description, setDescription] = useState('')
  return (
    <Modal title="Report" onClose={onClose}>
      <Select value={reason} onChange={(event) => setReason(event.target.value)}>{REPORT_REASONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select>
      <Textarea className="mt-3" value={description} onChange={(event) => setDescription(event.target.value)} />
      <Button className="mt-3" onClick={async () => {
        try {
          await api('/reports', { method: 'POST', body: { reported_user_id: userId, task_id: taskId, reason, description } })
          toast.success('Report sent')
          onClose()
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not send the report')
        }
      }}>Send</Button>
    </Modal>
  )
}
