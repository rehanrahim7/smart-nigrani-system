/**
 * The member-to-work network: each member of parliament joined to the works
 * they recommended that most need a look.
 *
 * Carried over from the first version of the site, where it showed three
 * invented members and 36 invented works. Here it draws the real snapshot:
 * members by alias (MP 01 to MP 47) on public pages, works coloured by their
 * review label. It is a projected 3D drawing in plain SVG, no WebGL: points
 * are placed in 3D, rotated, and projected with a simple perspective divide.
 *
 * It turns slowly on its own. Drag to rotate, use the buttons to zoom, press
 * pause to stop it; with "reduce motion" set in the operating system it never
 * moves by itself. Every work node is a button reachable by keyboard.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { NetworkData, RiskLabel } from '../types'
import { RISK_COLOR, RISK_SHORT, inr } from '../format'

type NetworkWork = NetworkData['works'][number]

const MAX_MEMBERS = 8
const WIDTH = 840
const HEIGHT = 520

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function NetworkScene({
  data,
  selected,
  onSelect,
  paused,
  onPause,
  names,
}: {
  data: NetworkData | null
  selected: string | null
  onSelect: (work: NetworkWork) => void
  paused: boolean
  onPause: () => void
  /** Real names by alias, for the signed-in research view. Public pages pass nothing. */
  names?: Record<string, string>
}) {
  const [angle, setAngle] = useState(0.4)
  const [tilt, setTilt] = useState(0.3)
  const [zoom, setZoom] = useState(1)
  const drag = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (paused || reducedMotion()) return
    const timer = window.setInterval(() => setAngle((a) => a + 0.0035), 40)
    return () => window.clearInterval(timer)
  }, [paused])

  // The members with the most flagged works, so the picture opens on the
  // part of the data that matters. The count underneath says how many more.
  const members = useMemo(() => {
    const list = [...(data?.members ?? [])].sort((a, b) => b.flagged - a.flagged || b.works - a.works)
    return list.slice(0, MAX_MEMBERS)
  }, [data])

  const project = (x: number, y: number, z: number) => {
    const xx = x * Math.cos(angle) + z * Math.sin(angle)
    const zz = -x * Math.sin(angle) + z * Math.cos(angle)
    const yy = y * Math.cos(tilt) - zz * Math.sin(tilt)
    const depth = y * Math.sin(tilt) + zz * Math.cos(tilt)
    const scale = (700 / (700 + depth)) * zoom
    return { x: WIDTH / 2 + xx * scale, y: HEIGHT / 2 + yy * scale, s: scale }
  }

  const ring = 250
  const hubs = members.map((member, index) => {
    const t = (index / Math.max(1, members.length)) * Math.PI * 2
    return { member, base: { x: Math.cos(t) * ring, y: 0, z: Math.sin(t) * ring } }
  })

  const nodes = hubs
    .flatMap(({ member, base }, hubIndex) => {
      const own = (data?.works ?? []).filter((w) => w.mpAlias === member.alias)
      return own.map((work, index) => {
        const t = (index / Math.max(1, own.length)) * Math.PI * 2 + hubIndex
        const x = base.x + Math.cos(t) * 78
        const y = Math.sin(t) * 92
        const z = base.z + Math.sin(t * 2 + hubIndex) * 60
        return { work, ...project(x, y, z), hub: project(base.x, base.y, base.z), key: index }
      })
    })
    .sort((a, b) => a.s - b.s)

  const hubPoints = hubs
    .map(({ member, base }) => ({ member, ...project(base.x, base.y, base.z) }))
    .sort((a, b) => a.s - b.s)

  const moving = !paused && !reducedMotion()
  const hidden = (data?.members.length ?? 0) - members.length

  return (
    <div className="network">
      <div className="network-label">
        <span className="pulse-dot" /> Recommendation network
        <span className="grow" />
        <span className="network-hint">Drag to turn</span>
      </div>

      {!data && <div className="network-empty">Loading the network…</div>}
      {data && data.works.length === 0 && (
        <div className="network-empty">No works match these filters. Reset the filters to see the network.</div>
      )}

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="group"
        aria-label="Network joining members of parliament to the works they recommended"
        onPointerDown={(event) => {
          if ((event.target as Element).closest('[data-node]')) return
          drag.current = { x: event.clientX, y: event.clientY }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!drag.current) return
          setAngle((a) => a + (event.clientX - drag.current!.x) * 0.008)
          setTilt((t) => Math.max(-0.7, Math.min(0.7, t + (event.clientY - drag.current!.y) * 0.004)))
          drag.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <defs>
          <radialGradient id="network-glow">
            <stop offset="0" stopColor="var(--accent-soft)" />
            <stop offset="1" stopColor="var(--panel)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx={WIDTH / 2} cy={HEIGHT / 2 + 30} rx={380} ry={220} fill="url(#network-glow)" />

        {nodes.map((n) => {
          const path = `M${n.hub.x} ${n.hub.y} Q${(n.hub.x + n.x) / 2} ${Math.min(n.y, n.hub.y) - 40} ${n.x} ${n.y}`
          const active = selected === n.work.id
          const colour = RISK_COLOR[n.work.riskLabel as RiskLabel]
          return (
            <g key={`line-${n.work.id}`}>
              <path
                d={path}
                fill="none"
                stroke={colour}
                strokeWidth={active ? 2.6 : 1.1}
                opacity={active ? 1 : 0.32}
              />
              {moving && (
                <circle r="2.6" fill={colour} opacity={0.9}>
                  <animateMotion dur={`${3 + (n.key % 4)}s`} repeatCount="indefinite" path={path} />
                </circle>
              )}
            </g>
          )
        })}

        {hubPoints.map(({ member, x, y, s }) => (
          <g key={member.alias} transform={`translate(${x} ${y}) scale(${s})`} className="network-hub">
            <circle r="34" fill="var(--panel)" stroke="var(--rule-strong)" />
            <circle r="28" fill="var(--sage-soft)" />
            {/* A plain person glyph, not a portrait: these are real people. */}
            <circle cy="-7" r="8" fill="var(--sage)" />
            <path d="M-15 17Q-14 3 0 3Q14 3 15 17Z" fill="var(--sage)" />
            <text y="52" textAnchor="middle" className="network-hub-name">
              {names?.[member.alias] ?? member.alias}
            </text>
            <text y="67" textAnchor="middle" className="network-hub-sub">
              {member.flagged} flagged of {member.works}
            </text>
          </g>
        ))}

        {nodes.map((n) => {
          const active = selected === n.work.id
          const colour = RISK_COLOR[n.work.riskLabel as RiskLabel]
          return (
            <g
              key={n.work.id}
              data-node
              role="button"
              tabIndex={0}
              aria-label={`${n.work.anonId}: ${n.work.name}. ${RISK_SHORT[n.work.riskLabel as RiskLabel]}. Select`}
              aria-pressed={active}
              className="network-node"
              transform={`translate(${n.x} ${n.y}) scale(${n.s})`}
              onClick={() => onSelect(n.work)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(n.work)
                }
              }}
            >
              <title>{`${n.work.anonId} · ${n.work.name} · ${inr(n.work.budget)}`}</title>
              <circle
                r={active ? 17 : 13}
                fill="var(--panel)"
                stroke={colour}
                strokeWidth={active ? 3 : 1.6}
              />
              <circle r={active ? 7 : 5} fill={colour} />
              {active && <circle r="24" fill="none" stroke={colour} strokeOpacity="0.35" strokeWidth="2" className="network-ping" />}
            </g>
          )
        })}
      </svg>

      <div className="network-controls">
        <button type="button" onClick={onPause} aria-label={paused ? 'Resume motion' : 'Pause motion'} title={paused ? 'Resume motion' : 'Pause motion'}>
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
        <button type="button" onClick={() => setAngle((a) => a - 0.35)} aria-label="Turn left" title="Turn left">
          <TurnIcon />
        </button>
        <button type="button" onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))} aria-label="Zoom in" title="Zoom in">
          +
        </button>
        <button type="button" onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))} aria-label="Zoom out" title="Zoom out">
          −
        </button>
        <button
          type="button"
          onClick={() => {
            setAngle(0.4)
            setTilt(0.3)
            setZoom(1)
          }}
          aria-label="Reset view"
          title="Reset view"
        >
          <ResetIcon />
        </button>
      </div>

      <div className="network-legend">
        {(['Critical Review', 'High Review', 'Medium Review', 'Routine'] as RiskLabel[]).map((label) => (
          <span key={label}>
            <i style={{ background: RISK_COLOR[label] }} />
            {RISK_SHORT[label]}
          </span>
        ))}
        {hidden > 0 && <span className="faint">+{hidden} more members, narrow the filters to see them</span>}
      </div>
    </div>
  )
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
    </svg>
  )
}

function TurnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ResetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}
