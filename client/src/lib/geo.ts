import { mapboxToken } from './supabase'

export type Place = {
  id: string
  label: string
  neighbourhood: string
  lat: number
  lng: number
}

export function circlePolygon(lng: number, lat: number, meters: number, steps = 64) {
  const coordinates: Array<[number, number]> = []
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2
    const east = meters * Math.sin(angle)
    const north = meters * Math.cos(angle)
    coordinates.push([
      lng + east / (111320 * Math.cos((lat * Math.PI) / 180)),
      lat + north / 110540,
    ])
  }
  return { type: 'Polygon' as const, coordinates: [coordinates] }
}

function neighbourhoodFrom(feature: {
  text?: string
  place_name?: string
  place_type?: string[]
  context?: Array<{ id: string; text: string }>
}) {
  const context = feature.context || []
  const neighbourhood = context.find((item) => item.id.startsWith('neighborhood'))?.text
  const locality = context.find((item) => item.id.startsWith('locality'))?.text
  const place = context.find((item) => item.id.startsWith('place'))?.text
  const own = feature.place_type?.some((type) => ['neighborhood', 'locality', 'place'].includes(type))
    ? feature.text
    : null
  return [own || neighbourhood || locality, place].filter(Boolean).join(', ') || feature.text || 'Nearby'
}

export async function searchPlaces(query: string): Promise<Place[]> {
  if (!mapboxToken || query.trim().length < 2) return []
  const endpoint = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`)
  endpoint.searchParams.set('access_token', mapboxToken)
  endpoint.searchParams.set('autocomplete', 'true')
  endpoint.searchParams.set('limit', '5')
  endpoint.searchParams.set('types', 'neighborhood,locality,place,address,poi')
  const response = await fetch(endpoint)
  if (!response.ok) throw new Error('Location search is unavailable')
  const body = await response.json()
  return (body.features || []).map((feature: {
    id: string
    text?: string
    place_name?: string
    place_type?: string[]
    center: [number, number]
    context?: Array<{ id: string; text: string }>
  }) => ({
    id: feature.id,
    label: feature.place_name || feature.text || 'Place',
    neighbourhood: neighbourhoodFrom(feature),
    lng: feature.center[0],
    lat: feature.center[1],
  }))
}

export function readOrigin() {
  const raw = sessionStorage.getItem('nook.origin')
  if (!raw) return null
  try {
    return JSON.parse(raw) as { lat: number; lng: number; label: string }
  } catch {
    return null
  }
}

export function saveOrigin(origin: { lat: number; lng: number; label: string }) {
  sessionStorage.setItem('nook.origin', JSON.stringify(origin))
}
