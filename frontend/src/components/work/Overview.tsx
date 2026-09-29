/**
 * The investigation overview: what needs attention and why, money against
 * reported progress, and a suggested next step for each signal.
 *
 * The suggestions come from fixed rules, one per kind of signal, written out
 * below. They are prompts for a person, not decisions, and nothing here
 * contacts anyone.
 */

import type { ProjectDetail, RecordCheck, SignalKey } from '../../types'
import { SIGNAL_COLOR, duration, inr, percent } from '../../format'
import { workHref } from '../../router'

interface Action {
  action: string
  owner: string
  because: string
}

const SIGNAL_ACTIONS: Record<SignalKey, { action: string; owner: string; tab: string; link: string }> = {
  cost: {
    action: 'Ask for the itemised estimate and the sanction order, and compare them with similar works.',
    owner: 'Implementing agency',
    tab: 'peers',
    link: 'Inspect the comparison group',
  },
  duplicate: {
    action: 'Compare the scope documents and sites of both works before any further payment.',
    owner: 'Implementing agency with the field officer',
    tab: 'similar',
    link: 'Compare the two works',
  },
  delay: {
    action: 'Ask for a progress report and schedule a site visit.',
    owner: 'Field officer',
    tab: 'timeline',
    link: 'Trace the timeline',
  },
  payment: {
    action: 'Reconcile the payments released with the stage reached, and ask for the measurement book.',
    owner: 'Implementing agency',
    tab: 'records',
    link: 'See every payment',
  },
}

const CHECK_ACTIONS: Record<RecordCheck['kind'], { action: string; owner: string; tab: string }> = {
  cost: { action: 'Compare the sanctioned amount with the comparison group and the approved specification.', owner: 'Implementing agency', tab: 'peers' },
  duplicate: { action: 'Check whether the similar descriptions are separate sites or phases.', owner: 'Field officer', tab: 'similar' },
  timing: { action: 'Confirm the dates with the original records and ask what delayed the next step.', owner: 'Implementing agency', tab: 'timeline' },
  amount: { action: 'Compare the original and revised sanction documents.', owner: 'Implementing agency', tab: 'records' },
  payment: { action: 'Reconcile the successful payments against the sanction and any revision.', owner: 'Accounts section of the agency', tab: 'records' },
  quality: { action: 'Inspect the original records for the order of the dates.', owner: 'Whoever keeps the records', tab: 'timeline' },
}

