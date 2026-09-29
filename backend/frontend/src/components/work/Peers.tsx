/**
 * The peer comparison, told in five steps: the selected work, the search for
 * comparable works, the group they form, the median, and what it means.
 *
 * The group is the record check's: other works with the same implementing
 * agency, the same kind of work and the same sanction year, with a positive
 * sanctioned amount, never including the work itself. These are total
 * amounts; the reports carry no quantities or specifications, so this is not
 * a unit-cost comparison and does not claim to be.
 *
 * The steps advance on their own every 1.7 seconds, unless the visitor has
 * asked their system to reduce motion; every step can also be clicked.
 */

import { useEffect, useMemo, useState } from 'react'
import type { ProjectDetail, WorkBrief } from '../../types'
import { count, inr } from '../../format'
import { workHref } from '../../router'

const STEPS = ['Select work', 'Search comparable works', 'Build peer group', 'Compare median', 'Review insight']

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function Peers({ project }: { project: ProjectDetail }) {
  const peers = useMemo(() => project.peers ?? [], [project.peers])
  const stats = project.peerStats ?? null
  const [step, setStep] = useState(reducedMotion() ? 4 : 0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (step >= 4 || paused || reducedMotion()) return
    const timer = window.setTimeout(() => setStep((s) => s + 1), 1700)
    return () => window.clearTimeout(timer)
  }, [step, paused])

  // Eight members of the group, spread across its range, for the drawing.
  const orbit = useMemo(() => {
    if (peers.length <= 8) return peers
    return Array.from({ length: 8 }, (_, i) => peers[Math.round((i * (peers.length - 1)) / 7)])
  }, [peers])

  const amount = project.sanctionAmount ?? 0
  const ratio = stats ? amount / stats.median : null
  const flagged = (project.checks ?? []).some((c) => c.kind === 'cost')

  const [year] = (project.sanctionDate ?? '').split('-')

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row wrap" style={{ justifyContent: 'space-between', gap: 12 }}>
        <div>
          <span className="kicker">Explainable comparison</span>
          <h2 className="page-title" style={{ fontSize: 'clamp(22px, 2.4vw, 32px)' }}>
            Every work deserves <em>a fair comparison.</em>
          </h2>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setPaused((v) => !v)}>
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              setPaused(false)
              setStep(0)
            }}
          >
            Replay
          </button>
        </div>
      </div>

      <ol className="peer-steps" aria-label="Steps of the comparison">
        {STEPS.map((name, index) => (
          <li key={name}>
            <button
              type="button"
              className={index === step ? 'active' : index < step ? 'done' : ''}
              aria-current={index === step ? 'step' : undefined}
              onClick={() => {
                setPaused(true)
                setStep(index)
              }}
            >
              <span>{index < step ? '✓' : index + 1}</span>
              {name}
            </button>
          </li>
        ))}
      </ol>

      <div className="peer-layout">
        <section className="panel peer-stage">
          <div className="panel-head">
            <span className="label">{STEPS[step]}</span>
            <span className="tag">{stats ? `${count(stats.count)} comparable works` : 'Not enough comparable works'}</span>
          </div>

          <div className="peer-canvas">
            {step === 0 && (
              <div className="peer-selected rise">
                <div className="selected-orb" aria-hidden="true">
                  ◎
                </div>
                <h3>{project.name}</h3>
                <p className="dim">
                  {project.workType ?? project.sector} · {inr(amount)} · sanctioned {year || 'date unknown'}
                </p>
                <small className="faint">The selected work is never part of its own benchmark.</small>
              </div>
            )}

            {step === 1 && (
              <div className="peer-radar rise">
                <div className="radar-ring" />
                <div className="radar-ring second" />
                <div className="radar-ring third" />
                <strong>Finding comparable works</strong>
                <span className="dim">Same agency → same kind of work → same sanction year</span>
              </div>
            )}

            {step === 2 &&
              (orbit.length ? (
                <svg className="peer-orbit rise" viewBox="0 0 600 390" role="img" aria-label={`${orbit.length} comparable works around the selected work`}>
                  <ellipse cx="300" cy="190" rx="215" ry="142" fill="none" stroke="var(--rule-strong)" strokeDasharray="4 7" />
                  {orbit.map((peer, index) => {
                    const a = (index / orbit.length) * Math.PI * 2
                    const x = 300 + Math.cos(a) * 215
                    const y = 190 + Math.sin(a) * 142
                    return (
                      <g key={peer.id}>
                        <path d={`M300 190Q${x} 190 ${x} ${y}`} className="peer-line" fill="none" />
                        <a href={workHref(peer.id)} aria-label={`Open ${peer.anonId}`}>
                          <circle cx={x} cy={y} r="30" className="peer-node" />
                          <text x={x} y={y + 4} textAnchor="middle" className="peer-node-label">
                            {peer.anonId}
                          </text>
                          <text x={x} y={y + 48} textAnchor="middle" className="peer-node-sub">
                            {inr(peer.sanctionAmount)}
                          </text>
                        </a>
                      </g>
                    )
                  })}
                  <circle cx="300" cy="190" r="50" fill="var(--accent)" />
                  <text x="300" y="187" textAnchor="middle" className="peer-centre-label">
                    {project.anonId}
                  </text>
                  <text x="300" y="206" textAnchor="middle" className="peer-centre-sub">
                    SELECTED
                  </text>
                </svg>
              ) : (
                <NotEnough />
              ))}

            {step >= 3 &&
              (stats && ratio !== null ? (
                <div className="peer-result rise">
                  <span className="kicker">Sanctioned amount against the group</span>
                  <h3 className="ratio">
                    {ratio.toFixed(1)}
                    <em>×</em>
                    <small>the group median</small>
                  </h3>
                  <Benchmark label="This work" value={amount} max={Math.max(amount, stats.q3)} tone="accent" />
                  <Benchmark label="Group median" value={stats.median} max={Math.max(amount, stats.q3)} tone="sage" />
                  <Benchmark label="Middle half (Q1 to Q3)" value={stats.q3} low={stats.q1} max={Math.max(amount, stats.q3)} tone="range" />
                  <p className="dim">
                    {flagged
                      ? 'This crosses the review line: above Q3 + 3 × IQR and more than 2.5 times the median. Check the specification and any revised sanction before drawing a conclusion; a larger scope can explain it.'
                      : 'This does not cross the review line (above Q3 + 3 × IQR and more than 2.5 times the median).'}
                  </p>
                  {step === 4 && (
                    <a className="btn btn-primary btn-sm" href={workHref(project.id)}>
                      Open the explained investigation →
                    </a>
                  )}
                </div>
              ) : (
                <NotEnough />
              ))}
          </div>

          <div className="peer-footer">
            <span className="faint small">
              {step < 2 ? 'The same rules apply to every work.' : 'The comparison group is listed below and every member can be opened.'}
            </span>
            <button className="link" disabled={step === 4} onClick={() => setStep((s) => Math.min(4, s + 1))}>
              Next step →
            </button>
          </div>
        </section>

        <aside className="panel card-pad common-factors">
          <span className="kicker">Common factors</span>
          <h3 className="serif">Like with like.</h3>
          <p className="dim small">Legitimate differences should not become red flags.</p>
          {[
            ['Implementing agency', project.agency ?? '-'],
            ['Kind of work', project.workType ?? '-'],
            ['Sanction year', year || '-'],
            ['Minimum group size', '8 other works'],
            ['Review line', 'Above Q3 + 3 × IQR and 2.5 × median'],
            ['Compares', 'Total amounts, not unit costs'],
          ].map(([label, value]) => (
            <div className="factor" key={label}>
              <span aria-hidden="true">✓</span>
              <span>
                {label}
                <b>{value}</b>
              </span>
            </div>
          ))}
        </aside>
      </div>

      <section className="panel">
        <div className="panel-head">
          <span className="label">The comparison group</span>
          <span className="label">{peers.length ? `${count(peers.length)} works · selected work excluded` : 'none'}</span>
        </div>
        {peers.length ? (
          <div className="peer-grid">
            {peers.map((peer) => (
              <PeerCard key={peer.id} peer={peer} />
            ))}
          </div>
        ) : (
          <NotEnough />
        )}
      </section>
    </div>
  )
}

