import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-pine-600 text-white hover:bg-pine-700',
    secondary: 'border border-line bg-white text-ink hover:bg-paper',
    ghost: 'text-ink hover:bg-black/5',
    danger: 'bg-red-700 text-white hover:bg-red-800',
  }
  return (
    <button
      type={type}
      className={cn('inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50', styles[variant], className)}
      {...props}
    />
  )
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="block text-sm text-red-700">{error}</span> : hint ? <span className="block text-sm text-mute">{hint}</span> : null}
    </label>
  )
}

const control = 'w-full rounded-2xl border border-line bg-white px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-stone-400 focus:border-pine-600'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(control, props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(control, 'min-h-28 resize-y', props.className)} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(control, props.className)} />
}

export function Badge({ children, tone = 'stone' }: { children: ReactNode; tone?: 'pine' | 'stone' | 'amber' | 'red' }) {
  const tones = {
    pine: 'bg-pine-50 text-pine-800',
    stone: 'bg-stone-100 text-stone-700',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-800',
  }
  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', tones[tone])}>{children}</span>
}

export function statusTone(status: string): 'pine' | 'stone' | 'amber' | 'red' {
  if (status === 'disputed') return 'red'
  if (status === 'completion_pending') return 'amber'
  if (status === 'cancelled') return 'stone'
  return 'pine'
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-3xl border border-line bg-card p-5 shadow-card', className)}>{children}</section>
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-mute">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-stone-200/70', className)} />
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-3xl bg-white p-5 shadow-card" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl">{title}</h2>
          <button className="rounded-full px-3 py-1 text-sm text-mute" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Avatar({ name, url, size = 'md' }: { name: string; url?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-16 w-16 text-xl' }
  if (url) return <img src={url} alt="" className={cn('rounded-full object-cover', sizes[size])} />
  return <span className={cn('inline-flex items-center justify-center rounded-full bg-pine-100 font-semibold text-pine-800', sizes[size])}>{name.slice(0, 1).toUpperCase()}</span>
}

export function Stars({ value }: { value: number }) {
  const rounded = Math.round(value)
  return <span aria-label={`${value} out of 5`}>{Array.from({ length: 5 }, (_, index) => <span key={index} className={index < rounded ? 'text-pine-700' : 'text-stone-300'}>★</span>)}</span>
}