export function Overview({
  project,
  riskVisible,
  oversight,
  publicView,
}: {
  project: ProjectDetail
  riskVisible: boolean
  oversight: boolean
  publicView: boolean
}) {
  const active = (project.signals ?? []).filter((s) => s.active)
  const checks = project.checks ?? []
  const budget = project.sanctionAmount ?? project.budget ?? 0

  const actions: Action[] = []
  for (const signal of active) {
    const rule = SIGNAL_ACTIONS[signal.key]
    actions.push({ action: rule.action, owner: rule.owner, because: signal.explanation ?? signal.label })
  }
  for (const check of checks) {
    const rule = CHECK_ACTIONS[check.kind]
    actions.push({ action: rule.action, owner: rule.owner, because: `${check.title}. ${check.detail}` })
  }
  const plan = actions.filter((a, i) => actions.findIndex((b) => b.action === a.action) === i)
  if (plan.length === 0) {
    plan.push({
      action: 'Routine monitoring: ask for the next progress report and keep the supporting records.',
      owner: 'Field officer',
      because: riskVisible ? 'No check crossed its line for this work.' : 'Routine delivery follow-up.',
    })
  }

  return (
    <div className="investigate">
      <div className="col" style={{ gap: 16, minWidth: 0 }}>
        <div className="stat-strip">
          <Stat label="Approved" value={inr(budget)} />
          <Stat label="Paid, successful" value={inr(project.totalPaid)} sub={budget ? `${percent(project.totalPaid / budget)} of approved` : undefined} />
          <Stat label="Payments in progress" value={inr(project.pendingPaid ?? 0)} />
          <Stat
            label={project.source === 'registered' ? 'Days since registered sanction' : 'Days since sanction'}
            value={project.daysSinceSanction != null ? String(project.daysSinceSanction) : '-'}
            sub={project.daysSinceSanction != null ? duration(project.daysSinceSanction) : undefined}
          />
        </div>

        {riskVisible ? (
          <section className="panel card-pad">
            <span className="kicker">What needs attention</span>
            <h2 className="serif card-title">Evidence, explained.</h2>
            {active.length === 0 && checks.length === 0 && (
              <p className="info">
                {project.fourChecks === false && project.source !== 'registered'
                  ? 'The four checks were not run on this work (they run only on sanctioned works with detector output), and none of the record checks fired. That is not a certification that the work is correct.'
                  : 'No check crossed its line for this work. That is not a certification that the work is correct.'}
              </p>
            )}
            {active.map((signal) => (
              <div className="reason" key={signal.key}>
                <span className="reason-mark" style={{ background: SIGNAL_COLOR[signal.key] }} aria-hidden="true" />
                <div className="grow">
                  <h3>{signal.label}</h3>
                  <p>{signal.explanation}</p>
                  <a className="link" href={workHref(project.id, { tab: SIGNAL_ACTIONS[signal.key].tab })}>
                    {SIGNAL_ACTIONS[signal.key].link} →
                  </a>
                </div>
                <b className="mono">{Math.round(signal.score)}</b>
              </div>
            ))}
            {checks.map((check) => (
              <div className="reason" key={`${check.kind}-${check.title}`}>
                <span className="reason-mark reason-record" aria-hidden="true" />
                <div className="grow">
                  <h3>
                    {check.title} <span className="tag">record check</span>
                  </h3>
                  <p>{check.detail}</p>
                  <a className="link" href={workHref(project.id, { tab: CHECK_ACTIONS[check.kind].tab })}>
                    Look into it →
                  </a>
                </div>
              </div>
            ))}
          </section>
        ) : (
          <p className="notice">
            Review findings about this work are shared with the Member of Parliament and research analysts only. Your
            job here is to record what is done, and the record speaks for itself.
          </p>
        )}

        <section className="panel card-pad">
          <div className="row wrap" style={{ justifyContent: 'space-between', gap: 10 }}>
            <h2 className="serif card-title">Money and progress</h2>
            {project.snapshot && <span className="tag">As of {project.snapshot}</span>}
          </div>
          <Bar label="Paid, successful" value={budget ? project.totalPaid / budget : null} tone="accent" />
          <Bar label="In progress" value={budget ? (project.pendingPaid ?? 0) / budget : null} tone="accent-soft" />
          <Bar
            label="Reported progress"
            value={project.reportedProgress != null ? project.reportedProgress / 100 : null}
            tone="sage"
            empty="Nobody has reported progress on this work yet"
          />
          <p className="faint small">
            Money paid and physical progress measure different things, and the reports carry no progress figure at
            all. Progress here is what the contractor or field officer reported, unverified. A gap is a reason to ask
            for documents, not a conclusion.
            {project.hasCompletionRecord === false && project.source !== 'registered' &&
              ' No completion record appears in this export, which does not prove the work is unfinished.'}
          </p>
        </section>

        <section className="panel card-pad action-plan">
          <span className="kicker">Explainable action plan</span>
          <h2 className="serif card-title">What should happen next?</h2>
          <p className="dim small">One suggestion per signal, from fixed rules. Nothing on this page contacts anyone.</p>
          <ol>
            {plan.map((item, index) => (
              <li key={item.action}>
                <span className="plan-number">{index + 1}</span>
                <div>
                  <strong>{item.action}</strong>
                  <small>{item.owner} · suggested</small>
                  <p>Because: {item.because}</p>
                </div>
              </li>
            ))}
          </ol>
          {oversight && (
            <a className="btn btn-primary btn-sm" href={workHref(project.id, { tab: 'reviews' })}>
              Record a decision
            </a>
          )}
          {publicView && !oversight && (
            <p className="faint small">Only a signed-in Member of Parliament or analyst can record a decision on a work.</p>
          )}
        </section>
      </div>

      <aside className="panel side-card">
        {riskVisible && project.fourChecks && project.riskLabel && (
          <div className="card-pad" style={{ borderBottom: '1px solid var(--rule)' }}>
            <span className="kicker">Review priority</span>
            <div className="score-ring" style={{ ['--score' as string]: `${(project.riskScore ?? 0) * 3.6}deg` }}>
              <div>
                <strong>{Math.round(project.riskScore ?? 0)}</strong>
                <span>/ 100</span>
              </div>
            </div>
            <p className="faint small" style={{ textAlign: 'center' }}>
              Four weighted checks. A place in the queue, not a probability of fraud.
            </p>
          </div>
        )}
        {riskVisible && project.anomaly && (
          <div className="card-pad" style={{ borderBottom: '1px solid var(--rule)' }}>
            <span className="kicker">Model, kept separate</span>
            <p style={{ margin: '8px 0 4px' }}>
              More unusual than <strong>{project.anomaly.percentile}%</strong> of the works it learned from.
            </p>
            <a className="link" href={workHref(project.id, { tab: 'model' })}>
              What that means →
            </a>
          </div>
        )}
        <div className="card-pad">
          <span className="kicker">The work</span>
          <p style={{ margin: '8px 0 12px', lineHeight: 1.6 }}>{project.description || project.name}</p>
          <dl className="side-facts">
            <div>
              <dt>Kind of work</dt>
              <dd>{project.workType ?? project.sector ?? '-'}</dd>
            </div>
            <div>
              <dt>Sector (worked out)</dt>
              <dd>{project.sector ?? '-'}</dd>
            </div>
            {project.agency && (
              <div>
                <dt>Implementing agency</dt>
                <dd>{project.agency}</dd>
              </div>
            )}
            {project.deadline && (
              <div>
                <dt>Completion target</dt>
                <dd>
                  {project.deadline}
                  {project.overdueDays ? ` · ${project.overdueDays} days past` : ''}
                </dd>
              </div>
            )}
          </dl>
          <div className="col" style={{ gap: 8, marginTop: 14 }}>
            {riskVisible && project.source !== 'registered' && (
              <a className="btn btn-sm" href={workHref(project.id, { tab: 'peers' })}>
                View the peer comparison
              </a>
            )}
            <a className="btn btn-sm" href={workHref(project.id, { tab: 'evidence' })}>
              {publicView ? 'How field evidence works' : 'Field evidence'}
            </a>
          </div>
        </div>
      </aside>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <small>{label}</small>
      <strong className="mono">{value}</strong>
      {sub && <span>{sub}</span>}
    </div>
  )
}

function Bar({
  label,
  value,
  tone,
  empty,
}: {
  label: string
  value: number | null
  tone: 'accent' | 'accent-soft' | 'sage'
  empty?: string
}) {
  const width = value === null ? 0 : Math.min(100, Math.max(0, value * 100))
  return (
    <div className="benchmark-row">
      <span>{label}</span>
      <div>
        {value !== null && <i className={tone} style={{ width: `${width}%` }} />}
      </div>
      <b className="mono">{value === null ? (empty ? '—' : '-') : percent(value)}</b>
      {value === null && empty && <em className="benchmark-empty">{empty}</em>}
    </div>
  )
}