function PeerCard({ peer }: { peer: WorkBrief }) {
  return (
    <a href={workHref(peer.id)} className="peer-card">
      <span className="label mono">
        {peer.anonId} · {peer.district ?? '-'}
      </span>
      <strong className="clamp-2">{peer.name}</strong>
      <small className="mono">{inr(peer.sanctionAmount)}</small>
    </a>
  )
}

function Benchmark({
  label,
  value,
  low,
  max,
  tone,
}: {
  label: string
  value: number
  low?: number
  max: number
  tone: 'accent' | 'sage' | 'range'
}) {
  const left = low !== undefined ? (low / max) * 100 : 0
  const width = ((value - (low ?? 0)) / max) * 100
  return (
    <div className="benchmark-row">
      <span>{label}</span>
      <div>
        <i className={tone} style={{ marginLeft: `${left}%`, width: `${Math.max(1, width)}%` }} />
      </div>
      <b className="mono">{low !== undefined ? `${inr(low)}–${inr(value)}` : inr(value)}</b>
    </div>
  )
}

function NotEnough() {
  return (
    <div className="empty-state">
      <h3>Not enough comparable works</h3>
      <p className="dim">
        A fair comparison needs at least 8 other works with the same agency, kind of work and sanction year. This work
        has fewer, so no amount comparison is made.
      </p>
    </div>
  )
}
