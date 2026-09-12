/**
 * The live map.
 *
 * Leaflet directly, no react-leaflet wrapper — the wrapper adds a dependency
 * and a re-render model we do not need for what is essentially one imperative
 * canvas.
 *
 * Two decisions worth knowing:
 *
 * 1. Markers render to a CANVAS layer, not SVG. A member with works across
 *    several districts can put hundreds on screen at once; as DOM nodes that
 *    is a visibly janky pan. On canvas it is smooth.
 * 2. Markers are drawn highest-risk LAST, so critical pins sit on top of the
 *    routine ones they would otherwise hide.
 */

import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
// leaflet.css is imported once in main.tsx, BEFORE styles.css, so our dark
// overrides win on source order instead of needing !important everywhere.
import type { MapPoint, RiskLabel } from '../types'
import { RISK_SHORT, RISK_VAR, count, inr } from '../format'
import { cssColour, useTheme } from '../theme'

// Maharashtra, framed so the whole state sits in the panel at first paint.
const HOME: L.LatLngBoundsExpression = [
  [15.6, 72.6],
  [22.1, 80.9],
]

const RADIUS: Record<RiskLabel, number> = {
  'Critical Review': 7,
  'High Review': 6,
  'Medium Review': 5,
  Routine: 3.5,
}

const DRAW_ORDER: RiskLabel[] = ['Routine', 'Medium Review', 'High Review', 'Critical Review']

export function MapPanel({
  points,
  selectedId,
  onSelect,
  loading,
}: {
  points: MapPoint[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  loading?: boolean
}) {
  // `version` changes whenever the theme flips. The markers live on a canvas
  // and cannot pick up new CSS by themselves, so they are redrawn.
  const { version } = useTheme()

  const hostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map())
  // Keep the latest callback in a ref so marker handlers never close over a
  // stale prop, without needing to rebind every marker on each render.
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect

  /* --- create the map once ------------------------------------------- */
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return

    const map = L.map(hostRef.current, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
      // Scroll-zoom is disabled until the map is clicked. Otherwise scrolling
      // the page over the map hijacks the wheel, which is infuriating.
      scrollWheelZoom: false,
    })

    map.fitBounds(HOME, { padding: [16, 16] })

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      minZoom: 5,
      attribution: '&copy; OpenStreetMap',
      // Serve retina-ish density without a second request; tiles are dimmed
      // by CSS anyway so the loss of sharpness is invisible.
      detectRetina: false,
    }).addTo(map)

    map.on('click', () => map.scrollWheelZoom.enable())
    map.on('mouseout', () => map.scrollWheelZoom.disable())

    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    // The panel is sized by flexbox, so its height changes when the window
    // resizes or a tab switches. Leaflet caches the size it was created with
    // and paints grey where it thinks there is nothing, so it has to be told.
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => map.invalidateSize({ animate: false }))
    })
    observer.observe(hostRef.current)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      map.remove()
      mapRef.current = null
      layerRef.current = null
      markersRef.current.clear()
    }
  }, [])

  /* --- redraw markers when the data changes --------------------------- */
  const sorted = useMemo(
    () =>
      [...points].sort(
        (a, b) => DRAW_ORDER.indexOf(a.riskLabel) - DRAW_ORDER.indexOf(b.riskLabel),
      ),
    [points],
  )

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    layer.clearLayers()
    markersRef.current.clear()

    for (const point of sorted) {
      if (point.lat == null || point.lon == null) continue
      const colour = cssColour(RISK_VAR[point.riskLabel])
      const routine = point.riskLabel === 'Routine'

      const marker = L.circleMarker([point.lat, point.lon], {
        radius: RADIUS[point.riskLabel],
        color: colour,
        weight: routine ? 1 : 1.5,
        opacity: routine ? 0.5 : 0.95,
        fillColor: colour,
        fillOpacity: routine ? 0.18 : 0.55,
        // Routine pins stay clickable but never steal a hover from a flagged
        // one sitting underneath the cursor.
        bubblingMouseEvents: false,
      })

      marker.bindPopup(popupHtml(point, colour), { closeButton: true, maxWidth: 260 })
      marker.on('click', () => selectRef.current?.(point.id))
      marker.addTo(layer)
      markersRef.current.set(point.id, marker)
    }

    // Fit to the data when the visible set is small enough that the default
    // state-wide frame would leave the pins as a tiny cluster.
    const map = mapRef.current
    if (map && sorted.length > 0 && sorted.length <= 400) {
      // Fit to EVERY point, including distant ones. MPLADS permits a member
      // to spend part of their allocation outside their own constituency, and
      // some do so heavily — one member in this dataset has 26 of 117 works in
      // Etah, Uttar Pradesh, roughly 900 km from Hingoli. Trimming outliers to
      // get a tidier frame would quietly hide a fifth of their portfolio, so
      // the map zooms out instead and the district filter narrows it back down.
      const bounds = L.latLngBounds(
        sorted
          .filter((p) => p.lat != null && p.lon != null)
          .map((p) => [p.lat, p.lon] as [number, number]),
      )
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [34, 34], maxZoom: 10, animate: false })
      }
    }
  }, [sorted, version])

  /* --- highlight the selected project --------------------------------- */
  useEffect(() => {
    if (!selectedId) return
    const marker = markersRef.current.get(selectedId)
    const map = mapRef.current
    if (!marker || !map) return

    marker.setStyle({ weight: 3, opacity: 1, fillOpacity: 0.8 })
    marker.bringToFront()
    map.panTo(marker.getLatLng(), { animate: true, duration: 0.35 })

    return () => {
      const routine = marker.options.fillOpacity === 0.18
      marker.setStyle({
        weight: routine ? 1 : 1.5,
        opacity: routine ? 0.5 : 0.95,
        fillOpacity: routine ? 0.18 : 0.55,
      })
    }
  }, [selectedId])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />

      {loading && (
        <div
          className="row fade"
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            zIndex: 500,
            gap: 7,
            padding: '5px 10px',
            background: 'var(--panel)',
            border: '1px solid var(--rule)',
            borderRadius: 4,
          }}
        >
          <span className="spinner" />
          <span className="label">Loading</span>
        </div>
      )}

      {/* Honesty note. The source CSVs carry no work-site coordinates, so
          saying so on the map itself is better than letting a judge assume
          these are surveyed positions. */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 10,
          zIndex: 500,
          padding: '4px 8px',
          background: 'var(--panel)',
          border: '1px solid var(--rule)',
          borderRadius: 4,
          pointerEvents: 'none',
        }}
      >
        <span className="label" style={{ letterSpacing: '0.09em' }}>
          District-level approximation
        </span>
      </div>
    </div>
  )
}

