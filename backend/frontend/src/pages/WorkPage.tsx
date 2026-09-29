/**
 * One work, in full. Every route to a work lands here: the public register,
 * the network, a member's map, a contractor's list, the research workspace.
 *
 * What it shows depends on who is looking, and the server decides that, not
 * this page:
 *
 *   public            the record, the checks and their reasons, peers,
 *                     timeline, similar works, the model's opinion; members
 *                     as aliases and no payee names
 *   member, analyst   all of the above with names, plus the work log, field
 *                     photographs and review decisions
 *   contractor,       the record, timeline, work log, photographs and the
 *   officer, agency   actions taken on their submissions; never a score
 *
 * The tab is part of the address (?tab=peers), so it survives refresh and the
 * back button, and can be linked to directly.
 */

import { useMemo } from 'react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { useAsync } from '../hooks'
import { RiskBadge } from '../components/Signal'
import { Overview } from '../components/work/Overview'
import { Checks } from '../components/work/Checks'
import { Peers } from '../components/work/Peers'
import { Timeline } from '../components/work/Timeline'
import { Similar } from '../components/work/Similar'
import { ModelTab } from '../components/work/ModelTab'
import { Records } from '../components/work/Records'
import { WorkLogTab } from '../components/work/WorkLog'
import { EvidenceTab } from '../components/work/Evidence'
import { ReviewsTab } from '../components/work/Reviews'
import { exportCase } from '../components/work/exportCase'
import { count, inr, properName } from '../format'
import { goBack, setParams, useRoute } from '../router'
import { usePresenting } from '../presentation'
import type { ProjectDetail } from '../types'

export type TabKey =
  | 'overview'
  | 'checks'
  | 'peers'
  | 'timeline'
  | 'similar'
  | 'model'
  | 'records'
  | 'log'
  | 'evidence'
  | 'reviews'

export function WorkPage({ id }: { id: string }) {
  const { user } = useAuth()
  const route = useRoute()
  const dataset = route.params.get('dataset') ?? undefined

  // Signed in, the work is read through the account (with names and team
  // records). If it is outside the account's scope the server says "not
  // found", and the public view is shown instead with a note saying so.
  const result = useAsync(
    async (signal) => {
      if (!user) return { project: await api.publicWork(id, signal), outside: false }
      try {
        return { project: await api.project(id, signal, dataset), outside: false }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404 && !dataset) {
          return { project: await api.publicWork(id, signal), outside: true }
        }
        throw error
      }
    },
    [id, user?.username, dataset],
  )
  const meta = useAsync(() => api.meta(), [])

  const project = result.data?.project ?? null
  const outside = result.data?.outside ?? false
  const signedTeam = Boolean(user) && !outside
  const oversight = signedTeam && (user?.role === 'mp' || user?.role === 'analyst')
  // An analyst presenting in front of people sees names the way the public
  // does: aliases, no payees. The underlying record is unchanged.
  const presenting = usePresenting() && user?.role === 'analyst'
  const publicView = !user || outside || presenting
  const riskVisible = !user || outside || oversight

  const tabs = useMemo(() => {
    if (!project) return [] as [TabKey, string][]
    const list: [TabKey, string][] = [['overview', 'Overview']]
    if (riskVisible) list.push(['checks', `Why flagged${flagCount(project) ? ` (${flagCount(project)})` : ''}`])
    if (riskVisible && project.source !== 'registered') list.push(['peers', 'Peer comparison'])
    list.push(['timeline', 'Timeline'])
    if (riskVisible && project.source !== 'registered') list.push(['similar', 'Similar works'])
    if (riskVisible && project.source !== 'registered') list.push(['model', 'Model opinion'])
    list.push(['records', 'Source records'])
    if (signedTeam && user?.role !== 'analyst') list.push(['log', `Work log${project.works.length ? ` (${project.works.length})` : ''}`])
    if (!user || user.role !== 'analyst') list.push(['evidence', `Field evidence${project.evidence.length ? ` (${project.evidence.length})` : ''}`])
    if (signedTeam) list.push(['reviews', 'Reviews'])
    return list
  }, [project, riskVisible, signedTeam, user])

  const requested = (route.params.get('tab') as TabKey) || 'overview'
  const tab: TabKey = tabs.some(([key]) => key === requested) ? requested : 'overview'

  const back = user ? '#/dashboard' : '#/works'

  return (
    <div className="page work-page">
      <button type="button" className="link back-link" onClick={() => goBack(back)}>
        ← Back
      </button>

      {result.loading && !project && <WorkSkeleton />}

      {result.error && (
        <div className="empty-state">
          <h1 className="h1">Could not open this work</h1>
          <p className="field-error">{result.error}</p>
          <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
            <button className="btn btn-sm" onClick={result.reload}>
              Try again
            </button>
            <a className="btn btn-sm btn-ghost" href={back}>
              {user ? 'Back to my workspace' : 'Back to the register'}
            </a>
          </div>
        </div>
      )}

      {project && (
        <>
          <WorkHeader project={project} publicView={publicView} riskVisible={riskVisible} onExport={() => exportCase(project, { publicView, snapshot: meta.data?.snapshot })} />

          {outside && (
            <p className="notice">
              This work is outside your account's area, so you are seeing the public view: members as aliases, no payee
              names, and nothing recorded by a delivery team.
            </p>
          )}
          {presenting && (
            <p className="notice">Presentation mode is on: names are shown as aliases on this screen only.</p>
          )}
          {dataset && user?.role === 'analyst' && (
            <p className="notice">You are reading this work in an imported dataset, not the base snapshot.</p>
          )}

          <nav className="tabs work-tabs" role="tablist" aria-label="Sections of this work">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={tab === key}
                className={tab === key ? 'active' : ''}
                onClick={() => setParams({ tab: key === 'overview' ? null : key }, { replace: false })}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="work-body" role="tabpanel">
            {tab === 'overview' && <Overview project={project} riskVisible={riskVisible} oversight={oversight} publicView={publicView} />}
            {tab === 'checks' && <Checks project={project} />}
            {tab === 'peers' && <Peers project={project} />}
            {tab === 'timeline' && <Timeline project={project} />}
            {tab === 'similar' && <Similar project={project} />}
            {tab === 'model' && <ModelTab project={project} card={meta.data?.model ?? null} />}
            {tab === 'records' && <Records project={project} publicView={publicView} />}
            {tab === 'log' && <WorkLogTab project={project} onChanged={result.reload} />}
            {tab === 'evidence' && (
              <EvidenceTab project={project} publicView={publicView} geminiConfigured={Boolean(meta.data?.geminiConfigured)} onChanged={result.reload} />
            )}
            {tab === 'reviews' && <ReviewsTab project={project} dataset={dataset} onChanged={result.reload} />}
          </div>
        </>
      )}
    </div>
  )
}

