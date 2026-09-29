/**
 * The Isolation Forest's opinion on one work, with the five numbers it was
 * given, so the reader can see what the model looked at.
 *
 * Kept apart from the review priority everywhere. It ranks statistical
 * unusualness among 2,437 sanctioned works; it was never shown a confirmed
 * case of wrongdoing, because this data contains none.
 */

import type { ModelCard, ProjectDetail } from '../../types'
import { count, inr, percent } from '../../format'

export function ModelTab({ project, card }: { project: ProjectDetail; card: ModelCard | null }) {
  const a = project.anomaly
  const amount = project.sanctionAmount ?? 0

  if (!a) {
    return (
      <div className="empty-state">
        <h3>The model did not score this work</h3>
        <p className="dim">
          It was trained only on sanctioned works with a positive sanctioned amount and a sanction date. Scoring a work
          outside that group would be guessing, so it is not done.
        </p>
      </div>
    )
  }

  const high = a.percentile >= 90
  const inputs: [string, string, string][] = [
    ['Sanctioned amount', inr(amount), 'used as log(1 + amount)'],
    ['Paid, successful, as a share of it', amount ? percent(project.totalPaid / amount, 1) : '-', 'payments in progress are not counted'],
    ['Payment rows', count(project.paymentCount), 'successful and in progress, used as log(1 + count)'],
    [
      'Days from recommendation to sanction',
      project.sanctionInterval != null ? String(project.sanctionInterval) : 'missing',
      project.sanctionInterval != null ? 'as recorded' : 'filled with the training median, as in training',
    ],
    ['Days from sanction to the snapshot', project.daysSinceSanction != null ? String(project.daysSinceSanction) : '-', `to ${project.snapshot ?? 'the snapshot date'}`],
  ]

  return (
    <div className="model-layout">
      <section className="panel card-pad">
        <span className="kicker">A second opinion, kept separate</span>
        <div className="row" style={{ alignItems: 'baseline', gap: 10, margin: '10px 0 6px' }}>
          <span className="mono" style={{ fontSize: 40, fontWeight: 600, color: high ? 'var(--high)' : 'var(--text)' }}>
            {a.percentile}
          </span>
          <span className="faint">percentile</span>
        </div>
        <div className="bar-track" style={{ height: 8, marginBottom: 12 }}>
          <div className="bar-fill" style={{ width: `${a.percentile}%`, background: high ? 'var(--high)' : undefined }} />
        </div>
        <p style={{ lineHeight: 1.65 }}>
          This work looks more unusual than <strong>{a.percentile}%</strong> of the {count(card?.trainingRecords ?? 2437)} sanctioned
          works the model learned from (raw score {a.score.toFixed(5)}, higher is stranger). The model was never told which
          works are good or bad. It learned what an ordinary work looks like from the five numbers below, and reports how
          far this one sits from that pattern.
        </p>
        <p className="notice" style={{ marginTop: 12 }}>
          Not part of the review priority, not a probability of fraud, and not a prediction. No reviewed cases exist to
          measure how often it is right, so no accuracy figure is given.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="label">What the model was given, for this work</span>
        </div>
        <table className="table">
          <tbody>
            {inputs.map(([name, value, note]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                  {value}
                </td>
                <td className="faint small">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {card && (
          <div className="card-pad faint small">
            {card.model} · {card.version} · seed {card.seed} · trained on {count(card.trainingRecords)} works. Scope:{' '}
            {card.scope} Evaluation: {card.evaluation}
          </div>
        )}
      </section>
    </div>
  )
}
