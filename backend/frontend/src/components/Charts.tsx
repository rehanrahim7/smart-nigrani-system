/**
 * Charts, hand-written as SVG.
 *
 * No charting library. Recharts and friends cost 100KB+ gzipped and still
 * need fighting to look like anything but a demo. These are a few hundred
 * bytes, render instantly, and match the instrument-panel surface exactly.
 *
 * Every bar carries its value as a direct label, so nothing here depends on
 * hover to be readable, which also means it survives a projector, a
 * screenshot in a slide deck, and a judge looking from three metres away.
 */

import type { ReactNode } from 'react'
import type { DistrictStat, NamedValue, RiskLabel, SignalKey } from '../types'
import { RISK_COLOR, SIGNAL_COLOR, count, inr, percent } from '../format'

/* -------------------------------------------------------------------------
   KPI tile
   ------------------------------------------------------------------------- */

export function Stat({
  label,
  value,
  sub,
  tone,
  delay = 0,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: string
  delay?: number
}) {
  return (
    <div
      className="panel rise"
      style={{ padding: '11px 13px', animationDelay: `${delay}ms` }}
    >
      <div className="label" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 21,
          fontWeight: 600,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          color: tone ?? 'var(--text)',
        }}
      >
        {value}
      </div>
      {sub !== undefined && (
        <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------
   Severity distribution, one stacked bar
   Proportion is the story here ("how much of my constituency needs
   attention"), and a single stacked bar reads that faster than four columns.
   ------------------------------------------------------------------------- */

export function RiskStrip({
  data,
  onSelect,
  selected,
}: {
  data: NamedValue[]
  onSelect?: (label: RiskLabel | 'all') => void
  selected?: string
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  if (!total) return <Empty>No projects in scope</Empty>

  return (
    <div className="col" style={{ gap: 10 }}>
      <div
        style={{
          display: 'flex',
          height: 9,
          borderRadius: 5,
          overflow: 'hidden',
          background: 'var(--sunken)',
          // 2px surface gaps between segments, so adjacent fills never merge
          gap: 2,
        }}
      >
        {data
          .filter((d) => d.value > 0)
          .map((d) => (
            <div
              key={d.name}
              title={`${d.name}: ${count(d.value)} projects, ${percent(d.value / total, 1)}`}
              style={{
                flex: d.value,
                background: RISK_COLOR[d.name as RiskLabel],
                opacity: selected && selected !== 'all' && selected !== d.name ? 0.3 : 1,
                transition: 'opacity 0.15s ease',
              }}
            />
          ))}
      </div>

      <div className="row wrap" style={{ gap: 12 }}>
        {data.map((d) => {
          const active = selected === d.name
          return (
            <button
              key={d.name}
              type="button"
              onClick={() => onSelect?.(active ? 'all' : (d.name as RiskLabel))}
              disabled={!onSelect}
              className="row"
              style={{
                gap: 6,
                cursor: onSelect ? 'pointer' : 'default',
                opacity: selected && selected !== 'all' && !active ? 0.45 : 1,
                transition: 'opacity 0.15s ease',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: RISK_COLOR[d.name as RiskLabel],
                  flex: 'none',
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {d.name.replace(' Review', '')}
              </span>
              <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                {count(d.value)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------
   Horizontal bar list, magnitude comparison, one series, one hue
   ------------------------------------------------------------------------- */

export function BarList({
  data,
  format = count,
  colour = 'var(--accent)',
  max,
  onSelect,
  selected,
  emptyLabel = 'Nothing to show',
}: {
  data: NamedValue[]
  format?: (value: number) => string
  colour?: string | ((row: NamedValue, index: number) => string)
  max?: number
  onSelect?: (name: string) => void
  selected?: string
  emptyLabel?: string
}) {
  if (!data.length) return <Empty>{emptyLabel}</Empty>
  const ceiling = max ?? Math.max(...data.map((d) => d.value), 1)

  return (
    <div className="col" style={{ gap: 9 }}>
      {data.map((row, index) => {
        const fill = typeof colour === 'function' ? colour(row, index) : colour
        const active = selected === row.name
        const Wrapper = onSelect ? 'button' : 'div'
        return (
          <Wrapper
            key={row.name}
            {...(onSelect
              ? { type: 'button' as const, onClick: () => onSelect(active ? 'all' : row.name) }
              : {})}
            className="col rise"
            style={{
              gap: 4,
              width: '100%',
              textAlign: 'left',
              animationDelay: `${index * 28}ms`,
              opacity: selected && selected !== 'all' && !active ? 0.5 : 1,
              cursor: onSelect ? 'pointer' : 'default',
              transition: 'opacity 0.15s ease',
            }}
          >
            <div className="row" style={{ gap: 8 }}>
              <span
                className="grow truncate"
                style={{ fontSize: 12.5, color: 'var(--text-dim)' }}
                title={row.name}
              >
                {row.name}
              </span>
              <span className="mono" style={{ fontSize: 12, fontWeight: 600, flex: 'none' }}>
                {format(row.value)}
              </span>
            </div>
            <div
              style={{
                height: 5,
                borderRadius: 3,
                background: 'var(--sunken)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.max(row.value > 0 ? 1.5 : 0, (row.value / ceiling) * 100)}%`,
                  background: fill,
                  borderRadius: 3,
                  transition: 'width 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            </div>
          </Wrapper>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------
   District table, budget against spend
   Two measures of the same unit (rupees), so one scale, one chart. The
   utilisation figure is the interesting column and gets its own tint.
   ------------------------------------------------------------------------- */

export function DistrictTable({ data }: { data: DistrictStat[] }) {
  if (!data.length) return <Empty>No districts in scope</Empty>
  const ceiling = Math.max(...data.map((d) => d.budget), 1)

  return (
    <div className="col" style={{ gap: 11 }}>
      {data.map((row, index) => (
        <div
          key={row.name}
          className="col rise"
          style={{ gap: 5, animationDelay: `${index * 30}ms` }}
        >
          <div className="row" style={{ gap: 8 }}>
            <span className="grow truncate" style={{ fontSize: 12.5 }}>
              {row.name}
            </span>
            {row.flagged > 0 && (
              <span
                className="mono"
                style={{ fontSize: 10.5, color: 'var(--high)', flex: 'none' }}
                title={`${row.flagged} project(s) flagged for a look`}
              >
                {row.flagged} flagged
              </span>
            )}
            <span
              className="mono faint"
              style={{ fontSize: 11, flex: 'none', minWidth: 52, textAlign: 'right' }}
            >
              {count(row.count)} works
            </span>
            <span
              className="mono"
              style={{ fontSize: 12, fontWeight: 600, flex: 'none', minWidth: 62, textAlign: 'right' }}
            >
              {inr(row.budget)}
            </span>
          </div>

          {/* Sanctioned budget as the track; spend as the fill inside it. One
              axis, one unit, never two scales on one chart. */}
          <div
            style={{
              position: 'relative',
              height: 6,
              borderRadius: 3,
              background: 'var(--sunken)',
              overflow: 'hidden',
            }}
            title={`Approved ${inr(row.budget)}, paid ${inr(row.spent)}, that is ${percent(row.utilisation)}`}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: `${(row.budget / ceiling) * 100}%`,
                background: 'var(--rule-strong)',
                borderRadius: 3,
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: `${(row.spent / ceiling) * 100}%`,
                background: 'var(--accent)',
                borderRadius: 3,
                transition: 'width 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </div>

          <div className="faint" style={{ fontSize: 11 }}>
            {inr(row.spent)} paid, {percent(row.utilisation)} of what was approved
          </div>
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------
   Detector activity, categorical, uses the validated detector hues
   ------------------------------------------------------------------------- */

export function SignalBars({
  data,
  total,
}: {
  data: (NamedValue & { key: SignalKey })[]
  total: number
}) {
  const ceiling = Math.max(...data.map((d) => d.value), 1)

  return (
    <div className="col" style={{ gap: 10 }}>
      {data.map((row, index) => (
        <div key={row.key} className="col rise" style={{ gap: 4, animationDelay: `${index * 30}ms` }}>
          <div className="row" style={{ gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: SIGNAL_COLOR[row.key],
                flex: 'none',
              }}
            />
            <span className="grow truncate" style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
              {row.name}
            </span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
              {count(row.value)}
            </span>
            {total > 0 && (
              <span className="mono faint" style={{ fontSize: 11, minWidth: 38, textAlign: 'right' }}>
                {percent(row.value / total, 1)}
              </span>
            )}
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--sunken)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.max(row.value > 0 ? 1.5 : 0, (row.value / ceiling) * 100)}%`,
                background: SIGNAL_COLOR[row.key],
                borderRadius: 3,
                transition: 'width 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------
   Budget utilisation meter
   A single headline figure, so it is a stat with a bar, not a chart.
   ------------------------------------------------------------------------- */

export function UtilisationMeter({
  spent,
  budget,
}: {
  spent: number
  budget: number
}) {
  const ratio = budget > 0 ? spent / budget : 0
  const capped = Math.min(1, ratio)
  // Over 100% utilisation is itself a finding, so it gets the alert colour.
  const tone = ratio > 1 ? 'var(--critical)' : ratio > 0.85 ? 'var(--high)' : 'var(--accent)'

  return (
    <div className="col" style={{ gap: 9 }}>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <span
          className="mono"
          style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', color: tone }}
        >
          {percent(ratio, 1)}
        </span>
        <span className="faint" style={{ fontSize: 12 }}>
          of the approved money has been paid out
        </span>
      </div>

      <div
        style={{
          position: 'relative',
          height: 8,
          borderRadius: 4,
          background: 'var(--sunken)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${capped * 100}%`,
            background: tone,
            borderRadius: 4,
            transition: 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="faint" style={{ fontSize: 11.5 }}>
          {inr(spent)} paid
        </span>
        <span className="faint" style={{ fontSize: 11.5 }}>
          {inr(budget)} approved
        </span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------
   shared empty state
   ------------------------------------------------------------------------- */

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div
      className="faint"
      style={{ fontSize: 12.5, padding: '18px 0', textAlign: 'center' }}
    >
      {children}
    </div>
  )
}
