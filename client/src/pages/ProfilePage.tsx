import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Avatar, Badge, Card, EmptyState, Stars } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import type { PublicProfile } from '@/lib/types'

const verificationCopy: Record<string, string> = {
  unverified: 'Email not confirmed',
  email_verified: 'Email confirmed',
  phone_verified: 'Phone confirmed',
  verified: 'Identity reviewed',
  rejected: 'Verification declined',
}

export function ProfilePage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const target = id || profile?.id
  const person = useQuery({
    queryKey: ['profile', target],
    enabled: Boolean(target),
    queryFn: () => api<PublicProfile>(`/users/${target}`),
  })
  if (person.isLoading) return <p>Loading profile…</p>
  if (person.error || !person.data) return <EmptyState title="Profile unavailable" body={person.error?.message || 'This profile is hidden.'} />
  const user = person.data
  const mine = user.id === profile?.id
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={user.full_name} url={user.avatar_url} size="lg" />
          <div>
            <h1 className="font-display text-4xl">{user.full_name}</h1>
            <p className="text-sm text-mute">@{user.username} {user.neighbourhood ? `· ${user.neighbourhood}` : ''}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <Stars value={Number(user.rating_avg)} />
              <span>{user.rating_count ? `${Number(user.rating_avg).toFixed(1)} · ${user.rating_count} reviews` : 'No reviews yet'}</span>
              <Badge tone="pine">{user.completed_count} completed</Badge>
              <Badge>{verificationCopy[user.verification_status] || user.verification_status}</Badge>
            </div>
          </div>
        </div>
        {user.bio ? <p className="mt-4 text-sm leading-6">{user.bio}</p> : null}
        {mine ? <div className="mt-4 flex gap-3 text-sm"><Link to="/settings" className="text-pine-800">Edit profile</Link><Link to="/earnings" className="text-pine-800">Earnings</Link></div> : null}
      </Card>
      {user.services_offered ? <Card><h2 className="font-semibold">Services offered</h2><p className="mt-2 text-sm leading-6 text-mute">{user.services_offered}</p></Card> : null}
      {user.skills.length ? <div className="flex flex-wrap gap-2">{user.skills.map((skill) => <Badge key={skill}>{skill}</Badge>)}</div> : null}
      <section>
        <h2 className="mb-3 font-display text-2xl">Reviews</h2>
        {user.reviews.length === 0 ? <EmptyState title="No reviews yet" body="Reviews appear after a completed task." /> : (
          <div className="space-y-3">{user.reviews.map((review, index) => (
            <Card key={`${review.created_at}-${index}`}>
              <div className="flex items-center gap-2"><Avatar name={review.reviewer_name} url={review.reviewer_avatar} size="sm" /><strong className="text-sm">{review.reviewer_name}</strong><Stars value={review.rating} /></div>
              {review.comment ? <p className="mt-2 text-sm leading-6">{review.comment}</p> : null}
            </Card>
          ))}</div>
        )}
      </section>
    </div>
  )
}
