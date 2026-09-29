/**
 * Where every number on this work came from: the report rows it was joined
 * from, every payment row, and every field in the record.
 */

import type { ProjectDetail } from '../../types'
import { count, date as fmtDate, duration, inr, inrFull, percent, properName } from '../../format'

export function Records({ project, publicView }: { project: ProjectDetail; publicView: boolean }) {
  const fields: [string, string][] = [
    ['Work ID', project.id],
    ['Reference', project.anonId],
    ['Kind of work (from the Work column)', project.workType ?? '-'],
    ['Category column', project.category ?? '-'],
    ['Sector (worked out from the description)', project.sector ?? '-'],
    ['State', project.state],
    ['District', project.district ?? '-'],
    ...(publicView
      ? ([['Member (alias)', project.mpAlias ?? '-']] as [string, string][])
      : ([
          ['Constituency', project.constituency ?? '-'],
          ['Member of Parliament', properName(project.mp)],
        ] as [string, string][])),
    ['Implementing agency', project.agency ?? '-'],
    ['Stage in the sanctioned report', project.status],
    ['Recommended amount', inrFull(project.recommendedAmount)],
    ['Sanctioned amount', inrFull(project.sanctionAmount)],
    ['Amount disbursed (completed report)', inrFull(project.amountDisbursed)],
    ['Paid, successful', inrFull(project.totalPaid)],
    ['Payments in progress', inrFull(project.pendingPaid ?? 0)],
    ['Payment rows', count(project.paymentCount)],
    ['Successful payments against sanction', project.paymentRatio != null ? percent(project.paymentRatio, 1) : '-'],
    ['Recommended on', fmtDate(project.recommendedDate)],
    ['Sanction date in the recommendation report', fmtDate(project.recommendationSanctionDate)],
    ['Sanctioned on', fmtDate(project.sanctionDate)],
    ['Completed on', fmtDate(project.completionDate)],
    ['Days from recommendation to sanction', project.sanctionInterval != null ? String(project.sanctionInterval) : '-'],
    ['Days from sanction to completion', project.duration != null ? String(project.duration) : '-'],
    ['On record for', duration(project.daysSinceSanction)],
    ['Image column of the completed report', project.imageLabel ?? '-'],
    [
      'Map position',
      project.lat != null && project.lon != null
        ? `${project.lat.toFixed(4)}, ${project.lon.toFixed(4)} (${project.locationPrecision ?? 'approximate'} level, not a surveyed site)`
        : 'Not placed',
    ],
  ]

  return (
    <div className="col" style={{ gap: 16 }}>
      {project.source !== 'registered' && (
        <section className="panel">
          <div className="panel-head">
            <span className="label">Source rows this work was joined from</span>
            <span className="label mono">{project.sources.length + project.payments.length}</span>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Sr. No.</th>
                </tr>
              </thead>
              <tbody>
                {project.sources.map((source) => (
                  <tr key={`${source.file}-${source.row}`}>
                    <td>{source.file}</td>
                    <td className="mono">{source.row}</td>
                  </tr>
                ))}
                {project.payments.map((pay) => (
                  <tr key={`pay-${pay.row}`}>
                    <td>Expenditure on Completed and On-going Works as on Date.csv</td>
                    <td className="mono">{pay.row}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {project.payments.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <span className="label">Payments</span>
            <span className="label mono">{project.payments.length}</span>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>{publicView ? 'Payee' : 'Payee (vendor)'}</th>
                  <th>Row</th>
                </tr>
              </thead>
              <tbody>
                {project.payments.map((pay) => (
                  <tr key={pay.row}>
                    <td className="mono">{fmtDate(pay.date)}</td>
                    <td className="num" title={inrFull(pay.amount)}>
                      {inr(pay.amount)}
                    </td>
                    <td>
                      <span className={`tag ${pay.status === 'Payment Success' ? 'tag-ok' : 'tag-wait'}`}>
                        {pay.status === 'Payment Success' ? 'Successful' : 'In progress'}
                      </span>
                    </td>
                    <td>{publicView ? <span className="faint">Hidden on public pages</span> : pay.vendor ?? '-'}</td>
                    <td className="mono">{pay.row}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="faint small card-pad">
            Successful and in-progress payments are kept apart and never added together as "paid". The export has no
            transaction ids, so a repeated payment cannot be told apart from a genuine second instalment.
          </p>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <span className="label">Everything in the record</span>
        </div>
        <table className="table">
          <tbody>
            {fields.map(([label, value]) => (
              <tr key={label}>
                <td style={{ width: 260, color: 'var(--text-faint)', fontSize: 12.5 }}>{label}</td>
                <td className="mono" style={{ fontSize: 12, wordBreak: 'break-word' }}>
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
