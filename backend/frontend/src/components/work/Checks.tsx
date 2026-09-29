/**
 * Why a work was flagged: the team's four checks and the review priority
 * they add up to, then the seven record checks, each with its sentence.
 */

import { SignalRow } from '../Signal'
import type { ProjectDetail } from '../../types'

const RECORD_RULES: [string, string][] = [
  ['Amount against its comparison group', 'At least 8 other works with the same agency, kind of work and sanction year; flagged above Q3 + 3 × IQR and 2.5 × the median.'],
  ['Similar description', 'Same constituency and kind of work, 6 or more distinct words each, 85% or more word overlap.'],
  ['Days to sanction', 'More than 45 days from recommendation to sanction.'],
  ['Age without completion', 'More than 365 days since sanction and no completion record in the export.'],
  ['Sanction above recommendation', 'Sanctioned amount more than 10% above the recommended amount.'],
  ['Payments above sanction', 'Successful payments more than 1% above the sanctioned amount.'],
  ['Date order', 'A later step dated before an earlier one, such as a payment before its sanction.'],
]

export function Checks({ project }: { project: ProjectDetail }) {
  const checks = project.checks ?? []
  return (
    <div className="col" style={{ gap: 16 }}>
      {project.fourChecks && project.signals ? (
        <>
          <section className="panel card-pad">
            <div className="row" style={{ alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-0.03em' }}>
                {Math.round(project.riskScore ?? 0)}
              </span>
              <span className="faint">out of 100 · {project.riskLabel}</span>
            </div>
            <p className="dim" style={{ lineHeight: 1.65 }}>
              Four checks run on this work and their scores are combined. Cost counts for 30%, repeated work 25%, time
              taken 25% and money paid 20%. Every check that crosses its own line adds 5 more points, up to three
              checks. <strong>Biggest reason:</strong> {project.primaryReason}.
            </p>
            <p className="faint small" style={{ marginTop: 8 }}>
              This score only decides what to look at first. It does not say that anyone did anything wrong.
            </p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <span className="label">The four checks</span>
              <span className="label mono">{project.activeSignals ?? 0} raised a flag</span>
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
          </section>

          {project.peer?.count ? (
            <section className="panel card-pad">
              <span className="kicker">The cost check compared this work with</span>
              <p style={{ marginTop: 8, lineHeight: 1.6 }}>
                {Math.round(project.peer.count)} works with similar descriptions (average similarity{' '}
                {project.peer.averageSimilarity != null ? project.peer.averageSimilarity.toFixed(2) : '-'}), whose
                median approved amount is ₹{project.peer.medianInr?.toLocaleString('en-IN') ?? '-'}. This work is{' '}
                {project.peer.ratioToMedian != null ? `${project.peer.ratioToMedian.toFixed(2)}×` : '-'} that median.
              </p>
            </section>
          ) : null}
        </>
      ) : (
        <p className="notice">
          {project.source === 'registered'
            ? 'This work was registered inside the system, so the four checks, which were built for the report snapshot, do not apply to it.'
            : 'The four checks were not run on this work. They cover sanctioned works that the team’s detector pipeline processed; recommendations that were never sanctioned, works it could not match by id, and imported datasets are outside it.'}
        </p>
      )}

      <section className="panel">
        <div className="panel-head">
          <span className="label">Record checks</span>
          <span className="label mono">{checks.length} of 7 fired</span>
        </div>
        <div className="card-pad">
          <p className="dim small" style={{ marginBottom: 12 }}>
            Seven plain rules that look for inconsistencies in the records themselves. They are separate from the
            review priority above; a record check is a reason to open the file, not a finding.
          </p>
          {checks.length === 0 && <p className="info">None of the seven record checks fired for this work.</p>}
          {checks.map((check) => (
            <div key={`${check.kind}-${check.title}`} className="record-check">
              <strong>{check.title}</strong>
              <p>{check.detail}</p>
            </div>
          ))}
          <details className="rules-detail">
            <summary>The seven rules and their thresholds</summary>
            <table className="table">
              <tbody>
                {RECORD_RULES.map(([name, rule]) => (
                  <tr key={name}>
                    <td style={{ width: 220, fontWeight: 600 }}>{name}</td>
                    <td className="dim">{rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      </section>
    </div>
  )
}
