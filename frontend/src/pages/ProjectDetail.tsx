/**
 * Project detail.
 *
 * This is the screen both sketches lead to. It holds the Sr No / Work / Cost /
 * Date table, plus, for a vendor, the Add Work form. Above the table sits
 * the risk breakdown, because section 5.21 of the brief is explicit that a
 * score must say WHY, and the Python pipeline already produces the sentences.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { useAsync, useEscape } from '../hooks'
import {
  count,
  date as fmtDate,
  duration,
  inr,
  inrFull,
  percent,
  properName,
  todayIso,
} from '../format'
import { RiskBadge, SignalRow } from '../components/Signal'
import { Empty } from '../components/Charts'
import type { ProjectDetail as Project, WorkLog } from '../types'

export function ProjectDetail({
  projectId,
  onClose,
  onOpenProject,
}: {
  projectId: string
  onClose: () => void
  onOpenProject?: (id: string) => void
}) {
  const { user } = useAuth()
  const canEdit = user?.role === 'vendor'

  const { data, loading, error, reload } = useAsync(
    (signal) => api.project(projectId, signal),
    [projectId],
  )

  // Work rows are kept in local state so an addition appears the instant the
  // server confirms it, without refetching the whole project.
  const [works, setWorks] = useState<WorkLog[]>([])
  useEffect(() => {
    if (data) setWorks(data.works)
  }, [data])

  useEscape(onClose)

  // Lock the page behind the drawer so the background does not scroll with it.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const logged = useMemo(() => works.reduce((sum, w) => sum + w.cost, 0), [works])

  // Slide the panel in on the frame after it mounts. Doing it this way rather
  // than with a keyframe animation means the resting position is the default,
  // so the panel is never left sitting off the edge if the animation does not
  // get to run.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      className="fade"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(12, 16, 22, 0.5)',
        backdropFilter: 'blur(3px)',
        // The panel slides in from the right. Without this, that transform
        // pushes past the edge of the screen for the length of the animation
        // and the whole page can be scrolled sideways while it plays. It also
        // means a browser that never runs the animation (a background tab
        // throttles them) cannot leave the panel sitting off the edge.
        overflow: 'hidden',
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Project detail"
    >
      <div
        className="col"
        style={{
          width: 'min(760px, 100%)',
          height: '100%',
          background: 'var(--page)',
          borderLeft: '1px solid var(--rule)',
          boxShadow: 'var(--shadow-lg)',
          transform: shown ? 'none' : 'translateX(26px)',
          opacity: shown ? 1 : 0,
          transition: 'transform 0.26s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease',
        }}
      >
        {loading && <DetailSkeleton onClose={onClose} />}

        {error && (
          <div className="col" style={{ padding: 22, gap: 12 }}>
            <div className="row">
              <span className="h2 grow">Could not load this project</span>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>
                Close
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--critical)' }}>{error}</p>
            <button className="btn btn-sm" onClick={reload} style={{ alignSelf: 'flex-start' }}>
              Try again
            </button>
          </div>
        )}

        {data && (
          <Body
            project={data}
            works={works}
            logged={logged}
            canEdit={canEdit}
            onClose={onClose}
            onWorksChange={setWorks}
            onOpenProject={onOpenProject}
          />
        )}
      </div>

    </div>
  )
}

/* ------------------------------------------------------------------------ */

