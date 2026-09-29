/**
 * Works that may repeat this one, side by side.
 *
 * Two independent sources, labelled separately:
 *
 * * the four checks' duplicate check, which compares descriptions by meaning
 *   (a sentence-transformer model, run offline by the team's pipeline) and
 *   names the single closest match;
 * * the record check, which compares the words of descriptions within the
 *   same constituency and kind of work (85% or more overlap).
 *
 * Either can be innocent: separate phases, separate sites, or a standard
 * description reused for genuinely different works.
 */

import type { ProjectDetail, WorkBrief } from '../../types'
import { date as fmtDate, inr, percent } from '../../format'
import { workHref } from '../../router'

export function Similar({ project }: { project: ProjectDetail }) {
  const match = project.duplicateMatch
  const similar = project.similar ?? []

  if (!match?.id && similar.length === 0) {
    return (
      <div className="empty-state">
        <h3>No similar works found</h3>
        <p className="dim">
          Neither the meaning-based duplicate check nor the word-overlap record check found a work that looks like this
          one. That is not proof the work is unique.
        </p>
      </div>
    )
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      {match?.id && (
        <>
          <div>
            <span className="kicker">Possible duplicate · pair review</span>
            <h2 className="page-title" style={{ fontSize: 'clamp(22px, 2.4vw, 32px)' }}>
              One need. <em>Two records?</em>
            </h2>
            <p className="dim">Inspect both scopes before deciding whether these are separate phases or sites.</p>
          </div>
          <div className="duplicate-pair">
            <PairCard
              heading="This work"
              name={project.name}
              reference={project.anonId}
              amount={project.budget}
              when={project.sanctionDate}
              district={project.district}
              status={project.status}
            />
            <div className="pair-link" aria-hidden="true">
              <span className="mono">{match.similarity != null ? percent(match.similarity, 1) : '?'}</span>
              <small>similar</small>
            </div>
            <PairCard
              heading="Closest match"
              name={match.name ?? match.description ?? 'Matched work'}
              reference={match.id}
              amount={match.budget ?? null}
              when={(match as { sanctionDate?: string | null }).sanctionDate ?? null}
              district={match.district ?? null}
              status={match.status ?? null}
              link={match.linkable ? workHref(match.id) : undefined}
            />
          </div>
          <section className="panel card-pad duplicate-explain">
            <h3 className="serif card-title">Why this pair surfaced</h3>
            <p className="dim">
              The duplicate check compares descriptions by meaning, not by exact words.{' '}
              {match.sameAgency ? 'Both are handled by the same implementing agency. ' : ''}
              {match.sameConstituency ? 'Both are in the same constituency. ' : ''}
              These signals mean the two sanction orders and sites should be compared.
            </p>
            <strong className="small">Next: compare scope documents → check payment references → visit the site.</strong>
          </section>
        </>
      )}

      {similar.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <span className="label">Descriptions with 85% or more of the same words</span>
            <span className="label mono">{similar.length}</span>
          </div>
          <div className="peer-grid">
            {similar.map((item: WorkBrief) => (
              <a key={item.id} className="peer-card" href={workHref(item.id)}>
                <span className="label mono">
                  {item.anonId} · {item.similarity}% word overlap
                </span>
                <strong className="clamp-2">{item.name}</strong>
                <small className="mono">
                  {inr(item.sanctionAmount ?? item.budget)} · {fmtDate(item.sanctionDate)}
                </small>
              </a>
            ))}
          </div>
          <p className="faint small card-pad">
            Same constituency and kind of work. Standard wording for similar works, or separate phases of one work,
            can explain a match.
          </p>
        </section>
      )}
    </div>
  )
}

function PairCard({
  heading,
  name,
  reference,
  amount,
  when,
  district,
  status,
  link,
}: {
  heading: string
  name: string
  reference: string | null
  amount: number | null
  when: string | null
  district: string | null
  status: string | null
  link?: string
}) {
  return (
    <article className="panel card-pad pair-card">
      <span className="kicker">{heading}</span>
      <h3>{name}</h3>
      <dl className="side-facts">
        <div>
          <dt>Reference</dt>
          <dd className="mono" style={{ wordBreak: 'break-all' }}>
            {reference ?? '-'}
          </dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd className="mono">{inr(amount)}</dd>
        </div>
        <div>
          <dt>Sanctioned</dt>
          <dd>{fmtDate(when)}</dd>
        </div>
        <div>
          <dt>District</dt>
          <dd>{district ?? '-'}</dd>
        </div>
        <div>
          <dt>Stage</dt>
          <dd>{status ?? '-'}</dd>
        </div>
      </dl>
      {link && (
        <a className="btn btn-sm" href={link} style={{ marginTop: 12 }}>
          Investigate this work →
        </a>
      )}
    </article>
  )
}
