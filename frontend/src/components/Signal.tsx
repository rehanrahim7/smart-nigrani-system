/**
 * The signal meter, the one element that should make this interface
 * memorable.
 *
 * Every project carries four detector scores (peer cost, overlapping work,
 * timeline, payment-vs-workflow). Rather than hide them behind a single
 * number, the meter draws all four as stacked segments: colour says which
 * detector, length says how strongly it fired, and a filled cap says it
 * crossed its threshold. A reviewer can scan a list and see the *shape* of a
 * problem, three short bars plus one long orange one is a different story
 * from one long purple one, without reading a word.
 */

import type { RiskLabel, Scores, SignalKey } from '../types'
import {
  RISK_CLASS,
  SIGNAL_TITLE,
  RISK_SHORT,
  SIGNAL_COLOR,
  SIGNAL_LABEL,
  SIGNAL_ORDER,
  SIGNAL_THRESHOLD,
} from '../format'

export function SignalMeter({
  scores,
  width = 64,
  height = 4,
  gap = 2,
  title = true,
}: {
  scores: Scores
  width?: number
  height?: number
  gap?: number
  title?: boolean
}) {
  const rows = SIGNAL_ORDER.map((key) => ({
    key,
    score: Math.max(0, Math.min(100, scores?.[key] ?? 0)),
    fired: (scores?.[key] ?? 0) >= SIGNAL_THRESHOLD[key],
  }))

  const totalHeight = rows.length * height + (rows.length - 1) * gap

  return (
    <svg
      width={width}
      height={totalHeight}
      viewBox={`0 0 ${width} ${totalHeight}`}
      role="img"
      aria-label={rows.map((r) => `${SIGNAL_LABEL[r.key]} ${Math.round(r.score)}`).join(', ')}
      style={{ display: 'block', flex: 'none' }}
    >
      {title && (
        <title>
          {rows
            .map((r) => `${SIGNAL_TITLE[r.key]}: ${Math.round(r.score)} out of 100${r.fired ? ' (flagged)' : ''}`)
            .join('\n')}
        </title>
      )}
      {rows.map((row, index) => {
        const y = index * (height + gap)
        const filled = Math.max(row.score > 0 ? 2 : 0, (row.score / 100) * width)
        return (
          <g key={row.key}>
            {/* track */}
            <rect x={0} y={y} width={width} height={height} rx={height / 2} fill="var(--rule)" />
            {/* value */}
            {filled > 0 && (
              <rect
                x={0}
                y={y}
                width={filled}
                height={height}
                rx={height / 2}
                fill={SIGNAL_COLOR[row.key]}
                opacity={row.fired ? 1 : 0.42}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** Legend explaining what the four bars mean. Shown once per screen. */
export function SignalLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div className="row wrap" style={{ gap: compact ? 10 : 14 }}>
      {SIGNAL_ORDER.map((key) => (
        <span key={key} className="row" style={{ gap: 5 }}>
          <span
            style={{
              width: 10,
              height: 3,
              borderRadius: 2,
              background: SIGNAL_COLOR[key],
              flex: 'none',
            }}
          />
          <span className="label" style={{ letterSpacing: '0.08em' }}>
            {SIGNAL_LABEL[key]}
          </span>
        </span>
      ))}
    </div>
  )
}

/** Severity chip. */
export function RiskBadge({ label, score }: { label: RiskLabel; score?: number }) {
  return (
    <span className={`sev ${RISK_CLASS[label]}`}>
      <span className="sev-dot" />
      {RISK_SHORT[label]}
      {score !== undefined && <span style={{ opacity: 0.75 }}>{Math.round(score)}</span>}
    </span>
  )
}

/**
 * One detector, expanded: score, threshold marker, and the plain-English
 * sentence the Python pipeline produced. Section 5.21 of the brief insists a
 * risk score must explain itself, and this is where that happens.
 */
export function SignalRow({
  signalKey,
  label,
  score,
  active,
  explanation,
}: {
  signalKey: SignalKey
  label: string
  score: number
  active: boolean
  explanation: string | null
}) {
  const threshold = SIGNAL_THRESHOLD[signalKey]
  const colour = SIGNAL_COLOR[signalKey]

  return (
    <div
      style={{
        padding: '11px 0',
        borderBottom: '1px solid var(--rule)',
        opacity: active ? 1 : 0.62,
      }}
    >
      <div className="row" style={{ gap: 10, marginBottom: 7 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 2,
            background: colour,
            opacity: active ? 1 : 0.4,
            flex: 'none',
          }}
        />
        <span className="h2 grow">{label}</span>
        {active && (
          <span
            className="label"
            style={{ color: colour, letterSpacing: '0.1em' }}
          >
            Flagged
          </span>
        )}
        <span
          className="mono"
          style={{ fontSize: 13, fontWeight: 600, color: active ? colour : 'var(--text-dim)' }}
        >
          {Math.round(score)}
        </span>
      </div>

      {/* Track with a tick at the detector's own threshold, so the reader can
          see how far past the line the score sits, not just that it passed. */}
      <div
        style={{
          position: 'relative',
          height: 5,
          borderRadius: 3,
          background: 'var(--rule)',
          overflow: 'hidden',
          marginBottom: explanation ? 8 : 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${Math.max(0, Math.min(100, score))}%`,
            background: colour,
            opacity: active ? 1 : 0.4,
            borderRadius: 3,
            transition: 'width 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
        <div
          title={`This check raises a flag at ${threshold}`}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${threshold}%`,
            width: 1,
            background: 'rgba(255,255,255,0.42)',
          }}
        />
      </div>

      {explanation && (
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-dim)' }}>
          {explanation}
        </p>
      )}
    </div>
  )
}
