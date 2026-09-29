/**
 * Download everything on screen about one work as a plain-text case file
 * (Markdown), for a meeting, a letter or a presentation.
 *
 * It is written in the browser from what the page already has, so it holds
 * exactly what the viewer is allowed to see: the public version has aliases
 * and no payee names, the member's version has names and the team's records.
 */

import type { ProjectDetail } from '../../types'
import { dateTime, inrFull, percent, properName } from '../../format'

export function exportCase(p: ProjectDetail, { publicView, snapshot }: { publicView: boolean; snapshot?: string }) {
  const lines: string[] = []
  const add = (...text: string[]) => lines.push(...text)

  add(
    `# Case file: ${p.anonId}`,
    '',
    '_Smart Nigrani System. Review support, not an official finding. A flag is a reason for a person to look, not a conclusion._',
    '',
    `- **Work:** ${p.name}`,
    `- **Work ID:** ${p.id}`,
    `- **District:** ${p.district ?? '-'}`,
    `- **Member:** ${publicView ? `${p.mpAlias ?? '-'} (alias)` : properName(p.mp)}`,
    ...(publicView ? [] : [`- **Constituency:** ${p.constituency ?? '-'}`]),
    `- **Implementing agency:** ${p.agency ?? '-'}`,
    `- **Stage:** ${p.status}`,
    `- **Sanctioned:** ${inrFull(p.sanctionAmount)} on ${p.sanctionDate ?? '-'}`,
    `- **Recommended:** ${inrFull(p.recommendedAmount)} on ${p.recommendedDate ?? '-'}`,
    `- **Paid, successful:** ${inrFull(p.totalPaid)}${p.sanctionAmount ? ` (${percent(p.totalPaid / p.sanctionAmount, 1)})` : ''}`,
    `- **Payments in progress:** ${inrFull(p.pendingPaid ?? 0)}`,
    `- **Completion:** ${p.completionDate ?? 'no completion record in this export (not proof the work is unfinished)'}`,
    `- **Data snapshot:** ${p.snapshot ?? snapshot ?? '-'}`,
    '',
  )

  if (p.signals) {
    add(`## Review priority: ${Math.round(p.riskScore ?? 0)} / 100 (${p.riskLabel})`, '')
    add('Four checks, weighted cost 30%, repeated work 25%, time taken 25%, money paid 20%, plus 5 points per check over its line (up to three).', '')
    for (const s of p.signals) add(`- **${s.label}:** ${Math.round(s.score)}${s.active ? ' (flagged)' : ''}. ${s.explanation ?? ''}`)
    add('')
  } else if (p.riskLabel === 'Not checked') {
    add('## Review priority', '', 'The four checks were not run on this work.', '')
  }

  if (p.checks) {
    add('## Record checks', '')
    if (p.checks.length === 0) add('None of the seven record checks fired.')
    for (const c of p.checks) add(`- **${c.title}.** ${c.detail}`)
    add('')
  }

  if (p.peerStats) {
    add(
      '## Comparison group',
      '',
      `${p.peerStats.count} other works with the same agency, kind of work and sanction year. Median ${inrFull(p.peerStats.median)}, middle half ${inrFull(p.peerStats.q1)} to ${inrFull(p.peerStats.q3)}. This work is ${p.peerStats.ratio}× the median. Total amounts only; quantities and specifications are not in the reports.`,
      '',
    )
  }

  if (p.duplicateMatch?.id) {
    add('## Possible repeat of another work', '', `- ${p.duplicateMatch.name ?? p.duplicateMatch.description ?? p.duplicateMatch.id} (${p.duplicateMatch.id}), description similarity ${p.duplicateMatch.similarity != null ? percent(p.duplicateMatch.similarity, 1) : '-'}`, '')
  }
  if (p.similar?.length) {
    add('## Descriptions with 85% or more of the same words', '')
    for (const s of p.similar) add(`- ${s.anonId}: ${s.name} (${s.similarity}% overlap)`)
    add('')
  }

  if (p.anomaly) {
    add(
      '## Statistical model (kept separate from the priority)',
      '',
      `More unusual than ${p.anomaly.percentile}% of the 2,437 sanctioned works the Isolation Forest learned from (score ${p.anomaly.score}). Not a probability of fraud; no accuracy figure exists because no reviewed cases exist.`,
      '',
    )
  }

  if (p.payments.length) {
    add('## Payments', '', '| Date | Amount | Status | Row |', '|---|---|---|---|')
    for (const pay of p.payments) add(`| ${pay.date ?? '-'} | ${inrFull(pay.amount)} | ${pay.status ?? '-'} | ${pay.row} |`)
    add('')
  }

  if (p.sources.length) {
    add('## Source rows', '')
    for (const s of p.sources) add(`- ${s.file}, Sr. No. ${s.row}`)
    add('')
  }

  if (!publicView && p.works.length) {
    add('## Work log (entered by the contractor, unverified)', '')
    for (const w of p.works) {
      add(`- ${w.date}: ${w.work}, ${inrFull(w.cost)} by ${w.createdByName}${w.stage ? `, stage ${w.stage}` : ''}${w.progress != null ? `, ${w.progress}%` : ''}`)
      for (const f of w.flags ?? []) add(`  - Noted: ${f}`)
    }
    add('')
  }
  if (!publicView && p.evidence.length) {
    add('## Field photographs', '')
    for (const e of p.evidence) {
      add(`- ${dateTime(e.createdAt)}, ${e.createdByName}: ${e.note}${e.lat != null ? ` (location ${e.lat}, ${e.lng})` : ''}; fingerprint ${e.sha256.slice(0, 16)}`)
      if (e.vision) add(`  - Gemini description (needs review): ${e.vision.text.replace(/\n+/g, ' ')}`)
    }
    add('')
  }
  if (!publicView && p.reviews.length) {
    add('## Review history', '')
    for (const r of p.reviews) add(`- ${dateTime(r.createdAt)}, ${r.createdByName}: **${r.decision}**. ${r.note}`)
    add('')
  }

  add(`_Exported ${new Date().toLocaleString('en-IN')}._`)

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${p.anonId}-case-file.md`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
