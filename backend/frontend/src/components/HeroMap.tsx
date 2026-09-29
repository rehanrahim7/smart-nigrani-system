/**
 * The picture on the landing page: a real map of Maharashtra with every
 * project on it.
 *
 * Two earlier attempts are worth recording so nobody repeats them. The first
 * drew the works as a grid of 4,807 squares; it was truthful but looked like
 * grey noise. The second plotted them by coordinate on a blank canvas, hoping
 * the shape of the state would emerge; it could not, because the source data
 * only gives 39 district centres, so it came out as scattered blobs.
 *
 * A map solves both problems. It is instantly recognisable, the dots sit on
 * real places, and it is the same view the dashboard uses, so the front page
 * is showing the product rather than an illustration of it.
 *
 * It behaves as an image: dragging, zooming and keyboard control are all off,
 * and the whole card is one link into the app. Leaflet is loaded only when
 * this component is reached, so it never delays the first paint of the page.
 */

import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import { api } from '../api'
import { useAsync } from '../hooks'
import { cssColour, useTheme } from '../theme'

// Maharashtra, framed so the whole state sits inside the card.
const FRAME: L.LatLngBoundsExpression = [
  [15.7, 72.7],
  [22.1, 80.6],
]

const STYLE = [
  { colour: '--routine', radius: 2.2, weight: 0, fillOpacity: 0.5 },
  { colour: '--medium', radius: 3.4, weight: 0, fillOpacity: 0.95 },
  { colour: '--high', radius: 4.2, weight: 0, fillOpacity: 1 },
  { colour: '--critical', radius: 6, weight: 1.5, fillOpacity: 1 },
]

export function HeroMap({ onOpen }: { onOpen?: () => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const { version } = useTheme()

  const data = useAsync(() => api.publicMap(), [])

  // Least urgent first, so the flagged works are painted on top.
  const points = useMemo(
    () => [...(data.data?.points ?? [])].sort((a, b) => a[2] - b[2]),
    [data.data],
  )

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return

    const map = L.map(hostRef.current, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      // Behaves as a picture, not a control.
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    })

    map.fitBounds(FRAME, { padding: [6, 6] })

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12,
      minZoom: 4,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)

    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    // The card is fluid, so the map has to be told when its box changes.
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        map.invalidateSize({ animate: false })
        map.fitBounds(FRAME, { padding: [6, 6] })
      })
    })
    observer.observe(hostRef.current)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.clearLayers()

    for (const [lat, lon, rank] of points) {
      const style = STYLE[rank] ?? STYLE[0]
      const colour = cssColour(style.colour)
      L.circleMarker([lat, lon], {
        radius: style.radius,
        color: colour,
        weight: style.weight,
        fillColor: colour,
        fillOpacity: style.fillOpacity,
        interactive: false,
      }).addTo(layer)
    }
  }, [points, version])

  const body = (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '10 / 8',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid var(--rule)',
        boxShadow: 'var(--shadow)',
        background: 'var(--sunken)',
      }}
    >
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />

      {data.loading && (
        <div
          className="row"
          style={{
            position: 'absolute',
            inset: 0,
            justifyContent: 'center',
            background: 'var(--sunken)',
          }}
        >
          <span className="spinner" />
        </div>
      )}
    </div>
  )

  return (
    <figure style={{ margin: 0 }}>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          style={{ display: 'block', width: '100%', textAlign: 'left' }}
          aria-label="Open the dashboard"
        >
          {body}
        </button>
      ) : (
        body
      )}

      <figcaption className="row wrap" style={{ gap: 14, marginTop: 14 }}>
        {[
          ['Critical', '--critical'],
          ['High', '--high'],
          ['Medium', '--medium'],
          ['Routine', '--routine'],
        ].map(([name, token]) => (
          <span key={name} className="row" style={{ gap: 6 }}>
            <span
              aria-hidden="true"
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: `var(${token})`,
                opacity: name === 'Routine' ? 0.55 : 1,
                flex: 'none',
              }}
            />
            <span className="label" style={{ letterSpacing: '0.07em' }}>
              {name}
            </span>
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
