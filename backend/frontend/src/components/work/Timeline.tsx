/**
 * From recommendation to reality: every dated step of one work, in order.
 *
 * Steps from the reports (recommendation, sanction, each payment, completion)
 * sit alongside what the delivery team recorded in this system (work log
 * entries, photographs, review actions), each labelled with where it came
 * from. A missing completion record is shown as missing, never as "not done":
 * the export simply may not have it.
 */

import { useMemo, useState } from 'react'
import type { ProjectDetail } from '../../types'
import { date as fmtDate, dateTime, inr } from '../../format'
import { workHref } from '../../router'

interface Milestone {
  key: string
  title: string
  when: string | null
  detail: string
  source: 'report' | 'system' | 'target'
  state: 'done' | 'pending' | 'warn'
}

export function Timeline({ project }: { project: ProjectDetail }) {
  const milestones = useMemo(() => build(project), [project])
  const [selected, setSelected] = useState(0)
  const current = milestones[Math.min(selected, milestones.length - 1)]

  return (
    <div className="timeline-layout">
      <section className="panel">
        <div className="panel-head">
          <span className="label">Work timeline</span>
          <span className="tag">{milestones.filter((m) => m.state === 'done').length} recorded steps</span>
        </div>
        <ol className="milestones">
          {milestones.map((m, index) => (
            <li key={m.key}>
              <button
                type="button"
                className={`milestone ${m.state} ${index === selected ? 'active' : ''}`}
                onClick={() => setSelected(index)}
                aria-current={index === selected ? 'step' : undefined}
              >
                <span className="milestone-icon" aria-hidden="true">
                  {m.state === 'done' ? '✓' : m.state === 'warn' ? '!' : '…'}
                </span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <strong>{m.title}</strong>
                  <small>{m.when ? (m.when.length > 10 ? dateTime(m.when) : fmtDate(m.when)) : 'Not in the record'}</small>
                  <p>{m.detail}</p>
                </span>
                <span className={`tag ${m.source === 'system' ? 'tag-system' : ''}`}>
                  {m.source === 'report' ? 'MPLADS report' : m.source === 'target' ? 'Target' : 'Recorded here'}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      {current && (
        <aside className="panel card-pad milestone-detail">
          <span className="kicker">Selected step</span>
          <h2 className="serif card-title">{current.title}</h2>
          <p className="milestone-date mono">
            {current.when ? (current.when.length > 10 ? dateTime(current.when) : fmtDate(current.when)) : 'No date in the record'}
          </p>
          <p style={{ lineHeight: 1.65 }}>{current.detail}</p>
          <p className="info small">
            {current.source === 'report'
              ? 'From the published MPLADS reports, as of the snapshot date.'
              : current.source === 'target'
                ? 'A target set when the work was registered, not an event.'
                : 'Entered by a member of the delivery team in this system. Nobody has independently verified it.'}
          </p>
          <a className="btn btn-sm" href={workHref(project.id, { tab: 'evidence' })}>
            See field evidence
          </a>
        </aside>
      )}
    </div>
  )
}

function build(p: ProjectDetail): Milestone[] {
  const out: Milestone[] = []

  if (p.source === 'registered') {
    out.push({
      key: 'registered',
      title: 'Registered and assigned',
      when: p.createdAt ?? null,
      detail: `Registered by ${p.createdBy ?? 'the agency'}, contractor ${p.contractor ?? '-'}, field officer ${p.officer ?? '-'}.`,
      source: 'system',
      state: 'done',
    })
    out.push({
      key: 'sanctioned',
      title: 'Sanctioned',
      when: p.sanctionDate,
      detail: `Approved amount ${inr(p.sanctionAmount)}.`,
      source: 'system',
      state: 'done',
    })
    if (p.deadline) {
      out.push({
        key: 'deadline',
        title: 'Completion target',
        when: p.deadline,
        detail: p.overdueDays
          ? `${p.overdueDays} days past the target, and nobody has reported 100% progress.`
          : 'Not past the target, or reported complete.',
        source: 'target',
        state: p.overdueDays ? 'warn' : 'pending',
      })
    }
  } else {
    out.push({
      key: 'recommended',
      title: 'Recommended by the member',
      when: p.recommendedDate,
      detail: p.recommendedAmount != null ? `Recommended amount ${inr(p.recommendedAmount)}.` : 'No recommended amount in the export.',
      source: 'report',
      state: p.recommendedDate ? 'done' : 'pending',
    })
    out.push({
      key: 'sanctioned',
      title: 'Sanctioned',
      when: p.sanctionDate,
      detail: p.sanctionDate
        ? `Sanctioned amount ${inr(p.sanctionAmount)}${p.sanctionInterval != null ? `, ${p.sanctionInterval} days after the recommendation` : ''}${p.sanctionInterval != null && p.sanctionInterval > 45 ? ' (the record checks look at anything over 45 days)' : ''}.`
        : 'Not sanctioned in this export: this is a recommendation only.',
      source: 'report',
      state: p.sanctionDate ? (p.sanctionInterval != null && p.sanctionInterval > 45 ? 'warn' : 'done') : 'pending',
    })
    p.payments.forEach((pay, index) => {
      out.push({
        key: `payment-${pay.row}-${index}`,
        title: pay.status === 'Payment Success' ? 'Payment made' : 'Payment in progress',
        when: pay.date,
        detail: `${inr(pay.amount)}${pay.vendor ? ` to ${pay.vendor}` : ''}, row ${pay.row} of the expenditure report. ${
          pay.date && p.sanctionDate && pay.date < p.sanctionDate ? 'Dated before the sanction, which the record checks flag.' : ''
        }`.trim(),
        source: 'report',
        state: pay.date && p.sanctionDate && pay.date < p.sanctionDate ? 'warn' : 'done',
      })
    })
    out.push({
      key: 'completed',
      title: 'Completion',
      when: p.completionDate,
      detail: p.completionDate
        ? `Completion recorded, amount disbursed ${inr(p.amountDisbursed)}.${p.status && p.status !== 'Work Completed' ? ` The sanctioned report still says "${p.status}", a difference between the two reports.` : ''}`
        : 'No completion record in this export. That does not prove the work is unfinished; the export may simply not have it.',
      source: 'report',
      state: p.completionDate ? 'done' : 'pending',
    })
  }

  for (const work of p.works) {
    out.push({
      key: `log-${work.id}`,
      title: `Work log: ${work.work}`,
      when: work.date,
      detail: `${inr(work.cost)} entered by ${work.createdByName}${work.stage ? `, stage ${work.stage}` : ''}${work.progress != null ? `, ${work.progress}% reported` : ''}.`,
      source: 'system',
      state: work.flags?.length ? 'warn' : 'done',
    })
  }
  for (const item of p.evidence) {
    out.push({
      key: `evidence-${item.id}`,
      title: 'Field photograph',
      when: item.createdAt,
      detail: `${item.createdByName}: ${item.note}${item.progress != null ? ` (${item.progress}% reported)` : ''}`,
      source: 'system',
      state: 'done',
    })
  }
  for (const review of p.reviews.filter((r) => r.targetKind !== 'work')) {
    out.push({
      key: `review-${review.id}`,
      title: review.decision,
      when: review.createdAt,
      detail: `${review.createdByName}: ${review.note}`,
      source: 'system',
      state: 'done',
    })
  }

  if (p.snapshot && p.source !== 'registered') {
    out.push({
      key: 'snapshot',
      title: 'Data snapshot',
      when: p.snapshot,
      detail: 'The date the reports describe. Report steps after it are outside this data; steps recorded here can come later.',
      source: 'report',
      state: 'done',
    })
  }

  // Dated steps in order; anything undated keeps its place at the end.
  const dated = out.filter((m) => m.when).sort((a, b) => (a.when! < b.when! ? -1 : a.when! > b.when! ? 1 : 0))
  const undated = out.filter((m) => !m.when)
  return [...dated, ...undated]
}
