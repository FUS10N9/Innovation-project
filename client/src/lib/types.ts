export type Profile = {
  id: string
  full_name: string
  username: string | null
  email: string
  phone: string | null
  avatar_url: string | null
  bio: string | null
  neighbourhood: string | null
  services_offered: string | null
  verification_status: string
  role: 'user' | 'admin'
  date_of_birth: string | null
  rating_avg: number
  rating_count: number
  completed_count: number
  is_suspended: boolean
  onboarding_completed: boolean
  notification_settings: {
    applications: boolean
    messages: boolean
    tasks: boolean
    reviews: boolean
    email: boolean
  }
  privacy_settings: { show_neighbourhood: boolean }
  home_lat: number | null
  home_lng: number | null
  discovery_radius_m: number
  skills: string[]
  created_at?: string
}

export type Category = {
  id: string
  parent_id: string | null
  name: string
  slug: string
  description: string
  icon: string
  min_age: number
  is_active: boolean
  sort_order: number
}

export type TaskSummary = {
  id: string
  title: string
  description: string
  task_type: 'fixed' | 'hourly'
  budget: number | null
  hourly_rate: number | null
  payment_method: 'cash' | 'upi' | 'gateway'
  public_location_label: string
  scheduled_at: string | null
  deadline: string | null
  status: string
  allow_negotiation: boolean
  created_at: string
  category_name: string
  category_icon: string
  category_id: string
  parent_category_name: string | null
  requester_id: string
  requester_name: string
  requester_avatar: string | null
  requester_rating: number
  requester_rating_count: number
  distance_m: number
  latitude: number
  longitude: number
  application_count: number
  saved: boolean
}

export type PublicProfile = {
  id: string
  full_name: string
  username: string | null
  avatar_url: string | null
  bio: string | null
  neighbourhood: string | null
  services_offered: string | null
  verification_status: string
  rating_avg: number
  rating_count: number
  completed_count: number
  created_at: string
  skills: string[]
  reviews: Array<{
    rating: number
    comment: string | null
    created_at: string
    reviewer_name: string
    reviewer_avatar: string | null
  }>
}