function Body({
  project,
  works,
  logged,
  canEdit,
  onClose,
  onWorksChange,
  onOpenProject,
}: {
  project: Project
  works: WorkLog[]
  logged: number
  canEdit: boolean
  onClose: () => void
  onWorksChange: (rows: WorkLog[]) => void
  onOpenProject?: (id: string) => void
}) {
  const [tab, setTab] = useState<'log' | 'why' | 'record'>('log')

  const firedSignals = project.signals.filter((s) => s.active)

  return (
    <>
      {/* ---------------- header ---------------- */}
      <header
        style={{
          padding: '16px 20px 0',
          borderBottom: '1px solid var(--rule)',
          background: 'var(--panel)',
          flex: 'none',
        }}
      >
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 9, marginBottom: 7 }}>
              <RiskBadge label={project.riskLabel} score={project.riskScore} />
              <span className="label mono" style={{ letterSpacing: '0.06em' }}>
                {project.anonId}
              </span>
            </div>
            <h2 className="h1" style={{ fontSize: 17, lineHeight: 1.35 }}>
              {project.name}
            </h2>
            <p className="faint mono" style={{ fontSize: 11, marginTop: 6 }}>
              {project.id}
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* facts strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))',
            gap: 14,
            padding: '15px 0',
          }}
        >
          <Fact label="District" value={project.district ?? '-'} />
          <Fact label="Constituency" value={project.constituency ?? '-'} />
          <Fact label="Member" value={properName(project.mp)} />
          <Fact label="Status" value={project.status} />
        </div>

        <nav className="tabs" style={{ borderBottom: 'none' }}>
          {[
            ['log', `Work log${works.length ? ` (${works.length})` : ''}`],
            ['why', `Why flagged${firedSignals.length ? ` (${firedSignals.length})` : ''}`],
            ['record', 'All details'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key as typeof tab)}
              style={{
                padding: '9px 13px',
                fontSize: 13,
                fontWeight: tab === key ? 600 : 500,
                color: tab === key ? 'var(--text)' : 'var(--text-faint)',
                borderBottom: `2px solid ${tab === key ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1,
                transition: 'color 0.12s ease',
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* ---------------- body ---------------- */}
      <div className="scroll-y grow" style={{ padding: 20 }}>
        {tab === 'log' && (
          <WorkLogTab
            project={project}
            works={works}
            logged={logged}
            canEdit={canEdit}
            onWorksChange={onWorksChange}
          />
        )}

        {tab === 'why' && <WhyTab project={project} onOpenProject={onOpenProject} />}

        {tab === 'record' && <RecordTab project={project} />}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------------
   Tab 1, the work log table from the sketches
   ------------------------------------------------------------------------ */

function WorkLogTab({
  project,
  works,
  logged,
  canEdit,
  onWorksChange,
}: {
  project: Project
  works: WorkLog[]
  logged: number
  canEdit: boolean
  onWorksChange: (rows: WorkLog[]) => void
}) {
  const [open, setOpen] = useState(false)
  const budget = project.budget ?? 0
  const over = budget > 0 && logged > budget

  const remove = useCallback(
    async (workId: string) => {
      const previous = works
      onWorksChange(works.filter((w) => w.id !== workId))
      try {
        await api.deleteWork(project.id, workId)
      } catch {
        onWorksChange(previous) // put it back if the server refused
      }
    },
    [works, onWorksChange, project.id],
  )

  return (
    <div className="col" style={{ gap: 16 }}>
      {/* running total */}
      <div className="panel" style={{ padding: '13px 15px' }}>
        <div className="row wrap" style={{ gap: 20 }}>
          <div>
            <div className="label">Approved budget</div>
            <div className="mono" style={{ fontSize: 17, fontWeight: 600, marginTop: 3 }}>
              {inr(project.budget)}
            </div>
          </div>
          <div>
            <div className="label">Paid so far</div>
            <div className="mono" style={{ fontSize: 17, fontWeight: 600, marginTop: 3 }}>
              {inr(project.totalPaid)}
            </div>
          </div>
          <div>
            <div className="label">Entered by contractor</div>
            <div
              className="mono"
              style={{
                fontSize: 17,
                fontWeight: 600,
                marginTop: 3,
                color: over ? 'var(--critical)' : 'var(--text)',
              }}
            >
              {inr(logged)}
            </div>
          </div>
          {canEdit && (
            <div className="grow row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={() => setOpen((v) => !v)}>
                {open ? 'Cancel' : '+ Add Work'}
              </button>
            </div>
          )}
        </div>

        {over && (
          <p style={{ fontSize: 12, color: 'var(--critical)', marginTop: 10 }}>
            The entries add up to {inr(logged - budget)} more than the approved budget.
            The entry is still saved. Spending over budget is exactly the kind of thing
            this system is meant to show, so it is recorded rather than blocked.
          </p>
        )}
      </div>

      {canEdit && open && (
        <AddWorkForm
          projectId={project.id}
          onAdded={(row) => {
            onWorksChange([...works, row])
            setOpen(false)
          }}
          onCancel={() => setOpen(false)}
        />
      )}

      {/* the table */}
      <div className="panel">
        <div className="panel-head">
          <span className="label">Work recorded</span>
          <span className="label mono">{count(works.length)}</span>
        </div>

        {works.length === 0 ? (
          <div style={{ padding: '26px 16px' }}>
            <Empty>
              {canEdit
                ? 'Nothing recorded yet. Use Add Work to enter the first item.'
                : 'The contractor has not entered any work for this project yet.'}
            </Empty>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 54 }}>Sr No</th>
                  <th>Work</th>
                  <th style={{ width: 120, textAlign: 'right' }}>Cost</th>
                  <th style={{ width: 118 }}>Time / Date</th>
                  {canEdit && <th style={{ width: 40 }} aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {works.map((row, index) => (
                  <tr key={row.id} className="rise" style={{ animationDelay: `${index * 26}ms` }}>
                    <td className="mono faint">{row.srNo}.</td>
                    <td>
                      <div style={{ fontSize: 13 }}>{row.work}</div>
                      {row.note && (
                        <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                          {row.note}
                        </div>
                      )}
                      <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>
                        {row.createdByName}
                      </div>
                    </td>
                    <td className="num" title={inrFull(row.cost)}>
                      {inr(row.cost)}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {fmtDate(row.date)}
                    </td>
                    {canEdit && (
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => remove(row.id)}
                          title="Remove this entry"
                          aria-label={`Remove ${row.work}`}
                        >
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  <td className="label">Total</td>
                  <td className="num" style={{ fontWeight: 600, color: over ? 'var(--critical)' : undefined }}>
                    {inr(logged)}
                  </td>
                  <td />
                  {canEdit && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function AddWorkForm({
  projectId,
  onAdded,
  onCancel,
}: {
  projectId: string
  onAdded: (row: WorkLog) => void
  onCancel: () => void
}) {
  const [work, setWork] = useState('')
  const [cost, setCost] = useState('')
  const [when, setWhen] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    const amount = Number(cost)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a cost greater than zero')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const created = await api.addWork(projectId, {
        work: work.trim(),
        cost: amount,
        date: when,
        note: note.trim() || null,
      })
      onAdded(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="panel rise"
      style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <span className="label">Add a work entry</span>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)',
          gap: 10,
        }}
        className="add-work-grid"
      >
        <div className="field">
          <label className="label" htmlFor="w-work">
            Work
          </label>
          <input
            id="w-work"
            className="input"
            value={work}
            onChange={(e) => setWork(e.target.value)}
            placeholder="Buy Cement"
            maxLength={200}
            required
            autoFocus
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="w-cost">
            Cost (₹)
          </label>
          <input
            id="w-cost"
            className="input mono"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="3000000"
            required
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="w-date">
            Date
          </label>
          <input
            id="w-date"
            className="input mono"
            type="date"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="w-note">
          Note (optional)
        </label>
        <input
          id="w-note"
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Supplier name, bill number, anything useful"
          maxLength={500}
        />
      </div>

      {cost && Number(cost) > 0 && (
        <p className="faint" style={{ fontSize: 11.5 }}>
          Will record {inrFull(Number(cost))}
        </p>
      )}

      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Saving' : 'Save entry'}
        </button>
        <button type="button" className="btn btn-sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------------
   Tab 2, explainable risk (brief §5.21)
   ------------------------------------------------------------------------ */

function WhyTab({
  project,
  onOpenProject,
}: {
  project: Project
  onOpenProject?: (id: string) => void
}) {
  const match = project.duplicateMatch

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="panel" style={{ padding: 15 }}>
        <div className="row" style={{ alignItems: 'baseline', gap: 10, marginBottom: 5 }}>
          <span
            className="mono"
            style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em' }}
          >
            {Math.round(project.riskScore)}
          </span>
          <span className="faint" style={{ fontSize: 12 }}>
            out of 100
          </span>
          <span className="grow" />
          <RiskBadge label={project.riskLabel} />
        </div>
        <p className="dim" style={{ fontSize: 13, lineHeight: 1.65 }}>
          Four checks run on this project and their scores are combined. Cost
          counts for 30%, repeated work 25%, time taken 25% and money paid 20%.
          Every check that crosses its line adds 5 more points, up to three
          checks. <strong>Biggest reason:</strong> {project.primaryReason}.
        </p>
        <p className="faint" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
          This score only decides what to look at first. It does not say that
          anyone did anything wrong.
        </p>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="label">The four checks</span>
          <span className="label mono">{project.activeSignals} raised a flag</span>
        </div>
        <div style={{ padding: '0 15px 4px' }}>
          {project.signals.map((signal) => (
            <SignalRow
              key={signal.key}
              signalKey={signal.key}
              label={signal.label}
              score={signal.score}
              active={signal.active}
              explanation={signal.explanation}
            />
          ))}
        </div>
      </div>

      {/* the model's separate opinion */}
      {project.anomaly && (
        <div className="panel" style={{ padding: 15 }}>
          <div className="row" style={{ gap: 10, marginBottom: 10 }}>
            <span className="label">A second opinion from the model</span>
            <span className="grow" />
            <span
              className="mono"
              style={{
                fontSize: 15,
                fontWeight: 600,
                color:
                  project.anomaly.percentile >= 90
                    ? 'var(--high)'
                    : 'var(--text)',
              }}
            >
              {project.anomaly.percentile}
              <span className="faint" style={{ fontSize: 11, fontWeight: 400 }}>
                {' '}
                out of 100
              </span>
            </span>
          </div>

          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: 'var(--sunken)',
              overflow: 'hidden',
              marginBottom: 11,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${project.anomaly.percentile}%`,
                borderRadius: 3,
                background:
                  project.anomaly.percentile >= 90 ? 'var(--high)' : 'var(--accent)',
                transition: 'width 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </div>

          <p className="dim" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            This work looks more unusual than{' '}
            <strong style={{ color: 'var(--text)' }}>{project.anomaly.percentile}%</strong>{' '}
            of the works the model was trained on. The model was never told which
            works are good or bad. It learned what an ordinary work looks like from
            the amount, how much has been paid, how many payments there were, and
            the timing, and it reports how far this one sits from that pattern.
          </p>

          <p className="faint" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 9 }}>
            This number is <strong>not</strong> part of the score above. It cannot
            explain itself the way the four checks can, so it is kept separate and
            used only as a prompt to look again.
          </p>
        </div>
      )}

      {/* peer comparison */}
      {project.peer?.count ? (
        <div className="panel" style={{ padding: 15 }}>
          <span className="label">Compared with similar works</span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
              gap: 14,
              marginTop: 11,
            }}
          >
            <Fact label="Similar works found" value={count(project.peer.count)} />
            <Fact label="Typical cost" value={inr(project.peer.medianInr)} />
            <Fact label="This work costs" value={inr(project.budget)} />
            <Fact
              label="Times the typical"
              value={project.peer.ratioToMedian ? `${project.peer.ratioToMedian.toFixed(2)}×` : '-'}
            />
          </div>
        </div>
      ) : null}

      {/* duplicate partner */}
      {match?.id && (
        <div className="panel" style={{ padding: 15 }}>
          <span className="label">The work this looks like</span>
          <p style={{ fontSize: 13, lineHeight: 1.5, margin: '9px 0 7px' }}>
            {match.name ?? match.description ?? 'Matched work'}
          </p>
          <div className="row wrap faint" style={{ gap: 12, fontSize: 11.5 }}>
            {match.similarity != null && (
              <span>{percent(match.similarity, 1)} description similarity</span>
            )}
            {match.sameAgency && <span>Same implementing agency</span>}
            {match.sameConstituency && <span>Same constituency</span>}
            {match.budget != null && <span>{inr(match.budget)}</span>}
          </div>
          {match.linkable && onOpenProject && (
            <button
              className="btn btn-sm"
              style={{ marginTop: 11 }}
              onClick={() => onOpenProject(match.id as string)}
            >
              Open that work
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------
   Tab 3, the raw record
   ------------------------------------------------------------------------ */

function RecordTab({ project }: { project: Project }) {
  const rows: [string, string][] = [
    ['Work ID', project.id],
    ['Reference', project.anonId],
    ['Category', project.category ?? '-'],
    ['State', project.state],
    ['District', project.district ?? '-'],
    ['Constituency', project.constituency ?? '-'],
    ['Implementing agency', project.agency ?? '-'],
    ['Member of Parliament', properName(project.mp)],
    ['Workflow status', project.status],
    ['Recommended amount', inrFull(project.recommendedAmount)],
    ['Sanctioned amount', inrFull(project.sanctionAmount)],
    ['Amount disbursed', inrFull(project.amountDisbursed)],
    ['Total paid', inrFull(project.totalPaid)],
    ['Payment instalments', count(project.paymentCount)],
    [
      'Payment vs sanction',
      project.paymentRatio != null ? percent(project.paymentRatio, 1) : '-',
    ],
    ['Recommended on', fmtDate(project.recommendedDate)],
    ['Sanctioned on', fmtDate(project.sanctionDate)],
    ['Completed on', fmtDate(project.completionDate)],
    ['First payment', fmtDate(project.firstPaymentDate)],
    ['Last payment', fmtDate(project.lastPaymentDate)],
    ['On record for', duration(project.daysSinceSanction)],
    ['Since last payment', duration(project.daysSinceLastPayment)],
    [
      'Map position',
      project.lat != null && project.lon != null
        ? `${project.lat.toFixed(4)}, ${project.lon.toFixed(4)} (${project.locationPrecision ?? 'approximate'})`
        : 'Not placed',
    ],
  ]

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Everything in the record</span>
      </div>
      <table className="table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={{ width: 190, color: 'var(--text-faint)', fontSize: 12.5 }}>{label}</td>
              <td className="mono" style={{ fontSize: 12, wordBreak: 'break-word' }}>
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="label">{label}</div>
      <div className="truncate" style={{ fontSize: 13, marginTop: 3 }} title={value}>
        {value}
      </div>
    </div>
  )
}

function DetailSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div className="col" style={{ padding: 20, gap: 14 }}>
      <div className="row">
        <div className="skeleton grow" style={{ height: 22, maxWidth: 260 }} />
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="skeleton" style={{ height: 58 }} />
      <div className="skeleton" style={{ height: 150 }} />
      <div className="skeleton" style={{ height: 190 }} />
    </div>
  )
}