function flagCount(project: ProjectDetail): number {
  return (project.signals?.filter((s) => s.active).length ?? 0) + (project.checks?.length ?? 0)
}

function WorkHeader({
  project,
  publicView,
  riskVisible,
  onExport,
}: {
  project: ProjectDetail
  publicView: boolean
  riskVisible: boolean
  onExport: () => void
}) {
  const member = publicView ? project.mpAlias ?? '-' : properName(project.mp)
  return (
    <header className="work-header">
      <div className="grow" style={{ minWidth: 0 }}>
        <span className="kicker">
          {project.source === 'registered' ? 'Registered work' : 'Investigation'} / {project.anonId}
        </span>
        <h1 className="page-title work-title">{project.name}</h1>
        <div className="row wrap" style={{ gap: 10, marginTop: 8 }}>
          {riskVisible && project.riskLabel && (
            <RiskBadge label={project.riskLabel} score={project.fourChecks ? project.riskScore : undefined} />
          )}
          {project.source === 'registered' && <span className="tag">Registered in Smart Nigrani</span>}
          <span className="faint mono" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>
            {project.id}
          </span>
        </div>
        <dl className="facts">
          <div>
            <dt>District</dt>
            <dd>{project.district ?? '-'}</dd>
          </div>
          <div>
            <dt>{publicView ? 'Member (alias)' : 'Member of Parliament'}</dt>
            <dd>{member}</dd>
          </div>
          {!publicView && (
            <div>
              <dt>Constituency</dt>
              <dd>{project.constituency ?? '-'}</dd>
            </div>
          )}
          <div>
            <dt>Stage</dt>
            <dd>{project.status}</dd>
          </div>
          <div>
            <dt>Approved amount</dt>
            <dd className="mono">{inr(project.budget)}</dd>
          </div>
          <div>
            <dt>Paid (successful)</dt>
            <dd className="mono">{inr(project.totalPaid)}</dd>
          </div>
          {project.paymentCount > 0 && (
            <div>
              <dt>Payments</dt>
              <dd className="mono">{count(project.paymentCount)}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="work-actions">
        <button type="button" className="btn btn-sm" onClick={onExport}>
          Export case file
        </button>
      </div>
    </header>
  )
}

function WorkSkeleton() {
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="skeleton" style={{ height: 26, maxWidth: 240 }} />
      <div className="skeleton" style={{ height: 44, maxWidth: 700 }} />
      <div className="skeleton" style={{ height: 70 }} />
      <div className="skeleton" style={{ height: 260 }} />
    </div>
  )
}