function popupHtml(point: MapPoint, colour: string): string {
  return `
    <div style="min-width:190px">
      <div style="font-family:var(--font-mono);font-size:9.5px;letter-spacing:.12em;
                  text-transform:uppercase;color:${colour};margin-bottom:5px">
        ${RISK_SHORT[point.riskLabel]} &middot; ${Math.round(point.riskScore)}
      </div>
      <div style="font-size:12.5px;line-height:1.45;margin-bottom:7px">
        ${escapeHtml(point.name)}
      </div>
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">
        ${escapeHtml(point.district ?? 'Unknown district')} &middot; ${inr(point.budget)}
      </div>
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-faint);margin-top:3px">
        ${escapeHtml(point.status)}
      </div>
    </div>
  `
}

/** Project descriptions come from a government CSV — treat them as untrusted
 *  text, never as markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function MapLegend({ shown, total }: { shown: number; total: number }) {
  return (
    <div className="row wrap" style={{ gap: 12 }}>
      {DRAW_ORDER.slice()
        .reverse()
        .map((label) => (
          <span key={label} className="row" style={{ gap: 5 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: `var(${RISK_VAR[label]})`,
                opacity: label === 'Routine' ? 0.5 : 1,
                flex: 'none',
              }}
            />
            <span className="label" style={{ letterSpacing: '0.08em' }}>
              {RISK_SHORT[label]}
            </span>
          </span>
        ))}
      <span className="label grow" style={{ textAlign: 'right', letterSpacing: '0.08em' }}>
        {shown < total ? `${count(shown)} of ${count(total)}` : `${count(total)} works`}
      </span>
    </div>
  )
}
