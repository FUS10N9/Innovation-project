import { circlePolygon } from '@/lib/geo'
import { mapboxToken } from '@/lib/supabase'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

type Marker = { id: string; lat: number; lng: number; title: string }

export function TaskMap({
  center,
  markers = [],
  circleMeters,
  onMove,
}: {
  center: { lat: number; lng: number }
  markers?: Marker[]
  circleMeters?: number
  onMove?: (point: { lat: number; lng: number }) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove
  const markerKey = markers.map((marker) => `${marker.id}:${marker.lat}:${marker.lng}`).join('|')

  useEffect(() => {
    if (!mapboxToken || !ref.current) return
    let map: import('mapbox-gl').Map | null = null
    let active = true
    const currentMarkers = markers
    ;(async () => {
      const mapboxgl = (await import('mapbox-gl')).default
      await import('mapbox-gl/dist/mapbox-gl.css')
      if (!active || !ref.current) return
      mapboxgl.accessToken = mapboxToken
      map = new mapboxgl.Map({
        container: ref.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [center.lng, center.lat],
        zoom: circleMeters ? 14 : 13,
      })
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
      map.on('load', () => {
        if (!map) return
        if (circleMeters) {
          map.addSource('area', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: circlePolygon(center.lng, center.lat, circleMeters) } })
          map.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#1F7A4D', 'fill-opacity': 0.16 } })
          map.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#1F7A4D', 'line-width': 1.5 } })
        }
        currentMarkers.forEach((marker) => {
          const element = document.createElement('button')
          element.className = 'h-3.5 w-3.5 rounded-full border-2 border-white bg-pine-600 shadow'
          element.title = marker.title
          element.onclick = () => navigate(`/tasks/${marker.id}`)
          new mapboxgl.Marker({ element }).setLngLat([marker.lng, marker.lat]).addTo(map!)
        })
      })
      map.on('click', (event) => onMoveRef.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng }))
    })()
    return () => {
      active = false
      map?.remove()
    }
    // markerKey captures marker identity without rebuilding on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, circleMeters, markerKey, navigate])

  if (!mapboxToken) {
    return <div className="flex h-full min-h-64 items-center justify-center rounded-3xl bg-stone-100 p-6 text-center text-sm text-mute">Add a Mapbox token to show the map. Search and coordinates still work.</div>
  }
  return <div ref={ref} className="h-full min-h-72 overflow-hidden rounded-3xl" />
}
