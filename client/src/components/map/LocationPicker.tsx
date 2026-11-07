import { TaskMap } from '@/components/map/TaskMap'
import { Button, Input } from '@/components/ui'
import { searchPlaces, type Place } from '@/lib/geo'
import { mapboxToken } from '@/lib/supabase'
import { LocateFixed } from 'lucide-react'
import { useState } from 'react'

export function LocationPicker({
  value,
  onChange,
}: {
  value: { lat: number | null; lng: number | null; label: string; address: string }
  onChange: (value: { lat: number | null; lng: number | null; label: string; address: string }) => void
}) {
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<Place[]>([])
  const [error, setError] = useState('')

  async function locate() {
    setError('')
    if (!navigator.geolocation) {
      setError('This browser cannot share a location. Search or enter one instead.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          ...value,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: value.label || 'My neighbourhood',
        })
      },
      () => setError('Location permission was denied. Search for your neighbourhood instead.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  }

  async function search() {
    try {
      setPlaces(await searchPlaces(query))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Search failed')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={query} placeholder="Search a neighbourhood" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); search() } }} />
        <Button variant="secondary" onClick={search} disabled={!mapboxToken}>Search</Button>
        <Button variant="secondary" onClick={locate} aria-label="Use my location"><LocateFixed className="h-4 w-4" /></Button>
      </div>
      {places.length ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {places.map((place) => (
            <button key={place.id} className="block w-full border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-paper" onClick={() => {
              onChange({ ...value, lat: place.lat, lng: place.lng, label: place.neighbourhood })
              setPlaces([])
              setQuery(place.label)
            }}>
              {place.label}
            </button>
          ))}
        </div>
      ) : null}
      {value.lat !== null && value.lng !== null ? (
        <div className="h-64">
          <TaskMap center={{ lat: value.lat, lng: value.lng }} circleMeters={180} onMove={(point) => onChange({ ...value, ...point })} />
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder="Neighbourhood people will see" value={value.label} onChange={(event) => onChange({ ...value, label: event.target.value })} />
        <Input placeholder="Exact spot, kept private" value={value.address} onChange={(event) => onChange({ ...value, address: event.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input type="number" step="any" placeholder="Latitude" value={value.lat ?? ''} onChange={(event) => onChange({ ...value, lat: event.target.value === '' ? null : Number(event.target.value) })} />
        <Input type="number" step="any" placeholder="Longitude" value={value.lng ?? ''} onChange={(event) => onChange({ ...value, lng: event.target.value === '' ? null : Number(event.target.value) })} />
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : <p className="text-sm text-mute">The public card shows the neighbourhood and an approximate area. The exact spot is shared only after someone is selected.</p>}
    </div>
  )
}
